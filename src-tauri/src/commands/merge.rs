use crate::error::AppError;
use crate::parser::{parse_conflict_markers, ParseConflictsResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::process::Command;

/// 1 行分の git blame 情報。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_number: usize, // 1-based
    pub hash: String,       // short hash (7 chars)
    pub author: String,
    pub date: String,    // YYYY-MM-DD
    pub summary: String, // first line of commit message
}

/// パス付きの単一ファイル内容。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFileContent {
    pub path: String,
    pub content: String,
}

/// フロントエンドへ返すマージ関連ファイル一式。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFiles {
    pub local: MergeFileContent,
    pub remote: MergeFileContent,
    pub base: Option<MergeFileContent>,
    pub merged: MergeFileContent,
    pub language: String,
    pub local_label: String,
    pub remote_label: String,
}

/// ファイル拡張子からプログラミング言語を判定する。
fn detect_language(path: &str) -> String {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext.to_lowercase().as_str() {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "py" => "python",
        "rb" => "ruby",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "cxx" | "cc" | "hpp" => "cpp",
        "cs" => "csharp",
        "swift" => "swift",
        "kt" | "kts" => "kotlin",
        "php" => "php",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" => "scss",
        "less" => "less",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "xml" => "xml",
        "md" | "markdown" => "markdown",
        "sql" => "sql",
        "sh" | "bash" | "zsh" => "shell",
        "ps1" => "powershell",
        "lua" => "lua",
        "r" => "r",
        "dart" => "dart",
        "zig" => "zig",
        "vue" => "vue",
        "svelte" => "svelte",
        _ => "plaintext",
    }
    .to_string()
}

/// 単一ファイルを読み込み、見つからない場合はパス付きエラーを返す。
/// 事前 exists() で TOCTOU を抱えないよう、I/O 結果から NotFound を派生させる。
async fn read_file_content(path: &str) -> Result<MergeFileContent, AppError> {
    let content = fs::read_to_string(path)
        .await
        .map_err(|e| AppError::from_io_with_path(path.to_string(), e))?;
    Ok(MergeFileContent {
        path: path.to_string(),
        content,
    })
}

/// Git リポジトリの状態からブランチ名を判定する。
/// エラー時は ("LOCAL", "REMOTE") へフォールバックする。
async fn detect_branch_names(merged_path: &str) -> (String, String) {
    let fallback = ("LOCAL".to_string(), "REMOTE".to_string());

    // merged ファイルのパスから作業ディレクトリを求める。
    let work_dir = match Path::new(merged_path).parent() {
        Some(dir) => dir.to_string_lossy().to_string(),
        None => return fallback,
    };

    // Git リポジトリのルートを取得する。
    let git_root = match Command::new("git")
        .args(["-C", &work_dir, "rev-parse", "--show-toplevel"])
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => return fallback,
    };

    // 現在のブランチ名（LOCAL 側）を取得する。
    let local_label = match Command::new("git")
        .args(["-C", &git_root, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => return fallback,
    };

    // Git 操作中の状態から REMOTE 側ブランチ名を判定する。
    let remote_label = match resolve_git_dir(&git_root).await {
        Ok(git_dir) => detect_remote_label(&git_dir, &git_root).await,
        Err(_) => "REMOTE".to_string(),
    };

    (local_label, remote_label)
}

/// 通常リポジトリと linked worktree の両方で実体の Git directory を解決する。
async fn resolve_git_dir(git_root: &str) -> Result<PathBuf, AppError> {
    let output = Command::new("git")
        .args(["-C", git_root, "rev-parse", "--git-dir"])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git rev-parse --git-dir: {}", e),
        })?;

    if !output.status.success() {
        return Err(AppError::CommandError {
            message: "Cannot determine git directory".to_string(),
        });
    }

    let git_dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let git_dir_path = PathBuf::from(&git_dir);
    if git_dir_path.is_absolute() {
        Ok(git_dir_path)
    } else {
        Ok(Path::new(git_root).join(git_dir_path))
    }
}

/// Path::exists / Path::is_dir の非同期版。エラーは false 扱い。
async fn path_exists(path: &Path) -> bool {
    fs::try_exists(path).await.unwrap_or(false)
}

async fn path_is_dir(path: &Path) -> bool {
    match fs::metadata(path).await {
        Ok(meta) => meta.is_dir(),
        Err(_) => false,
    }
}

/// Git 状態ファイルから REMOTE 側（取り込み側）のブランチラベルを判定する。
async fn detect_remote_label(git_dir: &Path, git_root: &str) -> String {
    // merge 中か確認する: .git/MERGE_HEAD が存在する。
    let merge_head = git_dir.join("MERGE_HEAD");
    if path_exists(&merge_head).await {
        // MERGE_MSG からブランチ名を取り出す。
        let merge_msg_path = git_dir.join("MERGE_MSG");
        if let Ok(msg) = fs::read_to_string(&merge_msg_path).await {
            if let Some(first_line) = msg.lines().next() {
                // 例: "Merge branch 'feature-branch'" / "Merge branch 'feature-branch' into main"
                if let Some(start) = first_line.find("Merge branch '") {
                    let after = &first_line[start + 14..];
                    if let Some(end) = after.find('\'') {
                        return after[..end].to_string();
                    }
                }
                // 例: "Merge remote-tracking branch 'origin/feature-branch'"
                if let Some(start) = first_line.find("Merge remote-tracking branch '") {
                    let after = &first_line[start + 30..];
                    if let Some(end) = after.find('\'') {
                        return after[..end].to_string();
                    }
                }
            }
        }

        // フォールバックとして git name-rev を使う。
        if let Ok(output) = Command::new("git")
            .args(["-C", git_root, "name-rev", "--name-only", "MERGE_HEAD"])
            .output()
            .await
        {
            if output.status.success() {
                let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // ~N suffix を取り除く（例: "feature-branch~2" -> "feature-branch"）。
                let clean = name.split('~').next().unwrap_or(&name).to_string();
                if !clean.is_empty() && clean != "undefined" {
                    return clean;
                }
            }
        }
    }

    // rebase 中か確認する: .git/rebase-merge/ が存在する。
    let rebase_merge = git_dir.join("rebase-merge");
    if path_is_dir(&rebase_merge).await {
        let head_name = rebase_merge.join("head-name");
        if let Ok(content) = fs::read_to_string(&head_name).await {
            let name = content.trim();
            // "refs/heads/" prefix を取り除く。
            return name.strip_prefix("refs/heads/").unwrap_or(name).to_string();
        }
    }

    // rebase-apply 形式の rebase 中か確認する。
    let rebase_apply = git_dir.join("rebase-apply");
    if path_is_dir(&rebase_apply).await {
        let head_name = rebase_apply.join("head-name");
        if let Ok(content) = fs::read_to_string(&head_name).await {
            let name = content.trim();
            return name.strip_prefix("refs/heads/").unwrap_or(name).to_string();
        }
    }

    "REMOTE".to_string()
}

/// マージ関連ファイル（LOCAL、REMOTE、BASE、MERGED）をまとめて読み込む。
/// 独立したファイル読み込みは tokio::try_join! で並行実行し、I/O 完了後に
/// ブランチ名取得を行うことで、I/O 失敗時に git 子プロセスを起動しない挙動を保つ。
#[tauri::command]
pub async fn read_merge_files(
    local: String,
    remote: String,
    base: Option<String>,
    merged: String,
) -> Result<MergeFiles, AppError> {
    let base_read = async {
        match base.as_deref().filter(|path| !path.is_empty()) {
            Some(path) => read_file_content(path).await.map(Some),
            None => Ok(None),
        }
    };

    // ファイル読み込みのみを並列化する（branch 名取得は I/O 成功後に逐次実行）。
    let (local_content, remote_content, base_content, merged_content) = tokio::try_join!(
        read_file_content(&local),
        read_file_content(&remote),
        base_read,
        read_file_content(&merged),
    )?;

    let language = detect_language(&merged);
    let (local_label, remote_label) = detect_branch_names(&merged).await;

    Ok(MergeFiles {
        local: local_content,
        remote: remote_content,
        base: base_content,
        merged: merged_content,
        language,
        local_label,
        remote_label,
    })
}

/// 指定された内容のコンフリクトマーカーを解析する。
#[tauri::command]
pub async fn parse_conflicts(content: String) -> Result<ParseConflictsResult, AppError> {
    Ok(parse_conflict_markers(&content))
}

/// `git blame --line-porcelain` の出力を BlameLine の配列へ変換する。
fn parse_line_porcelain(output: &str) -> Vec<BlameLine> {
    let mut results: Vec<BlameLine> = Vec::new();
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_time: i64 = 0;
    let mut current_tz_offset: i64 = 0;
    let mut current_summary = String::new();
    let mut current_line: usize = 0;

    for line in output.lines() {
        if line.starts_with('\t') {
            // 内容行は blame ブロックの終端を示す。
            let date = format_unix_timestamp(current_time + current_tz_offset);
            results.push(BlameLine {
                line_number: current_line,
                hash: if current_hash.len() >= 7 {
                    current_hash[..7].to_string()
                } else {
                    current_hash.clone()
                },
                author: current_author.clone(),
                date,
                summary: current_summary.clone(),
            });
        } else if let Some(rest) = line.strip_prefix("author ") {
            current_author = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            current_time = rest.parse::<i64>().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("author-tz ") {
            current_tz_offset = parse_tz_offset(rest);
        } else if let Some(rest) = line.strip_prefix("summary ") {
            current_summary = rest.to_string();
        } else {
            // ハッシュ行: "<hash> <orig_line> <final_line> [<num_lines>]"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].len() >= 7 {
                // 先頭フィールドが 16 進ハッシュらしい形式か検証する。
                if parts[0].chars().all(|c| c.is_ascii_hexdigit()) {
                    current_hash = parts[0].to_string();
                    current_line = parts[2].parse::<usize>().unwrap_or(0);
                }
            }
        }
    }

    results
}

/// タイムゾーンオフセット文字列（例: "+0900", "-0500"）を秒数へ変換する。
fn parse_tz_offset(tz: &str) -> i64 {
    let tz = tz.trim();
    if tz.len() < 5 {
        return 0;
    }
    let sign: i64 = if tz.starts_with('-') { -1 } else { 1 };
    let digits = tz.trim_start_matches(['+', '-']);
    if digits.len() >= 4 {
        let hours: i64 = digits[..2].parse().unwrap_or(0);
        let minutes: i64 = digits[2..4].parse().unwrap_or(0);
        sign * (hours * 3600 + minutes * 60)
    } else {
        0
    }
}

/// 外部 crate を使わず Unix timestamp を YYYY-MM-DD 形式へ変換する。
fn format_unix_timestamp(timestamp: i64) -> String {
    if timestamp <= 0 {
        return "unknown".to_string();
    }

    // 日数ベースの簡易計算を行う。
    let secs_per_day: i64 = 86400;
    let mut days = timestamp / secs_per_day;
    // 月計算を単純化するため epoch を 1970-01-01 から 0000-03-01 基準へずらす。
    days += 719468;

    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = (days - era * 146097) as u32; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // year of era [0, 399]
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of year [0, 365]
    let mp = (5 * doy + 2) / 153; // month index [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // day [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // month [1, 12]
    let y = if m <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// 指定されたマージ側に対応する Git ref を判定する。
///
/// remote 側で MERGE_HEAD/REBASE_HEAD/CHERRY_PICK_HEAD のいずれも存在しない
/// 場合は HEAD にフォールバックせずエラーを返す。HEAD を返すと local と同じ
/// blame 結果となり、ユーザーに誤った差分元を提示してしまうため。
async fn determine_merge_ref(git_dir: &Path, side: &str) -> Result<String, AppError> {
    if side == "local" {
        return Ok("HEAD".to_string());
    }

    // remote 側は MERGE_HEAD、REBASE_HEAD、CHERRY_PICK_HEAD の順に試す。
    for ref_name in &["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD"] {
        if path_exists(&git_dir.join(ref_name)).await {
            return Ok(ref_name.to_string());
        }
    }

    Err(AppError::CommandError {
        message: "Cannot determine remote merge ref: MERGE_HEAD, REBASE_HEAD, and CHERRY_PICK_HEAD are absent".to_string(),
    })
}

/// 指定された側のマージファイルに対する git blame 情報を取得する。
#[tauri::command]
pub async fn git_blame_for_merge(
    merged_path: String,
    side: String,
) -> Result<Vec<BlameLine>, AppError> {
    // side パラメータの検証
    if side != "local" && side != "remote" {
        return Err(AppError::CommandError {
            message: format!("Invalid side parameter: {}", side),
        });
    }

    // merged パスから作業ディレクトリを取得する。
    let work_dir = Path::new(&merged_path)
        .parent()
        .ok_or_else(|| AppError::CommandError {
            message: "Cannot determine parent directory".to_string(),
        })?
        .to_string_lossy()
        .to_string();

    // Git リポジトリのルートを取得する。
    let root_output = Command::new("git")
        .args(["-C", &work_dir, "rev-parse", "--show-toplevel"])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git rev-parse: {}", e),
        })?;

    if !root_output.status.success() {
        return Err(AppError::CommandError {
            message: "Not a git repository".to_string(),
        });
    }

    let git_root = String::from_utf8_lossy(&root_output.stdout)
        .trim()
        .to_string();

    // Git ルートからの相対パスを計算する。
    let abs_merged = fs::canonicalize(&merged_path)
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to canonicalize path: {}", e),
        })?;
    let abs_root = fs::canonicalize(&git_root)
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to canonicalize git root: {}", e),
        })?;
    let relative_path = abs_merged
        .strip_prefix(&abs_root)
        .map_err(|_| AppError::CommandError {
            message: "Merged path is not inside git repository".to_string(),
        })?
        .to_string_lossy()
        .to_string();

    // side に応じた ref を判定する。
    let git_dir = resolve_git_dir(&git_root).await?;
    let git_ref = determine_merge_ref(&git_dir, &side).await?;

    // git blame を実行する。
    let blame_output = Command::new("git")
        .args([
            "-C",
            &git_root,
            "blame",
            "--line-porcelain",
            &git_ref,
            "--",
            &relative_path,
        ])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git blame: {}", e),
        })?;

    if !blame_output.status.success() {
        let stderr = String::from_utf8_lossy(&blame_output.stderr);
        return Err(AppError::CommandError {
            message: format!("git blame failed: {}", stderr),
        });
    }

    let stdout = String::from_utf8_lossy(&blame_output.stdout);
    Ok(parse_line_porcelain(&stdout))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs as std_fs;
    use std::process::Command as StdCommand;

    #[test]
    fn test_detect_language_rust() {
        assert_eq!(detect_language("src/main.rs"), "rust");
    }

    #[test]
    fn test_detect_language_typescript() {
        assert_eq!(detect_language("app/page.tsx"), "typescript");
        assert_eq!(detect_language("utils.ts"), "typescript");
    }

    #[test]
    fn test_detect_language_javascript() {
        assert_eq!(detect_language("index.js"), "javascript");
        assert_eq!(detect_language("config.mjs"), "javascript");
    }

    #[test]
    fn test_detect_language_unknown() {
        assert_eq!(detect_language("file.xyz"), "plaintext");
        assert_eq!(detect_language("noext"), "plaintext");
    }

    #[test]
    fn test_detect_language_case_insensitive() {
        assert_eq!(detect_language("File.RS"), "rust");
        assert_eq!(detect_language("App.TSX"), "typescript");
    }

    #[test]
    fn test_parse_line_porcelain_basic() {
        let output = "\
abc1234def5678901234567890123456789012345 1 1 1
author Alice
author-mail <alice@example.com>
author-time 1700000000
author-tz +0900
committer Alice
committer-mail <alice@example.com>
committer-time 1700000000
committer-tz +0900
summary Initial commit
filename src/main.rs
\tuse std::io;
def5678abc1234901234567890123456789012345 2 2 1
author Bob
author-mail <bob@example.com>
author-time 1700086400
author-tz +0000
committer Bob
committer-mail <bob@example.com>
committer-time 1700086400
committer-tz +0000
summary Add feature X
filename src/main.rs
\tfn main() {}
";
        let result = parse_line_porcelain(output);
        assert_eq!(result.len(), 2);

        assert_eq!(result[0].line_number, 1);
        assert_eq!(result[0].hash, "abc1234");
        assert_eq!(result[0].author, "Alice");
        assert_eq!(result[0].date, "2023-11-15"); // 1700000000 UTC + 9h = JST 2023-11-15
        assert_eq!(result[0].summary, "Initial commit");

        assert_eq!(result[1].line_number, 2);
        assert_eq!(result[1].hash, "def5678");
        assert_eq!(result[1].author, "Bob");
        assert_eq!(result[1].date, "2023-11-15"); // 1700086400 UTC+0000
        assert_eq!(result[1].summary, "Add feature X");
    }

    #[test]
    fn test_parse_line_porcelain_empty() {
        let result = parse_line_porcelain("");
        assert!(result.is_empty());
    }

    #[test]
    fn test_format_unix_timestamp() {
        assert_eq!(format_unix_timestamp(0), "unknown");
        assert_eq!(format_unix_timestamp(1700000000), "2023-11-14");
        assert_eq!(format_unix_timestamp(1000000000), "2001-09-09");
    }

    #[test]
    fn test_format_unix_timestamp_negative() {
        // 負のタイムスタンプ（1970年以前）は u32 wrap を防止して "unknown" を返す
        assert_eq!(format_unix_timestamp(-1), "unknown");
        assert_eq!(format_unix_timestamp(-86400), "unknown");
        assert_eq!(format_unix_timestamp(i64::MIN), "unknown");
    }

    #[test]
    fn test_merge_files_serialization() {
        let files = MergeFiles {
            local: MergeFileContent {
                path: "/tmp/local".to_string(),
                content: "local content".to_string(),
            },
            remote: MergeFileContent {
                path: "/tmp/remote".to_string(),
                content: "remote content".to_string(),
            },
            base: None,
            merged: MergeFileContent {
                path: "/tmp/merged".to_string(),
                content: "merged content".to_string(),
            },
            language: "rust".to_string(),
            local_label: "main".to_string(),
            remote_label: "feature-branch".to_string(),
        };
        let json = serde_json::to_string(&files).unwrap();
        assert!(json.contains("\"language\":\"rust\""));
        assert!(json.contains("\"local\""));
        assert!(json.contains("\"remote\""));
        assert!(json.contains("\"merged\""));
        assert!(json.contains("\"localLabel\":\"main\""));
        assert!(json.contains("\"remoteLabel\":\"feature-branch\""));
    }

    #[test]
    fn test_parse_tz_offset() {
        assert_eq!(parse_tz_offset("+0900"), 32400); // 9h
        assert_eq!(parse_tz_offset("-0500"), -18000); // -5h
        assert_eq!(parse_tz_offset("+0000"), 0);
        assert_eq!(parse_tz_offset("+0530"), 19800); // 5h30m
        assert_eq!(parse_tz_offset(""), 0);
        assert_eq!(parse_tz_offset("abc"), 0);
    }

    /// `determine_merge_ref` 用に空の git_dir を作る。
    /// 並列実行時の衝突を避けるため uuid v4 を使用する。
    fn make_test_git_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gui-git-editor-determine-ref-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std_fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// `resolve_git_dir` 用に実際の Git リポジトリを作成する。
    fn make_test_repo() -> std::path::PathBuf {
        let repo = std::env::temp_dir().join(format!(
            "gui-git-editor-merge-repo-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std_fs::create_dir_all(&repo).unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "test@example.com"]);
        run_git(&repo, &["config", "user.name", "Test User"]);
        run_git(&repo, &["config", "commit.gpgsign", "false"]);
        std_fs::write(repo.join("file.txt"), "base\n").unwrap();
        run_git(&repo, &["add", "file.txt"]);
        run_git(&repo, &["commit", "-m", "initial"]);
        repo
    }

    fn run_git(repo: &Path, args: &[&str]) -> String {
        let output = StdCommand::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[test]
    fn test_determine_merge_ref_local_returns_head() {
        let dir = make_test_git_dir();
        let result = tauri::async_runtime::block_on(determine_merge_ref(&dir, "local")).unwrap();
        assert_eq!(result, "HEAD");
        let _ = std_fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_determine_merge_ref_remote_prefers_merge_head() {
        let dir = make_test_git_dir();
        std_fs::write(dir.join("MERGE_HEAD"), "abc1234").unwrap();
        std_fs::write(dir.join("REBASE_HEAD"), "def5678").unwrap();
        let result = tauri::async_runtime::block_on(determine_merge_ref(&dir, "remote")).unwrap();
        assert_eq!(result, "MERGE_HEAD");
        let _ = std_fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_determine_merge_ref_remote_falls_back_to_rebase_head() {
        let dir = make_test_git_dir();
        std_fs::write(dir.join("REBASE_HEAD"), "def5678").unwrap();
        let result = tauri::async_runtime::block_on(determine_merge_ref(&dir, "remote")).unwrap();
        assert_eq!(result, "REBASE_HEAD");
        let _ = std_fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_determine_merge_ref_remote_falls_back_to_cherry_pick_head() {
        let dir = make_test_git_dir();
        std_fs::write(dir.join("CHERRY_PICK_HEAD"), "ghi9012").unwrap();
        let result = tauri::async_runtime::block_on(determine_merge_ref(&dir, "remote")).unwrap();
        assert_eq!(result, "CHERRY_PICK_HEAD");
        let _ = std_fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_determine_merge_ref_remote_returns_error_when_no_state() {
        // remote 側で state ファイルがない場合は HEAD にフォールバックせず
        // エラーを返すことを確認する（local と同一 blame のサイレント誤結果を防止）
        let dir = make_test_git_dir();
        let result = tauri::async_runtime::block_on(determine_merge_ref(&dir, "remote"));
        assert!(result.is_err());
        let _ = std_fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_resolve_git_dir_handles_linked_worktree_git_file() {
        let repo = make_test_repo();
        let worktree = std::env::temp_dir().join(format!(
            "gui-git-editor-merge-worktree-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let worktree_arg = worktree.to_string_lossy().to_string();
        run_git(&repo, &["worktree", "add", "-b", "feature", &worktree_arg]);
        assert!(worktree.join(".git").is_file());

        let git_dir = tauri::async_runtime::block_on(resolve_git_dir(&worktree_arg)).unwrap();
        assert!(git_dir.is_dir());

        std_fs::write(git_dir.join("MERGE_HEAD"), "abc1234").unwrap();
        let result =
            tauri::async_runtime::block_on(determine_merge_ref(&git_dir, "remote")).unwrap();

        run_git(&repo, &["worktree", "remove", "--force", &worktree_arg]);
        let _ = std_fs::remove_dir_all(&repo);
        let _ = std_fs::remove_dir_all(&worktree);

        assert_eq!(result, "MERGE_HEAD");
    }

    #[test]
    fn test_read_file_content_returns_content() {
        let dir = make_test_git_dir();
        let path = dir.join("merged.txt");
        std_fs::write(&path, "merged content\n").unwrap();

        let content =
            tauri::async_runtime::block_on(read_file_content(&path.to_string_lossy())).unwrap();

        let _ = std_fs::remove_dir_all(&dir);

        assert_eq!(content.path, path.to_string_lossy());
        assert_eq!(content.content, "merged content\n");
    }

    #[test]
    fn test_read_file_content_missing_returns_file_not_found_with_path() {
        let dir = make_test_git_dir();
        let path = dir.join("missing.txt");
        let path_string = path.to_string_lossy().to_string();

        let error = tauri::async_runtime::block_on(read_file_content(&path_string)).unwrap_err();

        let _ = std_fs::remove_dir_all(&dir);

        assert!(matches!(
            error,
            AppError::FileNotFound { path: actual_path } if actual_path == path_string
        ));
    }

    #[test]
    fn test_path_exists_returns_true_for_existing_file() {
        let dir = make_test_git_dir();
        let path = dir.join("file.txt");
        std_fs::write(&path, "").unwrap();

        let exists = tauri::async_runtime::block_on(path_exists(&path));
        let _ = std_fs::remove_dir_all(&dir);

        assert!(exists);
    }

    #[test]
    fn test_path_exists_returns_false_for_missing_file() {
        let dir = make_test_git_dir();
        let path = dir.join("no-such-file.txt");

        let exists = tauri::async_runtime::block_on(path_exists(&path));
        let _ = std_fs::remove_dir_all(&dir);

        assert!(!exists);
    }

    #[test]
    fn test_path_is_dir_distinguishes_dir_and_file() {
        let dir = make_test_git_dir();
        let file_path = dir.join("file.txt");
        std_fs::write(&file_path, "").unwrap();
        let subdir = dir.join("sub");
        std_fs::create_dir_all(&subdir).unwrap();

        let dir_is_dir = tauri::async_runtime::block_on(path_is_dir(&subdir));
        let file_is_dir = tauri::async_runtime::block_on(path_is_dir(&file_path));
        let missing_is_dir = tauri::async_runtime::block_on(path_is_dir(&dir.join("missing")));

        let _ = std_fs::remove_dir_all(&dir);

        assert!(dir_is_dir);
        assert!(!file_is_dir);
        assert!(!missing_is_dir);
    }

    #[test]
    fn test_read_merge_files_reads_three_files_in_parallel() {
        let dir = make_test_git_dir();
        let local = dir.join("local.txt");
        let remote = dir.join("remote.txt");
        let merged = dir.join("merged.txt");
        std_fs::write(&local, "local").unwrap();
        std_fs::write(&remote, "remote").unwrap();
        std_fs::write(&merged, "merged").unwrap();

        let files = tauri::async_runtime::block_on(read_merge_files(
            local.to_string_lossy().to_string(),
            remote.to_string_lossy().to_string(),
            None,
            merged.to_string_lossy().to_string(),
        ))
        .unwrap();

        let _ = std_fs::remove_dir_all(&dir);

        assert_eq!(files.local.content, "local");
        assert_eq!(files.remote.content, "remote");
        assert!(files.base.is_none());
        assert_eq!(files.merged.content, "merged");
        assert_eq!(files.language, "plaintext");
    }

    #[test]
    fn test_read_merge_files_reports_missing_file_as_file_not_found() {
        let dir = make_test_git_dir();
        let local = dir.join("local.txt");
        let remote = dir.join("remote.txt");
        let merged = dir.join("merged.txt");
        std_fs::write(&local, "local").unwrap();
        std_fs::write(&remote, "remote").unwrap();
        // merged は意図的に作らない。

        let merged_path = merged.to_string_lossy().to_string();
        let error = tauri::async_runtime::block_on(read_merge_files(
            local.to_string_lossy().to_string(),
            remote.to_string_lossy().to_string(),
            None,
            merged_path.clone(),
        ))
        .unwrap_err();

        let _ = std_fs::remove_dir_all(&dir);

        assert!(matches!(
            error,
            AppError::FileNotFound { path: actual } if actual == merged_path
        ));
    }
}

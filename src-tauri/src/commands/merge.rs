use crate::error::AppError;
use crate::parser::{parse_conflict_markers, ParseConflictsResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tokio::process::Command;

/// A single line's git blame information.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_number: usize, // 1-based
    pub hash: String,       // short hash (7 chars)
    pub author: String,
    pub date: String,    // YYYY-MM-DD
    pub summary: String, // first line of commit message
}

/// A single file's content with its path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFileContent {
    pub path: String,
    pub content: String,
}

/// All merge file contents returned to the frontend.
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

/// Detect programming language from file extension.
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

/// Read a single file, returning an error with the path if not found.
fn read_file_content(path: &str) -> Result<MergeFileContent, AppError> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(AppError::FileNotFound {
            path: path.to_string(),
        });
    }
    let content = fs::read_to_string(file_path).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied {
            path: path.to_string(),
        },
        _ => AppError::IoError {
            message: e.to_string(),
        },
    })?;
    Ok(MergeFileContent {
        path: path.to_string(),
        content,
    })
}

/// Detect branch names from git repository state.
/// Returns (local_label, remote_label), falling back to ("LOCAL", "REMOTE") on any error.
async fn detect_branch_names(merged_path: &str) -> (String, String) {
    let fallback = ("LOCAL".to_string(), "REMOTE".to_string());

    // Derive working directory from the merged file path
    let work_dir = match Path::new(merged_path).parent() {
        Some(dir) => dir.to_string_lossy().to_string(),
        None => return fallback,
    };

    // Get git repo root
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

    // Get current branch name (LOCAL side)
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

    // Detect remote branch name based on git operation context
    let git_dir = Path::new(&git_root).join(".git");
    let remote_label = detect_remote_label(&git_dir, &git_root).await;

    (local_label, remote_label)
}

/// Detect the remote (incoming) branch label from git state files.
async fn detect_remote_label(git_dir: &Path, git_root: &str) -> String {
    // Check for merge context: .git/MERGE_HEAD exists
    let merge_head = git_dir.join("MERGE_HEAD");
    if merge_head.exists() {
        // Try parsing MERGE_MSG for branch name
        let merge_msg_path = git_dir.join("MERGE_MSG");
        if let Ok(msg) = fs::read_to_string(&merge_msg_path) {
            if let Some(first_line) = msg.lines().next() {
                // Pattern: "Merge branch 'feature-branch'" or "Merge branch 'feature-branch' into main"
                if let Some(start) = first_line.find("Merge branch '") {
                    let after = &first_line[start + 14..];
                    if let Some(end) = after.find('\'') {
                        return after[..end].to_string();
                    }
                }
                // Pattern: "Merge remote-tracking branch 'origin/feature-branch'"
                if let Some(start) = first_line.find("Merge remote-tracking branch '") {
                    let after = &first_line[start + 30..];
                    if let Some(end) = after.find('\'') {
                        return after[..end].to_string();
                    }
                }
            }
        }

        // Fallback: use git name-rev
        if let Ok(output) = Command::new("git")
            .args(["-C", git_root, "name-rev", "--name-only", "MERGE_HEAD"])
            .output()
            .await
        {
            if output.status.success() {
                let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // Strip ~N suffix (e.g., "feature-branch~2" -> "feature-branch")
                let clean = name.split('~').next().unwrap_or(&name).to_string();
                if !clean.is_empty() && clean != "undefined" {
                    return clean;
                }
            }
        }
    }

    // Check for rebase context: .git/rebase-merge/ exists
    let rebase_merge = git_dir.join("rebase-merge");
    if rebase_merge.is_dir() {
        let head_name = rebase_merge.join("head-name");
        if let Ok(content) = fs::read_to_string(&head_name) {
            let name = content.trim();
            // Strip "refs/heads/" prefix
            return name.strip_prefix("refs/heads/").unwrap_or(name).to_string();
        }
    }

    // Check for rebase-apply context
    let rebase_apply = git_dir.join("rebase-apply");
    if rebase_apply.is_dir() {
        let head_name = rebase_apply.join("head-name");
        if let Ok(content) = fs::read_to_string(&head_name) {
            let name = content.trim();
            return name.strip_prefix("refs/heads/").unwrap_or(name).to_string();
        }
    }

    "REMOTE".to_string()
}

/// Read all merge files (LOCAL, REMOTE, BASE, MERGED) at once.
#[tauri::command]
pub async fn read_merge_files(
    local: String,
    remote: String,
    base: Option<String>,
    merged: String,
) -> Result<MergeFiles, AppError> {
    let local_content = read_file_content(&local)?;
    let remote_content = read_file_content(&remote)?;
    let base_content = match &base {
        Some(path) if !path.is_empty() => Some(read_file_content(path)?),
        _ => None,
    };
    let merged_content = read_file_content(&merged)?;
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

/// Parse conflict markers in the given content.
#[tauri::command]
pub async fn parse_conflicts(content: String) -> Result<ParseConflictsResult, AppError> {
    Ok(parse_conflict_markers(&content))
}

/// Parse `git blame --line-porcelain` output into BlameLine entries.
fn parse_line_porcelain(output: &str) -> Vec<BlameLine> {
    let mut results: Vec<BlameLine> = Vec::new();
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_time: i64 = 0;
    let mut current_summary = String::new();
    let mut current_line: usize = 0;

    for line in output.lines() {
        if line.starts_with('\t') {
            // Content line marks end of a block
            let date = format_unix_timestamp(current_time);
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
        } else if let Some(rest) = line.strip_prefix("summary ") {
            current_summary = rest.to_string();
        } else {
            // Hash line: "<hash> <orig_line> <final_line> [<num_lines>]"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].len() >= 7 {
                // Validate that first part looks like a hex hash
                if parts[0].chars().all(|c| c.is_ascii_hexdigit()) {
                    current_hash = parts[0].to_string();
                    current_line = parts[2].parse::<usize>().unwrap_or(0);
                }
            }
        }
    }

    results
}

/// Format a Unix timestamp to YYYY-MM-DD without external crates.
fn format_unix_timestamp(timestamp: i64) -> String {
    if timestamp == 0 {
        return "unknown".to_string();
    }

    // Simple days-based calculation
    let secs_per_day: i64 = 86400;
    let mut days = timestamp / secs_per_day;
    // Shift epoch from 1970-01-01 to 0000-03-01 for easier month calculation
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

/// Determine the git ref for the given side of a merge.
async fn determine_merge_ref(git_dir: &Path, side: &str) -> String {
    if side == "local" {
        return "HEAD".to_string();
    }

    // remote side: try MERGE_HEAD, then REBASE_HEAD, then CHERRY_PICK_HEAD
    for ref_name in &["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD"] {
        if git_dir.join(ref_name).exists() {
            return ref_name.to_string();
        }
    }

    // Fallback
    "HEAD".to_string()
}

/// Get git blame information for a merge file on the given side.
#[tauri::command]
pub async fn git_blame_for_merge(
    merged_path: String,
    side: String,
) -> Result<Vec<BlameLine>, AppError> {
    // Get working directory from merged path
    let work_dir = Path::new(&merged_path)
        .parent()
        .ok_or_else(|| AppError::CommandError {
            message: "Cannot determine parent directory".to_string(),
        })?
        .to_string_lossy()
        .to_string();

    // Get git repo root
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

    // Calculate relative path from git root
    let abs_merged = fs::canonicalize(&merged_path).map_err(|e| AppError::CommandError {
        message: format!("Failed to canonicalize path: {}", e),
    })?;
    let abs_root = fs::canonicalize(&git_root).map_err(|e| AppError::CommandError {
        message: format!("Failed to canonicalize git root: {}", e),
    })?;
    let relative_path = abs_merged
        .strip_prefix(&abs_root)
        .map_err(|_| AppError::CommandError {
            message: "Merged path is not inside git repository".to_string(),
        })?
        .to_string_lossy()
        .to_string();

    // Determine ref based on side
    let git_dir = Path::new(&git_root).join(".git");
    let git_ref = determine_merge_ref(&git_dir, &side).await;

    // Run git blame
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
        assert_eq!(result[0].summary, "Initial commit");

        assert_eq!(result[1].line_number, 2);
        assert_eq!(result[1].hash, "def5678");
        assert_eq!(result[1].author, "Bob");
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
}

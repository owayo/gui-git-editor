use crate::error::AppError;

/// `codex` CLI がシステムで利用可能か確認する。
/// macOS 以外のプラットフォームでは iTerm2 連携が必要なため `false` を返す。
#[tauri::command]
pub async fn check_codex_available() -> Result<bool, AppError> {
    #[cfg(target_os = "macos")]
    {
        let output = tokio::process::Command::new("which")
            .arg("codex")
            .output()
            .await;
        match output {
            Ok(result) => Ok(result.status.success()),
            Err(_) => Ok(false),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

/// マージコンフリクト解決用の codex コマンドを iTerm2 のタブまたはウィンドウで開く。
///
/// macOS では `osascript`（AppleScript）で iTerm2 を開いて codex コマンドを実行する。
/// macOS でのみ利用できる。
#[tauri::command]
pub async fn open_codex_terminal(merged_path: String) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        open_codex_terminal_macos(merged_path).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = merged_path;
        Err(AppError::IoError {
            message: "Codex terminal integration is only available on macOS".to_string(),
        })
    }
}

#[cfg(target_os = "macos")]
async fn open_codex_terminal_macos(merged_path: String) -> Result<(), AppError> {
    // git 解決と osascript 実行は同期 std::process では Tokio ランタイムをブロックするため、
    // tokio::process::Command を使用する（check_codex_available / check_git_sc_available と整合）
    use tokio::process::Command;

    // --cd で渡すために git リポジトリのルートを解決する
    let file_dir = std::path::Path::new(&merged_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let project_dir = resolve_git_root(&file_dir).await.unwrap_or(file_dir);

    // iTerm2 の write text は改行を Enter として送信するため、
    // リクエスト文字列は改行なしの単一行にする
    let request = format!(
        "ファイル {} のコンフリクトを解決してください。\
        手順: \
        1. まずファイル全体を読み、各コンフリクト箇所の LOCAL 側と REMOTE 側の変更意図を分析する \
        2. git log や周辺コードを確認し、それぞれの変更が「なぜ」行われたかを理解する \
        3. 両方の意図を尊重した最適なマージ結果を判断する — 片方の採用、両方の統合、または書き直しを検討する \
        4. import文の重複・欠落、変数名や型の整合性、ロジックの矛盾がないか確認する \
        5. コンフリクトマーカー（<<<<<<<, =======, >>>>>>>）をすべて除去し、マージ結果に置き換える \
        6. プロジェクトに設定されている linter・formatter を実行し、エラーや警告がないことを確認する",
        merged_path
    );
    ensure_single_line("merged path", &merged_path)?;
    ensure_single_line("project directory", &project_dir)?;
    ensure_single_line("codex request", &request)?;

    // iTerm2 の write text で対話シェルへ 1 行として送られるため、! のヒストリ展開まで
    // 無効化できるシングルクォートで各引数を囲む（ダブルクォート内では ! が展開され、
    // パスに ! を含むと codex コマンドが event not found で丸ごと拒否される）。
    let codex_cmd = format!(
        "codex exec --full-auto --cd {} {}",
        shell_single_quote(&project_dir),
        shell_single_quote(&request),
    );

    let apple_script = format!(
        "tell application id \"com.googlecode.iterm2\"\n\
            activate\n\
            if (count of windows) > 0 then\n\
                tell current window\n\
                    set newTab to (create tab with default profile)\n\
                    tell current session of newTab\n\
                        write text \"{cmd}\"\n\
                    end tell\n\
                end tell\n\
            else\n\
                set newWindow to (create window with default profile)\n\
                tell current session of newWindow\n\
                    write text \"{cmd}\"\n\
                end tell\n\
            end if\n\
        end tell",
        cmd = escape_applescript(&codex_cmd),
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&apple_script)
        .output()
        .await
        .map_err(|e| AppError::IoError {
            message: format!("Failed to launch iTerm2: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::IoError {
            message: format!("osascript failed: {}", stderr),
        });
    }

    Ok(())
}

/// 指定ディレクトリから git リポジトリのルートを解決する。
/// Tokio ランタイムをブロックしないよう非同期版の Command を使用する。
#[cfg(target_os = "macos")]
async fn resolve_git_root(dir: &str) -> Option<String> {
    let output = tokio::process::Command::new("git")
        .args(["-C", dir, "rev-parse", "--show-toplevel"])
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !root.is_empty() {
            return Some(root);
        }
    }
    None
}

/// iTerm2 の `write text` で改行が Enter として扱われないよう、動的入力を単一行に制限する。
#[cfg(target_os = "macos")]
fn ensure_single_line(label: &str, value: &str) -> Result<(), AppError> {
    if value.chars().any(|c| c == '\n' || c == '\r') {
        return Err(AppError::CommandError {
            message: format!(
                "{} contains a line break and cannot be sent safely to iTerm2",
                label
            ),
        });
    }
    Ok(())
}

/// シングルクォートで囲んで shell 引数として安全に渡せる形にする。
/// シングルクォート内は `!`（ヒストリ展開）や `$` `` ` `` を含め一切展開されないため、
/// 対話シェルへ write text で送っても安全。内部の `'` は `'\''` で一旦閉じて再開する。
#[cfg(target_os = "macos")]
fn shell_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// AppleScript のダブルクォート文字列内で安全に使えるよう文字列をエスケープする。
#[cfg(target_os = "macos")]
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_single_quote_basic() {
        assert_eq!(shell_single_quote("hello world"), "'hello world'");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_single_quote_special_chars() {
        // シングルクォート内では特殊文字はすべてリテラル。
        assert_eq!(shell_single_quote("he\"llo"), "'he\"llo'");
        assert_eq!(shell_single_quote("$HOME"), "'$HOME'");
        assert_eq!(shell_single_quote("back\\slash"), "'back\\slash'");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_single_quote_neutralizes_bang() {
        // ! を含むパスでもヒストリ展開されないようシングルクォートで囲む。
        assert_eq!(shell_single_quote("important!.txt"), "'important!.txt'");
        assert_eq!(shell_single_quote("a!!b"), "'a!!b'");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_single_quote_embedded_single_quote() {
        // 内部の ' は '\'' で閉じて再開する。
        assert_eq!(shell_single_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_escape_applescript_quotes() {
        assert_eq!(escape_applescript("say \"hi\""), "say \\\"hi\\\"");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_escape_applescript_backslash() {
        assert_eq!(escape_applescript("path\\to"), "path\\\\to");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_ensure_single_line_rejects_line_breaks() {
        assert!(ensure_single_line("value", "safe path").is_ok());
        assert!(ensure_single_line("value", "bad\npath").is_err());
        assert!(ensure_single_line("value", "bad\rpath").is_err());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_single_quote_backtick() {
        assert_eq!(shell_single_quote("run `cmd`"), "'run `cmd`'");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_single_quote_combined() {
        // 複数の特殊文字を含むパスもシングルクォート内でリテラル化される。
        assert_eq!(
            shell_single_quote("path with \"quotes\" and $var"),
            "'path with \"quotes\" and $var'"
        );
    }
}

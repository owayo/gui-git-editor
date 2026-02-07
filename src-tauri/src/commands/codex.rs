use crate::error::AppError;

/// Check if the `codex` CLI is available on the system.
/// Returns `false` on non-macOS platforms since the terminal integration requires iTerm2.
#[tauri::command]
pub async fn check_codex_available() -> Result<bool, AppError> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("which").arg("codex").output();
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

/// Open an iTerm2 tab/window running the codex command to resolve merge conflicts.
///
/// Uses `osascript` (AppleScript) on macOS to open iTerm2 with the codex command.
/// Only available on macOS.
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
    use std::process::Command;

    // Resolve the git repository root directory for --cd
    let file_dir = std::path::Path::new(&merged_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let project_dir = resolve_git_root(&file_dir).unwrap_or(file_dir);

    let request = format!(
        "ファイル {} のコンフリクトマーカーをすべて解決してください。\
        コンフリクトマーカー（<<<<<<<, =======, >>>>>>>）を除去し、\
        適切にマージされたコードに置き換えてください。\
        解決後、プロジェクトに設定されている linter や formatter を実行し、\
        エラーや警告がないことを確認してください。",
        merged_path
    );

    let codex_cmd = format!(
        "codex exec --full-auto --cd {} \"{}\"",
        shell_escape(&project_dir),
        shell_escape(&request),
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

/// Resolve the git repository root from a directory path.
#[cfg(target_os = "macos")]
fn resolve_git_root(dir: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["-C", dir, "rev-parse", "--show-toplevel"])
        .output()
        .ok()?;

    if output.status.success() {
        let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !root.is_empty() {
            return Some(root);
        }
    }
    None
}

/// Escape a string for use inside a double-quoted shell argument.
#[cfg(target_os = "macos")]
fn shell_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`")
}

/// Escape a string for use inside an AppleScript double-quoted string.
#[cfg(target_os = "macos")]
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_escape_basic() {
        assert_eq!(shell_escape("hello world"), "hello world");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_shell_escape_special_chars() {
        assert_eq!(shell_escape("he\"llo"), "he\\\"llo");
        assert_eq!(shell_escape("$HOME"), "\\$HOME");
        assert_eq!(shell_escape("back\\slash"), "back\\\\slash");
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
}

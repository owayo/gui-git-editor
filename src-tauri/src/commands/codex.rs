use crate::error::AppError;
use std::process::Command;

/// Check if the `codex` CLI is available on the system.
#[tauri::command]
pub async fn check_codex_available() -> Result<bool, AppError> {
    let output = Command::new("which").arg("codex").output();

    match output {
        Ok(result) => Ok(result.status.success()),
        Err(_) => Ok(false),
    }
}

/// Open a new Terminal.app window running the codex command to resolve merge conflicts.
///
/// Uses `osascript` (AppleScript) on macOS to open Terminal.app with the codex command.
#[tauri::command]
pub async fn open_codex_terminal(merged_path: String) -> Result<(), AppError> {
    // Determine the project directory from the merged file path
    let project_dir = std::path::Path::new(&merged_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let request = format!(
        "ファイル {} のコンフリクトマーカーをすべて解決してください。\
        コンフリクトマーカー（<<<<<<<, =======, >>>>>>>）を除去し、\
        適切にマージされたコードに置き換えてください。",
        merged_path
    );

    let codex_cmd = format!(
        "codex exec --full-auto --cd {} \"{}\"",
        shell_escape(&project_dir),
        shell_escape(&request),
    );

    let apple_script = format!(
        "tell application \"Terminal\"\n\
            activate\n\
            do script \"{}\"\n\
        end tell",
        escape_applescript(&codex_cmd),
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&apple_script)
        .output()
        .map_err(|e| AppError::IoError {
            message: format!("Failed to launch Terminal.app: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::IoError {
            message: format!("osascript failed: {}", stderr),
        });
    }

    Ok(())
}

/// Escape a string for use inside a double-quoted shell argument.
fn shell_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`")
}

/// Escape a string for use inside an AppleScript double-quoted string.
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_escape_basic() {
        assert_eq!(shell_escape("hello world"), "hello world");
    }

    #[test]
    fn test_shell_escape_special_chars() {
        assert_eq!(shell_escape("he\"llo"), "he\\\"llo");
        assert_eq!(shell_escape("$HOME"), "\\$HOME");
        assert_eq!(shell_escape("back\\slash"), "back\\\\slash");
    }

    #[test]
    fn test_escape_applescript_quotes() {
        assert_eq!(escape_applescript("say \"hi\""), "say \\\"hi\\\"");
    }

    #[test]
    fn test_escape_applescript_backslash() {
        assert_eq!(escape_applescript("path\\to"), "path\\\\to");
    }
}

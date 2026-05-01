use tokio::process::Command;

use crate::error::AppError;
use crate::parser::{
    parse_rebase_todo as parse_todo, serialize_rebase_todo as serialize_todo, RebaseTodoFile,
};

/// git-rebase-todo の内容を解析する。
#[tauri::command]
pub fn parse_rebase_todo(content: String) -> Result<RebaseTodoFile, AppError> {
    parse_todo(&content)
}

/// RebaseTodoFile を git-rebase-todo 形式へ変換する。
#[tauri::command]
pub fn serialize_rebase_todo(file: RebaseTodoFile) -> String {
    serialize_todo(&file)
}

/// システム上で git-sc が利用可能か確認する。
#[tauri::command]
pub async fn check_git_sc_available() -> Result<bool, AppError> {
    let output = Command::new("which")
        .arg("git-sc")
        .output()
        .await
        .map_err(|_| AppError::CommandError {
            message: "Failed to run which".to_string(),
        })?;
    Ok(output.status.success())
}

/// 指定したコミットハッシュを対象に git-sc でコミットメッセージを生成する。
#[tauri::command]
pub async fn generate_commit_message(
    hashes: Vec<String>,
    with_body: bool,
) -> Result<String, AppError> {
    if hashes.is_empty() {
        return Err(AppError::CommandError {
            message: "No commit hashes provided".to_string(),
        });
    }

    let mut args = vec!["--generate-for".to_string()];
    args.extend(hashes);

    if with_body {
        args.push("--body".to_string());
    }

    run_git_sc(&args).await
}

/// ステージ済み変更を対象に git-sc でコミットメッセージを生成する（dry-run mode）。
/// dry-run の出力を解析し、区切り線に挟まれたコミットメッセージを取り出す。
#[tauri::command]
pub async fn generate_commit_message_from_staged(with_body: bool) -> Result<String, AppError> {
    let mut args = vec!["--dry-run".to_string()];

    if with_body {
        args.push("--body".to_string());
    }

    let raw = run_git_sc(&args).await?;
    Ok(parse_dry_run_output(&raw))
}

/// `git-sc --dry-run` の出力からコミットメッセージを取り出す。
///
/// 出力形式:
/// ```text
/// Using prefix rule for ...
/// Generating commit message...
///   Using Codex CLI...
///
/// Generated commit message:
/// ──────────────────────────────────────────────────
/// <commit message here>
/// ──────────────────────────────────────────────────
///
/// Dry run mode - no commit was made.
/// ```
fn parse_dry_run_output(output: &str) -> String {
    let lines: Vec<&str> = output.lines().collect();

    // 区切り線（'─' U+2500 だけで構成された行）を探す。
    let sep_indices: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| {
            let trimmed = line.trim();
            !trimmed.is_empty() && trimmed.chars().all(|c| c == '─')
        })
        .map(|(i, _)| i)
        .collect();

    if sep_indices.len() >= 2 {
        let start = sep_indices[0] + 1;
        let end = sep_indices[1];
        if start < end {
            return lines[start..end].join("\n").trim().to_string();
        }
    }

    // フォールバックとして生の出力を返す。
    output.to_string()
}

/// 指定された引数で git-sc を実行する。
async fn run_git_sc(args: &[String]) -> Result<String, AppError> {
    log::debug!("[CMD] git-sc {}", args.join(" "));

    let output = Command::new("git-sc")
        .args(args)
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to execute git-sc: {}", e),
        })?;

    log::debug!("[CMD] exit status: {:?}", output.status);

    if output.status.success() {
        let message = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if message.is_empty() {
            return Err(AppError::CommandError {
                message: "git-sc returned empty message".to_string(),
            });
        }
        Ok(message)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::CommandError {
            message: if stderr.is_empty() {
                "git-sc failed with no error message".to_string()
            } else {
                stderr
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_dry_run_subject_only() {
        let output = "\
Using prefix rule for github\\.com/owayo: conventional
Generating commit message...
  Using Codex CLI...

Generated commit message:
──────────────────────────────────────────────────
chore: バージョンを2026.1.104へ更新
──────────────────────────────────────────────────

Dry run mode - no commit was made.";
        assert_eq!(
            parse_dry_run_output(output),
            "chore: バージョンを2026.1.104へ更新"
        );
    }

    #[test]
    fn test_parse_dry_run_with_body() {
        let output = "\
Using prefix rule for github\\.com/owayo: conventional
Generating commit message...

Generated commit message:
──────────────────────────────────────────────────
feat: ログイン機能を追加

OAuth2.0を使用したGoogle認証を実装。
セッション管理にはJWTを採用。
──────────────────────────────────────────────────

Dry run mode - no commit was made.";
        let result = parse_dry_run_output(output);
        assert!(result.starts_with("feat: ログイン機能を追加"));
        assert!(result.contains("OAuth2.0"));
        assert!(result.contains("JWTを採用。"));
    }

    #[test]
    fn test_parse_dry_run_no_separators_fallback() {
        let output = "some raw message without separators";
        assert_eq!(parse_dry_run_output(output), output);
    }
}

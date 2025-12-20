use tokio::process::Command;

use crate::error::AppError;
use crate::parser::{
    parse_rebase_todo as parse_todo, serialize_rebase_todo as serialize_todo, RebaseTodoFile,
};

/// Parse git-rebase-todo content
#[tauri::command]
pub fn parse_rebase_todo(content: String) -> Result<RebaseTodoFile, AppError> {
    parse_todo(&content)
}

/// Serialize RebaseTodoFile to git-rebase-todo format
#[tauri::command]
pub fn serialize_rebase_todo(file: RebaseTodoFile) -> String {
    serialize_todo(&file)
}

/// Generate commit message using git-sc for specified commit hashes
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

/// Generate commit message using git-sc for staged changes (uses HEAD as reference)
#[tauri::command]
pub async fn generate_commit_message_from_staged(with_body: bool) -> Result<String, AppError> {
    // Get HEAD commit hash
    let head_output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to get HEAD: {}", e),
        })?;

    if !head_output.status.success() {
        return Err(AppError::CommandError {
            message: "No commits in repository yet".to_string(),
        });
    }

    let head_hash = String::from_utf8_lossy(&head_output.stdout)
        .trim()
        .to_string();

    let mut args = vec!["--generate-for".to_string(), head_hash];

    if with_body {
        args.push("--body".to_string());
    }

    run_git_sc(&args).await
}

/// Run git-sc with the given arguments
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

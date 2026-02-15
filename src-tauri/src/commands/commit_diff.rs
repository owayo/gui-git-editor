use serde::Serialize;
use tokio::process::Command;

use super::staging::resolve_git_root;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileInfo {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
}

/// Parse the output of `git diff-tree --no-commit-id -r --name-status`.
/// Each line is `STATUS\tPATH` or `STATUS\tOLD_PATH\tNEW_PATH` for renames/copies.
pub fn parse_diff_tree_output(output: &str) -> Vec<CommitFileInfo> {
    let mut files = Vec::new();

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 2 {
            continue;
        }

        let raw_status = parts[0];
        // R100, C100 etc. -> take first character
        let status = raw_status.chars().next().unwrap_or('?').to_string();

        let (path, original_path) = if (status == "R" || status == "C") && parts.len() >= 3 {
            (parts[2].to_string(), Some(parts[1].to_string()))
        } else {
            (parts[1].to_string(), None)
        };

        files.push(CommitFileInfo {
            path,
            original_path,
            status,
        });
    }

    files
}

/// Get the list of files changed in a specific commit.
#[tauri::command]
pub async fn git_commit_files(
    file_path: String,
    commit_hash: String,
) -> Result<Vec<CommitFileInfo>, AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args([
            "-C",
            &git_root,
            "diff-tree",
            "--no-commit-id",
            "-r",
            "--name-status",
            &commit_hash,
        ])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git diff-tree: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git diff-tree failed: {}", stderr),
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_diff_tree_output(&stdout))
}

/// Get the diff for a specific file in a commit.
#[tauri::command]
pub async fn git_commit_diff(
    file_path: String,
    commit_hash: String,
    target_file: String,
) -> Result<String, AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args([
            "-C",
            &git_root,
            "diff-tree",
            "-p",
            &commit_hash,
            "--",
            &target_file,
        ])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git diff-tree: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git diff-tree failed: {}", stderr),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_diff_tree_basic() {
        let output = "M\tsrc/main.rs\nA\tnew_file.txt\nD\told_file.txt\n";
        let files = parse_diff_tree_output(output);
        assert_eq!(files.len(), 3);

        assert_eq!(files[0].status, "M");
        assert_eq!(files[0].path, "src/main.rs");
        assert!(files[0].original_path.is_none());

        assert_eq!(files[1].status, "A");
        assert_eq!(files[1].path, "new_file.txt");

        assert_eq!(files[2].status, "D");
        assert_eq!(files[2].path, "old_file.txt");
    }

    #[test]
    fn test_parse_diff_tree_rename() {
        let output = "R100\told_name.rs\tnew_name.rs\n";
        let files = parse_diff_tree_output(output);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].path, "new_name.rs");
        assert_eq!(files[0].original_path.as_deref(), Some("old_name.rs"));
    }

    #[test]
    fn test_parse_diff_tree_copy() {
        let output = "C095\tsrc/a.rs\tsrc/b.rs\n";
        let files = parse_diff_tree_output(output);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "C");
        assert_eq!(files[0].path, "src/b.rs");
        assert_eq!(files[0].original_path.as_deref(), Some("src/a.rs"));
    }

    #[test]
    fn test_parse_diff_tree_empty() {
        let files = parse_diff_tree_output("");
        assert!(files.is_empty());
    }

    #[test]
    fn test_parse_diff_tree_mixed() {
        let output = "M\tsrc/lib.rs\nA\tsrc/new.rs\nR100\told.rs\trenamed.rs\nD\tremoved.rs\n";
        let files = parse_diff_tree_output(output);
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].status, "M");
        assert_eq!(files[1].status, "A");
        assert_eq!(files[2].status, "R");
        assert_eq!(files[2].path, "renamed.rs");
        assert_eq!(files[2].original_path.as_deref(), Some("old.rs"));
        assert_eq!(files[3].status, "D");
    }
}

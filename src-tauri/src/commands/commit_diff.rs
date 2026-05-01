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

/// `git diff-tree --no-commit-id -r --name-status` の通常出力を解析する。
/// 各行は `STATUS\tPATH`、または rename/copy の場合は `STATUS\tOLD_PATH\tNEW_PATH`。
#[cfg(test)]
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
        // R100 / C100 などは先頭文字だけを状態として扱う。
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

/// `git diff-tree --name-status -z` の NUL 区切り出力を解析する。
pub fn parse_diff_tree_output_z(output: &[u8]) -> Vec<CommitFileInfo> {
    let mut files = Vec::new();
    let mut fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());

    while let Some(raw_status_bytes) = fields.next() {
        let raw_status = String::from_utf8_lossy(raw_status_bytes);
        let status = raw_status.chars().next().unwrap_or('?').to_string();

        let Some(first_path_bytes) = fields.next() else {
            break;
        };
        let first_path = String::from_utf8_lossy(first_path_bytes).to_string();

        let (path, original_path) = if status == "R" || status == "C" {
            if let Some(second_path_bytes) = fields.next() {
                (
                    String::from_utf8_lossy(second_path_bytes).to_string(),
                    Some(first_path),
                )
            } else {
                (first_path, None)
            }
        } else {
            (first_path, None)
        };

        files.push(CommitFileInfo {
            path,
            original_path,
            status,
        });
    }

    files
}

/// 指定したコミットで変更されたファイル一覧を取得する。
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
            "-M",
            "-C",
            "-z",
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

    Ok(parse_diff_tree_output_z(&output.stdout))
}

/// 指定したコミット内の特定ファイルの差分を取得する。
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

    #[test]
    fn test_parse_diff_tree_z_with_tab_in_path() {
        let output = b"A\0a\tb.txt\0M\0dir/name with spaces.rs\0";
        let files = parse_diff_tree_output_z(output);

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].status, "A");
        assert_eq!(files[0].path, "a\tb.txt");
        assert!(files[0].original_path.is_none());
        assert_eq!(files[1].status, "M");
        assert_eq!(files[1].path, "dir/name with spaces.rs");
    }

    #[test]
    fn test_parse_diff_tree_z_rename_with_tab_in_path() {
        let output = b"R100\0old\tname.rs\0new\tname.rs\0";
        let files = parse_diff_tree_output_z(output);

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].path, "new\tname.rs");
        assert_eq!(files[0].original_path.as_deref(), Some("old\tname.rs"));
    }
}

use std::path::Path;

use serde::Serialize;
use tokio::process::Command;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub untracked: Vec<FileStatus>,
    pub repo_root: String,
    pub branch_name: String,
}

/// Resolve git repository root from a file path (e.g. .git/COMMIT_EDITMSG).
/// Handles the case where the file is inside the .git directory, where
/// `git rev-parse --show-toplevel` would fail with "this operation must be run in a work tree".
pub(crate) async fn resolve_git_root(file_path: &str) -> Result<String, AppError> {
    let path = Path::new(file_path);

    // Walk up ancestors; if any component is ".git", use its parent as work dir
    let mut work_dir = path.parent().ok_or_else(|| AppError::CommandError {
        message: "Cannot determine parent directory".to_string(),
    })?;

    for ancestor in path.ancestors() {
        if ancestor.file_name().map(|n| n == ".git").unwrap_or(false) {
            work_dir = ancestor.parent().ok_or_else(|| AppError::CommandError {
                message: "Cannot determine repository root".to_string(),
            })?;
            break;
        }
    }

    let work_dir_str = work_dir.to_string_lossy().to_string();

    let output = Command::new("git")
        .args(["-C", &work_dir_str, "rev-parse", "--show-toplevel"])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git rev-parse: {}", e),
        })?;

    if !output.status.success() {
        return Err(AppError::CommandError {
            message: "Not a git repository".to_string(),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Get the current branch name.
async fn get_branch_name(git_root: &str) -> String {
    let output = Command::new("git")
        .args(["-C", git_root, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "HEAD".to_string(),
    }
}

/// Parse a single line of `git status --porcelain=v1` output.
pub fn parse_porcelain_line(line: &str) -> Option<FileStatus> {
    if line.len() < 4 {
        return None;
    }

    let index_char = line.as_bytes()[0] as char;
    let worktree_char = line.as_bytes()[1] as char;
    let path_part = &line[3..];

    // Handle rename: "R  new_name -> old_name" pattern
    let (path, original_path) = if index_char == 'R' || index_char == 'C' {
        if let Some(arrow_pos) = path_part.find(" -> ") {
            let orig = path_part[..arrow_pos].to_string();
            let new_path = path_part[arrow_pos + 4..].to_string();
            (new_path, Some(orig))
        } else {
            (path_part.to_string(), None)
        }
    } else {
        (path_part.to_string(), None)
    };

    Some(FileStatus {
        path,
        original_path,
        index_status: index_char.to_string(),
        worktree_status: worktree_char.to_string(),
    })
}

/// Parse full `git status --porcelain=v1` output into categorized lists.
pub fn parse_porcelain_status(output: &str) -> (Vec<FileStatus>, Vec<FileStatus>, Vec<FileStatus>) {
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }

        let Some(status) = parse_porcelain_line(line) else {
            continue;
        };

        let idx = status.index_status.as_str();
        let wt = status.worktree_status.as_str();

        if idx == "?" && wt == "?" {
            untracked.push(status);
        } else {
            // Index changes → staged
            if idx != " " && idx != "?" {
                staged.push(FileStatus {
                    path: status.path.clone(),
                    original_path: status.original_path.clone(),
                    index_status: idx.to_string(),
                    worktree_status: " ".to_string(),
                });
            }
            // Worktree changes → unstaged
            if wt != " " && wt != "?" {
                unstaged.push(FileStatus {
                    path: status.path.clone(),
                    original_path: None,
                    index_status: " ".to_string(),
                    worktree_status: wt.to_string(),
                });
            }
        }
    }

    (staged, unstaged, untracked)
}

/// Get git status for the repository containing the given file.
#[tauri::command]
pub async fn git_status(file_path: String) -> Result<GitStatusResult, AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args(["-C", &git_root, "status", "--porcelain=v1"])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git status: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git status failed: {}", stderr),
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let (staged, unstaged, untracked) = parse_porcelain_status(&stdout);
    let branch_name = get_branch_name(&git_root).await;

    Ok(GitStatusResult {
        staged,
        unstaged,
        untracked,
        repo_root: git_root,
        branch_name,
    })
}

/// Stage a single file.
#[tauri::command]
pub async fn git_stage_file(file_path: String, target: String) -> Result<(), AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args(["-C", &git_root, "add", "--", &target])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git add: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git add failed: {}", stderr),
        });
    }

    Ok(())
}

/// Unstage a single file.
#[tauri::command]
pub async fn git_unstage_file(file_path: String, target: String) -> Result<(), AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args(["-C", &git_root, "restore", "--staged", "--", &target])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git restore: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git restore --staged failed: {}", stderr),
        });
    }

    Ok(())
}

/// Stage all changes.
#[tauri::command]
pub async fn git_stage_all(file_path: String) -> Result<(), AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args(["-C", &git_root, "add", "-A"])
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git add -A: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git add -A failed: {}", stderr),
        });
    }

    Ok(())
}

/// Get diff for a specific file.
#[tauri::command]
pub async fn git_diff_file(
    file_path: String,
    target: String,
    staged: bool,
) -> Result<String, AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let mut args = vec!["-C".to_string(), git_root, "diff".to_string()];
    if staged {
        args.push("--cached".to_string());
    }
    args.push("--".to_string());
    args.push(target);

    let output = Command::new("git")
        .args(&args)
        .output()
        .await
        .map_err(|e| AppError::CommandError {
            message: format!("Failed to run git diff: {}", e),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandError {
            message: format!("git diff failed: {}", stderr),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_porcelain_modified_staged() {
        let (staged, unstaged, untracked) = parse_porcelain_status("M  src/main.rs\n");
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].path, "src/main.rs");
        assert_eq!(staged[0].index_status, "M");
        assert!(unstaged.is_empty());
        assert!(untracked.is_empty());
    }

    #[test]
    fn test_parse_porcelain_modified_unstaged() {
        let (staged, unstaged, untracked) = parse_porcelain_status(" M src/main.rs\n");
        assert!(staged.is_empty());
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0].path, "src/main.rs");
        assert_eq!(unstaged[0].worktree_status, "M");
        assert!(untracked.is_empty());
    }

    #[test]
    fn test_parse_porcelain_added() {
        let (staged, _, _) = parse_porcelain_status("A  new_file.txt\n");
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].index_status, "A");
        assert_eq!(staged[0].path, "new_file.txt");
    }

    #[test]
    fn test_parse_porcelain_deleted() {
        let (staged, _, _) = parse_porcelain_status("D  old_file.txt\n");
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].index_status, "D");
        assert_eq!(staged[0].path, "old_file.txt");
    }

    #[test]
    fn test_parse_porcelain_renamed() {
        let (staged, _, _) = parse_porcelain_status("R  old_name.txt -> new_name.txt\n");
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].index_status, "R");
        assert_eq!(staged[0].path, "new_name.txt");
        assert_eq!(staged[0].original_path.as_deref(), Some("old_name.txt"));
    }

    #[test]
    fn test_parse_porcelain_untracked() {
        let (staged, unstaged, untracked) = parse_porcelain_status("?? new_file.txt\n");
        assert!(staged.is_empty());
        assert!(unstaged.is_empty());
        assert_eq!(untracked.len(), 1);
        assert_eq!(untracked[0].path, "new_file.txt");
    }

    #[test]
    fn test_parse_porcelain_both_staged_and_unstaged() {
        let (staged, unstaged, _) = parse_porcelain_status("MM src/lib.rs\n");
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].index_status, "M");
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0].worktree_status, "M");
    }

    #[test]
    fn test_parse_porcelain_empty() {
        let (staged, unstaged, untracked) = parse_porcelain_status("");
        assert!(staged.is_empty());
        assert!(unstaged.is_empty());
        assert!(untracked.is_empty());
    }

    #[test]
    fn test_parse_porcelain_mixed() {
        let input = "M  staged.rs\n M unstaged.rs\n?? untracked.txt\nA  added.rs\nD  deleted.rs\n";
        let (staged, unstaged, untracked) = parse_porcelain_status(input);
        assert_eq!(staged.len(), 3); // M, A, D
        assert_eq!(unstaged.len(), 1); // M (worktree)
        assert_eq!(untracked.len(), 1); // ??
    }

    #[test]
    fn test_parse_porcelain_line_too_short() {
        assert!(parse_porcelain_line("M").is_none());
        assert!(parse_porcelain_line("MM").is_none());
        assert!(parse_porcelain_line("MM ").is_none());
    }
}

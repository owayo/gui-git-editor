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

/// ファイルパス（例: `.git/COMMIT_EDITMSG`）から Git リポジトリのルートを解決する。
/// `.git` 配下では `git rev-parse --show-toplevel` が失敗するため、その場合も扱う。
pub(crate) async fn resolve_git_root(file_path: &str) -> Result<String, AppError> {
    let path = Path::new(file_path);

    // 祖先をたどり、`.git` 配下なら親ディレクトリを作業ディレクトリに使う。
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

/// 現在のブランチ名を取得する。
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

#[cfg(test)]
/// `git status --porcelain=v1` の 1 行を解釈する。
pub fn parse_porcelain_line(line: &str) -> Option<FileStatus> {
    if line.len() < 4 {
        return None;
    }

    let index_char = line.as_bytes()[0] as char;
    let worktree_char = line.as_bytes()[1] as char;
    let path_part = &line[3..];

    // リネームは `old -> new` 形式なので、元パスと新パスを分解する。
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

fn push_status(
    status: FileStatus,
    staged: &mut Vec<FileStatus>,
    unstaged: &mut Vec<FileStatus>,
    untracked: &mut Vec<FileStatus>,
) {
    let idx = status.index_status.as_str();
    let wt = status.worktree_status.as_str();

    if idx == "?" && wt == "?" {
        untracked.push(status);
    } else {
        if idx != " " && idx != "?" {
            staged.push(FileStatus {
                path: status.path.clone(),
                original_path: status.original_path.clone(),
                index_status: idx.to_string(),
                worktree_status: " ".to_string(),
            });
        }

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

#[cfg(test)]
/// `git status --porcelain=v1` の全文を分類済みの配列に変換する。
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

        push_status(status, &mut staged, &mut unstaged, &mut untracked);
    }

    (staged, unstaged, untracked)
}

/// `git status --porcelain=v1 -z` の出力を分類済みの配列に変換する。
pub fn parse_porcelain_status_z(
    output: &[u8],
) -> (Vec<FileStatus>, Vec<FileStatus>, Vec<FileStatus>) {
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut cursor = 0;

    while cursor + 4 <= output.len() {
        let index_char = output[cursor] as char;
        let worktree_char = output[cursor + 1] as char;
        let path_start = cursor + 3;

        let Some(path_end_offset) = output[path_start..].iter().position(|byte| *byte == 0) else {
            break;
        };
        let path_end = path_start + path_end_offset;
        let path = String::from_utf8_lossy(&output[path_start..path_end]).to_string();
        cursor = path_end + 1;

        let original_path = if index_char == 'R' || index_char == 'C' {
            let Some(original_end_offset) = output[cursor..].iter().position(|byte| *byte == 0)
            else {
                break;
            };
            let original_end = cursor + original_end_offset;
            let original = String::from_utf8_lossy(&output[cursor..original_end]).to_string();
            cursor = original_end + 1;
            Some(original)
        } else {
            None
        };

        push_status(
            FileStatus {
                path,
                original_path,
                index_status: index_char.to_string(),
                worktree_status: worktree_char.to_string(),
            },
            &mut staged,
            &mut unstaged,
            &mut untracked,
        );
    }

    (staged, unstaged, untracked)
}

/// 指定したファイルを含むリポジトリの Git 状態を取得する。
#[tauri::command]
pub async fn git_status(file_path: String) -> Result<GitStatusResult, AppError> {
    let git_root = resolve_git_root(&file_path).await?;

    let output = Command::new("git")
        .args(["-C", &git_root, "status", "--porcelain=v1", "-z"])
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

    let (staged, unstaged, untracked) = parse_porcelain_status_z(&output.stdout);
    let branch_name = get_branch_name(&git_root).await;

    Ok(GitStatusResult {
        staged,
        unstaged,
        untracked,
        repo_root: git_root,
        branch_name,
    })
}

/// 1 ファイルをステージする。
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

/// 1 ファイルをアンステージする。
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

/// すべての変更をステージする。
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

/// 指定ファイルの差分を取得する。
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
        assert_eq!(staged.len(), 3); // 変更は M / A / D の 3 件
        assert_eq!(unstaged.len(), 1); // 作業ツリー変更は M の 1 件
        assert_eq!(untracked.len(), 1); // 未追跡は 1 件
    }

    #[test]
    fn test_parse_porcelain_z_with_spaces() {
        let input = b" M a b.txt\0";
        let (staged, unstaged, untracked) = parse_porcelain_status_z(input);
        assert!(staged.is_empty());
        assert_eq!(unstaged.len(), 1);
        assert_eq!(unstaged[0].path, "a b.txt");
        assert!(untracked.is_empty());
    }

    #[test]
    fn test_parse_porcelain_z_rename_with_spaces() {
        let input = b"R  new name.txt\0old name.txt\0";
        let (staged, unstaged, untracked) = parse_porcelain_status_z(input);
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].path, "new name.txt");
        assert_eq!(staged[0].original_path.as_deref(), Some("old name.txt"));
        assert!(unstaged.is_empty());
        assert!(untracked.is_empty());
    }

    #[test]
    fn test_parse_porcelain_line_too_short() {
        assert!(parse_porcelain_line("M").is_none());
        assert!(parse_porcelain_line("MM").is_none());
        assert!(parse_porcelain_line("MM ").is_none());
    }
}

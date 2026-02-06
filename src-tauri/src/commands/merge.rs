use crate::error::AppError;
use crate::parser::{parse_conflict_markers, ParseConflictsResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tokio::process::Command;

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
            return name
                .strip_prefix("refs/heads/")
                .unwrap_or(name)
                .to_string();
        }
    }

    // Check for rebase-apply context
    let rebase_apply = git_dir.join("rebase-apply");
    if rebase_apply.is_dir() {
        let head_name = rebase_apply.join("head-name");
        if let Ok(content) = fs::read_to_string(&head_name) {
            let name = content.trim();
            return name
                .strip_prefix("refs/heads/")
                .unwrap_or(name)
                .to_string();
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

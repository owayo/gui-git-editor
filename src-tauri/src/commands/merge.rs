use crate::error::AppError;
use crate::parser::{parse_conflict_markers, ParseConflictsResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// A single file's content with its path.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeFileContent {
    pub path: String,
    pub content: String,
}

/// All merge file contents returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeFiles {
    pub local: MergeFileContent,
    pub remote: MergeFileContent,
    pub base: Option<MergeFileContent>,
    pub merged: MergeFileContent,
    pub language: String,
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

    Ok(MergeFiles {
        local: local_content,
        remote: remote_content,
        base: base_content,
        merged: merged_content,
        language,
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
        };
        let json = serde_json::to_string(&files).unwrap();
        assert!(json.contains("\"language\":\"rust\""));
        assert!(json.contains("\"local\""));
        assert!(json.contains("\"remote\""));
        assert!(json.contains("\"merged\""));
    }
}

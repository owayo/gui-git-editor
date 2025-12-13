use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GitFileType {
    RebaseTodo,
    CommitMsg,
    MergeMsg,
    SquashMsg,
    TagMsg,
    Unknown,
}

/// Detect Git file type from file path
pub fn detect_file_type(path: &Path) -> GitFileType {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    match file_name {
        "git-rebase-todo" => GitFileType::RebaseTodo,
        "COMMIT_EDITMSG" => GitFileType::CommitMsg,
        "MERGE_MSG" => GitFileType::MergeMsg,
        "SQUASH_MSG" => GitFileType::SquashMsg,
        "TAG_EDITMSG" => GitFileType::TagMsg,
        _ => GitFileType::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_rebase_todo() {
        let path = Path::new("/path/to/.git/rebase-merge/git-rebase-todo");
        assert_eq!(detect_file_type(path), GitFileType::RebaseTodo);
    }

    #[test]
    fn test_detect_commit_msg() {
        let path = Path::new("/path/to/.git/COMMIT_EDITMSG");
        assert_eq!(detect_file_type(path), GitFileType::CommitMsg);
    }

    #[test]
    fn test_detect_merge_msg() {
        let path = Path::new("/path/to/.git/MERGE_MSG");
        assert_eq!(detect_file_type(path), GitFileType::MergeMsg);
    }

    #[test]
    fn test_detect_squash_msg() {
        let path = Path::new("/path/to/.git/SQUASH_MSG");
        assert_eq!(detect_file_type(path), GitFileType::SquashMsg);
    }

    #[test]
    fn test_detect_tag_msg() {
        let path = Path::new("/path/to/.git/TAG_EDITMSG");
        assert_eq!(detect_file_type(path), GitFileType::TagMsg);
    }

    #[test]
    fn test_detect_unknown() {
        let path = Path::new("/path/to/some/random/file.txt");
        assert_eq!(detect_file_type(path), GitFileType::Unknown);
    }
}

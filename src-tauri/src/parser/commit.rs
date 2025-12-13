//! Commit message parser and serializer
//!
//! Handles parsing of COMMIT_EDITMSG, MERGE_MSG, SQUASH_MSG, and TAG_EDITMSG files.

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Represents a parsed commit message with its components
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommitMessage {
    /// The first line of the commit message (subject line)
    pub subject: String,
    /// The body of the commit message (after the blank line)
    pub body: String,
    /// Git trailers (e.g., "Signed-off-by:", "Co-authored-by:")
    pub trailers: Vec<Trailer>,
    /// Comment lines (lines starting with #)
    pub comments: Vec<String>,
    /// Diff content shown in verbose mode (after the scissors line)
    pub diff_content: Option<String>,
}

/// Represents a git trailer (key-value metadata)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Trailer {
    pub key: String,
    pub value: String,
}

/// The scissors line that separates the commit message from the diff
const SCISSORS_LINE: &str = "# ------------------------ >8 ------------------------";

/// Known trailer keys
const KNOWN_TRAILER_KEYS: &[&str] = &[
    "Signed-off-by",
    "Co-authored-by",
    "Reviewed-by",
    "Acked-by",
    "Tested-by",
    "Reported-by",
    "Fixes",
    "Closes",
    "Refs",
    "See-also",
    "Cc",
];

impl CommitMessage {
    /// Create a new empty commit message
    pub fn new() -> Self {
        Self {
            subject: String::new(),
            body: String::new(),
            trailers: Vec::new(),
            comments: Vec::new(),
            diff_content: None,
        }
    }

    /// Check if the subject line exceeds the recommended length (50 chars)
    pub fn is_subject_too_long(&self) -> bool {
        self.subject.len() > 50
    }

    /// Get the length of the subject line
    pub fn subject_length(&self) -> usize {
        self.subject.len()
    }

    /// Check if any body line exceeds the recommended length (72 chars)
    #[cfg(test)]
    pub fn has_long_body_lines(&self) -> bool {
        self.body.lines().any(|line| line.len() > 72)
    }

    /// Get lines that exceed the recommended 72 character limit
    pub fn get_long_body_lines(&self) -> Vec<(usize, usize)> {
        self.body
            .lines()
            .enumerate()
            .filter_map(|(i, line)| {
                if line.len() > 72 {
                    Some((i + 1, line.len()))
                } else {
                    None
                }
            })
            .collect()
    }
}

impl Default for CommitMessage {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse a commit message file content into a CommitMessage struct
pub fn parse_commit_msg(content: &str) -> Result<CommitMessage, AppError> {
    let mut message = CommitMessage::new();
    let mut lines: Vec<&str> = content.lines().collect();

    // Check for scissors line and extract diff content
    if let Some(scissors_pos) = lines.iter().position(|line| *line == SCISSORS_LINE) {
        // Everything after scissors is diff content
        let diff_lines: Vec<&str> = lines.drain(scissors_pos..).skip(1).collect();
        if !diff_lines.is_empty() {
            message.diff_content = Some(diff_lines.join("\n"));
        }
    }

    // Separate comments from content lines
    let (content_lines, comment_lines): (Vec<&str>, Vec<&str>) =
        lines.iter().partition(|line| !line.starts_with('#'));

    message.comments = comment_lines.iter().map(|s| s.to_string()).collect();

    // Parse subject, body, and trailers from content lines
    let content_text = content_lines.join("\n");
    let trimmed = content_text.trim();

    if trimmed.is_empty() {
        return Ok(message);
    }

    // Split into paragraphs by blank lines
    let parts: Vec<&str> = trimmed.split("\n\n").collect();

    if parts.is_empty() {
        return Ok(message);
    }

    // First non-empty part is the subject
    message.subject = parts[0].lines().next().unwrap_or("").to_string();

    // Check if first part has multiple lines (treat additional lines as body start)
    let subject_part_lines: Vec<&str> = parts[0].lines().collect();
    let mut body_parts: Vec<String> = Vec::new();

    if subject_part_lines.len() > 1 {
        body_parts.push(subject_part_lines[1..].join("\n"));
    }

    // Remaining parts are body and/or trailers
    if parts.len() > 1 {
        for part in &parts[1..] {
            body_parts.push(part.to_string());
        }
    }

    // Try to extract trailers from the last body part
    if let Some(last_part) = body_parts.last() {
        let (remaining_body, trailers) = extract_trailers(last_part);

        if !trailers.is_empty() {
            message.trailers = trailers;
            body_parts.pop();
            if !remaining_body.is_empty() {
                body_parts.push(remaining_body);
            }
        }
    }

    message.body = body_parts.join("\n\n").trim().to_string();

    Ok(message)
}

/// Extract trailers from a text block
fn extract_trailers(text: &str) -> (String, Vec<Trailer>) {
    let lines: Vec<&str> = text.lines().collect();
    let mut trailers = Vec::new();
    let mut non_trailer_lines = Vec::new();
    let mut in_trailer_block = false;

    // Process lines in reverse to find trailing trailer block
    for line in lines.iter().rev() {
        if let Some(trailer) = parse_trailer_line(line) {
            trailers.push(trailer);
            in_trailer_block = true;
        } else if in_trailer_block && line.trim().is_empty() {
            // Allow blank lines within trailer block
            continue;
        } else {
            in_trailer_block = false;
            non_trailer_lines.push(*line);
        }
    }

    non_trailer_lines.reverse();
    trailers.reverse();

    (non_trailer_lines.join("\n"), trailers)
}

/// Parse a single line as a trailer if it matches the format "Key: Value"
fn parse_trailer_line(line: &str) -> Option<Trailer> {
    let trimmed = line.trim();

    // Check for "Key: Value" format
    if let Some((key, value)) = trimmed.split_once(':') {
        let key = key.trim();
        let value = value.trim();

        // Validate key format (should be a valid trailer key)
        if is_valid_trailer_key(key) && !value.is_empty() {
            return Some(Trailer {
                key: key.to_string(),
                value: value.to_string(),
            });
        }
    }

    None
}

/// Check if a key is a valid trailer key
fn is_valid_trailer_key(key: &str) -> bool {
    // Known keys are always valid
    if KNOWN_TRAILER_KEYS
        .iter()
        .any(|k| k.eq_ignore_ascii_case(key))
    {
        return true;
    }

    // Custom keys should be PascalCase or kebab-case with letters
    if key.is_empty() {
        return false;
    }

    let chars: Vec<char> = key.chars().collect();

    // First char must be a letter
    if !chars[0].is_ascii_alphabetic() {
        return false;
    }

    // Rest can be letters, digits, or hyphens
    chars[1..]
        .iter()
        .all(|c| c.is_ascii_alphanumeric() || *c == '-')
}

/// Serialize a CommitMessage struct back to file content
pub fn serialize_commit_msg(message: &CommitMessage) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Subject line
    if !message.subject.is_empty() {
        parts.push(message.subject.clone());
    }

    // Body
    if !message.body.is_empty() {
        parts.push(String::new()); // Blank line after subject
        parts.push(message.body.clone());
    }

    // Trailers
    if !message.trailers.is_empty() {
        if !message.body.is_empty() {
            parts.push(String::new()); // Blank line before trailers
        } else if !message.subject.is_empty() {
            parts.push(String::new()); // Blank line after subject if no body
        }

        for trailer in &message.trailers {
            parts.push(format!("{}: {}", trailer.key, trailer.value));
        }
    }

    let mut result = parts.join("\n");

    // Add comments
    if !message.comments.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(&message.comments.join("\n"));
    }

    // Add diff content after scissors line
    if let Some(diff) = &message.diff_content {
        result.push('\n');
        result.push_str(SCISSORS_LINE);
        result.push('\n');
        result.push_str(diff);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_commit() {
        let content = "Add new feature\n\nThis is the body of the commit message.";
        let result = parse_commit_msg(content).unwrap();

        assert_eq!(result.subject, "Add new feature");
        assert_eq!(result.body, "This is the body of the commit message.");
        assert!(result.trailers.is_empty());
        assert!(result.comments.is_empty());
    }

    #[test]
    fn test_parse_commit_with_trailers() {
        let content = "Fix bug in parser\n\nFixed the parsing issue.\n\nSigned-off-by: John Doe <john@example.com>\nReviewed-by: Jane Doe <jane@example.com>";
        let result = parse_commit_msg(content).unwrap();

        assert_eq!(result.subject, "Fix bug in parser");
        assert_eq!(result.body, "Fixed the parsing issue.");
        assert_eq!(result.trailers.len(), 2);
        assert_eq!(result.trailers[0].key, "Signed-off-by");
        assert_eq!(result.trailers[0].value, "John Doe <john@example.com>");
    }

    #[test]
    fn test_parse_commit_with_comments() {
        let content = "Update README\n\n# Please enter the commit message\n# Lines starting with '#' will be ignored";
        let result = parse_commit_msg(content).unwrap();

        assert_eq!(result.subject, "Update README");
        assert_eq!(result.comments.len(), 2);
        assert!(result.comments[0].starts_with("# Please"));
    }

    #[test]
    fn test_parse_commit_with_scissors() {
        let content = "Commit message\n\n# ------------------------ >8 ------------------------\ndiff --git a/file.txt b/file.txt\n+new line";
        let result = parse_commit_msg(content).unwrap();

        assert_eq!(result.subject, "Commit message");
        assert!(result.diff_content.is_some());
        assert!(result.diff_content.unwrap().contains("diff --git"));
    }

    #[test]
    fn test_parse_empty_commit() {
        let content = "";
        let result = parse_commit_msg(content).unwrap();

        assert_eq!(result.subject, "");
        assert_eq!(result.body, "");
    }

    #[test]
    fn test_parse_subject_only() {
        let content = "Just a subject line";
        let result = parse_commit_msg(content).unwrap();

        assert_eq!(result.subject, "Just a subject line");
        assert_eq!(result.body, "");
    }

    #[test]
    fn test_serialize_simple_commit() {
        let message = CommitMessage {
            subject: "Add feature".to_string(),
            body: "This is the body.".to_string(),
            trailers: vec![],
            comments: vec![],
            diff_content: None,
        };

        let result = serialize_commit_msg(&message);
        assert!(result.contains("Add feature"));
        assert!(result.contains("This is the body."));
    }

    #[test]
    fn test_serialize_with_trailers() {
        let message = CommitMessage {
            subject: "Fix bug".to_string(),
            body: "Description".to_string(),
            trailers: vec![Trailer {
                key: "Signed-off-by".to_string(),
                value: "Test User <test@example.com>".to_string(),
            }],
            comments: vec![],
            diff_content: None,
        };

        let result = serialize_commit_msg(&message);
        assert!(result.contains("Signed-off-by: Test User"));
    }

    #[test]
    fn test_subject_length_check() {
        let message = CommitMessage {
            subject: "A".repeat(60),
            body: String::new(),
            trailers: vec![],
            comments: vec![],
            diff_content: None,
        };

        assert!(message.is_subject_too_long());
        assert_eq!(message.subject_length(), 60);
    }

    #[test]
    fn test_long_body_lines() {
        let message = CommitMessage {
            subject: "Test".to_string(),
            body: format!("Short line\n{}\nAnother short line", "x".repeat(80)),
            trailers: vec![],
            comments: vec![],
            diff_content: None,
        };

        assert!(message.has_long_body_lines());
        let long_lines = message.get_long_body_lines();
        assert_eq!(long_lines.len(), 1);
        assert_eq!(long_lines[0], (2, 80)); // Line 2, length 80
    }

    #[test]
    fn test_roundtrip() {
        let original = CommitMessage {
            subject: "Test commit".to_string(),
            body: "This is the body.\n\nWith multiple paragraphs.".to_string(),
            trailers: vec![Trailer {
                key: "Signed-off-by".to_string(),
                value: "User <user@example.com>".to_string(),
            }],
            comments: vec!["# This is a comment".to_string()],
            diff_content: None,
        };

        let serialized = serialize_commit_msg(&original);
        let parsed = parse_commit_msg(&serialized).unwrap();

        assert_eq!(parsed.subject, original.subject);
        assert_eq!(parsed.trailers.len(), original.trailers.len());
    }
}

//! コミットメッセージのパーサーとシリアライザー
//!
//! COMMIT_EDITMSG、MERGE_MSG、SQUASH_MSG、TAG_EDITMSG の解析を扱う。

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// 解析済みコミットメッセージの各要素を表す。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommitMessage {
    /// コミットメッセージの 1 行目（subject）。
    pub subject: String,
    /// 空行より後の本文。
    pub body: String,
    /// Git trailer（例: "Signed-off-by:"、"Co-authored-by:"）。
    pub trailers: Vec<Trailer>,
    /// `#` で始まるコメント行。
    pub comments: Vec<String>,
    /// verbose モードで scissors 行の後ろに表示される diff。
    pub diff_content: Option<String>,
}

/// Git trailer の key-value メタデータ。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Trailer {
    pub key: String,
    pub value: String,
}

/// コミットメッセージと diff を分離する scissors 行。
const SCISSORS_LINE: &str = "# ------------------------ >8 ------------------------";

/// よく使われる trailer key。
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
    /// 空のコミットメッセージを作る。
    pub fn new() -> Self {
        Self {
            subject: String::new(),
            body: String::new(),
            trailers: Vec::new(),
            comments: Vec::new(),
            diff_content: None,
        }
    }

    /// subject が推奨文字数（50 文字）を超えているかを返す。
    pub fn is_subject_too_long(&self) -> bool {
        self.subject_length() > 50
    }

    /// subject の文字数を返す。
    pub fn subject_length(&self) -> usize {
        character_count(&self.subject)
    }

    /// 本文に推奨文字数（72 文字）を超える行があるかを返す。
    #[cfg(test)]
    pub fn has_long_body_lines(&self) -> bool {
        self.body.lines().any(|line| character_count(line) > 72)
    }

    /// 本文から推奨 72 文字を超える行と文字数を返す。
    pub fn get_long_body_lines(&self) -> Vec<(usize, usize)> {
        self.body
            .lines()
            .enumerate()
            .filter_map(|(i, line)| {
                let length = character_count(line);
                if length > 72 {
                    Some((i + 1, length))
                } else {
                    None
                }
            })
            .collect()
    }
}

fn character_count(text: &str) -> usize {
    text.chars().count()
}

impl Default for CommitMessage {
    fn default() -> Self {
        Self::new()
    }
}

/// コミットメッセージファイルの内容を CommitMessage に解析する。
pub fn parse_commit_msg(content: &str) -> Result<CommitMessage, AppError> {
    let mut message = CommitMessage::new();
    let mut lines: Vec<&str> = content.lines().collect();

    // scissors 行がある場合は diff 部分を分離する。
    if let Some(scissors_pos) = lines.iter().position(|line| *line == SCISSORS_LINE) {
        // scissors 行より後ろはすべて diff として扱う。
        let diff_lines: Vec<&str> = lines.drain(scissors_pos..).skip(1).collect();
        if !diff_lines.is_empty() {
            message.diff_content = Some(diff_lines.join("\n"));
        }
    }

    // コメント行と本文行を分ける。
    let (content_lines, comment_lines): (Vec<&str>, Vec<&str>) =
        lines.iter().partition(|line| !line.starts_with('#'));

    message.comments = comment_lines.iter().map(|s| s.to_string()).collect();

    // 本文行から subject、body、trailer を解析する。
    let content_text = content_lines.join("\n");
    let trimmed = content_text.trim();

    if trimmed.is_empty() {
        return Ok(message);
    }

    // 空行区切りで段落に分ける。
    let parts: Vec<&str> = trimmed.split("\n\n").collect();

    if parts.is_empty() {
        return Ok(message);
    }

    // 最初の空でない段落を subject とする。
    message.subject = parts[0].lines().next().unwrap_or("").to_string();

    // 先頭段落が複数行なら、2 行目以降を body の先頭として扱う。
    let subject_part_lines: Vec<&str> = parts[0].lines().collect();
    let mut body_parts: Vec<String> = Vec::new();

    if subject_part_lines.len() > 1 {
        body_parts.push(subject_part_lines[1..].join("\n"));
    }

    // 残りの段落は body または trailer として扱う。
    if parts.len() > 1 {
        for part in &parts[1..] {
            body_parts.push(part.to_string());
        }
    }

    // 最後の body 段落から trailer を抽出する。
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

/// テキストブロックから trailer を抽出する。
fn extract_trailers(text: &str) -> (String, Vec<Trailer>) {
    let lines: Vec<&str> = text.lines().collect();
    let mut trailers = Vec::new();
    let mut non_trailer_lines = Vec::new();
    let mut in_trailer_block = false;

    // 末尾の trailer ブロックを見つけるために後ろから処理する。
    for line in lines.iter().rev() {
        if let Some(trailer) = parse_trailer_line(line) {
            trailers.push(trailer);
            in_trailer_block = true;
        } else if in_trailer_block && line.trim().is_empty() {
            // trailer ブロック内の空行は許容する。
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

/// 1 行が "Key: Value" 形式なら trailer として解析する。
fn parse_trailer_line(line: &str) -> Option<Trailer> {
    let trimmed = line.trim();

    // "Key: Value" 形式か確認する。
    if let Some((key, value)) = trimmed.split_once(':') {
        let key = key.trim();
        let value = value.trim();

        // trailer key として妥当な形式か確認する。
        if is_valid_trailer_key(key) && !value.is_empty() {
            return Some(Trailer {
                key: key.to_string(),
                value: value.to_string(),
            });
        }
    }

    None
}

/// key が trailer key として妥当かを返す。
fn is_valid_trailer_key(key: &str) -> bool {
    // 既知の key は常に許可する。
    if KNOWN_TRAILER_KEYS
        .iter()
        .any(|k| k.eq_ignore_ascii_case(key))
    {
        return true;
    }

    // カスタム key は英字始まりで、英数字またはハイフンを許可する。
    if key.is_empty() {
        return false;
    }

    let chars: Vec<char> = key.chars().collect();

    // 先頭は英字である必要がある。
    if !chars[0].is_ascii_alphabetic() {
        return false;
    }

    // 2 文字目以降は英数字またはハイフンを許可する。
    chars[1..]
        .iter()
        .all(|c| c.is_ascii_alphanumeric() || *c == '-')
}

/// CommitMessage をコミットメッセージファイル形式へ戻す。
pub fn serialize_commit_msg(message: &CommitMessage) -> String {
    let mut parts: Vec<String> = Vec::new();

    // subject 行。
    if !message.subject.is_empty() {
        parts.push(message.subject.clone());
    }

    // body。
    if !message.body.is_empty() {
        parts.push(String::new()); // subject の後ろに空行を入れる。
        parts.push(message.body.clone());
    }

    // trailer。
    if !message.trailers.is_empty() {
        if !message.body.is_empty() {
            parts.push(String::new()); // trailer の前に空行を入れる。
        } else if !message.subject.is_empty() {
            parts.push(String::new()); // body がない場合は subject の後ろに空行を入れる。
        }

        for trailer in &message.trailers {
            parts.push(format!("{}: {}", trailer.key, trailer.value));
        }
    }

    let mut result = parts.join("\n");

    // コメントを追加する。
    if !message.comments.is_empty() {
        if !result.is_empty() {
            result.push_str("\n\n");
        }
        result.push_str(&message.comments.join("\n"));
    }

    // scissors 行の後ろに diff を追加する。
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
    fn test_subject_length_counts_unicode_characters() {
        let message = CommitMessage {
            subject: "機能改善".repeat(10),
            body: String::new(),
            trailers: vec![],
            comments: vec![],
            diff_content: None,
        };

        assert_eq!(message.subject_length(), 40);
        assert!(!message.is_subject_too_long());
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
        assert_eq!(long_lines[0], (2, 80)); // 2 行目、80 文字。
    }

    #[test]
    fn test_long_body_lines_count_unicode_characters() {
        let message = CommitMessage {
            subject: "Test".to_string(),
            body: format!("{}\n{}", "詳細".repeat(36), "説明".repeat(37)),
            trailers: vec![],
            comments: vec![],
            diff_content: None,
        };

        let long_lines = message.get_long_body_lines();
        assert_eq!(long_lines, vec![(2, 74)]);
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

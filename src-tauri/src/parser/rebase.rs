use crate::error::AppError;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value")]
#[serde(rename_all = "snake_case")]
pub enum RebaseCommand {
    Pick,
    Reword,
    Edit,
    Squash,
    Fixup,
    Drop,
    Exec(String),
    Break,
    Label(String),
    Reset(String),
    Merge {
        commit: Option<String>,
        label: String,
        message: Option<String>,
    },
}

impl RebaseCommand {
    /// Parse command from string (supports both full and short forms)
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "pick" | "p" => Some(RebaseCommand::Pick),
            "reword" | "r" => Some(RebaseCommand::Reword),
            "edit" | "e" => Some(RebaseCommand::Edit),
            "squash" | "s" => Some(RebaseCommand::Squash),
            "fixup" | "f" => Some(RebaseCommand::Fixup),
            "drop" | "d" => Some(RebaseCommand::Drop),
            "break" | "b" => Some(RebaseCommand::Break),
            _ => None,
        }
    }

    /// Convert command to short form for output
    pub fn to_short(&self) -> &str {
        match self {
            RebaseCommand::Pick => "p",
            RebaseCommand::Reword => "r",
            RebaseCommand::Edit => "e",
            RebaseCommand::Squash => "s",
            RebaseCommand::Fixup => "f",
            RebaseCommand::Drop => "d",
            RebaseCommand::Exec(_) => "x",
            RebaseCommand::Break => "b",
            RebaseCommand::Label(_) => "l",
            RebaseCommand::Reset(_) => "t",
            RebaseCommand::Merge { .. } => "m",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseEntry {
    pub id: String,
    pub command: RebaseCommand,
    pub commit_hash: String,
    pub message: String,
}

impl RebaseEntry {
    pub fn new(command: RebaseCommand, commit_hash: String, message: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            command,
            commit_hash,
            message,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseTodoFile {
    pub entries: Vec<RebaseEntry>,
    pub comments: Vec<String>,
}

/// Parse git-rebase-todo file content
pub fn parse_rebase_todo(content: &str) -> Result<RebaseTodoFile, AppError> {
    let mut entries = Vec::new();
    let mut comments = Vec::new();
    let mut in_comments_section = false;

    for (line_num, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        // Skip empty lines
        if trimmed.is_empty() {
            if in_comments_section {
                comments.push(String::new());
            }
            continue;
        }

        // Handle comment lines
        if trimmed.starts_with('#') {
            in_comments_section = true;
            comments.push(line.to_string());
            continue;
        }

        // Parse command line
        let parts: Vec<&str> = trimmed.splitn(3, char::is_whitespace).collect();

        if parts.is_empty() {
            continue;
        }

        let command_str = parts[0];

        // Handle special commands
        match command_str.to_lowercase().as_str() {
            "exec" | "x" => {
                let exec_command = if parts.len() > 1 {
                    parts[1..].join(" ")
                } else {
                    String::new()
                };
                entries.push(RebaseEntry::new(
                    RebaseCommand::Exec(exec_command),
                    String::new(),
                    String::new(),
                ));
                continue;
            }
            "break" | "b" => {
                entries.push(RebaseEntry::new(
                    RebaseCommand::Break,
                    String::new(),
                    String::new(),
                ));
                continue;
            }
            "label" | "l" => {
                let label = parts.get(1).unwrap_or(&"").to_string();
                entries.push(RebaseEntry::new(
                    RebaseCommand::Label(label),
                    String::new(),
                    String::new(),
                ));
                continue;
            }
            "reset" | "t" => {
                let label = parts.get(1).unwrap_or(&"").to_string();
                entries.push(RebaseEntry::new(
                    RebaseCommand::Reset(label),
                    String::new(),
                    String::new(),
                ));
                continue;
            }
            "merge" | "m" => {
                // merge [-C <commit> | -c <commit>] <label> [# <oneline>]
                let rest = if parts.len() > 1 {
                    parts[1..].join(" ")
                } else {
                    String::new()
                };
                let (commit, label, message) = parse_merge_args(&rest);
                entries.push(RebaseEntry::new(
                    RebaseCommand::Merge {
                        commit,
                        label,
                        message,
                    },
                    String::new(),
                    String::new(),
                ));
                continue;
            }
            _ => {}
        }

        // Standard command: <command> <hash> <message>
        let command = RebaseCommand::from_str(command_str).ok_or_else(|| AppError::ParseError {
            line: line_num + 1,
            message: format!("Unknown command: {}", command_str),
        })?;

        let commit_hash = parts.get(1).unwrap_or(&"").to_string();
        let message = parts.get(2).unwrap_or(&"").to_string();

        entries.push(RebaseEntry::new(command, commit_hash, message));
    }

    Ok(RebaseTodoFile { entries, comments })
}

/// Parse merge command arguments
fn parse_merge_args(args: &str) -> (Option<String>, String, Option<String>) {
    let mut commit = None;
    let mut label = String::new();
    let mut message = None;

    let parts: Vec<&str> = args.split_whitespace().collect();
    let mut i = 0;

    while i < parts.len() {
        let part = parts[i];

        if part == "-C" || part == "-c" {
            if i + 1 < parts.len() {
                commit = Some(parts[i + 1].to_string());
                i += 2;
                continue;
            }
        }

        if part.starts_with('#') {
            // Rest is the message
            message = Some(
                parts[i..]
                    .join(" ")
                    .trim_start_matches('#')
                    .trim()
                    .to_string(),
            );
            break;
        }

        if label.is_empty() {
            label = part.to_string();
        }

        i += 1;
    }

    (commit, label, message)
}

/// Serialize RebaseTodoFile back to git-rebase-todo format
pub fn serialize_rebase_todo(file: &RebaseTodoFile) -> String {
    let mut lines = Vec::new();

    for entry in &file.entries {
        let line = match &entry.command {
            RebaseCommand::Pick
            | RebaseCommand::Reword
            | RebaseCommand::Edit
            | RebaseCommand::Squash
            | RebaseCommand::Fixup
            | RebaseCommand::Drop => {
                format!(
                    "{} {} {}",
                    entry.command.to_short(),
                    entry.commit_hash,
                    entry.message
                )
            }
            RebaseCommand::Exec(cmd) => format!("x {}", cmd),
            RebaseCommand::Break => "b".to_string(),
            RebaseCommand::Label(label) => format!("l {}", label),
            RebaseCommand::Reset(label) => format!("t {}", label),
            RebaseCommand::Merge {
                commit,
                label,
                message,
            } => {
                let mut parts = vec!["m".to_string()];
                if let Some(c) = commit {
                    parts.push(format!("-C {}", c));
                }
                parts.push(label.clone());
                if let Some(msg) = message {
                    parts.push(format!("# {}", msg));
                }
                parts.join(" ")
            }
        };
        lines.push(line);
    }

    // Append comments
    if !file.comments.is_empty() {
        lines.push(String::new()); // Empty line before comments
        lines.extend(file.comments.clone());
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_todo() {
        let content = r#"pick abc1234 First commit
reword def5678 Second commit
squash ghi9012 Third commit
"#;

        let result = parse_rebase_todo(content).unwrap();
        assert_eq!(result.entries.len(), 3);
        assert_eq!(result.entries[0].command, RebaseCommand::Pick);
        assert_eq!(result.entries[0].commit_hash, "abc1234");
        assert_eq!(result.entries[0].message, "First commit");
        assert_eq!(result.entries[1].command, RebaseCommand::Reword);
        assert_eq!(result.entries[2].command, RebaseCommand::Squash);
    }

    #[test]
    fn test_parse_short_form() {
        let content = "p abc1234 First commit\nr def5678 Second commit\n";
        let result = parse_rebase_todo(content).unwrap();
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.entries[0].command, RebaseCommand::Pick);
        assert_eq!(result.entries[1].command, RebaseCommand::Reword);
    }

    #[test]
    fn test_parse_with_comments() {
        let content = r#"pick abc1234 First commit

# This is a comment
# Another comment
"#;

        let result = parse_rebase_todo(content).unwrap();
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.comments.len(), 2);
    }

    #[test]
    fn test_parse_exec_command() {
        let content = "x npm run test\n";
        let result = parse_rebase_todo(content).unwrap();
        assert_eq!(result.entries.len(), 1);
        assert_eq!(
            result.entries[0].command,
            RebaseCommand::Exec("npm run test".to_string())
        );
    }

    #[test]
    fn test_serialize_todo() {
        let file = RebaseTodoFile {
            entries: vec![
                RebaseEntry {
                    id: "1".to_string(),
                    command: RebaseCommand::Pick,
                    commit_hash: "abc1234".to_string(),
                    message: "First commit".to_string(),
                },
                RebaseEntry {
                    id: "2".to_string(),
                    command: RebaseCommand::Squash,
                    commit_hash: "def5678".to_string(),
                    message: "Second commit".to_string(),
                },
            ],
            comments: vec!["# Comment".to_string()],
        };

        let output = serialize_rebase_todo(&file);
        assert!(output.contains("p abc1234 First commit"));
        assert!(output.contains("s def5678 Second commit"));
        assert!(output.contains("# Comment"));
    }
}

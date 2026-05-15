use base64::{engine::general_purpose::STANDARD, Engine};

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
    UpdateRef(String),
    Merge {
        commit: Option<String>,
        edit_message: bool,
        label: String,
        message: Option<String>,
    },
}

impl RebaseCommand {
    /// コマンド文字列を解析する（フル形式と短縮形式の両方に対応）。
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

    /// 出力用にコマンドを短縮形式へ変換する。
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
            RebaseCommand::UpdateRef(_) => "u",
            RebaseCommand::Merge { .. } => "m",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseEntry {
    pub id: String,
    pub command: RebaseCommand,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fixup_option: Option<String>,
    pub commit_hash: String,
    pub message: String,
}

impl RebaseEntry {
    pub fn new(command: RebaseCommand, commit_hash: String, message: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            command,
            fixup_option: None,
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

/// git-rebase-todo の内容を解析する。
pub fn parse_rebase_todo(content: &str) -> Result<RebaseTodoFile, AppError> {
    let mut entries = Vec::new();
    let mut comments = Vec::new();
    let mut in_comments_section = false;

    for (line_num, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        // 空行はコメントセクション内だけ保持する。
        if trimmed.is_empty() {
            if in_comments_section {
                comments.push(String::new());
            }
            continue;
        }

        // コメント行を扱う。
        if trimmed.starts_with('#') {
            in_comments_section = true;
            comments.push(line.to_string());
            continue;
        }

        // コマンド行を解析する。
        let parts: Vec<&str> = trimmed.splitn(3, char::is_whitespace).collect();

        if parts.is_empty() {
            continue;
        }

        let command_str = parts[0];

        // 特殊コマンドを扱う。
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
            "update-ref" | "u" => {
                let ref_name = parts.get(1).unwrap_or(&"").to_string();
                entries.push(RebaseEntry::new(
                    RebaseCommand::UpdateRef(ref_name),
                    String::new(),
                    String::new(),
                ));
                continue;
            }
            "merge" | "m" => {
                // 構文: merge [-C <commit> | -c <commit>] <label> [# <oneline>]
                let rest = if parts.len() > 1 {
                    parts[1..].join(" ")
                } else {
                    String::new()
                };
                let (commit, edit_message, label, message) = parse_merge_args(&rest);
                entries.push(RebaseEntry::new(
                    RebaseCommand::Merge {
                        commit,
                        edit_message,
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

        // 標準コマンド: <command> <hash> <message>
        let command = RebaseCommand::from_str(command_str).ok_or_else(|| AppError::ParseError {
            line: line_num + 1,
            message: format!("Unknown command: {}", command_str),
        })?;

        let rest = trimmed
            .strip_prefix(command_str)
            .unwrap_or_default()
            .trim_start();
        let (fixup_option, commit_hash, message) = parse_commit_args(&command, rest);

        let mut entry = RebaseEntry::new(command, commit_hash, message);
        entry.fixup_option = fixup_option;
        entries.push(entry);
    }

    Ok(RebaseTodoFile { entries, comments })
}

/// 空白区切りの次トークンと残りを分離する。
fn split_next_token(input: &str) -> (&str, &str) {
    let trimmed = input.trim_start();

    if trimmed.is_empty() {
        return ("", "");
    }

    if let Some(pos) = trimmed.find(char::is_whitespace) {
        (&trimmed[..pos], trimmed[pos..].trim_start())
    } else {
        (trimmed, "")
    }
}

/// 通常の commit 系コマンドから commit hash と message を取り出す。
///
/// Git は `fixup -C <commit>` / `fixup -c <commit>` を生成するため、
/// fixup の場合だけ先頭オプションを保持して commit hash を読み直す。
fn parse_commit_args(command: &RebaseCommand, args: &str) -> (Option<String>, String, String) {
    let (first, rest) = split_next_token(args);

    if matches!(command, RebaseCommand::Fixup) && (first == "-C" || first == "-c") {
        let (commit_hash, message) = split_next_token(rest);
        return (
            Some(first.to_string()),
            commit_hash.to_string(),
            message.to_string(),
        );
    }

    (None, first.to_string(), rest.to_string())
}

/// merge コマンドの引数を解析する。
fn parse_merge_args(args: &str) -> (Option<String>, bool, String, Option<String>) {
    let mut commit = None;
    let mut edit_message = false;
    let mut label = String::new();
    let mut message = None;

    let parts: Vec<&str> = args.split_whitespace().collect();
    let mut i = 0;

    while i < parts.len() {
        let part = parts[i];

        if (part == "-C" || part == "-c") && i + 1 < parts.len() {
            commit = Some(parts[i + 1].to_string());
            edit_message = part == "-c";
            i += 2;
            continue;
        }

        if part.starts_with('#') {
            // 残りは oneline メッセージとして扱う。
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

    (commit, edit_message, label, message)
}

/// RebaseTodoFile を git-rebase-todo 形式へ戻す。
pub fn serialize_rebase_todo(file: &RebaseTodoFile) -> String {
    let mut lines = Vec::new();

    for entry in &file.entries {
        match &entry.command {
            RebaseCommand::Reword => {
                // reword はエディタを開かずにメッセージを適用するため pick + exec に変換する。
                let subject = entry.message.lines().next().unwrap_or(&entry.message);
                lines.push(format!("pick {} {}", entry.commit_hash, subject));

                // 複数行メッセージをシェル経由で安全に渡すため base64 化する。
                // --quiet は出力を抑制し、--no-edit はエディタ起動を防ぐ。
                let encoded = STANDARD.encode(&entry.message);
                lines.push(format!(
                    "exec echo {} | base64 -d | git commit --amend --quiet --no-edit -F -",
                    encoded
                ));
            }
            RebaseCommand::Pick
            | RebaseCommand::Edit
            | RebaseCommand::Squash
            | RebaseCommand::Drop => {
                // git-rebase-todo は 1 行形式なので subject 行だけを出力する。
                let subject = entry.message.lines().next().unwrap_or(&entry.message);
                lines.push(format!(
                    "{} {} {}",
                    entry.command.to_short(),
                    entry.commit_hash,
                    subject
                ));
            }
            RebaseCommand::Fixup => {
                // fixup -C/-c は元の todo の意味を変えないよう保持する。
                let subject = entry.message.lines().next().unwrap_or(&entry.message);
                if let Some(option) = entry
                    .fixup_option
                    .as_deref()
                    .filter(|option| *option == "-C" || *option == "-c")
                {
                    lines.push(format!(
                        "{} {} {} {}",
                        entry.command.to_short(),
                        option,
                        entry.commit_hash,
                        subject
                    ));
                } else {
                    lines.push(format!(
                        "{} {} {}",
                        entry.command.to_short(),
                        entry.commit_hash,
                        subject
                    ));
                }
            }
            RebaseCommand::Exec(cmd) => lines.push(format!("x {}", cmd)),
            RebaseCommand::Break => lines.push("b".to_string()),
            RebaseCommand::Label(label) => lines.push(format!("l {}", label)),
            RebaseCommand::Reset(label) => lines.push(format!("t {}", label)),
            RebaseCommand::UpdateRef(ref_name) => lines.push(format!("u {}", ref_name)),
            RebaseCommand::Merge {
                commit,
                edit_message,
                label,
                message,
            } => {
                let mut parts = vec!["m".to_string()];
                if let Some(c) = commit {
                    let option = if *edit_message { "-c" } else { "-C" };
                    parts.push(format!("{} {}", option, c));
                }
                parts.push(label.clone());
                if let Some(msg) = message {
                    parts.push(format!("# {}", msg));
                }
                lines.push(parts.join(" "));
            }
        }
    }

    // コメントを末尾に追加する。
    if !file.comments.is_empty() {
        lines.push(String::new()); // コメントの前に空行を入れる。
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
    fn test_parse_merge_command_preserves_edit_message_flag() {
        let content = "m -c abc1234 feature-label # merge subject\n";
        let result = parse_rebase_todo(content).unwrap();

        assert_eq!(result.entries.len(), 1);
        assert_eq!(
            result.entries[0].command,
            RebaseCommand::Merge {
                commit: Some("abc1234".to_string()),
                edit_message: true,
                label: "feature-label".to_string(),
                message: Some("merge subject".to_string()),
            },
        );
    }

    #[test]
    fn test_parse_fixup_commit_option_preserves_real_commit_hash() {
        let content = "fixup -C abc1234 # amend! target commit\n";
        let result = parse_rebase_todo(content).unwrap();

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].command, RebaseCommand::Fixup);
        assert_eq!(result.entries[0].fixup_option.as_deref(), Some("-C"));
        assert_eq!(result.entries[0].commit_hash, "abc1234");
        assert_eq!(result.entries[0].message, "# amend! target commit");
    }

    #[test]
    fn test_parse_fixup_edit_option_preserves_real_commit_hash() {
        let content = "f -c def5678 # amend! target commit\n";
        let result = parse_rebase_todo(content).unwrap();

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].command, RebaseCommand::Fixup);
        assert_eq!(result.entries[0].fixup_option.as_deref(), Some("-c"));
        assert_eq!(result.entries[0].commit_hash, "def5678");
        assert_eq!(result.entries[0].message, "# amend! target commit");
    }

    #[test]
    fn test_parse_update_ref_command() {
        let content = "update-ref refs/heads/feature\n";
        let result = parse_rebase_todo(content).unwrap();

        assert_eq!(result.entries.len(), 1);
        assert_eq!(
            result.entries[0].command,
            RebaseCommand::UpdateRef("refs/heads/feature".to_string()),
        );
    }

    #[test]
    fn test_serialize_merge_command_preserves_uppercase_commit_option() {
        let file = RebaseTodoFile {
            entries: vec![RebaseEntry {
                id: "1".to_string(),
                command: RebaseCommand::Merge {
                    commit: Some("abc1234".to_string()),
                    edit_message: false,
                    label: "feature-label".to_string(),
                    message: Some("merge subject".to_string()),
                },
                fixup_option: None,
                commit_hash: String::new(),
                message: String::new(),
            }],
            comments: vec![],
        };

        assert_eq!(
            serialize_rebase_todo(&file),
            "m -C abc1234 feature-label # merge subject",
        );
    }

    #[test]
    fn test_serialize_merge_command_preserves_lowercase_edit_option() {
        let file = RebaseTodoFile {
            entries: vec![RebaseEntry {
                id: "1".to_string(),
                command: RebaseCommand::Merge {
                    commit: Some("abc1234".to_string()),
                    edit_message: true,
                    label: "feature-label".to_string(),
                    message: Some("merge subject".to_string()),
                },
                fixup_option: None,
                commit_hash: String::new(),
                message: String::new(),
            }],
            comments: vec![],
        };

        assert_eq!(
            serialize_rebase_todo(&file),
            "m -c abc1234 feature-label # merge subject",
        );
    }

    #[test]
    fn test_serialize_todo() {
        let file = RebaseTodoFile {
            entries: vec![
                RebaseEntry {
                    id: "1".to_string(),
                    command: RebaseCommand::Pick,
                    fixup_option: None,
                    commit_hash: "abc1234".to_string(),
                    message: "First commit".to_string(),
                },
                RebaseEntry {
                    id: "2".to_string(),
                    command: RebaseCommand::Squash,
                    fixup_option: None,
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

    #[test]
    fn test_serialize_fixup_commit_option() {
        let file = RebaseTodoFile {
            entries: vec![RebaseEntry {
                id: "1".to_string(),
                command: RebaseCommand::Fixup,
                fixup_option: Some("-C".to_string()),
                commit_hash: "abc1234".to_string(),
                message: "# amend! target commit".to_string(),
            }],
            comments: vec![],
        };

        assert_eq!(
            serialize_rebase_todo(&file),
            "f -C abc1234 # amend! target commit",
        );
    }

    #[test]
    fn test_serialize_update_ref_command() {
        let file = RebaseTodoFile {
            entries: vec![RebaseEntry {
                id: "1".to_string(),
                command: RebaseCommand::UpdateRef("refs/heads/feature".to_string()),
                fixup_option: None,
                commit_hash: String::new(),
                message: String::new(),
            }],
            comments: vec![],
        };

        assert_eq!(serialize_rebase_todo(&file), "u refs/heads/feature");
    }
}

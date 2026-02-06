use serde::{Deserialize, Serialize};

/// A single conflict region parsed from conflict markers in a file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRegion {
    pub id: usize,
    pub start_line: usize,
    pub local_start_line: usize,
    pub local_end_line: usize,
    pub base_start_line: Option<usize>,
    pub base_end_line: Option<usize>,
    pub remote_start_line: usize,
    pub remote_end_line: usize,
    pub end_line: usize,
    pub local_content: String,
    pub base_content: Option<String>,
    pub remote_content: String,
    pub resolved: bool,
}

/// Result of parsing conflict markers from a file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParseConflictsResult {
    pub conflicts: Vec<ConflictRegion>,
    pub has_conflicts: bool,
    pub total_conflicts: usize,
}

/// Conflict marker constants
const MARKER_LOCAL: &str = "<<<<<<<";
const MARKER_BASE: &str = "|||||||";
const MARKER_SEPARATOR: &str = "=======";
const MARKER_REMOTE: &str = ">>>>>>>";

/// Internal state machine for parsing conflict markers.
enum ParserState {
    /// Outside any conflict region
    Normal,
    /// Inside LOCAL section (after <<<<<<< before ||||||| or =======)
    InLocal {
        conflict_start: usize,
        local_start: usize,
    },
    /// Inside BASE section (after ||||||| before =======), diff3 only
    InBase {
        conflict_start: usize,
        local_start: usize,
        local_end: usize,
        local_lines: Vec<String>,
        base_start: usize,
    },
    /// Inside REMOTE section (after ======= before >>>>>>>)
    InRemote {
        conflict_start: usize,
        local_start: usize,
        local_end: usize,
        local_lines: Vec<String>,
        base_start: Option<usize>,
        base_end: Option<usize>,
        base_lines: Option<Vec<String>>,
        remote_start: usize,
    },
}

/// Parse conflict markers from file content.
///
/// Supports both standard and diff3 style markers:
/// - Standard: `<<<<<<<` ... `=======` ... `>>>>>>>`
/// - diff3: `<<<<<<<` ... `|||||||` ... `=======` ... `>>>>>>>`
pub fn parse_conflict_markers(content: &str) -> ParseConflictsResult {
    let lines: Vec<&str> = content.lines().collect();
    let mut conflicts = Vec::new();
    let mut state = ParserState::Normal;
    let mut conflict_id: usize = 0;

    let mut local_lines_buf: Vec<String> = Vec::new();
    let mut base_lines_buf: Vec<String> = Vec::new();
    let mut remote_lines_buf: Vec<String> = Vec::new();

    for (line_num, line) in lines.iter().enumerate() {
        match &mut state {
            ParserState::Normal => {
                if line.starts_with(MARKER_LOCAL) {
                    state = ParserState::InLocal {
                        conflict_start: line_num,
                        local_start: line_num + 1,
                    };
                    local_lines_buf.clear();
                }
            }
            ParserState::InLocal {
                conflict_start,
                local_start,
            } => {
                if line.starts_with(MARKER_BASE) {
                    // diff3 style: entering BASE section
                    let cs = *conflict_start;
                    let ls = *local_start;
                    let le = line_num;
                    let saved_local = local_lines_buf.clone();
                    base_lines_buf.clear();
                    state = ParserState::InBase {
                        conflict_start: cs,
                        local_start: ls,
                        local_end: le,
                        local_lines: saved_local,
                        base_start: line_num + 1,
                    };
                } else if line.starts_with(MARKER_SEPARATOR) {
                    // Standard style: entering REMOTE section
                    let cs = *conflict_start;
                    let ls = *local_start;
                    let le = line_num;
                    let saved_local = local_lines_buf.clone();
                    remote_lines_buf.clear();
                    state = ParserState::InRemote {
                        conflict_start: cs,
                        local_start: ls,
                        local_end: le,
                        local_lines: saved_local,
                        base_start: None,
                        base_end: None,
                        base_lines: None,
                        remote_start: line_num + 1,
                    };
                } else {
                    local_lines_buf.push((*line).to_string());
                }
            }
            ParserState::InBase {
                conflict_start,
                local_start,
                local_end,
                local_lines,
                base_start,
            } => {
                if line.starts_with(MARKER_SEPARATOR) {
                    let cs = *conflict_start;
                    let ls = *local_start;
                    let le = *local_end;
                    let saved_local = local_lines.clone();
                    let bs = *base_start;
                    let be = line_num;
                    let saved_base = base_lines_buf.clone();
                    remote_lines_buf.clear();
                    state = ParserState::InRemote {
                        conflict_start: cs,
                        local_start: ls,
                        local_end: le,
                        local_lines: saved_local,
                        base_start: Some(bs),
                        base_end: Some(be),
                        base_lines: Some(saved_base),
                        remote_start: line_num + 1,
                    };
                } else {
                    base_lines_buf.push((*line).to_string());
                }
            }
            ParserState::InRemote {
                conflict_start,
                local_start,
                local_end,
                local_lines,
                base_start,
                base_end,
                base_lines,
                remote_start,
            } => {
                if line.starts_with(MARKER_REMOTE) {
                    let region = ConflictRegion {
                        id: conflict_id,
                        start_line: *conflict_start,
                        local_start_line: *local_start,
                        local_end_line: *local_end,
                        base_start_line: *base_start,
                        base_end_line: *base_end,
                        remote_start_line: *remote_start,
                        remote_end_line: line_num,
                        end_line: line_num,
                        local_content: local_lines.join("\n"),
                        base_content: base_lines.as_ref().map(|lines| lines.join("\n")),
                        remote_content: remote_lines_buf.join("\n"),
                        resolved: false,
                    };
                    conflicts.push(region);
                    conflict_id += 1;
                    state = ParserState::Normal;
                } else {
                    remote_lines_buf.push((*line).to_string());
                }
            }
        }
    }

    let total = conflicts.len();
    ParseConflictsResult {
        conflicts,
        has_conflicts: total > 0,
        total_conflicts: total,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_conflicts() {
        let content = "line 1\nline 2\nline 3\n";
        let result = parse_conflict_markers(content);
        assert!(!result.has_conflicts);
        assert_eq!(result.total_conflicts, 0);
        assert!(result.conflicts.is_empty());
    }

    #[test]
    fn test_single_standard_conflict() {
        let content = "\
line before
<<<<<<< HEAD
local change
=======
remote change
>>>>>>> feature-branch
line after";
        let result = parse_conflict_markers(content);
        assert!(result.has_conflicts);
        assert_eq!(result.total_conflicts, 1);

        let c = &result.conflicts[0];
        assert_eq!(c.id, 0);
        assert_eq!(c.start_line, 1);
        assert_eq!(c.local_start_line, 2);
        assert_eq!(c.local_end_line, 3);
        assert!(c.base_start_line.is_none());
        assert!(c.base_end_line.is_none());
        assert_eq!(c.remote_start_line, 4);
        assert_eq!(c.remote_end_line, 5);
        assert_eq!(c.end_line, 5);
        assert_eq!(c.local_content, "local change");
        assert!(c.base_content.is_none());
        assert_eq!(c.remote_content, "remote change");
        assert!(!c.resolved);
    }

    #[test]
    fn test_single_diff3_conflict() {
        let content = "\
before
<<<<<<< HEAD
local line
||||||| merged common ancestors
base line
=======
remote line
>>>>>>> feature
after";
        let result = parse_conflict_markers(content);
        assert!(result.has_conflicts);
        assert_eq!(result.total_conflicts, 1);

        let c = &result.conflicts[0];
        assert_eq!(c.id, 0);
        assert_eq!(c.start_line, 1);
        assert_eq!(c.local_start_line, 2);
        assert_eq!(c.local_end_line, 3);
        assert_eq!(c.base_start_line, Some(4));
        assert_eq!(c.base_end_line, Some(5));
        assert_eq!(c.remote_start_line, 6);
        assert_eq!(c.remote_end_line, 7);
        assert_eq!(c.end_line, 7);
        assert_eq!(c.local_content, "local line");
        assert_eq!(c.base_content, Some("base line".to_string()));
        assert_eq!(c.remote_content, "remote line");
    }

    #[test]
    fn test_multiple_conflicts() {
        let content = "\
<<<<<<< HEAD
local 1
=======
remote 1
>>>>>>> branch
middle
<<<<<<< HEAD
local 2
=======
remote 2
>>>>>>> branch";
        let result = parse_conflict_markers(content);
        assert_eq!(result.total_conflicts, 2);

        assert_eq!(result.conflicts[0].id, 0);
        assert_eq!(result.conflicts[0].local_content, "local 1");
        assert_eq!(result.conflicts[0].remote_content, "remote 1");

        assert_eq!(result.conflicts[1].id, 1);
        assert_eq!(result.conflicts[1].local_content, "local 2");
        assert_eq!(result.conflicts[1].remote_content, "remote 2");
    }

    #[test]
    fn test_multiline_content() {
        let content = "\
<<<<<<< HEAD
local line 1
local line 2
local line 3
=======
remote line 1
remote line 2
>>>>>>> branch";
        let result = parse_conflict_markers(content);
        assert_eq!(result.total_conflicts, 1);

        let c = &result.conflicts[0];
        assert_eq!(c.local_content, "local line 1\nlocal line 2\nlocal line 3");
        assert_eq!(c.remote_content, "remote line 1\nremote line 2");
    }

    #[test]
    fn test_empty_local_content() {
        let content = "\
<<<<<<< HEAD
=======
remote content
>>>>>>> branch";
        let result = parse_conflict_markers(content);
        assert_eq!(result.total_conflicts, 1);

        let c = &result.conflicts[0];
        assert_eq!(c.local_content, "");
        assert_eq!(c.remote_content, "remote content");
    }

    #[test]
    fn test_empty_remote_content() {
        let content = "\
<<<<<<< HEAD
local content
=======
>>>>>>> branch";
        let result = parse_conflict_markers(content);
        assert_eq!(result.total_conflicts, 1);

        let c = &result.conflicts[0];
        assert_eq!(c.local_content, "local content");
        assert_eq!(c.remote_content, "");
    }

    #[test]
    fn test_incomplete_marker_ignored() {
        let content = "\
<<<<<<< HEAD
local content
some text without closing marker";
        let result = parse_conflict_markers(content);
        assert!(!result.has_conflicts);
        assert_eq!(result.total_conflicts, 0);
    }

    #[test]
    fn test_serialization_camel_case() {
        let region = ConflictRegion {
            id: 0,
            start_line: 1,
            local_start_line: 2,
            local_end_line: 3,
            base_start_line: None,
            base_end_line: None,
            remote_start_line: 4,
            remote_end_line: 5,
            end_line: 5,
            local_content: "local".to_string(),
            base_content: None,
            remote_content: "remote".to_string(),
            resolved: false,
        };
        let json = serde_json::to_string(&region).unwrap();
        assert!(json.contains("\"startLine\""));
        assert!(json.contains("\"localStartLine\""));
        assert!(json.contains("\"baseContent\""));
        assert!(json.contains("\"remoteContent\""));
    }

    #[test]
    fn test_result_serialization() {
        let result = ParseConflictsResult {
            conflicts: vec![],
            has_conflicts: false,
            total_conflicts: 0,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"hasConflicts\""));
        assert!(json.contains("\"totalConflicts\""));
    }

    #[test]
    fn test_diff3_with_empty_base() {
        let content = "\
<<<<<<< HEAD
local
||||||| base
=======
remote
>>>>>>> branch";
        let result = parse_conflict_markers(content);
        assert_eq!(result.total_conflicts, 1);

        let c = &result.conflicts[0];
        assert_eq!(c.local_content, "local");
        assert_eq!(c.base_content, Some("".to_string()));
        assert_eq!(c.remote_content, "remote");
    }
}

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct HistoryEntry {
    display: Option<String>,
    project: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClaudeAutoName {
    pub name: String,
    pub session_id: String,
}

/// Read ~/.claude/history.jsonl and find the most recent conversation prompt
/// for the given project path. Returns the display text (first user prompt)
/// truncated to 50 characters, or null if not found.
#[tauri::command]
pub fn get_claude_auto_name(project_path: String) -> Option<ClaudeAutoName> {
    let home = std::env::var("HOME")
        .ok()
        .map(PathBuf::from)?;
    let history_path: PathBuf = home.join(".claude").join("history.jsonl");

    if !history_path.exists() {
        return None;
    }

    let file = std::fs::File::open(&history_path).ok()?;
    let reader = BufReader::new(file);

    // Collect all lines, then search from the end (most recent)
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();

    for line in lines.iter().rev() {
        if let Ok(entry) = serde_json::from_str::<HistoryEntry>(line) {
            if let (Some(ref project), Some(ref display)) = (&entry.project, &entry.display) {
                if project == &project_path {
                    let display = display.trim();
                    // Skip slash commands, very short prompts, and empty lines
                    if display.starts_with('/') || display.len() < 3 {
                        continue;
                    }
                    let name = if display.len() > 50 {
                        format!("{}...", &display[..47])
                    } else {
                        display.to_string()
                    };
                    return Some(ClaudeAutoName {
                        name,
                        session_id: entry.session_id.unwrap_or_default(),
                    });
                }
            }
        }
    }

    None
}

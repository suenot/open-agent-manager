use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct HistoryEntry {
    display: Option<String>,
    project: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    timestamp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClaudeAutoName {
    pub name: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeSessionEntry {
    pub session_id: String,
    pub display: String,
    pub project: String,
    pub timestamp: String,
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
                    let name = if display.chars().count() > 50 {
                        let truncated: String = display.chars().take(47).collect();
                        format!("{}...", truncated)
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

/// Find the most recently started Claude session for a given cwd by scanning
/// ~/.claude/sessions/<pid>.json files. Returns the sessionId if found.
#[tauri::command]
pub fn find_claude_session_by_cwd(cwd: String) -> Option<String> {
    let home = std::env::var("HOME").ok().map(PathBuf::from)?;
    let sessions_dir = home.join(".claude").join("sessions");

    if !sessions_dir.exists() {
        return None;
    }

    let mut best: Option<(u64, String)> = None; // (startedAt, sessionId)

    if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let session_cwd = val.get("cwd").and_then(|v| v.as_str()).unwrap_or("");
                    let session_id = val.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                    let started_at = val.get("startedAt").and_then(|v| v.as_u64()).unwrap_or(0);

                    if session_cwd == cwd && !session_id.is_empty() {
                        if best.as_ref().map_or(true, |(best_ts, _)| started_at > *best_ts) {
                            best = Some((started_at, session_id.to_string()));
                        }
                    }
                }
            }
        }
    }

    best.map(|(_, id)| id)
}

/// Read ~/.claude/history.jsonl and return all unique sessions, most recent first.
/// Each session is deduplicated by sessionId (keeping the most recent entry).
#[tauri::command]
pub fn get_claude_sessions() -> Vec<ClaudeSessionEntry> {
    let home = match std::env::var("HOME").ok().map(PathBuf::from) {
        Some(h) => h,
        None => return vec![],
    };
    let history_path = home.join(".claude").join("history.jsonl");

    if !history_path.exists() {
        return vec![];
    }

    let file = match std::fs::File::open(&history_path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };
    let reader = BufReader::new(file);

    // Parse all entries, keeping only those with a session_id and display text
    let mut session_map: HashMap<String, ClaudeSessionEntry> = HashMap::new();

    for line in reader.lines().filter_map(|l| l.ok()) {
        if let Ok(entry) = serde_json::from_str::<HistoryEntry>(&line) {
            if let (Some(session_id), Some(display)) = (entry.session_id, entry.display) {
                let display = display.trim().to_string();
                if display.is_empty() || display.len() < 3 || display.starts_with('/') {
                    continue;
                }
                if session_id.is_empty() {
                    continue;
                }
                let truncated = if display.chars().count() > 80 {
                    let t: String = display.chars().take(77).collect();
                    format!("{}...", t)
                } else {
                    display
                };
                // Always overwrite with latest entry for this session
                session_map.insert(session_id.clone(), ClaudeSessionEntry {
                    session_id,
                    display: truncated,
                    project: entry.project.unwrap_or_default(),
                    timestamp: entry.timestamp.unwrap_or_default(),
                });
            }
        }
    }

    // Sort by timestamp descending (most recent first)
    let mut sessions: Vec<ClaudeSessionEntry> = session_map.into_values().collect();
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Limit to 100 most recent sessions
    sessions.truncate(100);
    sessions
}

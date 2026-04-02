use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "projectName")]
    pub project_name: String,
    #[serde(rename = "projectIcon")]
    pub project_icon: String,
    pub status: String,
    pub cli: Option<String>,
    #[serde(rename = "customName")]
    pub custom_name: Option<String>,
    #[serde(rename = "manuallyRenamed", default)]
    pub manually_renamed: bool,
    #[serde(rename = "autoName")]
    pub auto_name: Option<String>,
    #[serde(rename = "agentSessionId")]
    pub agent_session_id: Option<String>,
    #[serde(default)]
    pub restored: bool,
}

fn sessions_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    Ok(data_dir.join("sessions.json"))
}

#[tauri::command]
pub fn get_sessions(app_handle: tauri::AppHandle) -> Result<Vec<TerminalSession>, String> {
    let file_path = sessions_file(&app_handle)?;

    if !file_path.exists() {
        return Ok(vec![]);
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read sessions.json: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions.json: {}", e))
}

#[tauri::command]
pub fn save_sessions(
    app_handle: tauri::AppHandle,
    sessions: Vec<TerminalSession>,
) -> Result<(), String> {
    let file_path = sessions_file(&app_handle)?;
    let json = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize sessions: {}", e))?;
    std::fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write sessions.json: {}", e))?;
    Ok(())
}

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub server_type: String, // "ssh" | "cmdop"
    // SSH fields
    pub host: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    // CMDOP fields
    pub machine: Option<String>,
    // Common
    pub default_projects_path: String,
}

fn servers_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let file_path = data_dir.join("servers.json");

    if !file_path.exists() {
        std::fs::write(&file_path, "[]")
            .map_err(|e| format!("Failed to create servers.json: {}", e))?;
    }

    Ok(file_path)
}

#[tauri::command]
pub fn get_servers(app_handle: tauri::AppHandle) -> Result<Vec<Server>, String> {
    let file_path = servers_file(&app_handle)?;
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse servers.json: {}", e))
}

#[tauri::command]
pub fn add_server(app_handle: tauri::AppHandle, server: Server) -> Result<Vec<Server>, String> {
    let file_path = servers_file(&app_handle)?;
    let mut servers = get_servers(app_handle)?;

    if servers.iter().any(|s| s.name == server.name) {
        return Err(format!("Server with name '{}' already exists", server.name));
    }

    servers.push(server);
    let json = serde_json::to_string_pretty(&servers)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(servers)
}

#[tauri::command]
pub fn update_server(app_handle: tauri::AppHandle, server: Server) -> Result<Vec<Server>, String> {
    let file_path = servers_file(&app_handle)?;
    let mut servers = get_servers(app_handle)?;

    if let Some(existing) = servers.iter_mut().find(|s| s.id == server.id) {
        *existing = server;
    } else {
        return Err(format!("Server not found"));
    }

    let json = serde_json::to_string_pretty(&servers)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(servers)
}

#[tauri::command]
pub fn remove_server(app_handle: tauri::AppHandle, server_id: String) -> Result<Vec<Server>, String> {
    let file_path = servers_file(&app_handle)?;
    let mut servers = get_servers(app_handle)?;

    servers.retain(|s| s.id != server_id);

    let json = serde_json::to_string_pretty(&servers)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(servers)
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteConfig {
    #[serde(rename = "type", default)]
    pub remote_type: Option<String>, // "cmdop" | "ssh"
    // CMDOP fields
    pub machine: Option<String>,
    pub remote_path: String,
    // SSH fields
    pub host: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default = "default_icon")]
    pub icon: String,
    pub icon_path: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    pub remote: Option<RemoteConfig>,
    pub cli: Option<String>,
    #[serde(default)]
    pub archived: bool,
    pub server_id: Option<String>,
}

fn default_icon() -> String {
    "📁".to_string()
}

/// Get the path to projects.json in app data dir, creating it if needed
fn projects_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure directory exists
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let file_path = data_dir.join("projects.json");

    // If file doesn't exist, create it with empty array
    if !file_path.exists() {
        std::fs::write(&file_path, "[]")
            .map_err(|e| format!("Failed to create projects.json: {}", e))?;
    }

    Ok(file_path)
}

fn write_projects(file_path: &PathBuf, projects: &Vec<Project>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(projects)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(file_path, json)
        .map_err(|e| format!("Failed to write: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_projects(app_handle: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let file_path = projects_file(&app_handle)?;
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse projects.json: {}", e))
}

#[tauri::command]
pub fn add_project(app_handle: tauri::AppHandle, project: Project) -> Result<Vec<Project>, String> {
    let file_path = projects_file(&app_handle)?;
    let mut projects = get_projects(app_handle.clone())?;

    // Check for duplicate path (only among non-archived, excluding the same project by id)
    if projects.iter().any(|p| p.path == project.path && !p.archived && p.id != project.id) {
        return Err(format!("Project with path '{}' already exists", project.path));
    }

    // If project with same id exists, replace it (edit mode); otherwise push new
    if let Some(pos) = projects.iter().position(|p| p.id == project.id) {
        projects[pos] = project;
    } else {
        projects.push(project);
    }
    write_projects(&file_path, &projects)?;

    Ok(projects)
}

#[tauri::command]
pub fn remove_project(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<Project>, String> {
    let file_path = projects_file(&app_handle)?;
    let mut projects = get_projects(app_handle)?;

    projects.retain(|p| p.id != project_id);
    write_projects(&file_path, &projects)?;

    Ok(projects)
}

#[tauri::command]
pub fn save_projects(app_handle: tauri::AppHandle, projects: Vec<Project>) -> Result<(), String> {
    let file_path = projects_file(&app_handle)?;
    write_projects(&file_path, &projects)
}

#[tauri::command]
pub fn archive_project(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<Project>, String> {
    let file_path = projects_file(&app_handle)?;
    let mut projects = get_projects(app_handle)?;

    if let Some(p) = projects.iter_mut().find(|p| p.id == project_id) {
        p.archived = true;
    }
    write_projects(&file_path, &projects)?;

    Ok(projects)
}

#[tauri::command]
pub fn duplicate_project(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<Project>, String> {
    let file_path = projects_file(&app_handle)?;
    let mut projects = get_projects(app_handle)?;

    let source = projects.iter().find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?
        .clone();

    let new_project = Project {
        id: format!("proj-{}", uuid_v4()),
        name: format!("{} (copy)", source.name),
        archived: false,
        ..source
    };

    projects.push(new_project);
    write_projects(&file_path, &projects)?;

    Ok(projects)
}

/// Simple UUID v4 generator (random)
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // Use a combination of timestamp nanos and a simple counter for uniqueness
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (seed & 0xFFFF_FFFF) as u32,
        ((seed >> 32) & 0xFFFF) as u16,
        ((seed >> 48) & 0x0FFF) as u16,
        (0x8000 | ((seed >> 60) & 0x3FFF)) as u16,
        ((seed >> 74) ^ (seed & 0xFFFF_FFFF_FFFF)) as u64 & 0xFFFF_FFFF_FFFF,
    )
}

#[tauri::command]
pub fn restore_project(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<Project>, String> {
    let file_path = projects_file(&app_handle)?;
    let mut projects = get_projects(app_handle)?;

    if let Some(p) = projects.iter_mut().find(|p| p.id == project_id) {
        p.archived = false;
    }
    write_projects(&file_path, &projects)?;

    Ok(projects)
}

const DEFAULT_ICON_PATH: &str = ".manager/icon.png";

/// Read project icon file as base64 data URL.
/// Tries icon_path first, then falls back to DEFAULT_ICON_PATH.
#[tauri::command]
pub fn get_project_icon(project_path: String, icon_path: Option<String>) -> Result<Option<String>, String> {
    let base = Path::new(&project_path);
    let rel = icon_path.as_deref().unwrap_or(DEFAULT_ICON_PATH);
    let full_path = base.join(rel);

    if !full_path.exists() {
        return Ok(None);
    }

    let data = std::fs::read(&full_path)
        .map_err(|e| format!("Failed to read icon: {}", e))?;

    let ext = full_path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let mime = match ext {
        "svg" => "image/svg+xml",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        _ => "image/png",
    };

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

use base64::Engine;
use std::fs;
use tauri::Manager;

/// Save base64-encoded file data (from a data URL) to a temp directory and return the file path.
/// The `data` parameter should be a data URL string like "data:image/png;base64,iVBOR..."
/// or raw base64 content. The `name` parameter is the desired filename.
#[tauri::command]
pub fn save_temp_file(
    app_handle: tauri::AppHandle,
    data: String,
    name: String,
) -> Result<String, String> {
    // Create a temp directory inside the app's data dir
    let temp_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("temp_files");

    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // Extract base64 content from data URL if present
    let base64_content = if data.starts_with("data:") {
        // Format: data:[<mediatype>][;base64],<data>
        match data.find(",") {
            Some(comma_idx) => &data[comma_idx + 1..],
            None => return Err("Invalid data URL format: no comma found".to_string()),
        }
    } else {
        &data
    };

    // Decode base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_content)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Sanitize filename: keep only safe characters
    let safe_name = sanitize_filename(&name);

    // Build unique file path (add timestamp to avoid collisions)
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_path = temp_dir.join(format!("{}_{}", timestamp, safe_name));

    // Write file
    fs::write(&file_path, bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    if sanitized.is_empty() {
        "file".to_string()
    } else {
        sanitized
    }
}

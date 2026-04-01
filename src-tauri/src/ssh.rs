use std::process::Command;

/// List available SSH private keys from ~/.ssh/
#[tauri::command]
pub fn list_ssh_keys() -> Vec<String> {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return vec![],
    };

    let ssh_dir = std::path::PathBuf::from(&home).join(".ssh");
    if !ssh_dir.is_dir() {
        return vec![];
    }

    let entries = match std::fs::read_dir(&ssh_dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut keys: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let path = e.path();
            // Must be a file
            if !path.is_file() {
                return false;
            }
            // Skip .pub files, known_hosts, config, authorized_keys, agent sockets
            if name.ends_with(".pub")
                || name == "known_hosts"
                || name == "known_hosts.old"
                || name == "config"
                || name == "authorized_keys"
                || name == "environment"
                || name.starts_with(".")
            {
                return false;
            }
            true
        })
        .map(|e| {
            // Return absolute path so frontend doesn't need to expand ~
            e.path().to_string_lossy().to_string()
        })
        .collect();

    keys.sort();
    keys
}

/// Build SSH command with common options
fn build_ssh_command(
    host: &str,
    user: &Option<String>,
    port: &Option<u16>,
    identity_file: &Option<String>,
) -> Command {
    let mut cmd = Command::new("ssh");
    if let Some(key) = identity_file {
        cmd.args(["-i", key]);
    }
    if let Some(p) = port {
        cmd.args(["-p", &p.to_string()]);
    }
    cmd.args(["-o", "ConnectTimeout=10"]);
    cmd.args(["-o", "BatchMode=yes"]);
    cmd.args(["-o", "StrictHostKeyChecking=accept-new"]);
    let target = format!("{}@{}", user.as_deref().unwrap_or("root"), host);
    cmd.arg(&target);
    cmd
}

/// Create a remote directory via SSH (mkdir -p)
#[tauri::command]
pub fn ssh_mkdir(
    host: String,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    remote_path: String,
) -> Result<(), String> {
    let mut cmd = build_ssh_command(&host, &user, &port, &identity_file);
    cmd.arg(format!("mkdir -p '{}'", remote_path.replace('\'', "'\\''")));

    let output = cmd.output().map_err(|e| format!("SSH failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH mkdir failed: {}", stderr.chars().take(500).collect::<String>()));
    }
    Ok(())
}

/// List directories under a remote path via SSH
#[tauri::command]
pub fn ssh_list_dirs(
    host: String,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    remote_path: String,
) -> Result<Vec<String>, String> {
    let mut cmd = build_ssh_command(&host, &user, &port, &identity_file);
    // List only directories, one per line, just basenames
    cmd.arg(format!(
        "ls -1d {path}/*/ 2>/dev/null | xargs -I{{}} basename {{}}",
        path = remote_path.replace('\'', "'\\''")
    ));

    let output = cmd.output().map_err(|e| format!("SSH failed: {}", e))?;
    if !output.status.success() {
        // Empty dir is not an error — ls returns non-zero when no matches
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No such file") {
            return Err(format!("Remote path '{}' does not exist", remote_path));
        }
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let dirs: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(dirs)
}

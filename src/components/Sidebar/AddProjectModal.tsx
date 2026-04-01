import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../../stores/store";
import type { Project, Server } from "../../types";
import { DEFAULT_ICON_PATH } from "../../types";

const CLI_PRESETS = [
  { value: "claude", label: "Claude Code" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "aider", label: "Aider" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "kilocode", label: "Kilo Code" },
  { value: "droid", label: "Factory Droid" },
  { value: "none", label: "Terminal Only" },
  { value: "custom", label: "Custom" },
];

type ProjectMode = "local" | "ssh" | "cmdop";

export function AddProjectModal() {
  const setShowAddProject = useStore((s) => s.setShowAddProject);
  const setProjects = useStore((s) => s.setProjects);
  const editingProject = useStore((s) => s.editingProject);
  const setEditingProject = useStore((s) => s.setEditingProject);
  const servers = useStore((s) => s.servers);
  const setShowAddServer = useStore((s) => s.setShowAddServer);
  const setEditingServer = useStore((s) => s.setEditingServer);
  const addError = useStore((s) => s.addError);

  const [mode, setMode] = useState<ProjectMode>("local");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  // Server selection
  const [selectedServerId, setSelectedServerId] = useState("");
  // CMDOP fields
  const [machine, setMachine] = useState("");
  const [remotePath, setRemotePath] = useState("");
  // SSH fields
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshKey, setSshKey] = useState("");
  const [sshPath, setSshPath] = useState("");
  const [sshKeys, setSshKeys] = useState<string[]>([]);

  const [cliPreset, setCliPreset] = useState("claude");
  const [customCli, setCustomCli] = useState("");
  const [iconPath, setIconPath] = useState("");
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Filter servers by current mode
  const filteredServers = servers.filter((s) =>
    mode === "ssh" ? s.type === "ssh" : mode === "cmdop" ? s.type === "cmdop" : false
  );

  // Load icon preview when path or iconPath changes
  const projectBasePath = mode === "local" ? path : mode === "ssh" ? sshPath : remotePath;
  useEffect(() => {
    if (!projectBasePath) {
      setIconPreview(null);
      return;
    }
    let cancelled = false;
    invoke<string | null>("get_project_icon", {
      projectPath: projectBasePath,
      iconPath: iconPath || null,
    }).then((url) => {
      if (!cancelled) setIconPreview(url ?? null);
    }).catch(() => {
      if (!cancelled) setIconPreview(null);
    });
    return () => { cancelled = true; };
  }, [projectBasePath, iconPath]);

  // Load SSH keys on mount
  useEffect(() => {
    invoke<string[]>("list_ssh_keys")
      .then(setSshKeys)
      .catch(() => setSshKeys([]));
  }, []);

  // Populate form if editing
  useEffect(() => {
    if (editingProject) {
      setName(editingProject.name);
      setDescription(editingProject.description || "");
      setSelectedServerId(editingProject.server_id || "");

      if (editingProject.remote) {
        if (editingProject.remote.type === "ssh") {
          setMode("ssh");
          setSshHost(editingProject.remote.host || "");
          setSshUser(editingProject.remote.user || "");
          setSshPort(editingProject.remote.port?.toString() || "22");
          setSshKey(editingProject.remote.identity_file || "");
          setSshPath(editingProject.remote.remote_path || "");
        } else {
          setMode("cmdop");
          setMachine(editingProject.remote.machine || "");
          setRemotePath(editingProject.remote.remote_path || "");
        }
      } else {
        setMode("local");
        setPath(editingProject.path);
      }

      setIconPath(editingProject.icon_path || "");

      if (editingProject.cli) {
        const preset = CLI_PRESETS.find((p) => p.value === editingProject.cli);
        if (preset) {
          setCliPreset(preset.value);
        } else {
          setCliPreset("custom");
          setCustomCli(editingProject.cli);
        }
      } else {
        setCliPreset("none");
      }
    } else {
      setMode("local");
      setName("");
      setPath("");
      setDescription("");
      setSelectedServerId("");
      setMachine("");
      setRemotePath("");
      setSshHost("");
      setSshUser("");
      setSshPort("22");
      setSshKey("");
      setSshPath("");
      setCliPreset("claude");
      setCustomCli("");
    }
  }, [editingProject]);

  // Auto-fill from selected server
  const handleServerSelect = (serverId: string) => {
    setSelectedServerId(serverId);
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;

    if (server.type === "ssh") {
      setSshHost(server.host || "");
      setSshUser(server.user || "");
      setSshPort(server.port?.toString() || "22");
      setSshKey(server.identity_file || "");
      // Pre-fill remote path with server's default + project name
      const basePath = server.default_projects_path.replace(/\/$/, "");
      setSshPath(name ? `${basePath}/${name}` : basePath + "/");
    } else {
      setMachine(server.machine || "");
      const basePath = server.default_projects_path.replace(/\/$/, "");
      setRemotePath(name ? `${basePath}/${name}` : basePath + "/");
    }
  };

  // Auto-update path suffix when name changes (if server selected)
  const handleNameChange = (newName: string) => {
    setName(newName);
    const server = servers.find((s) => s.id === selectedServerId);
    if (server && newName.trim()) {
      const basePath = server.default_projects_path.replace(/\/$/, "");
      const newPath = `${basePath}/${newName.trim()}`;
      if (mode === "ssh") setSshPath(newPath);
      else if (mode === "cmdop") setRemotePath(newPath);
    }
  };

  const handleClose = () => {
    setShowAddProject(false);
    setEditingProject(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Name is required"); return; }
    if (mode === "local" && !path.trim()) { setError("Path is required"); return; }
    if (mode === "cmdop") {
      if (!machine.trim()) { setError("Machine name is required"); return; }
      if (!remotePath.trim()) { setError("Remote path is required"); return; }
    }
    if (mode === "ssh") {
      if (!sshHost.trim()) { setError("SSH host is required"); return; }
      if (!sshPath.trim()) { setError("Remote path is required"); return; }
    }
    if (cliPreset === "custom" && !customCli.trim()) { setError("Custom CLI command is required"); return; }

    const cli = cliPreset === "custom" ? customCli.trim() : cliPreset;

    setSaving(true);
    try {
      let project: Project;
      const baseId = editingProject ? editingProject.id : `proj-${Date.now()}`;
      const baseIcon = editingProject ? editingProject.icon : "📁";

      if (mode === "local") {
        project = {
          id: baseId,
          name: name.trim(),
          path: path.trim(),
          icon: baseIcon,
          icon_path: iconPath.trim() || undefined,
          description: description.trim() || undefined,
          env_vars: {},
          cli,
        };
      } else if (mode === "ssh") {
        const port = parseInt(sshPort) || 22;
        project = {
          id: baseId,
          name: name.trim(),
          path: `ssh://${sshUser.trim() || "root"}@${sshHost.trim()}:${port}${sshPath.trim()}`,
          icon: baseIcon,
          icon_path: iconPath.trim() || undefined,
          description: description.trim() || undefined,
          env_vars: {},
          server_id: selectedServerId || undefined,
          remote: {
            type: "ssh",
            host: sshHost.trim(),
            user: sshUser.trim() || undefined,
            port: port !== 22 ? port : undefined,
            identity_file: sshKey || undefined,
            remote_path: sshPath.trim(),
          },
          cli,
        };
      } else {
        project = {
          id: baseId,
          name: name.trim(),
          path: `cmdop://${machine.trim()}${remotePath.trim()}`,
          icon: baseIcon,
          icon_path: iconPath.trim() || undefined,
          description: description.trim() || undefined,
          env_vars: {},
          server_id: selectedServerId || undefined,
          remote: {
            type: "cmdop",
            machine: machine.trim(),
            remote_path: remotePath.trim(),
          },
          cli,
        };
      }

      const updated = await invoke<Project[]>("add_project", { project });
      setProjects(updated);

      // Auto-mkdir for SSH projects
      if (mode === "ssh" && sshPath.trim()) {
        invoke("ssh_mkdir", {
          host: sshHost.trim(),
          user: sshUser.trim() || null,
          port: parseInt(sshPort) || null,
          identityFile: sshKey || null,
          remotePath: sshPath.trim(),
        }).catch((err) => addError("SSH", `mkdir failed: ${err}`));
      }

      handleClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="bg-zinc-900/95 backdrop-blur-xl rounded-xl shadow-2xl w-[500px] border border-white/10 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {editingProject ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/10 transition-all text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-white/5 bg-zinc-950/30">
          {(["local", "ssh", "cmdop"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setSelectedServerId(""); }}
              className={`flex-1 py-3 text-sm font-medium transition-all relative ${mode === m
                ? "text-blue-400"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {m === "local" ? "Local" : m === "ssh" ? "SSH" : "CMDOP"}
              {mode === m && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              )}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Server selector (SSH / CMDOP only) */}
          {mode !== "local" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Server</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedServerId}
                    onChange={(e) => handleServerSelect(e.target.value)}
                    className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm appearance-none pr-8 transition-all"
                  >
                    <option value="" className="bg-zinc-900 text-zinc-300">Manual configuration</option>
                    {filteredServers.map((s) => (
                      <option key={s.id} value={s.id} className="bg-zinc-900 text-zinc-300">
                        {s.name} ({s.type === "ssh" ? `${s.user || "root"}@${s.host}` : s.machine})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 1L5 5L9 1" />
                    </svg>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingServer(null); setShowAddServer(true); }}
                  className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg border border-zinc-700/50 transition-all shrink-0"
                  title="Add server"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="my-project"
              autoFocus
              className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
            />
          </div>

          {/* Local: Path */}
          {mode === "local" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                Absolute Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/Users/you/projects/my-project"
                  className="flex-1 px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono transition-all"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const selected = await open({ directory: true, multiple: false });
                    if (selected) {
                      setPath(selected as string);
                      if (!name) {
                        const folderName = (selected as string).split("/").pop() || "";
                        setName(folderName);
                      }
                    }
                  }}
                  className="px-3 py-2.5 bg-zinc-800 border border-zinc-700/50 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-all text-sm shrink-0"
                  title="Browse..."
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* SSH: Host, User, Port, Key, Path */}
          {mode === "ssh" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Host</label>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">User</label>
                  <input
                    type="text"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    placeholder="root"
                    className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Port</label>
                  <input
                    type="text"
                    value={sshPort}
                    onChange={(e) => setSshPort(e.target.value)}
                    placeholder="22"
                    className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">SSH Key</label>
                  <div className="relative">
                    <select
                      value={sshKey}
                      onChange={(e) => setSshKey(e.target.value)}
                      className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono appearance-none pr-8 transition-all"
                    >
                      <option value="" className="bg-zinc-900 text-zinc-300">Default (ssh-agent)</option>
                      {sshKeys.map((k) => (
                        <option key={k} value={k} className="bg-zinc-900 text-zinc-300">{k}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 1L5 5L9 1" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Remote path</label>
                <input
                  type="text"
                  value={sshPath}
                  onChange={(e) => setSshPath(e.target.value)}
                  placeholder="/home/user/projects/my-project"
                  className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {/* CMDOP: Machine + Remote Path */}
          {mode === "cmdop" && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Machine name
                </label>
                <input
                  type="text"
                  value={machine}
                  onChange={(e) => setMachine(e.target.value)}
                  placeholder="my-server"
                  className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                />
                <div className="text-[10px] text-zinc-500 mt-1">
                  CMDOP machine name (from `cmdop connect --name`)
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Remote path
                </label>
                <input
                  type="text"
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="/home/user/projects/my-project"
                  className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {/* CLI selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">CLI Tool</label>
            <div className="flex gap-2 flex-wrap">
              {CLI_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setCliPreset(preset.value)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer border
                    ${cliPreset === preset.value
                      ? "bg-blue-500 text-white border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                      : "bg-zinc-800/50 text-zinc-400 border-transparent hover:bg-zinc-700 hover:text-zinc-200"
                    }
                  `}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {cliPreset === "custom" && (
              <input
                type="text"
                value={customCli}
                onChange={(e) => setCustomCli(e.target.value)}
                placeholder="my-ai-tool --flag"
                className="w-full mt-3 px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono transition-all animate-fade-in"
              />
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
            />
          </div>

          {/* Project Icon */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              Project Icon
            </label>
            <div className="flex items-start gap-3">
              {/* Preview */}
              <div className="w-12 h-12 rounded-lg bg-zinc-950/50 border border-zinc-700/50 flex items-center justify-center overflow-hidden shrink-0">
                {iconPreview ? (
                  <img src={iconPreview} alt="Icon preview" className="w-full h-full object-cover" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  value={iconPath}
                  onChange={(e) => setIconPath(e.target.value)}
                  placeholder={DEFAULT_ICON_PATH}
                  className="w-full px-3 py-2 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-xs font-mono transition-all"
                />
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Place an image at <code className="text-zinc-500 bg-zinc-800/50 px-1 rounded">{DEFAULT_ICON_PATH}</code> in your project root, or specify a custom relative path above.
                </p>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-300 bg-red-900/20 border border-red-500/20 px-3 py-2.5 rounded-lg flex items-center gap-2 animate-fade-in">
              <span className="text-lg">⚠️</span> {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 active:scale-95"
            >
              {saving ? "Saving..." : (editingProject ? "Update Project" : "Add Project")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

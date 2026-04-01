import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../stores/store";
import type { Server } from "../../types";

type ServerMode = "ssh" | "cmdop";

export function AddServerModal() {
  const setShowAddServer = useStore((s) => s.setShowAddServer);
  const servers = useStore((s) => s.servers);
  const setServers = useStore((s) => s.setServers);
  const editingServer = useStore((s) => s.editingServer);
  const setEditingServer = useStore((s) => s.setEditingServer);

  const [mode, setMode] = useState<ServerMode>("ssh");
  const [name, setName] = useState("");
  // SSH fields
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [port, setPort] = useState("22");
  const [sshKey, setSshKey] = useState("");
  const [sshKeys, setSshKeys] = useState<string[]>([]);
  // CMDOP fields
  const [machine, setMachine] = useState("");
  // Common
  const [defaultPath, setDefaultPath] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Load SSH keys
  useEffect(() => {
    invoke<string[]>("list_ssh_keys")
      .then(setSshKeys)
      .catch(() => setSshKeys([]));
  }, []);

  // Populate if editing
  useEffect(() => {
    if (editingServer) {
      setName(editingServer.name);
      setDefaultPath(editingServer.default_projects_path);
      if (editingServer.type === "ssh") {
        setMode("ssh");
        setHost(editingServer.host || "");
        setUser(editingServer.user || "");
        setPort(editingServer.port?.toString() || "22");
        setSshKey(editingServer.identity_file || "");
      } else {
        setMode("cmdop");
        setMachine(editingServer.machine || "");
      }
    }
  }, [editingServer]);

  const handleClose = () => {
    setShowAddServer(false);
    setEditingServer(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Name is required"); return; }
    if (!defaultPath.trim()) { setError("Default projects path is required"); return; }
    if (mode === "ssh" && !host.trim()) { setError("Host is required"); return; }
    if (mode === "cmdop" && !machine.trim()) { setError("Machine name is required"); return; }

    setSaving(true);
    try {
      const server: Server = {
        id: editingServer ? editingServer.id : `srv-${Date.now()}`,
        name: name.trim(),
        type: mode,
        default_projects_path: defaultPath.trim(),
        ...(mode === "ssh" ? {
          host: host.trim(),
          user: user.trim() || undefined,
          port: parseInt(port) !== 22 ? parseInt(port) : undefined,
          identity_file: sshKey || undefined,
        } : {
          machine: machine.trim(),
        }),
      };

      let updated: Server[];
      if (editingServer) {
        updated = await invoke<Server[]>("update_server", { server });
      } else {
        updated = await invoke<Server[]>("add_server", { server });
      }
      setServers(updated);
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
        className="bg-zinc-900/95 backdrop-blur-xl rounded-xl shadow-2xl w-[460px] border border-white/10 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <span className="text-xl">🖥️</span> {editingServer ? "Edit Server" : "New Server"}
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
          {(["ssh", "cmdop"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 py-3 text-sm font-medium transition-all relative ${mode === m
                ? "text-blue-400"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {m === "ssh" ? "SSH" : "CMDOP"}
              {mode === m && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              )}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GPU Box"
              autoFocus
              className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
            />
          </div>

          {/* SSH fields */}
          {mode === "ssh" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">User</label>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
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
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
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
            </div>
          )}

          {/* CMDOP fields */}
          {mode === "cmdop" && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Machine name</label>
                <input
                  type="text"
                  value={machine}
                  onChange={(e) => setMachine(e.target.value)}
                  placeholder="my-server"
                  className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {/* Default projects path */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Default Projects Path</label>
            <input
              type="text"
              value={defaultPath}
              onChange={(e) => setDefaultPath(e.target.value)}
              placeholder="/home/user/projects"
              className="w-full px-3 py-2.5 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono transition-all"
            />
            <div className="text-[10px] text-zinc-500 mt-1">
              Base path for project scanning and import
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
              {saving ? "Saving..." : (editingServer ? "Update Server" : "Add Server")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

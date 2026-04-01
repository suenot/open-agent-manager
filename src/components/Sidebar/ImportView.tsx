import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../stores/store";
import type { Project, Server } from "../../types";

export function ImportView() {
  const servers = useStore((s) => s.servers);
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const setShowAddServer = useStore((s) => s.setShowAddServer);
  const setEditingServer = useStore((s) => s.setEditingServer);
  const addError = useStore((s) => s.addError);

  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [dirs, setDirs] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);

  const server = servers.find((s) => s.id === selectedServerId);

  // Paths already imported (to dim them)
  const existingPaths = new Set(projects.map((p) => p.path));

  const handleScan = async () => {
    if (!server) return;
    setScanning(true);
    setDirs([]);
    setSelected(new Set());
    try {
      if (server.type === "ssh") {
        const result = await invoke<string[]>("ssh_list_dirs", {
          host: server.host || "",
          user: server.user || null,
          port: server.port || null,
          identityFile: server.identity_file || null,
          remotePath: server.default_projects_path,
        });
        setDirs(result);
      } else {
        addError("Import", "CMDOP directory listing not yet supported");
      }
    } catch (err) {
      addError("Import", "Failed to scan remote directories", String(err));
    } finally {
      setScanning(false);
    }
  };

  const toggleDir = (dir: string) => {
    const fullPath = `${server!.default_projects_path}/${dir}`;
    const sshPath = server!.type === "ssh"
      ? `ssh://${server!.user || "root"}@${server!.host}:${server!.port || 22}${fullPath}`
      : `cmdop://${server!.machine}${fullPath}`;

    if (existingPaths.has(sshPath)) return; // Already imported

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const handleImport = async () => {
    if (!server || selected.size === 0) return;
    setImporting(true);

    try {
      for (const dir of selected) {
        const fullPath = `${server.default_projects_path}/${dir}`;
        const project: Project = {
          id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: dir,
          path: server.type === "ssh"
            ? `ssh://${server.user || "root"}@${server.host}:${server.port || 22}${fullPath}`
            : `cmdop://${server.machine}${fullPath}`,
          icon: "📁",
          env_vars: {},
          server_id: server.id,
          remote: server.type === "ssh" ? {
            type: "ssh" as const,
            host: server.host,
            user: server.user,
            port: server.port,
            identity_file: server.identity_file,
            remote_path: fullPath,
          } : {
            type: "cmdop" as const,
            machine: server.machine,
            remote_path: fullPath,
          },
          cli: "claude",
        };

        try {
          const updated = await invoke<Project[]>("add_project", { project });
          setProjects(updated);
        } catch (err) {
          addError("Import", `Failed to import ${dir}`, String(err));
        }
      }
      setSelected(new Set());
    } finally {
      setImporting(false);
    }
  };

  if (servers.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-zinc-500 flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-xl opacity-50 shadow-inner">
          🖥️
        </div>
        <p className="mb-2 font-medium">No servers configured</p>
        <button
          onClick={() => { setEditingServer(null); setShowAddServer(true); }}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors border-b border-blue-400/30 hover:border-blue-300"
        >
          Add your first server
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Server selector */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={selectedServerId}
            onChange={(e) => { setSelectedServerId(e.target.value); setDirs([]); setSelected(new Set()); }}
            className="w-full px-3 py-2 bg-zinc-950/50 border border-zinc-700/50 rounded-lg text-zinc-100 text-sm focus:outline-none focus:border-blue-500 appearance-none pr-8"
          >
            <option value="" className="bg-zinc-900">Select server...</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id} className="bg-zinc-900">
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
          onClick={() => { setEditingServer(null); setShowAddServer(true); }}
          className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-all shrink-0"
          title="Add server"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      {/* Scan button */}
      {server && (
        <button
          onClick={handleScan}
          disabled={scanning}
          className="w-full px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {scanning ? (
            <>
              <span className="animate-spin">⏳</span> Scanning...
            </>
          ) : (
            <>
              <span>🔍</span> Scan {server.default_projects_path}
            </>
          )}
        </button>
      )}

      {/* Directory list */}
      {dirs.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider px-1 mb-2">
            {dirs.length} directories found
          </div>
          {dirs.map((dir) => {
            const fullPath = `${server!.default_projects_path}/${dir}`;
            const sshPath = server!.type === "ssh"
              ? `ssh://${server!.user || "root"}@${server!.host}:${server!.port || 22}${fullPath}`
              : `cmdop://${server!.machine}${fullPath}`;
            const alreadyImported = existingPaths.has(sshPath);
            const isSelected = selected.has(dir);

            return (
              <div
                key={dir}
                onClick={() => toggleDir(dir)}
                className={`
                  px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all
                  ${alreadyImported
                    ? "text-zinc-600 cursor-default"
                    : isSelected
                      ? "bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/30 cursor-pointer"
                      : "text-zinc-300 hover:bg-white/5 cursor-pointer"
                  }
                `}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                  alreadyImported ? "border-zinc-700 bg-zinc-800 text-zinc-600" :
                  isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-zinc-600"
                }`}>
                  {alreadyImported ? "✓" : isSelected ? "✓" : ""}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{dir}</div>
                  <div className="text-[10px] text-zinc-600 font-mono truncate">{fullPath}</div>
                </div>
                {alreadyImported && (
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wide shrink-0">imported</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import button */}
      {selected.size > 0 && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full px-3 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 active:scale-95"
        >
          {importing ? "Importing..." : `Import ${selected.size} project(s)`}
        </button>
      )}
    </div>
  );
}

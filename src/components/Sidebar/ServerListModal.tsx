import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../stores/store";
import type { Server } from "../../types";

export function ServerListModal() {
  const servers = useStore((s) => s.servers);
  const setServers = useStore((s) => s.setServers);
  const setShowServerList = useStore((s) => s.setShowServerList);
  const setShowAddServer = useStore((s) => s.setShowAddServer);
  const setEditingServer = useStore((s) => s.setEditingServer);
  const addError = useStore((s) => s.addError);

  const handleClose = () => setShowServerList(false);

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setShowAddServer(true);
  };

  const handleRemove = async (serverId: string) => {
    try {
      const updated = await invoke<Server[]>("remove_server", { serverId });
      setServers(updated);
    } catch (err) {
      addError("Servers", "Failed to remove server", String(err));
    }
  };

  const handleAdd = () => {
    setEditingServer(null);
    setShowAddServer(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="bg-zinc-900/95 backdrop-blur-xl rounded-xl shadow-2xl w-[460px] max-h-[70vh] border border-white/10 ring-1 ring-white/5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <span className="text-xl">🖥️</span> Servers
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all active:scale-95"
            >
              + Add
            </button>
            <button
              onClick={handleClose}
              className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/10 transition-all text-xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Server list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {servers.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-xl opacity-50 shadow-inner">
                🖥️
              </div>
              <p className="mb-2 font-medium">No servers configured</p>
              <button
                onClick={handleAdd}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors border-b border-blue-400/30 hover:border-blue-300"
              >
                Add your first server
              </button>
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.id}
                className="group px-4 py-3 rounded-lg bg-zinc-950/50 border border-white/5 hover:border-white/10 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{server.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase border ${
                        server.type === "ssh"
                          ? "bg-cyan-950 text-cyan-400 border-cyan-500/20"
                          : "bg-purple-950 text-purple-400 border-purple-500/20"
                      }`}>
                        {server.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate">
                      {server.type === "ssh"
                        ? `${server.user || "root"}@${server.host}${server.port && server.port !== 22 ? `:${server.port}` : ""}`
                        : server.machine
                      }
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">
                      {server.default_projects_path}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3">
                    <button
                      onClick={() => handleEdit(server)}
                      className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded-md transition-all"
                      title="Edit"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRemove(server.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                      title="Delete"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

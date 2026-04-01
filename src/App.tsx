import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore, getTasksForProject } from "./stores/store";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { TerminalPane } from "./components/Terminal/TerminalPane";
import { RemoteTerminalPane } from "./components/Terminal/RemoteTerminalPane";
import { PromptQueue } from "./components/PromptQueue/PromptQueue";
import { TaskPanel } from "./components/TaskPanel/TaskPanel";
import { AddProjectModal } from "./components/Sidebar/AddProjectModal";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { ServerListModal } from "./components/Sidebar/ServerListModal";
import { AddServerModal } from "./components/Sidebar/AddServerModal";
import { TerminalTabs } from "./components/Terminal/TerminalTabs";
import { ErrorOverlay } from "./components/ErrorOverlay/ErrorOverlay";
import { ptyRegistry } from "./utils/ptyRegistry";
import type { Project, Server } from "./types";

function App() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const setServers = useStore((s) => s.setServers);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const updateSessionStatus = useStore((s) => s.updateSessionStatus);
  const showAddProject = useStore((s) => s.showAddProject);
  const showAddServer = useStore((s) => s.showAddServer);
  const showServerList = useStore((s) => s.showServerList);
  const showSettings = useStore((s) => s.showSettings);
  const showPromptQueue = useStore((s) => s.showPromptQueue);
  const showTaskPanel = useStore((s) => s.showTaskPanel);
  const setShowTaskPanel = useStore((s) => s.setShowTaskPanel);
  const projectTasks = useStore((s) => s.tasks);
  const removePrompt = useStore((s) => s.removePrompt);
  const prompts = useStore((s) => s.prompts);
  const settings = useStore((s) => s.settings);
  const addError = useStore((s) => s.addError);

  useEffect(() => {
    invoke<Project[]>("get_projects")
      .then(setProjects)
      .catch((err) => {
        console.error("Failed to load projects:", err);
        addError("Projects", "Failed to load projects", String(err));
      });
    invoke<Server[]>("get_servers")
      .then(setServers)
      .catch((err) => {
        console.error("Failed to load servers:", err);
        addError("Servers", "Failed to load servers", String(err));
      });
  }, [setProjects, setServers, addError]);

  const toggleSidebar = useStore((s) => s.toggleSidebar);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      addError("Window", e.message, `${e.filename}:${e.lineno}:${e.colno}`);
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      addError("Promise", String(e.reason));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addError, toggleSidebar]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handlePromptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/ccam-prompt");
    if (!raw || !activeSessionId) return;
    try {
      const { cardId, projectId } = JSON.parse(raw);
      const cards = prompts[projectId] || [];
      const card = cards.find((c) => c.id === cardId);
      if (card && card.text.trim()) {
        ptyRegistry.write(activeSessionId, card.text.trim() + "\n");
      }
      removePrompt(projectId, cardId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30">
      {showAddProject && <AddProjectModal />}
      {showAddServer && <AddServerModal />}
      {showServerList && <ServerListModal />}
      {showSettings && <SettingsModal />}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 relative">
        <TerminalTabs />

        <div className="flex-1 flex min-h-0 relative">
          {/* Terminal area — drop zone for prompt cards */}
          <div
            className="flex-1 relative bg-zinc-950"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/ccam-prompt")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={handlePromptDrop}
          >
            {/* Empty state */}
            {!activeSession && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-6 opacity-20 filter blur-sm animate-pulse">🤖</div>
                  <h2 className="text-xl font-medium text-zinc-300 mb-2">Ready to Code</h2>
                  <div className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                    Select a project from the sidebar to launch a terminal session.
                  </div>
                </div>
              </div>
            )}

            {/* Terminal panes — all mounted, visibility toggled */}
            {sessions.map((session) => {
              const project = projects.find((p) => p.id === session.projectId);
              if (!project) return null;

              const isRemote = !!project.remote;
              const isSsh = isRemote && project.remote?.type === "ssh";
              const isCmdop = isRemote && !isSsh;
              const isActive = activeSessionId === session.id;

              return (
                <div
                  key={session.id}
                  className="absolute inset-0"
                  style={{
                    display: isActive ? "block" : "none",
                    zIndex: isActive ? 10 : 0
                  }}
                >
                  {isSsh ? (
                    <TerminalPane
                      sessionId={session.id}
                      cwd="/"
                      env={{}}
                      isVisible={isActive}
                      onExit={() => updateSessionStatus(session.id, "stopped")}
                      settings={settings}
                      cli={session.cli || project.cli}
                      sshConfig={project.remote}
                    />
                  ) : isCmdop ? (
                    <RemoteTerminalPane
                      sessionId={session.id}
                      isVisible={isActive}
                      onExit={() => updateSessionStatus(session.id, "stopped")}
                      settings={settings}
                      remote={project.remote!}
                      cli={session.cli || project.cli}
                    />
                  ) : (
                    <TerminalPane
                      sessionId={session.id}
                      cwd={project.path}
                      env={project.env_vars}
                      isVisible={isActive}
                      onExit={() => updateSessionStatus(session.id, "stopped")}
                      settings={settings}
                      cli={session.cli || project.cli}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Prompt Queue panel (toggleable) */}
          {showPromptQueue && activeSession && (
            <div className="w-80 border-l border-white/5 bg-zinc-900/50 backdrop-blur-sm">
              <PromptQueue projectId={activeSession.projectId} />
            </div>
          )}

          {/* Task Panel — right drawer overlay (REMOVED) */}
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-950 border-t border-white/5 text-[10px] text-zinc-500 uppercase tracking-wider font-mono select-none">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${sessions.some(s => s.status === "running") ? "bg-emerald-500 animate-pulse" : "bg-zinc-700"}`} />
            <span>
              {sessions.filter((s) => s.status === "running").length} agent(s) active
            </span>
          </div>

          <span className="ml-auto flex items-center gap-4">
            {/* Task panel toggle */}
            <button
              onClick={async () => {
                const win = getCurrentWindow();
                await win.maximize();
                await invoke("toggle_devtools");
              }}
              className="hover:text-blue-400 transition-colors cursor-pointer flex items-center gap-1"
              title="Toggle DevTools (F12)"
            >
              <span>DEV</span>
            </button>
          </span>
        </div>
      </div>
      <ErrorOverlay />
    </div>
  );
}

export default App;

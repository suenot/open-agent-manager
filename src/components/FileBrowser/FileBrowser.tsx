import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../stores/store";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export function FileBrowser() {
  const showFileBrowser = useStore((s) => s.showFileBrowser);
  const setShowFileBrowser = useStore((s) => s.setShowFileBrowser);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const projects = useStore((s) => s.projects);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeProject = activeSession
    ? projects.find((p) => p.id === activeSession.projectId)
    : null;

  const rootPath = activeProject?.path || null;

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load root directory when project changes
  useEffect(() => {
    if (!rootPath) return;
    setExpandedDirs(new Set());
    setDirContents({});
    setSelected(new Set());
    loadDir(rootPath);
  }, [rootPath]);

  const loadDir = useCallback(async (path: string) => {
    if (dirContents[path] || loading.has(path)) return;
    setLoading((prev) => new Set(prev).add(path));
    try {
      const entries = await invoke<FileEntry[]>("list_directory", { path });
      setDirContents((prev) => ({ ...prev, [path]: entries }));
    } catch (err) {
      console.error("Failed to list directory:", err);
      setDirContents((prev) => ({ ...prev, [path]: [] }));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [dirContents, loading]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        loadDir(path);
      }
      return next;
    });
  }, [loadDir]);

  const handleFileClick = useCallback((path: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle selection
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    } else {
      // Single select
      setSelected(new Set([path]));
    }
  }, []);

  // Ctrl+C / Cmd+C to copy selected paths
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showFileBrowser) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && selected.size > 0) {
        // Only handle if focus is in the file browser
        if (containerRef.current?.contains(document.activeElement) || containerRef.current === document.activeElement) {
          e.preventDefault();
          const paths = Array.from(selected).join("\n");
          navigator.clipboard.writeText(paths).then(() => {
            setCopiedFeedback(true);
            setTimeout(() => setCopiedFeedback(false), 1500);
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showFileBrowser, selected]);

  if (!showFileBrowser) return null;

  const renderEntries = (parentPath: string, depth: number): React.ReactNode => {
    const entries = dirContents[parentPath];
    if (!entries) {
      if (loading.has(parentPath)) {
        return (
          <div className="text-[11px] text-zinc-600 py-1" style={{ paddingLeft: depth * 16 + 12 }}>
            Loading...
          </div>
        );
      }
      return null;
    }

    return entries.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path);
      const isSelected = selected.has(entry.path);

      return (
        <div key={entry.path}>
          <div
            className={`flex items-center gap-1.5 py-0.5 px-2 cursor-pointer text-[12px] font-mono truncate transition-colors
              ${isSelected ? "bg-blue-500/20 text-blue-300" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={(e) => {
              if (entry.is_dir) {
                toggleDir(entry.path);
              }
              handleFileClick(entry.path, e);
            }}
            title={entry.path}
          >
            {entry.is_dir ? (
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="flex-shrink-0 text-zinc-600"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
            <span className="truncate">{entry.name}</span>
          </div>
          {entry.is_dir && isExpanded && renderEntries(entry.path, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="absolute left-0 top-0 bottom-0 z-20 flex flex-col bg-zinc-950/95 backdrop-blur-sm border-r border-white/10 w-64 focus:outline-none shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Files</span>
        <div className="flex items-center gap-2">
          {copiedFeedback && (
            <span className="text-[10px] text-emerald-400 font-medium animate-fade-in">Copied!</span>
          )}
          {selected.size > 0 && (
            <span className="text-[10px] text-zinc-600">{selected.size} selected</span>
          )}
          <button
            onClick={() => setShowFileBrowser(false)}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {!rootPath ? (
          <div className="text-[11px] text-zinc-600 px-3 py-4 text-center">
            Select a project to browse files
          </div>
        ) : (
          renderEntries(rootPath, 0)
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-zinc-700">
        Ctrl/Cmd+Click to multi-select, Ctrl/Cmd+C to copy paths
      </div>
    </div>
  );
}

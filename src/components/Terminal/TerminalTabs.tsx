import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToHorizontalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useStore } from "../../stores/store";
import type { TerminalSession } from "../../types";

// ---------------------------------------------------------------------------
// Claude Code auto-naming utilities
// ---------------------------------------------------------------------------
//
// Claude Code stores conversation data in ~/.claude/:
//
//   ~/.claude/history.jsonl
//     Each line: { display, project, sessionId, timestamp, ... }
//     "display" is the user's prompt text, "project" is the cwd path,
//     "sessionId" is the conversation UUID.
//
//   ~/.claude/projects/<encoded-path>/<sessionId>.jsonl
//     Full conversation log. Each line has "type" (user|assistant|
//     file-history-snapshot|last-prompt). The first "user" type message
//     contains { message: { role: "user", content: "<initial prompt>" } }.
//
//   ~/.claude/sessions/<pid>.json
//     Maps OS PIDs to { pid, sessionId, cwd, startedAt, kind, entrypoint }.
//
// Auto-naming strategy:
//   1. Read ~/.claude/history.jsonl and find the most recent entry whose
//      "project" path matches the session's project path.
//   2. Use the "display" field (first user prompt) as the auto-generated name,
//      truncated to a reasonable length.
//   3. Only apply if the tab has not been manually renamed.
//
// This runs client-side via Tauri's fs API. If the files are not accessible
// (permissions, different OS, Claude Code not installed), it silently falls
// back to the default CLI label.
// ---------------------------------------------------------------------------

/**
 * Attempt to read Claude Code conversation history and extract an auto-name
 * for a session. Calls the Rust backend command `get_claude_auto_name` which
 * reads ~/.claude/history.jsonl and finds the most recent user prompt for the
 * given project path.
 *
 * Returns the truncated prompt text or null if not found.
 */
async function getClaudeAutoName(projectPath: string): Promise<string | null> {
  try {
    const result = await invoke<{ name: string; session_id: string } | null>(
      "get_claude_auto_name",
      { projectPath },
    );
    return result?.name ?? null;
  } catch {
    // Claude Code not installed, history not found, or command not available
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper to compute the display name for a tab
// ---------------------------------------------------------------------------
function getTabDisplayName(
  session: TerminalSession,
  idx: number,
  projectSessionsCount: number,
  cliLabel: string,
): string {
  // Priority 1: manually set custom name
  if (session.manuallyRenamed && session.customName) {
    return session.customName;
  }
  // Priority 2: auto-generated name from Claude Code conversation
  if (session.autoName) {
    return session.autoName;
  }
  // Priority 3: default CLI label + index
  return cliLabel + (projectSessionsCount > 1 ? ` #${idx + 1}` : "");
}

// ---------------------------------------------------------------------------
// Tab components
// ---------------------------------------------------------------------------

interface SortableTabItemProps {
  session: TerminalSession;
  isActive: boolean;
  idx: number;
  projectSessionsCount: number;
  cliLabel: string;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

function TabItem({
  session,
  isActive,
  idx,
  projectSessionsCount,
  cliLabel,
  onSelect,
  onClose,
  onDoubleClick,
  isEditing,
  editValue,
  onEditChange,
  onEditCommit,
  onEditCancel,
  isOverlay = false,
  dragHandleProps = {},
  style = {},
  innerRef,
}: SortableTabItemProps & { isOverlay?: boolean; dragHandleProps?: any; style?: any; innerRef?: any }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const displayName = getTabDisplayName(session, idx, projectSessionsCount, cliLabel);

  return (
    <div
      ref={innerRef}
      style={style}
      {...dragHandleProps}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      className={`
        group relative flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer
        transition-all duration-200 border-t border-x border-transparent mb-[-1px]
        ${isActive
          ? "bg-zinc-900 border-white/10 text-white shadow-sm"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
        }
        ${isOverlay ? "bg-zinc-800 border-white/20 z-50 scale-105 shadow-xl" : ""}
      `}
    >
      {/* Active Highlight Line */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
      )}

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onEditCommit();
            } else if (e.key === "Escape") {
              onEditCancel();
            }
          }}
          onBlur={onEditCommit}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs bg-transparent border border-blue-500/50 rounded px-1 py-0 outline-none text-white w-[100px]"
          placeholder={cliLabel}
          maxLength={50}
        />
      ) : (
        <span
          className="font-mono text-xs truncate max-w-[100px]"
          title={displayName}
        >
          {displayName}
        </span>
      )}

      {/* Status Indicator */}
      <div className={`
        w-1.5 h-1.5 rounded-full transition-all duration-300
        ${session.status === "running"
          ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)] animate-pulse"
          : session.status === "idle"
            ? "bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]"
            : "bg-zinc-600"
        }
      `} />

      {/* Close Button */}
      <button
        onClick={onClose}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-white/10 transition-all text-zinc-500 hover:text-white"
      >
        ✕
      </button>

    </div>
  );
}

function SortableTabItem(props: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.session.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <TabItem
      {...props}
      innerRef={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}
const CLI_PRESETS = [
  { value: "claude", label: "Claude Code" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "aider", label: "Aider" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "kilocode", label: "Kilo Code" },
  { value: "droid", label: "Factory Droid" },
  { value: "none", label: "Terminal Only" },
];

export function TerminalTabs() {
  const sessions = useStore((s) => s.sessions);
  const setSessions = useStore((s) => s.setSessions);
  const projects = useStore((s) => s.projects);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSessionId = useStore((s) => s.setActiveSessionId);
  const removeSession = useStore((s) => s.removeSession);
  const addSession = useStore((s) => s.addSession);
  const showPromptQueue = useStore((s) => s.showPromptQueue);
  const setShowPromptQueue = useStore((s) => s.setShowPromptQueue);
  const renameSession = useStore((s) => s.renameSession);
  const updateSession = useStore((s) => s.updateSession);

  const [cliMenu, setCliMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Inline rename state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Derive active project from active session
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeProjectId = activeSession?.projectId ?? null;
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

  // Filter sessions for current project only
  const projectSessions = activeProjectId
    ? sessions.filter((s) => s.projectId === activeProjectId)
    : [];

  // -----------------------------------------------------------------------
  // Auto-naming: attempt to fetch Claude Code conversation names for sessions
  // that haven't been manually renamed.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activeProject) return;

    const sessionsToAutoName = projectSessions.filter(
      (s) => !s.manuallyRenamed && !s.autoName && s.cli === "claude"
    );

    if (sessionsToAutoName.length === 0) return;

    // Attempt auto-naming for each qualifying session
    getClaudeAutoName(activeProject.path).then((autoName) => {
      if (!autoName) return;
      // Apply to sessions that still need naming
      for (const session of sessionsToAutoName) {
        updateSession(session.id, { autoName });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.path, projectSessions.length]);

  // Close CLI menu on outside click
  useEffect(() => {
    if (!cliMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCliMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [cliMenu]);

  // -----------------------------------------------------------------------
  // Inline rename handlers
  // -----------------------------------------------------------------------
  const handleStartEditing = useCallback((session: TerminalSession) => {
    setEditingTabId(session.id);
    setEditValue(session.customName || "");
  }, []);

  const handleEditCommit = useCallback(() => {
    if (editingTabId) {
      renameSession(editingTabId, editValue);
      setEditingTabId(null);
      setEditValue("");
    }
  }, [editingTabId, editValue, renameSession]);

  const handleEditCancel = useCallback(() => {
    setEditingTabId(null);
    setEditValue("");
  }, []);

  const handleAddSession = (cli: string) => {
    if (!activeProject) return;
    addSession({
      id: `session-${Date.now()}`,
      projectId: activeProject.id,
      projectName: activeProject.name,
      projectIcon: activeProject.icon,
      status: "running",
      cli,
    });
    setCliMenu(null);
  };

  const handleAddClick = (e: React.MouseEvent) => {
    if (e.altKey) {
      // Option/Alt + click: show CLI picker
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setCliMenu({ x: rect.left, y: rect.bottom + 4 });
      return;
    }
    // Default: add session with project's default CLI
    handleAddSession(activeProject?.cli || "claude");
  };

  const handleAddContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCliMenu({ x: e.clientX, y: e.clientY });
  };

  const handleAddPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    longPressTimer.current = setTimeout(() => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setCliMenu({ x: rect.left, y: rect.bottom + 4 });
    }, 500);
  };

  const handleAddPointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = projectSessions.findIndex(s => s.id === active.id);
      const newIndex = projectSessions.findIndex(s => s.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newProjectSessions = arrayMove(projectSessions, oldIndex, newIndex);
        const otherSessions = sessions.filter(s => s.projectId !== activeProjectId);
        setSessions([...otherSessions, ...newProjectSessions]);
      }
    }

    setActiveId(null);
  };

  // Even if no active project, we render a placeholder header or nothing
  if (!activeProject) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis, restrictToWindowEdges]}
    >
      <div className="flex items-center bg-zinc-950/80 backdrop-blur-md border-b border-white/5 px-2 select-none h-12 sticky top-0 z-20">
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto px-1 scrollbar-hide">
          <SortableContext items={projectSessions.map(s => s.id)} strategy={horizontalListSortingStrategy}>
            {projectSessions.map((session, idx) => (
              <SortableTabItem
                key={session.id}
                session={session}
                isActive={activeSessionId === session.id}
                idx={idx}
                projectSessionsCount={projectSessions.length}
                cliLabel={session.cli || "claude"}
                onSelect={() => setActiveSessionId(session.id)}
                onClose={(e) => {
                  e.stopPropagation();
                  removeSession(session.id);
                }}
                onDoubleClick={() => handleStartEditing(session)}
                isEditing={editingTabId === session.id}
                editValue={editValue}
                onEditChange={setEditValue}
                onEditCommit={handleEditCommit}
                onEditCancel={handleEditCancel}
              />
            ))}
          </SortableContext>
        </div>

        {/* Add session split button: main "+" and dropdown chevron */}
        <div className="ml-2 flex items-center">
          <button
            onClick={handleAddClick}
            onContextMenu={handleAddContextMenu}
            onPointerDown={handleAddPointerDown}
            onPointerUp={handleAddPointerUp}
            onPointerLeave={handleAddPointerUp}
            className="w-7 h-8 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 rounded-l-md transition-all duration-200 border-r border-white/5"
            title="New session (⌥/Alt+click or right-click to choose agent)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setCliMenu(cliMenu ? null : { x: rect.left - 160, y: rect.bottom + 4 });
            }}
            className="w-5 h-8 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 rounded-r-md transition-all duration-200"
            title="Choose agent for new session"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M2 3.5 L5 7 L8 3.5" />
            </svg>
          </button>
        </div>

        <div className="w-px h-5 bg-white/10 mx-2" />

        {/* Prompt queue toggle */}
        <button
          onClick={() => setShowPromptQueue(!showPromptQueue)}
          className={`
            p-2 rounded-md transition-all duration-200
            ${showPromptQueue
              ? "text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }
          `}
          title={showPromptQueue ? "Hide prompts" : "Show prompt queue"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </button>

        {/* CLI menu popup */}
        {cliMenu && (
          <>
            <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setCliMenu(null)} />
            <div
              ref={menuRef}
              className="fixed z-50 bg-zinc-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[200px] backdrop-blur-md animate-fade-in"
              style={{ left: cliMenu.x, top: cliMenu.y }}
            >
              <div className="px-3 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider border-b border-white/5 bg-zinc-950/30">
                Launch New Session
              </div>
              {CLI_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleAddSession(preset.value)}
                  className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-blue-500/10 hover:border-l-2 hover:border-blue-500 transition-all flex items-center gap-3 group"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500 group-hover:text-blue-400 transition-colors"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                  <div className="flex flex-col">
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{preset.value}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <TabItem
            session={projectSessions.find(s => s.id === activeId)!}
            isActive={activeSessionId === activeId}
            idx={projectSessions.findIndex(s => s.id === activeId)}
            projectSessionsCount={projectSessions.length}
            cliLabel={projectSessions.find(s => s.id === activeId)?.cli || "claude"}
            onSelect={() => { }}
            onClose={() => { }}
            onDoubleClick={() => { }}
            isEditing={false}
            editValue=""
            onEditChange={() => { }}
            onEditCommit={() => { }}
            onEditCancel={() => { }}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

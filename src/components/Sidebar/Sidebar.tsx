import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_ICON_PATH } from "../../types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useStore } from "../../stores/store";
import type { Project } from "../../types";
import { ImportView } from "./ImportView";

function useProjectIcon(projectPath: string, iconPath?: string) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    invoke<string | null>("get_project_icon", {
      projectPath,
      iconPath: iconPath || null,
    }).then((url) => {
      if (!cancelled) setIconUrl(url ?? null);
    }).catch(() => {
      if (!cancelled) setIconUrl(null);
    });
    return () => { cancelled = true; };
  }, [projectPath, iconPath]);
  return iconUrl;
}

function ProjectIconDisplay({ project }: { project: Project }) {
  const iconUrl = useProjectIcon(project.path, project.icon_path);
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="w-7 h-7 rounded-md object-cover" />;
  }
  return <div className="flex-shrink-0 text-xl">{project.icon}</div>;
}

interface SortableProjectItemProps {
  project: Project;
  isActiveProject: boolean;
  isArchive: boolean;
  isContextOpen: boolean;
  hasSession: boolean;
  projectSessions: any[];
  remoteLabel: string | null;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function ProjectItem({
  project,
  isActiveProject,
  isArchive,
  isContextOpen,
  hasSession,
  projectSessions,
  remoteLabel,
  onClick,
  onContextMenu,
  isOverlay = false,
  dragHandleProps = {},
  style = {},
  innerRef,
}: SortableProjectItemProps & { isOverlay?: boolean; dragHandleProps?: any; style?: any; innerRef?: any }) {
  return (
    <div
      ref={innerRef}
      style={style}
      className={`
        group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer
        transition-all duration-300 mx-2 mb-1 border border-transparent
        ${isActiveProject ? "bg-blue-600/10 border-blue-500/20 text-blue-400 shadow-lg" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}
        ${isOverlay ? "bg-zinc-800 border-white/20 z-50 scale-105 shadow-2xl rotate-1" : ""}
      `}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex-shrink-0"><ProjectIconDisplay project={project} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold truncate tracking-tight">{project.name}</span>
          {hasSession && (
            <div className="flex gap-0.5">
              {projectSessions.map((s: any) => (
                <div
                  key={s.id}
                  className={`w-1.5 h-1.5 rounded-full ${s.status === "running" ? "bg-emerald-500 animate-pulse" : s.status === "idle" ? "bg-blue-400" : "bg-zinc-600"}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-zinc-500 font-mono truncate">{project.path}</span>
          {remoteLabel && (
            <>
              <span className="text-[10px] text-zinc-800">•</span>
              <span className="text-[10px] text-blue-500/70 font-bold tracking-widest uppercase">{remoteLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Drag Handle (visible on hover, right side) */}
      {!isArchive && (
        <div
          {...dragHandleProps}
          className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-zinc-500 cursor-grab active:cursor-grabbing p-1 transition-opacity shrink-0"
          title="Drag to reorder"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg>
        </div>
      )}

      {isActiveProject && (
        <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
      )}
    </div>
  );
}

function SortableProjectItem(props: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.project.id, disabled: props.isArchive });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <ProjectItem
      {...props}
      innerRef={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const reorderProjects = useStore((s) => s.reorderProjects);
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const addSession = useStore((s) => s.addSession);
  const setActiveSessionId = useStore((s) => s.setActiveSessionId);
  const setShowAddProject = useStore((s) => s.setShowAddProject);
  const setEditingProject = useStore((s) => s.setEditingProject);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const settings = useStore((s) => s.settings);
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const sidebarTab = useStore((s) => s.sidebarTab);
  const setSidebarTab = useStore((s) => s.setSidebarTab);
  const setShowAddServer = useStore((s) => s.setShowAddServer);
  const setShowServerList = useStore((s) => s.setShowServerList);
  const setEditingServer = useStore((s) => s.setEditingServer);
  const addError = useStore((s) => s.addError);

  const [width, setWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: Project } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

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
  const activeCount = sessions.filter((s) => s.status === "running").length;

  // Filter projects by tab
  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);

  // Resizing Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "default";
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Close Context Menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const handleProjectClick = (project: Project) => {
    if (project.archived) return; // Don't create sessions from archive

    const projectSessions = sessions.filter((s) => s.projectId === project.id);
    if (projectSessions.length > 0) {
      setActiveSessionId(projectSessions[0].id);
      return;
    }

    addSession({
      id: `session-${Date.now()}`,
      projectId: project.id,
      projectName: project.name,
      projectIcon: project.icon,
      status: "running",
      cli: project.cli || "claude",
    });
  };

  const handleRemoveProject = async (projectId: string) => {
    try {
      const updated = await invoke<Project[]>("remove_project", { projectId });
      setProjects(updated);
    } catch (err) {
      console.error("Failed to remove project:", err);
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      const updated = await invoke<Project[]>("archive_project", { projectId });
      setProjects(updated);
    } catch (err) {
      addError("Projects", "Failed to archive project", String(err));
    }
  };

  const handleRestoreProject = async (projectId: string) => {
    try {
      const updated = await invoke<Project[]>("restore_project", { projectId });
      setProjects(updated);
    } catch (err) {
      addError("Projects", "Failed to restore project", String(err));
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setShowAddProject(true);
    setContextMenu(null);
  };

  const onContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, project });
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeProjects.findIndex((p) => p.id === active.id);
      const newIndex = activeProjects.findIndex((p) => p.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newActive = arrayMove(activeProjects, oldIndex, newIndex);
        reorderProjects([...newActive, ...archivedProjects]);
      }
    }

    setActiveId(null);
  };

  const getRemoteLabel = (project: Project) => {
    if (project.remote?.type === "cmdop") return "Cmdop";
    if (project.remote?.type === "ssh") return project.remote.host || "SSH";
    return null;
  };

  const activeProjectForOverlay = activeId ? (activeProjects.find(p => p.id === activeId) || null) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <div
        className="relative flex flex-col h-full bg-zinc-950 border-r border-white/5"
        style={{ width }}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar pt-4 pb-4 no-scrollbar">
          <div className="mb-8">
            <div className="px-5 mb-3 flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Active Projects</span>
              <span className="text-[10px] text-zinc-800 bg-white/5 px-2 py-0.5 rounded-full">{activeProjects.length}</span>
            </div>
            <SortableContext items={activeProjects.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {activeProjects.map((p) => (
                <SortableProjectItem
                  key={p.id}
                  project={p}
                  isActiveProject={activeProjectId === p.id}
                  isArchive={false}
                  isContextOpen={contextMenu?.project.id === p.id}
                  hasSession={sessions.some((s) => s.projectId === p.id)}
                  projectSessions={sessions.filter((s) => s.projectId === p.id)}
                  remoteLabel={getRemoteLabel(p)}
                  onClick={() => handleProjectClick(p)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, project: p });
                  }}
                />
              ))}
            </SortableContext>
          </div>

          {archivedProjects.length > 0 && (
            <div className="opacity-50">
              <div className="px-5 mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Archived</span>
              </div>
              {archivedProjects.map((p) => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  isActiveProject={activeProjectId === p.id}
                  isArchive={true}
                  isContextOpen={contextMenu?.project.id === p.id}
                  hasSession={sessions.some((s) => s.projectId === p.id)}
                  projectSessions={sessions.filter((s) => s.projectId === p.id)}
                  remoteLabel={getRemoteLabel(p)}
                  onClick={() => handleProjectClick(p)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, project: p });
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-3 pb-3">
          <button
            onClick={() => {
              setEditingProject(null);
              setShowAddProject(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 text-blue-400 text-xs font-medium hover:bg-blue-500/10 hover:border-blue-500/50 transition-all active:scale-[0.98]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Project
          </button>
        </div>

        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30 transition-colors"
          onMouseDown={() => setIsResizing(true)}
        />

        {contextMenu && (
          <div
            className="fixed z-50 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1.5 min-w-[180px] animate-in fade-in zoom-in duration-200"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={() => setContextMenu(null)}
          >
            <div className="px-3 py-1 border-b border-white/5 mb-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate block">
                {contextMenu.project.name}
              </span>
            </div>
            <button
              onClick={() => handleEditProject(contextMenu.project)}
              className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-blue-500/20 hover:text-white flex items-center gap-2 transition-colors font-medium"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Project
            </button>
            {!contextMenu.project.archived ? (
              <button
                onClick={() => handleArchiveProject(contextMenu.project.id)}
                className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-blue-500/20 hover:text-white flex items-center gap-2 transition-colors font-medium"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                Archive Project
              </button>
            ) : (
              <button
                onClick={() => handleRestoreProject(contextMenu.project.id)}
                className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-blue-500/20 hover:text-white flex items-center gap-2 transition-colors font-medium"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Restore Project
              </button>
            )}
            <div className="h-px bg-white/5 my-1" />
            <button
              onClick={() => handleRemoveProject(contextMenu.project.id)}
              className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors font-bold"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete Project
            </button>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.4',
            },
          },
        }),
      }}>
        {activeProjectForOverlay ? (
          <ProjectItem
            project={activeProjectForOverlay}
            isActiveProject={activeProjectId === activeProjectForOverlay.id}
            isArchive={false}
            isContextOpen={false}
            hasSession={sessions.some((s) => s.projectId === activeProjectForOverlay.id)}
            projectSessions={sessions.filter((s) => s.projectId === activeProjectForOverlay.id)}
            remoteLabel={getRemoteLabel(activeProjectForOverlay)}
            onClick={() => { }}
            onContextMenu={() => { }}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

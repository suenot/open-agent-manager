import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Project, TerminalSession, PromptCard, TaskCard, AppError, CmdopAuth, Server, SidebarTab } from "../types";

export type TeammateMode = "auto" | "in-process" | "tmux";

export interface AppSettings {
  useTmux: boolean;
  teammateMode: TeammateMode;
  dangerouslySkipPermissions: boolean;
  cmdopApiKey: string;
}

const SETTINGS_KEY = "ccam-settings";
const CMDOP_AUTH_KEY = "ccam-cmdop-auth";

const defaultSettings: AppSettings = {
  useTmux: false,
  teammateMode: "auto",
  dangerouslySkipPermissions: true,
  cmdopApiKey: "",
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultSettings;
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadCmdopAuth(): CmdopAuth | null {
  try {
    const raw = localStorage.getItem(CMDOP_AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveCmdopAuth(auth: CmdopAuth | null) {
  if (auth) {
    localStorage.setItem(CMDOP_AUTH_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(CMDOP_AUTH_KEY);
  }
}

interface AppState {
  projects: Project[];
  setProjects: (projects: Project[]) => void;

  sessions: TerminalSession[];
  setSessions: (sessions: TerminalSession[]) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;

  addSession: (session: TerminalSession) => void;
  removeSession: (sessionId: string) => void;
  updateSessionStatus: (
    sessionId: string,
    status: TerminalSession["status"],
  ) => void;
  updateSession: (sessionId: string, patch: Partial<TerminalSession>) => void;
  renameSession: (sessionId: string, name: string) => void;

  showAddProject: boolean;
  setShowAddProject: (show: boolean) => void;

  editingProject: Project | null;
  setEditingProject: (project: Project | null) => void;

  toggleSidebar: () => void; // For hotkey
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  reorderProjects: (projects: Project[]) => void;

  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  showPromptQueue: boolean;
  setShowPromptQueue: (show: boolean) => void;

  prompts: Record<string, PromptCard[]>;
  loadPrompts: (projectId: string) => Promise<void>;
  addPrompt: (projectId: string, card: PromptCard) => void;
  removePrompt: (projectId: string, cardId: string) => void;
  updatePrompt: (projectId: string, card: PromptCard) => void;
  reorderPrompts: (projectId: string, cards: PromptCard[]) => void;

  tasks: Record<string, TaskCard[]>;
  showTaskPanel: boolean;
  setShowTaskPanel: (show: boolean) => void;
  loadTasks: (projectId: string) => Promise<void>;
  addTask: (projectId: string, card: TaskCard) => void;
  removeTask: (projectId: string, cardId: string) => void;
  updateTask: (projectId: string, card: TaskCard) => void;
  reorderTasks: (projectId: string, cards: TaskCard[]) => void;

  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  servers: Server[];
  setServers: (servers: Server[]) => void;

  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  showAddServer: boolean;
  setShowAddServer: (show: boolean) => void;
  showServerList: boolean;
  setShowServerList: (show: boolean) => void;
  editingServer: Server | null;
  setEditingServer: (server: Server | null) => void;

  cmdopAuth: CmdopAuth | null;
  setCmdopAuth: (auth: CmdopAuth | null) => void;

  errors: AppError[];
  addError: (source: string, message: string, details?: string) => void;
  clearErrors: () => void;
  removeError: (id: string) => void;
}

const STABLE_EMPTY_ARRAY: any[] = [];

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),

  sessions: [],
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),

  removeSession: (sessionId) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      const newActive =
        state.activeSessionId === sessionId
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : state.activeSessionId;
      return { sessions: remaining, activeSessionId: newActive };
    }),

  updateSessionStatus: (sessionId, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status } : s,
      ),
    })),

  updateSession: (sessionId, patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...patch } : s,
      ),
    })),

  renameSession: (sessionId, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? name.trim()
            ? { ...s, customName: name.trim(), manuallyRenamed: true }
            : { ...s, customName: undefined, manuallyRenamed: false }
          : s,
      ),
    })),

  showAddProject: false,
  setShowAddProject: (show) => set({ showAddProject: show }),

  editingProject: null,
  setEditingProject: (project) => set({ editingProject: project }),

  sidebarVisible: true,
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  reorderProjects: (projects) => {
    set({ projects });
    invoke("save_projects", { projects }).catch((e) => {
      console.warn("Failed to save project order:", e);
    });
  },

  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),

  showPromptQueue: false,
  setShowPromptQueue: (show) => set({ showPromptQueue: show }),

  prompts: {},
  loadPrompts: async (projectId) => {
    try {
      const cards = await invoke<PromptCard[]>("get_prompts", { projectId });
      set((state) => ({ prompts: { ...state.prompts, [projectId]: cards } }));
    } catch (err) {
      console.error("Failed to load prompts:", err);
    }
  },
  addPrompt: (projectId, card) =>
    set((state) => {
      const current = state.prompts[projectId] || [];
      const next = [...current, card];
      invoke("save_prompts", { projectId, prompts: next }).catch(console.error);
      return { prompts: { ...state.prompts, [projectId]: next } };
    }),
  removePrompt: (projectId, cardId) =>
    set((state) => {
      const current = state.prompts[projectId] || [];
      const next = current.filter((c) => c.id !== cardId);
      invoke("save_prompts", { projectId, prompts: next }).catch(console.error);
      return { prompts: { ...state.prompts, [projectId]: next } };
    }),
  updatePrompt: (projectId, card) =>
    set((state) => {
      const current = state.prompts[projectId] || [];
      const next = current.map((c) => (c.id === card.id ? card : c));
      invoke("save_prompts", { projectId, prompts: next }).catch(console.error);
      return { prompts: { ...state.prompts, [projectId]: next } };
    }),
  reorderPrompts: (projectId, cards) =>
    set((state) => {
      invoke("save_prompts", { projectId, prompts: cards }).catch(console.error);
      return { prompts: { ...state.prompts, [projectId]: cards } };
    }),

  tasks: {},
  showTaskPanel: false,
  setShowTaskPanel: (show) => set({ showTaskPanel: show }),
  loadTasks: async (projectId) => {
    try {
      const cards = await invoke<TaskCard[]>("get_tasks", { projectId });
      set((state) => ({ tasks: { ...state.tasks, [projectId]: cards } }));
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  },
  addTask: (projectId, card) =>
    set((state) => {
      const current = state.tasks[projectId] || [];
      const next = [...current, card];
      invoke("save_tasks", { projectId, tasks: next }).catch(console.error);
      return { tasks: { ...state.tasks, [projectId]: next } };
    }),
  removeTask: (projectId, cardId) =>
    set((state) => {
      const current = state.tasks[projectId] || [];
      const next = current.filter((c) => c.id !== cardId);
      invoke("save_tasks", { projectId, tasks: next }).catch(console.error);
      return { tasks: { ...state.tasks, [projectId]: next } };
    }),
  updateTask: (projectId, card) =>
    set((state) => {
      const current = state.tasks[projectId] || [];
      const next = current.map((c) => (c.id === card.id ? card : c));
      invoke("save_tasks", { projectId, tasks: next }).catch(console.error);
      return { tasks: { ...state.tasks, [projectId]: next } };
    }),
  reorderTasks: (projectId, cards) =>
    set((state) => {
      invoke("save_tasks", { projectId, tasks: cards }).catch(console.error);
      return { tasks: { ...state.tasks, [projectId]: cards } };
    }),

  settings: loadSettings(),
  updateSettings: (patch) =>
    set((state) => {
      const next = { ...state.settings, ...patch };
      saveSettings(next);
      return { settings: next };
    }),

  servers: [],
  setServers: (servers) => set({ servers }),

  sidebarTab: "active" as SidebarTab,
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  showAddServer: false,
  setShowAddServer: (show) => set({ showAddServer: show }),
  showServerList: false,
  setShowServerList: (show) => set({ showServerList: show }),
  editingServer: null,
  setEditingServer: (server) => set({ editingServer: server }),

  cmdopAuth: loadCmdopAuth(),
  setCmdopAuth: (auth) => {
    saveCmdopAuth(auth);
    set({ cmdopAuth: auth });
  },

  errors: [],
  addError: (source, message, details) =>
    set((state) => ({
      errors: [
        ...state.errors,
        { id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now(), source, message, details },
      ],
    })),
  clearErrors: () => set({ errors: [] }),
  removeError: (id) =>
    set((state) => ({ errors: state.errors.filter((e) => e.id !== id) })),
}));

// Selectors helper for component use
export const getPromptsForProject = (state: AppState, projectId: string) => {
  return state.prompts[projectId] || (STABLE_EMPTY_ARRAY as PromptCard[]);
};

export const getTasksForProject = (state: AppState, projectId: string) => {
  return state.tasks[projectId] || (STABLE_EMPTY_ARRAY as TaskCard[]);
};

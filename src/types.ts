export interface RemoteConfig {
  type?: "cmdop" | "ssh"; // default "cmdop" for backward compat
  // CMDOP fields
  machine?: string;
  remote_path: string;
  // SSH fields
  host?: string;
  user?: string;
  port?: number;
  identity_file?: string;
}

export const DEFAULT_ICON_PATH = ".manager/icon.png";

export interface Project {
  id: string;
  name: string;
  path: string;
  icon: string;
  icon_path?: string;
  description?: string;
  env_vars: Record<string, string>;
  remote?: RemoteConfig;
  cli?: string;
  archived?: boolean;
  server_id?: string;
}

export interface Server {
  id: string;
  name: string;
  type: "ssh" | "cmdop";
  host?: string;
  user?: string;
  port?: number;
  identity_file?: string;
  machine?: string;
  default_projects_path: string;
}

export type SidebarTab = "active" | "archive" | "import";

export interface PromptAttachment {
  id: string;
  name: string;
  /** MIME type, e.g. "image/png", "application/pdf" */
  mime: string;
  /** Data URL (base64-encoded) for the file content */
  dataUrl: string;
}

export interface PromptCard {
  id: string;
  text: string;
  images: string[];
  /** File/media attachments (images, documents, etc.) */
  attachments?: PromptAttachment[];
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskCard {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  created_at: number;
}

export interface TerminalSession {
  id: string;
  projectId: string;
  projectName: string;
  projectIcon: string;
  status: "running" | "idle" | "stopped" | "error";
  cli?: string;
  /** User-defined custom tab name (set via double-click rename) */
  customName?: string;
  /** Whether the user has manually renamed this tab */
  manuallyRenamed?: boolean;
  /** Auto-generated name from Claude Code conversation data */
  autoName?: string;
}

export interface CmdopAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AppError {
  id: string;
  timestamp: number;
  source: string;
  message: string;
  details?: string;
}

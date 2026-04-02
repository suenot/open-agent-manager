import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { spawn } from "tauri-pty";
import type { IPty } from "tauri-pty";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";
import { useStore, type AppSettings } from "../../stores/store";
import { ptyRegistry } from "../../utils/ptyRegistry";
import type { RemoteConfig } from "../../types";

interface TerminalPaneProps {
  sessionId: string;
  cwd: string;
  env?: Record<string, string>;
  isVisible: boolean;
  onExit?: () => void;
  settings: AppSettings;
  cli?: string;
  sshConfig?: RemoteConfig;
  /** Whether this session was restored from a previous app run */
  restored?: boolean;
  /** The agent's session ID to resume (e.g. Claude conversation UUID) */
  agentSessionId?: string;
}

const THEME = {
  background: "#09090b", // zinc-950
  foreground: "#e4e4e7", // zinc-200
  cursor: "#3b82f6",     // blue-500
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(59, 130, 246, 0.3)",
  black: "#27272a",      // zinc-800
  red: "#ef4444",        // red-500
  green: "#10b981",      // emerald-500
  yellow: "#f59e0b",     // amber-500
  blue: "#3b82f6",       // blue-500
  magenta: "#d946ef",    // fuchsia-500
  cyan: "#06b6d4",       // cyan-500
  white: "#f4f4f5",      // zinc-100
  brightBlack: "#52525b", // zinc-600
  brightRed: "#f87171",   // red-400
  brightGreen: "#34d399", // emerald-400
  brightYellow: "#fbbf24", // amber-400
  brightBlue: "#60a5fa",   // blue-400
  brightMagenta: "#e879f9", // fuchsia-400
  brightCyan: "#22d3ee",    // cyan-400
  brightWhite: "#ffffff",
};

export function TerminalPane({
  sessionId,
  cwd,
  env,
  isVisible,
  onExit,
  settings,
  cli,
  sshConfig,
  restored,
  agentSessionId,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const ptyAliveRef = useRef(false);
  const initializedRef = useRef(false);
  // Store callbacks in refs to avoid dependency issues
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const addError = useStore((s) => s.addError);
  const addErrorRef = useRef(addError);
  addErrorRef.current = addError;
  const updateSessionStatus = useStore((s) => s.updateSessionStatus);
  const updateSession = useStore((s) => s.updateSession);

  // Main initialization — runs ONCE per mount
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: THEME,
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      fontWeight: '500',
      letterSpacing: 0,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Debug: log container dimensions
    const rect = containerRef.current.getBoundingClientRect();
    console.log(`[Terminal ${sessionId}] container: ${rect.width}x${rect.height}, cols=${terminal.cols}, rows=${terminal.rows}, cwd=${cwd}`);

    // Fit after DOM settles
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        console.log(`[Terminal ${sessionId}] after fit: cols=${terminal.cols}, rows=${terminal.rows}`);
      } catch {
        // ignore
      }
    });

    // ResizeObserver for container size changes
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            try {
              fitAddon.fit();
              if (ptyRef.current && ptyAliveRef.current) {
                ptyRef.current.resize(terminal.cols, terminal.rows);
              }
            } catch {
              // ignore
            }
          }, 50);
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // Build env: ensure TERM and PATH are set for proper shell behavior
    // In Tauri WebView, process.env is unavailable — use sensible macOS defaults
    const defaultPath = [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].join(":");
    // Derive HOME from cwd pattern or use /Users fallback (macOS)
    const homeGuess = cwd.match(/^(\/Users\/[^/]+)/)?.[1] || "/tmp";
    const spawnEnv: Record<string, string> = {
      TERM: "xterm-256color",
      PATH: defaultPath,
      LANG: "en_US.UTF-8",
      HOME: homeGuess,
      ...(env && Object.keys(env).length > 0 ? env : {}),
    };

    const cols = terminal.cols || 80;
    const rows = terminal.rows || 24;

    // Spawn PTY — local shell or SSH
    const decoder = new TextDecoder();
    try {
      let spawnCmd: string;
      let spawnArgs: string[];
      let spawnCwd: string;

      if (sshConfig && sshConfig.type === "ssh" && sshConfig.host) {
        // SSH mode — spawn ssh command through local PTY
        spawnCmd = "/usr/bin/ssh";
        spawnArgs = [];
        if (sshConfig.identity_file) {
          // Key paths from list_ssh_keys are absolute; expand ~ just in case
          const keyPath = sshConfig.identity_file.startsWith("~")
            ? sshConfig.identity_file.replace(/^~/, spawnEnv.HOME || "/tmp")
            : sshConfig.identity_file;
          spawnArgs.push("-i", keyPath);
        }
        if (sshConfig.port && sshConfig.port !== 22) {
          spawnArgs.push("-p", String(sshConfig.port));
        }
        spawnArgs.push("-t"); // force PTY allocation
        spawnArgs.push("-o", "StrictHostKeyChecking=accept-new");
        spawnArgs.push(`${sshConfig.user || "root"}@${sshConfig.host}`);
        // Remote command: cd to path + start login shell
        const remotePath = sshConfig.remote_path || "~";
        spawnArgs.push(`cd ${remotePath} && exec $SHELL -l`);
        spawnCwd = "/tmp";
      } else {
        // Local mode — login shell
        spawnCmd = "/bin/zsh";
        spawnArgs = ["-l"];
        spawnCwd = cwd;
      }

      const pty = spawn(spawnCmd, spawnArgs, {
        cwd: spawnCwd,
        env: spawnEnv,
        cols,
        rows,
      });
      ptyRef.current = pty;
      ptyAliveRef.current = true;
      ptyRegistry.register(sessionId, (data) => {
        if (ptyAliveRef.current) pty.write(data);
      });
      ptyRegistry.registerKill(sessionId, () => {
        try { pty.kill(); } catch { /* ignore */ }
      });
      const modeLabel = sshConfig?.type === "ssh" ? `ssh:${sshConfig.user}@${sshConfig.host}` : "local";
      console.log(`[Terminal ${sessionId}] PTY spawned (${modeLabel})`);

      // Detect Claude session ID from ~/.claude/sessions/ after launch
      // Poll a few times with delay to give Claude time to write its session file
      if ((cli || "claude") === "claude" && !agentSessionId) {
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          if (pollCount > 10 || !ptyAliveRef.current) {
            clearInterval(pollInterval);
            return;
          }
          try {
            const foundId = await invoke<string | null>("find_claude_session_by_cwd", { cwd });
            if (foundId) {
              updateSession(sessionId, { agentSessionId: foundId });
              console.log(`[Terminal ${sessionId}] Detected Claude session: ${foundId}`);
              clearInterval(pollInterval);
            }
          } catch {
            // ignore
          }
        }, 3000);
      }

      // Idle detection: debounce PTY output to detect when agent is waiting for input
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const IDLE_DELAY_MS = 2000;

      pty.onData((data) => {
        const text = decoder.decode(new Uint8Array(data));
        terminal.write(text);

        // Any output means the process is active — mark running
        updateSessionStatus(sessionId, "running");

        // Reset idle timer on every chunk of output
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (ptyAliveRef.current) {
            updateSessionStatus(sessionId, "idle");
          }
        }, IDLE_DELAY_MS);
      });

      pty.onExit(({ exitCode }) => {
        console.log(`[Terminal ${sessionId}] PTY exited with code ${exitCode}`);
        // If ptyAliveRef is already false, the exit was triggered by cleanup (tab close) — not an error
        const wasIntentional = !ptyAliveRef.current;
        ptyAliveRef.current = false;
        pty.write = () => { };
        pty.resize = () => { };
        if (!wasIntentional) {
          terminal.writeln(
            `\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`,
          );
          if (exitCode !== 0) {
            addErrorRef.current("Terminal", `Process exited with code ${exitCode}`, `Session: ${sessionId}, CWD: ${cwd}, CLI: ${cli || "claude"}`);
          }
        }
        onExitRef.current?.();
      });

      terminal.onData((data) => {
        if (ptyAliveRef.current) {
          pty.write(data);
          updateSessionStatus(sessionId, "running");
        }
      });

      // Build CLI command — claude gets special flags, others run as-is
      const cliName = cli || "claude";
      let cliCmd: string;
      if (cliName === "claude") {
        const flags: string[] = [];
        // If restoring a previous session with a known agent session ID, resume it
        if (restored && agentSessionId) {
          flags.push(`--resume "${agentSessionId}"`);
        }
        // Without agentSessionId, just start fresh — don't use --continue
        // as it would resume an arbitrary recent session, not the one from this tab
        if (settings.dangerouslySkipPermissions) {
          flags.push("--dangerously-skip-permissions");
        }
        if (settings.teammateMode !== "auto") {
          flags.push(`--teammate-mode ${settings.teammateMode}`);
        }
        cliCmd = `claude ${flags.join(" ")}`.trim();
      } else {
        cliCmd = cliName;
      }

      // Auto-start CLI (skip if "none" — just open shell)
      if (cliName !== "none") {
        const cliDelay = sshConfig?.type === "ssh" ? 2000 : 500;
        setTimeout(() => {
          if (!ptyAliveRef.current) return;

          if (settings.useTmux) {
            const tmuxSession = `ccam-${sessionId}`;
            pty.write(`tmux new-session -s "${tmuxSession}" "${cliCmd}" 2>/dev/null || tmux attach -t "${tmuxSession}"\n`);
          } else {
            pty.write(`${cliCmd}\n`);
          }
        }, cliDelay);
      }
    } catch (err) {
      terminal.writeln(
        `\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m`,
      );
      addErrorRef.current("Terminal", "Failed to start terminal", `${String(err)}\nSession: ${sessionId}, CWD: ${cwd}, CLI: ${cli || "claude"}`);
    }

    // Cleanup
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();

      ptyAliveRef.current = false;
      ptyRegistry.unregister(sessionId);
      if (ptyRef.current) {
        ptyRef.current.write = () => { };
        ptyRef.current.resize = () => { };
        ptyRef.current.kill();
        ptyRef.current = null;
      }

      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cwd]);

  // Re-fit when tab becomes visible
  useEffect(() => {
    if (!isVisible || !fitAddonRef.current || !terminalRef.current) return;

    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        if (ptyRef.current && ptyAliveRef.current && terminalRef.current) {
          ptyRef.current.resize(terminalRef.current.cols, terminalRef.current.rows);
        }
      } catch {
        // ignore
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isVisible]);

  // Window resize
  useEffect(() => {
    const onResize = () => {
      if (!isVisible) return;
      try {
        fitAddonRef.current?.fit();
        if (ptyRef.current && ptyAliveRef.current && terminalRef.current) {
          ptyRef.current.resize(terminalRef.current.cols, terminalRef.current.rows);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ backgroundColor: THEME.background }}
    />
  );
}

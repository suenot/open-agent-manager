import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";
import { useStore, type AppSettings } from "../../stores/store";
import type { RemoteConfig } from "../../types";
import { ptyRegistry } from "../../utils/ptyRegistry";

/** Terminal session returned from gRPC via Tauri command */
interface GrpcTerminalSession {
  session_id: string;
  machine_name: string;
  hostname: string;
  status: string;
  os: string;
  agent_version: string;
  shell: string;
  connected_at: string;
}

interface AgentRunResult {
  text: string;
  success: boolean;
}

interface RemoteTerminalPaneProps {
  sessionId: string;
  isVisible: boolean;
  onExit?: () => void;
  settings: AppSettings;
  remote: RemoteConfig;
  cli?: string;
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

import { listen } from "@tauri-apps/api/event";

/**
 * Inner terminal component — xterm.js + cmdop_bridge.py for real-time streaming.
 */
function RemoteTerminalInner({
  sessionId,
  isVisible,
  onExit,
  settings,
  remote,
  cli,
  cmdopSessionId,
}: RemoteTerminalPaneProps & { cmdopSessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const addError = useStore((s) => s.addError);
  const addErrorRef = useRef(addError);
  addErrorRef.current = addError;
  const apiKey = useStore((s) => s.settings.cmdopApiKey);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  // Initialize xterm.js and stream
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

    terminal.writeln(
      `\x1b[36mConnecting to remote machine: ${remote.machine}\x1b[0m`,
    );
    terminal.writeln(`\x1b[90mAgent session: ${cmdopSessionId}\x1b[0m`);
    terminal.writeln(`\x1b[90mStream: ${sessionId}\x1b[0m`);
    terminal.writeln(`\x1b[90mMode: Real-time Streaming (gRPC, independent PTY)\x1b[0m`);
    terminal.writeln("");

    let unlisten: (() => void) | null = null;

    const startStream = async () => {
      try {
        // Start bridge process — 'connect' mode creates a new independent PTY
        await invoke("cmdop_start_stream", {
          apiKey: apiKeyRef.current,
          sessionId: cmdopSessionId,
          streamId: sessionId,
          mode: "attach",
        });

        // Listen for output events
        unlisten = await listen<{ type: string; data?: string; status?: string; message?: string }>(
          `cmdop-event-${sessionId}`,
          (event) => {
            const msg = event.payload;
            if (msg.type === "output" && msg.data) {
              // Base64 to Uint8Array/String
              const binary = atob(msg.data);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              terminal.write(bytes);
            } else if (msg.type === "status") {
              terminal.writeln(`\x1b[90m[Status: ${msg.status}]\x1b[0m`);
            } else if (msg.type === "error") {
              terminal.writeln(`\x1b[31m[Error: ${msg.message}]\x1b[0m`);
            }
          }
        );

        // Initial resize
        fitAddon.fit();
        const { cols, rows } = terminal;
        await invoke("cmdop_resize_terminal", {
          streamId: sessionId,
          cols,
          rows,
        });

        // Optional: Start CLI if requested
        if (cli && cli !== "none") {
          const cliName = cli === "claude" ? "claude" : cli;
          const flags: string[] = [];
          if (settings.dangerouslySkipPermissions) flags.push("--dangerously-skip-permissions");
          if (settings.teammateMode !== "auto") flags.push(`--teammate-mode ${settings.teammateMode}`);

          const startCmd = cli === "claude"
            ? `cd ${remote.remote_path || "~"} && claude ${flags.join(" ")}\n`
            : `cd ${remote.remote_path || "~"} && ${cli}\n`;

          await invoke("cmdop_send_input", {
            streamId: sessionId,
            data: startCmd,
            isBase64: false,
          });
        }

      } catch (err) {
        terminal.writeln(`\x1b[31mConnection failed: ${String(err)}\x1b[0m`);
        addErrorRef.current(
          "Remote Terminal",
          `Streaming failed: ${String(err)}`,
          `Machine: ${remote.machine}`
        );
      }
    };

    startStream();

    // Handle keyboard input — Direct passthrough
    const inputDisposable = terminal.onData(async (data) => {
      try {
        await invoke("cmdop_send_input", {
          streamId: sessionId,
          data,
          isBase64: false,
        });
      } catch (err) {
        console.error("Failed to send input:", err);
      }
    });

    // Handle binary input (e.g. paste)
    const binaryInputDisposable = terminal.onBinary(async (data: string) => {
      try {
        // Encode binary string to base64
        const b64 = btoa(data);

        await invoke("cmdop_send_input", {
          streamId: sessionId,
          data: b64,
          isBase64: true,
        });
      } catch (err) {
        console.error("Failed to send binary input:", err);
      }
    });


    // Resize handling
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async () => {
        try {
          if (!terminalRef.current || !fitAddonRef.current) return;
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          await invoke("cmdop_resize_terminal", {
            streamId: sessionId,
            cols,
            rows,
          });
          console.log(`[RemoteTerminal ${sessionId}] resized to ${cols}x${rows}`);
        } catch (err) {
          console.warn("[RemoteTerminal] resize error:", err);
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          handleResize();
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Explicit window resize listener for extra safety
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (unlisten) unlisten();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      inputDisposable.dispose();
      binaryInputDisposable.dispose();
      ptyRegistry.unregister(sessionId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;

      // Stop the bridge process
      invoke("cmdop_stop_stream", { streamId: sessionId }).catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cmdopSessionId, remote.machine]);

  // Re-fit when tab becomes visible
  useEffect(() => {
    if (!isVisible || !fitAddonRef.current) return;
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        if (terminalRef.current) {
          const { cols, rows } = terminalRef.current;
          invoke("cmdop_resize_terminal", {
            streamId: sessionId,
            cols,
            rows,
          }).catch(console.error);
        }
      } catch {
        // ignore
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isVisible, sessionId]);

  // Window resize
  useEffect(() => {
    const onResize = () => {
      if (!isVisible) return;
      try {
        fitAddonRef.current?.fit();
        if (terminalRef.current) {
          const { cols, rows } = terminalRef.current;
          invoke("cmdop_resize_terminal", {
            streamId: sessionId,
            cols,
            rows,
          }).catch(console.error);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isVisible, sessionId]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ backgroundColor: THEME.background }}
    />
  );
}

/**
 * Layer 2: Connector — loads sessions via gRPC, finds matching machine.
 */

function RemoteTerminalConnector(props: RemoteTerminalPaneProps) {
  const settings = useStore((s) => s.settings);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const [sessions, setSessions] = useState<GrpcTerminalSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiKey = settings.cmdopApiKey;

  useEffect(() => {
    if (!apiKey) {
      setError("CMDOP API key not set. Add it in Settings.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    invoke<GrpcTerminalSession[]>("list_cmdop_sessions", { apiKey })
      .then((result) => {
        if (!cancelled) {
          console.log("[CMDOP] gRPC sessions:", result);
          setSessions(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[CMDOP] gRPC error:", err);
          setError(typeof err === "string" ? err : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const targetMachine = props.remote.machine || "";
  const matchedSession = sessions.find(
    (s) =>
      s.machine_name.toLowerCase() === targetMachine.toLowerCase() ||
      s.hostname.toLowerCase().includes(targetMachine.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: THEME.background }}
      >
        <div className="text-center text-gray-400">
          <div className="text-sm">Loading sessions via gRPC...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: THEME.background }}
      >
        <div className="text-center text-red-400">
          <div className="text-lg font-medium mb-2">
            Failed to load sessions
          </div>
          <div className="text-sm text-gray-500 mb-4">{error}</div>
          {!apiKey && (
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Open Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!matchedSession) {
    const machineNames = [...new Set(sessions.map((s) => s.machine_name))];
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: THEME.background }}
      >
        <div className="text-center text-gray-400">
          <div className="text-lg font-medium mb-2">No active session</div>
          <div className="text-sm text-gray-500">
            No active terminal session for machine &quot;{props.remote.machine}
            &quot;.
            <br />
            Make sure the CMDOP agent is running on the remote machine.
          </div>
          {machineNames.length > 0 && (
            <div className="mt-3 text-xs text-gray-600">
              Available machines: {machineNames.join(", ")}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <RemoteTerminalInner
      {...props}
      cmdopSessionId={matchedSession.session_id}
    />
  );
}

/**
 * Layer 1: Auth check — needs API key for gRPC.
 * Uses agent.run() via gRPC — no WebSocket/OAuth required.
 */
export function RemoteTerminalPane(props: RemoteTerminalPaneProps) {
  const settings = useStore((s) => s.settings);
  const setShowSettings = useStore((s) => s.setShowSettings);

  if (!settings.cmdopApiKey) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: THEME.background }}
      >
        <div className="text-center text-gray-400">
          <div className="text-lg font-medium mb-2">
            CMDOP API Key Required
          </div>
          <div className="text-sm text-gray-500 mb-4">
            Set your CMDOP API key (cmd_...) in Settings to connect to remote
            machines.
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return <RemoteTerminalConnector {...props} />;
}

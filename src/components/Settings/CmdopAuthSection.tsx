import { useState, useEffect, useRef } from "react";
import { useStore } from "../../stores/store";
import {
  requestDeviceCode,
  exchangeDeviceCode,
  type DeviceCodeResponse,
} from "../../utils/cmdopAuth";

export function CmdopAuthSection() {
  const cmdopAuth = useStore((s) => s.cmdopAuth);
  const setCmdopAuth = useStore((s) => s.setCmdopAuth);

  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "requesting" | "polling" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const startAuth = async () => {
    setStatus("requesting");
    setError(null);

    try {
      const code = await requestDeviceCode();
      setDeviceCode(code);
      setStatus("polling");

      // Start polling
      pollTimerRef.current = setInterval(async () => {
        try {
          const result = await exchangeDeviceCode(code.device_code);
          if (result === "pending") return;
          if (result === "expired") {
            setStatus("error");
            setError("Device code expired. Please try again.");
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            return;
          }
          // Success
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          console.log(`[CMDOP OAuth] Got token! prefix="${result.access_token.slice(0, 6)}", length=${result.access_token.length}`);
          console.log(`[CMDOP OAuth] refresh prefix="${result.refresh_token.slice(0, 7)}", scope="${(result as unknown as Record<string, unknown>).scope}", workspace="${(result as unknown as Record<string, unknown>).workspace_name}"`);
          setCmdopAuth({
            accessToken: result.access_token,
            refreshToken: result.refresh_token,
            expiresAt: Date.now() + result.expires_in * 1000,
          });
          setDeviceCode(null);
          setStatus("idle");
        } catch (err) {
          setStatus("error");
          setError(String(err));
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      }, (code.interval || 5) * 1000);
    } catch (err) {
      setStatus("error");
      setError(String(err));
    }
  };

  const disconnect = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setCmdopAuth(null);
    setDeviceCode(null);
    setStatus("idle");
    setError(null);
  };

  // Connected state
  if (cmdopAuth) {
    const isExpired = cmdopAuth.expiresAt < Date.now();
    return (
      <div className="bg-zinc-950/50 p-4 rounded-lg border border-white/5 animate-fade-in">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isExpired ? "bg-amber-500" : "bg-emerald-500"} shadow-[0_0_8px_currentColor]`}
            />
            {!isExpired && <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />}
          </div>
          <span className={`text-sm font-medium ${isExpired ? "text-amber-200" : "text-emerald-200"}`}>
            {isExpired ? "Token Expired" : "Connected to CMDOP"}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-4 bg-zinc-900/50 p-2 rounded border border-white/5">
          <span className="text-xs text-zinc-500 font-mono">Token:</span>
          <code className="text-xs text-zinc-300 font-mono bg-white/5 px-1.5 py-0.5 rounded">
            {cmdopAuth.accessToken.slice(0, 12)}...
          </code>
        </div>

        <button
          onClick={disconnect}
          className="w-full px-3 py-2 text-xs font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-all flex items-center justify-center gap-2 group"
        >
          <span>Disconnect</span>
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
      </div>
    );
  }

  // Polling state — show device code
  if (status === "polling" && deviceCode) {
    return (
      <div className="bg-zinc-950/50 p-6 rounded-lg border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)] animate-fade-in text-center">
        <div className="text-sm font-medium text-zinc-300 mb-4">
          Authorize Device
        </div>

        <div className="bg-zinc-900 border border-blue-500/30 rounded-lg p-4 mb-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="text-3xl font-mono font-bold text-blue-400 tracking-[0.2em] relative z-10 selection:bg-blue-500/30">
            {deviceCode.user_code}
          </div>
        </div>

        <a
          href={deviceCode.verification_uri}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md shadow-lg shadow-blue-500/20 transition-all active:scale-95 mb-3"
        >
          Open Authorization Page ↗
        </a>

        <div className="text-xs text-zinc-500 mb-4 animate-pulse">
          Waiting for approval...
        </div>

        <button
          onClick={disconnect}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline decoration-zinc-700 hover:decoration-zinc-500"
        >
          Cancel Request
        </button>
      </div>
    );
  }

  // Idle / Error state
  return (
    <div className="mt-6 pt-6 border-t border-white/5">
      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Authorization</h4>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-300 flex items-start gap-2">
          <span className="text-lg leading-none">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={startAuth}
        disabled={status === "requesting"}
        className="w-full px-4 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 hover:text-white border border-white/5 hover:border-white/10 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
      >
        {status === "requesting" ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <span>🔐</span> Connect via OAuth
          </>
        )}
      </button>

      <div className="text-[10px] text-zinc-600 mt-2 text-center leading-relaxed">
        Securely connects to CMDOP services via browser authentication.
        <br />Required for advanced remote features.
      </div>
    </div>
  );
}

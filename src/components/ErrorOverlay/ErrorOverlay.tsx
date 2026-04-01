import { useState } from "react";
import { useStore } from "../../stores/store";

export function ErrorOverlay() {
  const errors = useStore((s) => s.errors);
  const clearErrors = useStore((s) => s.clearErrors);
  const removeError = useStore((s) => s.removeError);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (errors.length === 0) return null;

  const handleCopyAll = async () => {
    const text = errors
      .map((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        let line = `[${time}] [${e.source}] ${e.message}`;
        if (e.details) line += `\n  ${e.details}`;
        return line;
      })
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <>
      <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 transform ${open ? "translate-y-[-16px]" : ""}`}>
        <button
          onClick={() => setOpen(!open)}
          className={`
            relative w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110 active:scale-95
            ${open ? "bg-zinc-700 text-zinc-300" : "bg-red-500 hover:bg-red-400 text-white shadow-red-500/30"}
          `}
          title={`${errors.length} error${errors.length !== 1 ? "s" : ""}`}
        >
          <span className="font-bold text-sm font-mono">{errors.length}</span>
          {!open && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-zinc-950 rounded-full animate-ping" />
          )}
        </button>
      </div>

      {/* Error panel */}
      {open && (
        <div className="fixed bottom-16 right-4 z-50 w-[500px] max-h-[60vh] bg-zinc-900/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-slide-up ring-1 ring-white/5">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-red-500/5">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-sm font-semibold text-red-200 uppercase tracking-wide">
                {errors.length} Error{errors.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAll}
                className="px-3 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-300 rounded-md transition-all border border-white/5 hover:border-white/10"
              >
                {copied ? "Copied!" : "Copy All"}
              </button>
              <button
                onClick={() => {
                  clearErrors();
                  setOpen(false);
                }}
                className="px-3 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-300 rounded-md transition-all border border-white/5 hover:border-white/10"
              >
                Clear All
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white rounded-md transition-colors ml-1 hover:bg-white/10"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Error list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-zinc-950/30">
            {errors.map((err) => (
              <div
                key={err.id}
                className="bg-zinc-900/80 border border-white/5 rounded-lg p-3 group hover:border-white/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-white/5">
                        {new Date(err.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-[10px] font-bold text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/10 uppercase tracking-wider">
                        {err.source}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-zinc-200 break-words leading-relaxed">
                      {err.message}
                    </div>
                    {err.details && (
                      <pre className="mt-2 text-xs font-mono text-pink-200/80 bg-zinc-950/50 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-40 border border-white/5 custom-scrollbar selection:bg-pink-500/30">
                        {err.details}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => removeError(err.id)}
                    className="text-zinc-600 hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-white/10 rounded"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

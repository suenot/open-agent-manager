const registry = new Map<string, (data: string) => void>();
const killFns = new Map<string, () => void>();

export const ptyRegistry = {
  register(sessionId: string, write: (data: string) => void) {
    registry.set(sessionId, write);
  },
  registerKill(sessionId: string, kill: () => void) {
    killFns.set(sessionId, kill);
  },
  unregister(sessionId: string) {
    registry.delete(sessionId);
    killFns.delete(sessionId);
  },
  write(sessionId: string, data: string) {
    registry.get(sessionId)?.(data);
  },
  killAll() {
    for (const [id, kill] of killFns) {
      try {
        kill();
      } catch {
        // ignore
      }
    }
    killFns.clear();
    registry.clear();
  },
};

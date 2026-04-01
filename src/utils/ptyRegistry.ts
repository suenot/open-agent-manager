const registry = new Map<string, (data: string) => void>();

export const ptyRegistry = {
  register(sessionId: string, write: (data: string) => void) {
    registry.set(sessionId, write);
  },
  unregister(sessionId: string) {
    registry.delete(sessionId);
  },
  write(sessionId: string, data: string) {
    registry.get(sessionId)?.(data);
  },
};

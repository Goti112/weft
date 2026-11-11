import type { SocketFactory, SocketLike } from './SyncClient';

export class NetworkSim {
  latencyMs = 0;
  duplicateProb = 0;
  reorderProb = 0;

  wrap(factory: SocketFactory): SocketFactory {
    return url => {
      const socket = factory(url);
      const timers = new Set<ReturnType<typeof setTimeout>>();
      let closed = false;
      const later = (callback: () => void, delay: number) => {
        const timer = setTimeout(() => { timers.delete(timer); if (!closed) callback(); }, delay);
        timers.add(timer);
      };
      const wrapped: SocketLike = {
        onopen: null, onmessage: null, onclose: null,
        send: data => {
          if (this.latencyMs === 0) socket.send(data);
          else later(() => socket.send(data), this.latencyMs);
        },
        close: () => {
          closed = true; for (const timer of timers) clearTimeout(timer);
          timers.clear(); socket.close();
        },
      };
      socket.onopen = event => { if (!closed) wrapped.onopen?.(event); };
      socket.onclose = event => {
        if (closed) return;
        closed = true; for (const timer of timers) clearTimeout(timer); timers.clear(); wrapped.onclose?.(event);
      };
      socket.onmessage = event => {
        const delay = this.latencyMs + (Math.random() < this.reorderProb ? 50 + Math.random() * 200 : 0);
        later(() => wrapped.onmessage?.(event), delay);
        if (Math.random() < this.duplicateProb) later(() => wrapped.onmessage?.(event), delay);
      };
      return wrapped;
    };
  }
}

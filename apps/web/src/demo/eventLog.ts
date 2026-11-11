import type { ClientMsg, ServerMsg } from '../sync/protocol';

export type LogEvent = { at: number; replica: string; dir: 'in' | 'out'; t: string; summary: string };
export class EventLog {
  private readonly events: LogEvent[] = [];
  private readonly listeners = new Set<() => void>();
  push(event: LogEvent): void {
    this.events.push({ ...event });
    if (this.events.length > 500) this.events.shift();
    for (const listener of this.listeners) listener();
  }
  list(): LogEvent[] { return this.events.map(event => ({ ...event })); }
  subscribe(callback: () => void): () => void { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
}

export function summarize(msg: ClientMsg | ServerMsg): string {
  if (msg.t === 'hello') return `hello lastSeq=${msg.lastSeq}`;
  if (msg.t === 'ack') return `ack ×${msg.opIds.length}`;
  if (msg.t === 'error') return `error ${msg.code}: ${msg.message}`;
  const first = msg.ops[0], last = msg.ops.at(-1);
  const range = first && last && 'seq' in first && 'seq' in last ? ` (seq ${first.seq}–${last.seq})` : '';
  return `${msg.t} ×${msg.ops.length}${range}${msg.t === 'catchup' ? `, headSeq=${msg.headSeq}, done=${msg.done}` : ''}`;
}

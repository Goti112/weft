import { idKey } from '@weft/crdt';
import type { SocketFactory, SocketLike } from './SyncClient';
import type { ClientMsg, SequencedOp, ServerMsg } from './protocol';

const CATCHUP_PAGE = 5000;
type DocState = { ops: SequencedOp[]; ids: Set<string>; sessions: Set<LocalSocket> };

/**
 * The sync server's protocol, running in the browser. Used by the static demo
 * so it works without a backend. It follows the same contract as the Java
 * server (server/.../sync/SyncHandler.java):
 *   - per-document contiguous seqs (duplicates do not consume one);
 *   - dedupe by op id;
 *   - an ack for every op in a batch;
 *   - broadcast to the other sessions only;
 *   - paged catch-up from `lastSeq`.
 * Messages are delivered asynchronously, like a real socket.
 */
export class LocalServer {
  private readonly docs = new Map<string, DocState>();

  createDoc(): string {
    const id = crypto.randomUUID().slice(0, 10);
    this.docs.set(id, { ops: [], ids: new Set(), sessions: new Set() });
    return id;
  }

  readonly connect: SocketFactory = () => new LocalSocket(this);

  /** @internal Called by LocalSocket for every client message. */
  receive(session: LocalSocket, msg: ClientMsg): void {
    if (msg.t === 'hello') return this.hello(session, msg.doc, msg.lastSeq);
    const doc = session.doc && this.docs.get(session.doc);
    if (!doc) return session.deliver({ t: 'error', code: 'NO_HELLO', message: 'Send hello first' });
    const fresh: SequencedOp[] = [];
    for (const op of msg.ops) {
      const key = idKey(op.opId);
      if (doc.ids.has(key)) continue;
      doc.ids.add(key);
      const stored = { seq: doc.ops.length + 1, op };
      doc.ops.push(stored); fresh.push(stored);
    }
    session.deliver({ t: 'ack', opIds: msg.ops.map(op => op.opId) });
    if (fresh.length) for (const other of doc.sessions) if (other !== session) other.deliver({ t: 'ops', ops: fresh });
  }

  private hello(session: LocalSocket, docId: string, lastSeq: number): void {
    const doc = this.docs.get(docId);
    if (!doc) {
      session.deliver({ t: 'error', code: 'DOC_NOT_FOUND', message: `Unknown document ${docId}` });
      session.closeFromServer(); return;
    }
    session.doc = docId; doc.sessions.add(session);
    // Seqs are contiguous, so everything after lastSeq starts at index lastSeq.
    const missing = doc.ops.slice(lastSeq);
    const headSeq = doc.ops.length;
    if (!missing.length) return session.deliver({ t: 'catchup', ops: [], headSeq, done: true });
    for (let i = 0; i < missing.length; i += CATCHUP_PAGE) {
      session.deliver({ t: 'catchup', ops: missing.slice(i, i + CATCHUP_PAGE), headSeq, done: i + CATCHUP_PAGE >= missing.length });
    }
  }

  /** @internal */
  leave(session: LocalSocket): void {
    if (session.doc) this.docs.get(session.doc)?.sessions.delete(session);
  }
}

class LocalSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  doc: string | null = null;
  private closed = false;

  constructor(private readonly server: LocalServer) {
    setTimeout(() => { if (!this.closed) this.onopen?.(new Event('open')); }, 0);
  }

  send(data: string): void {
    if (this.closed) throw new Error('Socket is closed');
    let msg: ClientMsg;
    try { msg = JSON.parse(data) as ClientMsg; }
    catch { this.deliver({ t: 'error', code: 'BAD_MESSAGE', message: 'Invalid JSON' }); return; }
    setTimeout(() => { if (!this.closed) this.server.receive(this, msg); }, 0);
  }

  deliver(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    setTimeout(() => { if (!this.closed) this.onmessage?.(new MessageEvent('message', { data })); }, 0);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true; this.server.leave(this);
    setTimeout(() => this.onclose?.(new CloseEvent('close')), 0);
  }

  /** Closes after the messages already queued for this socket have been delivered. */
  closeFromServer(): void { setTimeout(() => this.close(), 0); }
}

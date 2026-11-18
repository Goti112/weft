import { idKey, type Op } from '@weft/crdt';
import { MemoryStore } from './MemoryStore';
import type { Commit, Store, StoredState } from './Store';

/**
 * Schema v2: one record per op instead of one snapshot per document, so a
 * keystroke writes one small record regardless of document size.
 *   meta: doc -> { replicaId, lastSeq }
 *   ops:  [doc, opKey] -> { op, pending }
 */
const VERSION = 2;
type Meta = { replicaId: string | null; lastSeq: number };
type Entry = { op: Op; pending: boolean };

export class IdbStore implements Store {
  private readonly database: Promise<IDBDatabase>;
  constructor(name = 'weft-v1') {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        // v1 stored whole-document snapshots. It never shipped, so local v1 data is dropped, not migrated.
        if (db.objectStoreNames.contains('docs')) db.deleteObjectStore('docs');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('ops')) db.createObjectStore('ops');
      };
      request.onsuccess = () => {
        const db = request.result; db.onversionchange = () => db.close(); resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
  }

  /** Runs body in one transaction and resolves when it commits. */
  private async run(mode: IDBTransactionMode, body: (meta: IDBObjectStore, ops: IDBObjectStore) => void): Promise<void> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['meta', 'ops'], mode);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      try { body(transaction.objectStore('meta'), transaction.objectStore('ops')); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }

  private updateMeta(meta: IDBObjectStore, doc: string, fn: (m: Meta) => Meta): void {
    const request = meta.get(doc);
    request.onsuccess = () => meta.put(fn((request.result as Meta | undefined) ?? { replicaId: null, lastSeq: 0 }), doc);
  }

  async load(doc: string): Promise<StoredState> {
    let meta: Meta | undefined; let entries: Entry[] = [];
    await this.run('readonly', (metaStore, opsStore) => {
      const m = metaStore.get(doc); m.onsuccess = () => { meta = m.result as Meta | undefined; };
      const all = opsStore.getAll(IDBKeyRange.bound([doc], [doc, []]));
      all.onsuccess = () => { entries = all.result as Entry[]; };
    });
    return {
      replicaId: meta?.replicaId ?? null, lastSeq: meta?.lastSeq ?? 0,
      ops: entries.map(e => e.op), pending: entries.filter(e => e.pending).map(e => e.op),
    };
  }

  saveReplicaId(doc: string, id: string): Promise<void> {
    return this.run('readwrite', meta => this.updateMeta(meta, doc, m => ({ ...m, replicaId: id })));
  }

  commit(doc: string, change: Commit): Promise<void> {
    return this.run('readwrite', (meta, ops) => {
      for (const op of change.local ?? []) {
        const key = [doc, idKey(op.opId)];
        const existing = ops.get(key);
        // Never overwrite: another tab may already have this op acknowledged.
        existing.onsuccess = () => { if (!existing.result) ops.put({ op, pending: true } satisfies Entry, key); };
      }
      for (const op of change.remote ?? []) ops.put({ op, pending: false } satisfies Entry, [doc, idKey(op.opId)]);
      for (const id of change.acked ?? []) {
        const key = [doc, idKey(id)];
        const existing = ops.get(key);
        existing.onsuccess = () => {
          const entry = existing.result as Entry | undefined;
          if (entry?.pending) ops.put({ ...entry, pending: false } satisfies Entry, key);
        };
      }
      if (change.lastSeq !== undefined) {
        const lastSeq = change.lastSeq;
        this.updateMeta(meta, doc, m => ({ ...m, lastSeq: Math.max(m.lastSeq, lastSeq) }));
      }
    });
  }
}

export async function openStore(name = 'weft-v1'): Promise<{ store: Store; persistent: boolean }> {
  try {
    const store = new IdbStore(name); await store.load('__probe__');
    return { store, persistent: true };
  } catch { return { store: new MemoryStore(), persistent: false }; }
}

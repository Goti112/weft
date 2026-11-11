import { idKey, type Op } from '@weft/crdt';
import { cloneState, emptyState, type Store, type StoredState } from './Store';
import { MemoryStore } from './MemoryStore';

export class IdbStore implements Store {
  private readonly database: Promise<IDBDatabase>;
  constructor(name = 'weft-v1') {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('docs'); };
      request.onsuccess = () => {
        const db = request.result; db.onversionchange = () => db.close(); resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
  }

  async load(doc: string): Promise<StoredState> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('docs', 'readonly');
      const request = transaction.objectStore('docs').get(doc);
      transaction.oncomplete = () => resolve((request.result as StoredState | undefined) ?? emptyState());
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private async update(doc: string, fn: (state: StoredState) => StoredState): Promise<void> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('docs', 'readwrite');
      const store = transaction.objectStore('docs'); const request = store.get(doc);
      request.onsuccess = () => {
        try { store.put(fn((request.result as StoredState | undefined) ?? emptyState()), doc); }
        catch (error) { transaction.abort(); reject(error); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  saveState(doc: string, state: StoredState): Promise<void> {
    const snapshot = cloneState(state);
    return this.update(doc, () => snapshot);
  }
  saveReplicaId(doc: string, id: string): Promise<void> { return this.update(doc, s => ({ ...s, replicaId: id })); }
  appendOps(doc: string, ops: Op[]): Promise<void> {
    return this.update(doc, s => ({ ...s, ops: [...new Map([...s.ops, ...ops].map(op => [idKey(op.opId), op])).values()] }));
  }
  setPending(doc: string, pending: Op[]): Promise<void> { return this.update(doc, s => ({ ...s, pending })); }
  setLastSeq(doc: string, lastSeq: number): Promise<void> { return this.update(doc, s => ({ ...s, lastSeq })); }
}

export async function openStore(name = 'weft-v1'): Promise<{ store: Store; persistent: boolean }> {
  try {
    const store = new IdbStore(name); await store.load('__probe__');
    return { store, persistent: true };
  } catch { return { store: new MemoryStore(), persistent: false }; }
}

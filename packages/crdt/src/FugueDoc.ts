import { compareIds, idKey, type Id } from './id';
import type { Op } from './ops';
import type { TreeSnapshot, TextChange } from './inspect';

export const MAX_CHUNK = 1000;

type Node = {
  id: Id | null;
  parent: Node | null;
  side: 'L' | 'R';
  char: string;
  deleted: boolean;
  leftChildren: Node[];
  rightChildren: Node[];
};

export class FugueDoc {
  private readonly root: Node = {
    id: null, parent: null, side: 'R', char: '', deleted: false,
    leftChildren: [], rightChildren: [],
  };
  private readonly nodes = new Map<string, Node>();
  private readonly order: Node[] = [];
  private readonly versions: Record<string, number> = Object.create(null);
  private counter = 0;
  private readonly applied = new Set<string>();
  private readonly pending = new Map<string, Op>();
  private readonly listeners = new Set<(changes: TextChange[]) => void>();

  constructor(private readonly replicaId: string) {}

  private visible(): Node[] { return this.order.filter(n => !n.deleted); }

  private checkRange(index: number, length = 0): void {
    const size = this.visible().length;
    if (!Number.isInteger(index) || !Number.isInteger(length) || index < 0 || length < 0 || index + length > size) {
      throw new RangeError('Invalid visible range');
    }
  }

  insert(index: number, text: string): Op[] {
    this.checkRange(index);
    const ops: Op[] = [];
    for (let offset = 0; offset < text.length; offset += MAX_CHUNK) {
      const chunk = text.slice(offset, offset + MAX_CHUNK);
      const left = index === 0 ? this.root : this.visible()[index - 1];
      const next = this.order[this.order.indexOf(left) + 1];
      const parent = left.rightChildren.length === 0 ? left : next;
      const side = left.rightChildren.length === 0 ? 'R' : 'L';
      const op: Op = { type: 'insert', opId: { replica: this.replicaId, counter: this.counter }, parent: parent.id, side, text: chunk };
      this.counter += chunk.length;
      this.insertChunk(op);
      this.applied.add(idKey(op.opId));
      ops.push(op);
      index += chunk.length;
    }
    return ops;
  }

  delete(index: number, length: number): Op[] {
    this.checkRange(index, length);
    if (!length) return [];
    const targets = this.visible().slice(index, index + length);
    const op: Op = { type: 'delete', opId: { replica: this.replicaId, counter: this.counter++ }, targets: targets.map(n => n.id!) };
    for (const node of targets) node.deleted = true;
    this.observe(op.opId);
    this.applied.add(idKey(op.opId));
    return [op];
  }

  private observe(id: Id): void {
    this.versions[id.replica] = Math.max(this.versions[id.replica] ?? -1, id.counter);
    if (id.replica === this.replicaId) this.counter = Math.max(this.counter, id.counter + 1);
  }

  private insertChunk(op: Extract<Op, { type: 'insert' }>): void {
    let parent = op.parent === null ? this.root : this.nodes.get(idKey(op.parent))!;
    const siblings = op.side === 'L' ? parent.leftChildren : parent.rightChildren;
    const siblingIndex = siblings.findIndex(n => compareIds(n.id!, op.opId) > 0);
    const at = siblingIndex < 0 ? siblings.length : siblingIndex;
    let position: number;
    if (at > 0) {
      let last = siblings[at - 1];
      while (last.rightChildren.length) last = last.rightChildren[last.rightChildren.length - 1];
      position = this.order.indexOf(last) + 1;
    } else if (op.side === 'R') {
      position = parent === this.root ? 0 : this.order.indexOf(parent) + 1;
    } else {
      let first = parent;
      while (first.leftChildren.length) first = first.leftChildren[0];
      position = this.order.indexOf(first);
    }
    const chain: Node[] = [];
    for (let i = 0; i < op.text.length; i++) {
      const id = { replica: op.opId.replica, counter: op.opId.counter + i };
      const node: Node = { id, parent, side: i === 0 ? op.side : 'R', char: op.text[i], deleted: false, leftChildren: [], rightChildren: [] };
      if (i === 0) siblings.splice(at, 0, node);
      else parent.rightChildren.push(node);
      this.nodes.set(idKey(id), node);
      this.observe(id);
      chain.push(node);
      parent = node;
    }
    this.order.splice(position, 0, ...chain);
  }

  apply(op: Op): void {
    const key = idKey(op.opId);
    if (this.applied.has(key)) return;
    const before = this.listeners.size ? this.visible() : [];
    this.pending.set(key, op);
    let progress: boolean;
    do {
      progress = false;
      for (const [pendingKey, candidate] of this.pending) {
        const ready = candidate.type === 'insert'
          ? candidate.parent === null || this.nodes.has(idKey(candidate.parent))
          : candidate.targets.every(id => this.nodes.has(idKey(id)));
        if (!ready) continue;
        if (candidate.type === 'insert') this.insertChunk(candidate);
        else {
          for (const id of candidate.targets) this.nodes.get(idKey(id))!.deleted = true;
          this.observe(candidate.opId);
        }
        this.applied.add(pendingKey);
        this.pending.delete(pendingKey);
        progress = true;
      }
    } while (progress);
    if (!this.listeners.size) return;
    const after = this.visible();
    const oldPositions = new Map(before.map((node, i) => [node, i]));
    const changes: TextChange[] = [];
    let from = 0;
    let inserted = '';
    for (const node of after) {
      const oldIndex = oldPositions.get(node);
      if (oldIndex === undefined) inserted += node.char;
      else {
        if (oldIndex !== from || inserted) changes.push({ from, to: oldIndex, insert: inserted });
        from = oldIndex + 1;
        inserted = '';
      }
    }
    if (from !== before.length || inserted) changes.push({ from, to: before.length, insert: inserted });
    if (changes.length) for (const cb of this.listeners) cb(changes);
  }

  pendingCount(): number { return this.pending.size; }

  onChange(cb: (changes: TextChange[]) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  inspect(): TreeSnapshot {
    const snapshots = new Map<Node, TreeSnapshot>();
    for (const node of [this.root, ...this.order]) snapshots.set(node, {
      id: node.id && { ...node.id }, char: node.char, deleted: node.deleted,
      side: node === this.root ? null : node.side, left: [], right: [],
    });
    for (const [node, snapshot] of snapshots) {
      snapshot.left = node.leftChildren.map(child => snapshots.get(child)!);
      snapshot.right = node.rightChildren.map(child => snapshots.get(child)!);
    }
    return snapshots.get(this.root)!;
  }
  text(): string { return this.visible().map(n => n.char).join(''); }
  version(): Record<string, number> { return { ...this.versions }; }
}

import type { Id } from './id';

export type Op =
  | { type: 'insert'; opId: Id; parent: Id | null; side: 'L' | 'R'; text: string }
  | { type: 'delete'; opId: Id; targets: Id[] };

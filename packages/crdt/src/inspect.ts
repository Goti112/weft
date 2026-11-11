import type { Id } from './id';

export type TreeSnapshot = {
  id: Id | null;
  char: string;
  deleted: boolean;
  side: 'L' | 'R' | null;
  left: TreeSnapshot[];
  right: TreeSnapshot[];
};

export type TextChange = { from: number; to: number; insert: string };

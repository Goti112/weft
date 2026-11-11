export type Id = { replica: string; counter: number };

export function compareIds(a: Id, b: Id): number {
  return a.replica < b.replica ? -1 : a.replica > b.replica ? 1 : a.counter - b.counter;
}

export function idKey(id: Id): string {
  return `${id.replica}:${id.counter}`;
}

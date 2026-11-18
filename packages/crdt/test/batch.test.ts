import { expect, test } from 'vitest';
import { FugueDoc, type Op, type TextChange } from '../src/index';

/**
 * A document typed one keystroke at a time at the end: one op per character,
 * each the right child of the previous one (what FugueDoc.insert produces).
 */
function typedOps(n: number, replica = 'author'): Op[] {
  return Array.from({ length: n }, (_, i): Op => ({
    type: 'insert', opId: { replica, counter: i },
    parent: i === 0 ? null : { replica, counter: i - 1 }, side: 'R', text: String.fromCharCode(97 + (i % 26)),
  }));
}

test('typedOps matches what typing produces', () => {
  const author = new FugueDoc('author'); const typed: Op[] = [];
  for (let i = 0; i < 30; i++) typed.push(...author.insert(i, String.fromCharCode(97 + (i % 26))));
  expect(typedOps(30)).toEqual(typed);
});
const elapsed = (fn: () => void) => { const t = performance.now(); fn(); return performance.now() - t; };

test('applyMany notifies once per batch with correct changes', () => {
  const a = new FugueDoc('a'), b = new FugueDoc('b');
  b.applyMany(a.insert(0, 'ad'));
  const ops = [...a.insert(1, 'bc'), ...a.insert(4, 'e'), ...a.delete(0, 1)];
  const calls: TextChange[][] = [];
  b.onChange(changes => calls.push(changes));
  b.applyMany(ops);
  expect(calls).toHaveLength(1);
  expect(b.text()).toBe(a.text());
  let replayed = 'ad';
  for (const c of [...calls[0]].reverse()) replayed = replayed.slice(0, c.from) + c.insert + replayed.slice(c.to);
  expect(replayed).toBe(a.text());
});

test('applyMany is idempotent and buffers missing parents', () => {
  const ops = typedOps(50); const b = new FugueDoc('b');
  b.applyMany([...ops].reverse()); b.applyMany(ops);
  expect(b.text()).toBe(typedOps(50).map(o => o.type === 'insert' ? o.text : '').join(''));
  expect(b.pendingCount()).toBe(0);
});

test('catch-up of 10,000 typed ops with a listener takes under 2 s', () => {
  const ops = typedOps(10_000); const b = new FugueDoc('b'); b.onChange(() => {});
  const ms = elapsed(() => { for (let i = 0; i < ops.length; i += 5000) b.applyMany(ops.slice(i, i + 5000)); });
  expect(b.text().length).toBe(10_000);
  expect(ms).toBeLessThan(2000);
});

test('replaying 10,000 ops in reverse order takes under 2 s', () => {
  const ops = typedOps(10_000).reverse(); const b = new FugueDoc('b');
  const ms = elapsed(() => b.applyMany(ops));
  expect(b.text().length).toBe(10_000); expect(b.pendingCount()).toBe(0);
  expect(ms).toBeLessThan(2000);
});

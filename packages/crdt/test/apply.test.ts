import { test, expect } from 'vitest';
import { FugueDoc, type Op, type TextChange } from '../src/index';
const sync = (from: FugueDoc, to: FugueDoc, ops: Op[]) => ops.forEach(o => to.apply(o));
test('remote insert reproduces text', () => { const a = new FugueDoc('a'), b = new FugueDoc('b');
  sync(a, b, a.insert(0, 'hola')); expect(b.text()).toBe('hola'); });
test('apply is idempotent', () => { const a = new FugueDoc('a'), b = new FugueDoc('b');
  const ops = a.insert(0, 'hi'); sync(a, b, ops); sync(a, b, ops); expect(b.text()).toBe('hi'); });
test('op with missing parent is buffered until parent arrives', () => {
  const a = new FugueDoc('a'), b = new FugueDoc('b');
  const o1 = a.insert(0, 'a'); const o2 = a.insert(1, 'b');
  b.apply(o2[0]); expect(b.text()).toBe(''); expect(b.pendingCount()).toBe(1);
  b.apply(o1[0]); expect(b.text()).toBe('ab'); expect(b.pendingCount()).toBe(0);
});
test('delete before its target is buffered', () => {
  const a = new FugueDoc('a'), b = new FugueDoc('b');
  const ins = a.insert(0, 'x'); const del = a.delete(0, 1);
  sync(a, b, del); sync(a, b, ins); expect(b.text()).toBe('');
});
test('concurrent inserts at same position do not interleave', () => {
  const a = new FugueDoc('a'), b = new FugueDoc('b');
  const base = a.insert(0, '[]'); sync(a, b, base);
  const oa = a.insert(1, 'hola'); const ob = b.insert(1, 'adios');
  sync(a, b, oa); sync(b, a, ob);
  expect(a.text()).toBe(b.text()); expect(['[holaadios]', '[adioshola]']).toContain(a.text());
});
test('onChange reports visible changes for remote ops', () => {
  const a = new FugueDoc('a'), b = new FugueDoc('b'); const seen: TextChange[] = [];
  b.onChange(c => seen.push(...c)); sync(a, b, a.insert(0, 'ab'));
  expect(seen).toEqual([{ from: 0, to: 0, insert: 'ab' }]);
});
test('inspect shows tombstones', () => {
  const d = new FugueDoc('a'); d.insert(0, 'ab'); d.delete(0, 1);
  expect(JSON.stringify(d.inspect())).toContain('"deleted":true');
});

test('character-by-character inserts do not interleave', () => {
 const a = new FugueDoc('a'), b = new FugueDoc('b'); const base = a.insert(0, '[]'); sync(a,b,base);
 const oa: Op[] = [], ob: Op[] = [];
 for (let i=0;i<4;i++) oa.push(...a.insert(1+i,'hola'[i]));
 for (let i=0;i<5;i++) ob.push(...b.insert(1+i,'adios'[i]));
 sync(a,b,oa); sync(b,a,ob); expect(a.text()).toBe(b.text()); expect(['[holaadios]','[adioshola]']).toContain(a.text());
});

test('delete never leaves half of a surrogate pair', () => {
  const d = new FugueDoc('a'); d.insert(0, 'a😀b');
  d.delete(1, 1); expect(d.text()).toBe('ab');
});

test('insert cannot split a surrogate pair', () => {
  const d = new FugueDoc('a'); d.insert(0, '😀');
  expect(() => d.insert(1, 'x')).toThrow(RangeError);
});

test('chunk boundary does not split a surrogate pair', () => {
  const d = new FugueDoc('a'); const ops = d.insert(0, 'x'.repeat(999) + '😀');
  expect(ops.filter(o => o.type === 'insert').map(o => o.text.length)).toEqual([999, 2]);
});

test('large deletes split into operations within the wire budget', () => {
  const d = new FugueDoc('a'); d.insert(0, 'x'.repeat(5000));
  const ops = d.delete(0, 5000);
  expect(ops.length).toBeGreaterThan(1);
  expect(ops.every(op => new TextEncoder().encode(JSON.stringify(op)).length < 60000)).toBe(true);
  expect(new Set(ops.map(op => op.opId.counter)).size).toBe(ops.length);
  expect(d.text()).toBe('');
});

import { test, expect } from 'vitest';
import { FugueDoc } from '../src/index';
test('insert into empty doc', () => {
  const d = new FugueDoc('a'); d.insert(0, 'hola'); expect(d.text()).toBe('hola');
});
test('insert in middle and at end', () => {
  const d = new FugueDoc('a'); d.insert(0, 'hla'); d.insert(1, 'o'); d.insert(4, '!');
  expect(d.text()).toBe('hola!');
});
test('delete range', () => {
  const d = new FugueDoc('a'); d.insert(0, 'hola mundo'); d.delete(4, 6);
  expect(d.text()).toBe('hola');
});
test('insert after deleted char lands in visible position', () => {
  const d = new FugueDoc('a'); d.insert(0, 'abc'); d.delete(1, 1); d.insert(1, 'X');
  expect(d.text()).toBe('aXc');
});
test('insert returns one op per chunk with consecutive counters', () => {
  const d = new FugueDoc('a'); const ops = d.insert(0, 'abc');
  expect(ops).toEqual([{ type: 'insert', opId: { replica: 'a', counter: 0 }, parent: null, side: 'R', text: 'abc' }]);
  expect(d.version()).toEqual({ a: 2 });
});
test('insert splits long text into chunks', () => {
  const d = new FugueDoc('a'); const ops = d.insert(0, 'x'.repeat(2500));
  expect(ops.map(o => o.type === 'insert' && o.text.length)).toEqual([1000, 1000, 500]);
  expect(d.text().length).toBe(2500);
});
test('delete op consumes its own counter', () => {
  const d = new FugueDoc('a'); d.insert(0, 'ab'); const [op] = d.delete(0, 1);
  expect(op).toMatchObject({ type: 'delete', opId: { replica: 'a', counter: 2 }, targets: [{ replica: 'a', counter: 0 }] });
});
test('out of range index throws RangeError', () => {
  const d = new FugueDoc('a'); expect(() => d.insert(1, 'x')).toThrow(RangeError);
  expect(() => d.delete(0, 1)).toThrow(RangeError);
});


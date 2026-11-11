import { test, expect } from 'vitest';
import fc from 'fast-check';
import { FugueDoc, type Op } from '../src/index';

const action = fc.record({
  replica: fc.nat(), index: fc.nat(), remove: fc.boolean(), length: fc.nat(),
  symbols: fc.array(fc.nat(), { minLength: 1, maxLength: 5 }),
  deliver: fc.boolean(), destination: fc.nat(),
});
const history = fc.integer({ min: 2, max: 5 }).chain(count => fc.record({
  groups: fc.array(fc.array(action, { minLength: 1, maxLength: 30 }), { minLength: count, maxLength: count }),
  seed: fc.integer(),
}).map(({ groups, seed }) => ({
  count, seed,
  actions: Array.from({ length: 30 }, (_, step) => groups.flatMap((group, replica) =>
    step < group.length ? [{ ...group[step], replica }] : [],
  )).flat(),
})));

type History = typeof history extends fc.Arbitrary<infer T> ? T : never;
function runHistory(h: History, alphabet: string[]) {
  const docs = Array.from({ length: h.count }, (_, i) => new FugueDoc(`r${i}`));
  const ops: Op[] = [];
  let randomState = h.seed | 0;
  const random = () => {
    randomState = Math.imul(randomState, 1664525) + 1013904223 | 0;
    return (randomState >>> 0) / 4294967296;
  };
  for (const a of h.actions) {
    const d = docs[a.replica % docs.length];
    const points = Array.from(d.text());
    const at = a.index % (points.length + 1);
    const index = points.slice(0, at).join('').length;
    if (a.remove && at < points.length) {
      const length = 1 + a.length % (points.length - at);
      ops.push(...d.delete(index, points.slice(at, at + length).join('').length));
    } else ops.push(...d.insert(index, a.symbols.map(n => alphabet[n % alphabet.length]).join('')));
    if (a.deliver && ops.length) docs[a.destination % docs.length].apply(ops[Math.floor(random() * ops.length)]);
  }
  for (const d of docs) {
    const shuffled = [...ops, ...ops.filter(() => random() < 0.4)];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const op of shuffled) d.apply(op);
    expect(d.pendingCount()).toBe(0);
    expect(d.text()).toBe(docs[0].text());
  }
  return docs[0].text();
}

test('converges', () => {
  fc.assert(fc.property(history, h => { runHistory(h, ['a', 'b', 'c', ' ']); }), { numRuns: 500 });
});

test('converges with emoji alphabet', () => {
  fc.assert(fc.property(history, h => {
    const text = runHistory(h, ['a', '😀', 'é', 'ñ']);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  }), { numRuns: 500 });
});

test('no interleaving', () => {
  fc.assert(fc.property(fc.integer({ min: 2, max: 30 }), fc.integer({ min: 2, max: 30 }), fc.nat(), (n, m, position) => {
    const a = new FugueDoc('a'), b = new FugueDoc('b');
    const base = a.insert(0, 'base'); base.forEach(op => b.apply(op));
    const at = position % 5;
    const oa: Op[] = [], ob: Op[] = [];
    for (let i = 0; i < n; i++) oa.push(...a.insert(at + i, 'x'));
    for (let i = 0; i < m; i++) ob.push(...b.insert(at + i, 'y'));
    oa.reverse().forEach(op => b.apply(op)); ob.reverse().forEach(op => a.apply(op));
    expect(a.text()).toBe(b.text());
    expect(a.text()).toContain('x'.repeat(n));
    expect(a.text()).toContain('y'.repeat(m));
  }), { numRuns: 500 });
});

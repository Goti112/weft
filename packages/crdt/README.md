# @weft/crdt

Dependency-free TypeScript text CRDT using a two-sided Fugue tree. Each UTF-16
code unit has a stable `(replica, counter)` identifier. Left descendants, the
node, then right descendants define the text order; siblings use deterministic
identifier order. Deleted nodes remain as tombstones. Right-chained typing
preserves contiguous concurrent words.

```ts
import { FugueDoc } from '@weft/crdt';
const a = new FugueDoc('a');
const b = new FugueDoc('b');
a.insert(0, 'hola').forEach(op => b.apply(op));
a.delete(0, 1).forEach(op => b.apply(op));
console.log(b.text()); // ola
```

`insert(index, text)` and `delete(index, length)` apply locally and return ops
for transmission. `apply(op)` is idempotent and buffers missing dependencies.
`version()` returns maximum counters, `pendingCount()` counts unresolved ops,
and `inspect()` returns an independent tree snapshot. `onChange(callback)`
subscribes to remote changes, in pre-change visible coordinates, and returns
an unsubscribe function. Local edits do not trigger it.

Indices use UTF-16. Inserting inside a surrogate pair throws `RangeError`;
deletion expands to include a complete pair. Insert chunks use at most 1,000
units and never split a pair. Empty edits return no operations. Invalid
ranges throw `RangeError`.

## Verification

`pnpm --filter @weft/crdt test` runs unit tests and three fast-check properties,
500 runs each: convergence, Unicode convergence, and concurrent non-interleaving.
Histories use 2–5 replicas with 1–30 actions each, partial delivery, shuffled final
delivery and duplicates.

## Benchmarks

Windows, Node 24.20.0, Vitest 3.2.7; measured on 2026-11-11 with
`pnpm --filter @weft/crdt exec vitest bench --run`.

| Operation at index 50,000 | Mean | Samples |
| --- | ---: | ---: |
| Local insert | 5.9715 ms | 100 |
| Local delete | 8.8904 ms | 100 |
| Remote insert apply | 0.0345 ms | 100 |

Each benchmark starts with 100,000 characters. Each sample performs a new
operation; the document changes by at most 101 characters during measurement
(including the runner's untimed probe). Initialization is excluded. These means
meet the 16 ms goal; occasional GC pauses exceed it. The implementation uses a
linear order array and is not intended to guarantee constant-time edits.

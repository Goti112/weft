# Weft

A local-first collaborative text editor. Several people edit the same document at once, also while offline, and every replica converges to the same text when it reconnects, without losing an edit or interleaving concurrent words.

[![CI](https://github.com/Goti112/weft/actions/workflows/ci.yml/badge.svg)](https://github.com/Goti112/weft/actions/workflows/ci.yml)

- **A text CRDT written from scratch.** [Fugue](https://arxiv.org/abs/2305.00583) in dependency-free TypeScript, checked with property-based tests.
- **A sync server in Java 21 + Spring Boot.** WebSocket, PostgreSQL, incremental catch-up and idempotent retries.
- **A demo that shows the internals.** Three live editors with a "cut network" button, a network simulator (latency, duplication, reordering), and an inspector that shows every protocol message, the Fugue tree with its tombstones, and the version vectors.

## Architecture

```text
┌──────────────────── Browser (one per replica) ────────────────────┐
│  React + CodeMirror 6                                             │
│      │ edits                       ▲ remote changes (one per batch)│
│  @weft/crdt  FugueDoc ◄──────────► IndexedDB  (one record per op, │
│      │                                         delivery watermark)│
│  SyncClient  (pending queue, watermark, backoff, rate limiting)   │
└──────┼────────────────────────────────────────────────────────────┘
       │ WebSocket · JSON
┌──────▼──────────────── Sync server (Java 21 · Spring Boot) ───────┐
│  validate → dedupe → assign seq → ack → broadcast · catch-up      │
│  ops are opaque: the server never interprets or merges text       │
└──────┬────────────────────────────────────────────────────────────┘
       │
   PostgreSQL  ops(doc_id, seq, replica_id, counter, payload jsonb)
```

## Design decisions

**The CRDT lives only in the client.** The server stores and relays operations without understanding them. That keeps the merge logic in one place ([`packages/crdt`](packages/crdt)), so it can be tested in isolation, and the server needs no copy of it.

**Fugue instead of RGA.** Both converge, but Fugue also guarantees *maximal non-interleaving*: if two people type "hola" and "adiós" at the same position, the result is `holaadiós` or `adióshola`, never `haodliaós`. Each UTF-16 code unit is a tree node with a stable `(replica, counter)` id. Deletes leave tombstones so their ids can still anchor concurrent inserts. Edits never split a surrogate pair, so emoji survive concurrent editing.

**Causal buffering that does not care about arrival order.** An op whose parent (or delete target) has not arrived yet is buffered under the id it is waiting for. When that id is integrated, exactly its dependents are woken. Replaying 10,000 ops in reverse order takes the same time as in order. See [`FugueDoc.integrate`](packages/crdt/src/FugueDoc.ts).

**Contiguous sequence numbers plus a delivery watermark.**
- The server gives each stored op a per-document `seq`. Duplicates do not consume one, so the seqs for a document are always exactly `1..head` ([`OpStore`](server/src/main/java/dev/weft/server/store/OpStore.java)).
- The client tracks the highest `n` such that it has received every seq up to `n`. Seqs that arrive ahead of a gap wait until it fills ([`SyncClient`](apps/web/src/sync/SyncClient.ts)).
- On reconnect the client sends that watermark, and the server returns only what is missing. This stays correct when messages are reordered, duplicated or lost right before a disconnect.

**Idempotent end to end.**
- `(doc, replica, counter)` is unique in PostgreSQL. The server acknowledges every op in a batch, including ones it already had. The CRDT ignores ops it has already applied.
- As a result, any message can be retried or delivered twice safely, and there is no need for exactly-once delivery.

**Durability before transmission.**
- A local edit is written to IndexedDB before it is sent. Reloading the page offline never loses an edit the server has not acknowledged.
- Storage is one record per op, so a keystroke costs the same in a 10-character document as in a 100,000-character one ([`IdbStore`](apps/web/src/storage/IdbStore.ts)).
- Tabs share the log under three merge rules: an acknowledged op never becomes pending again, server-delivered ops count as acknowledged, and the watermark only grows. Each tab writes with a fresh replica id, so two live tabs can never allocate the same op id.

**No races between catch-up and live traffic.** For each document, catch-up and broadcasts run under the same lock. Seq allocation is serialized by a row lock on the document. A client that fails mid-broadcast is disconnected without blocking delivery to the others.

**Limits for a public demo:**
- 500 ops per batch and 64 KiB per message;
- 5 MiB of ops per document;
- 20 messages/s per connection (token bucket on both client and server);
- catch-up pages bounded by count and by bytes;
- reconnect backoff with jitter, capped at 10 s;
- inactive documents deleted after 7 days.

## Protocol

| Direction | Message | Payload |
| --- | --- | --- |
| C → S | `hello` | `doc`, `replica`, `lastSeq` (watermark) |
| S → C | `catchup` | `ops: [{seq, op}]`, `headSeq`, `done` (paged) |
| C → S | `ops` | `Op[]` |
| S → C | `ack` | `opIds` for the whole batch, including duplicates |
| S → C | `ops` | `[{seq, op}]`, broadcast to the other sessions |
| S → C | `error` | `BAD_MESSAGE` · `NO_HELLO` · `LIMIT_EXCEEDED` · `DOC_NOT_FOUND` |

## Testing

- **Property-based tests** ([fast-check](https://fast-check.dev/)). Each property runs 500 random histories with 2–5 replicas, where ops are delivered shuffled, duplicated and partially synced. The properties are convergence, convergence with emoji and accented characters, and non-interleaving of concurrent typing.
- **Server integration tests** against real PostgreSQL through Testcontainers. They cover dedupe, contiguous seqs, 8 threads appending concurrently to one document, paged catch-up, malformed messages and every limit.
- **End-to-end tests** with Playwright against the Docker image:
  - two browsers editing offline and converging;
  - reloading the page with no network;
  - recovering the pending edits of a closed tab;
  - the guided demo scenario;
  - a reconnect that resumes from its watermark.
- **Performance regression tests**: catch-up of 10,000 ops, in order and reversed, must take under 2 s, and a keystroke must write only the new op.

CI runs all of it on every push.

### Numbers

Measured with Node 24 on a laptop. Catch-up is for a document typed one keystroke at a time, with the editor attached.

| | |
| --- | ---: |
| Local insert in the middle of a 100,000-character document | 6 ms |
| Remote op applied in the middle of a 100,000-character document | 0.03 ms |
| Catch-up of 10,000 ops with the editor attached | 141 ms |
| Same catch-up, applying op by op (the first version) | ≈ 15 s |

## Run it

```bash
docker compose up --build        # app on http://localhost:8080
```

Use `WEFT_PORT=18081` if port 8080 is taken.

Development needs Node 24, pnpm, Docker and a JDK. The Gradle wrapper provisions JDK 21 if needed.

```bash
pnpm install
pnpm lint && pnpm -r test                     # CRDT + web unit and property tests
(cd server && ./gradlew test)                 # server tests (needs Docker)
docker compose up -d --build && pnpm --filter e2e test:e2e
```

## Repository layout

```text
packages/crdt   Fugue CRDT: tree, causal buffer, batch apply, tests, benchmarks
apps/web        React + Vite + CodeMirror 6: sync client, IndexedDB store, demo, inspector
server          Spring Boot: WebSocket protocol, op store, limits, cleanup job
e2e             Playwright tests against the Docker image
```

## Next

- Run several server instances behind Redis pub/sub, with k6 load tests.
- Show remote cursors and selections.
- Compact tombstones.
- Use an indexed (order-statistic) tree for O(log n) local edits.

## License

[MIT](LICENSE) © 2026 Miquel Manzano

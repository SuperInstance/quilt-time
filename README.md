# quilt-time

> Time travel for Quilt cells. Every cell has history; you can fork, rewind, replay, and merge.

A standalone TypeScript library. No dependencies. Drop it in, give your cells a past.

## The thesis

Quilt today is a reactive runtime. Quilt with time travel is a **database** that you can also run programs in. Every cell has versions. You can:

- get the current value of a cell
- get the value as of any past time
- see the diff between two times
- **fork** the engine (like `git branch`)
- **rewind** to a fork
- **replay** events forward from a fork
- **merge** two forks together

Without time travel, Quilt is "a runtime." With time travel, Quilt is "a database + a runtime + a version control system for your data." The combination is the new thing.

## Install

```bash
npm install quilt-time
```

Or just copy `src/index.js` — there are no dependencies.

## Use

```js
import { QuiltTime } from 'quilt-time';

const q = new QuiltTime();

q.set('user.alice.score', 100);   // t=1
q.set('user.alice.score', 250);   // t=2
q.set('user.alice.score', 175);   // t=3

// Current value:
q.get('user.alice.score');   // → 175

// Value at any past time:
q.at('user.alice.score', 1);  // → 100
q.at('user.alice.score', 2);  // → 250
q.at('user.alice.score', 3);  // → 175

// Full history:
q.history('user.alice.score');
// → [
//     { value: 100, t: 1, author: 'local' },
//     { value: 250, t: 2, author: 'local' },
//     { value: 175, t: 3, author: 'local' },
//   ]

// Fork: like git branch.
const v1 = q.fork('experiment-A');
q.set('user.alice.score', 999);   // t=4 — only on the v1 branch
q.set('user.alice.score', 0);     // t=5 — diverged

// Rewind: go back to v1.
q.rewind(v1);
q.get('user.alice.score');  // → 175 (the v1 value)

// Replay: walk forward from a fork.
q.set('user.alice.score', 500);   // t=6 — new history on top of v1
q.set('user.alice.score', 600);   // t=7
for (const e of q.replay(v1)) {
  console.log(e.cid, e.value, e.t);
}
// user.alice.score 500 6
// user.alice.score 600 7

// Merge two engines.
const a = new QuiltTime();
a.set('x', 1, { t: 1 });
const b = new QuiltTime();
b.set('y', 2, { t: 1 });
const merged = QuiltTime.merge(a, b);
merged.get('x');  // → 1
merged.get('y');  // → 2

// Save and load.
const json = q.toJSON();
const restored = QuiltTime.fromJSON(json);
restored.get('user.alice.score');  // → 600
```

## Test

```bash
npm test
```

17 tests pass. Cover set/get, history, fork, rewind, replay, merge, serialization.

## Use cases

- **Undo/redo without a stack.** A rewind is just `rewind(previousFork)`.
- **"What was the value yesterday?"** — `at(t)`.
- **"What changed between these two reports?"** — `diff(from, to)`.
- **Branch a scenario, try something risky, return if it doesn't pan out.**
- **Sync between devices using last-write-wins** — merge resolves
  conflicts deterministically.
- **Time-travel debugging.** Replay the cell history and see what
  the state was at each step.
- **Audit log.** Every change is preserved.

## Design notes

- **Timestamps are Lamport-like.** Each engine has a monotonic
  counter. The `merge` function uses a tiebreaker tag (which fork
  came "first") for deterministic conflict resolution.
- **Storage is in-memory.** A real implementation would persist to
  disk (append-only log, snapshot, then a real CRDT for merge).
- **No CRDT yet.** The merge is "last-write-wins by time, with
  tiebreaker." A real implementation would use Yjs, Automerge, or
  a custom CRDT for true concurrent editing.
- **The engine is small.** ~250 lines of code. No deps. Drop it
  in.

## Why this matters

Databases give you persistence. Reactive systems give you live
updates. CRDTs give you conflict-free merge. Spreadsheets give you
formula propagation. **Quilt-time is the first system to give you
all four in a single API surface, on a cell.**

This unlocks new applications:

- **Personal data with a real history.** Your budget cell can
  answer "what was my net worth 6 months ago?"
- **Branching models.** Try a different budget. If it doesn't work
  out, rewind.
- **Real-time collaboration without a server.** Two peers, two
  engines, merge.
- **Audit.** Every cell knows every change.
- **Time-travel debugging for the entire app.** The whole cell
  graph is replayable.

## Where it goes from here

This is the sketch. The next version:

1. **Persist to disk.** Append-only log + periodic snapshot.
2. **Real CRDT merge.** Use Yjs or Automerge.
3. **Subscribe to history events.** Not just "cell changed" but
   "cell changed from X to Y at time T."
4. **Time-based queries.** `cells.changedBetween(t1, t2)`.
5. **Compression.** Old versions can be garbage-collected or
   compressed.
6. **WASM port.** Time travel is universal — every cell engine
   should have it.

## Related

- [Quilt (TypeScript)](https://github.com/SuperInstance/quilt) — the
  canonical reactive runtime.
- [Quilt (Rust)](https://github.com/SuperInstance/quilt-rust) — the
  desktop runtime.
- [Quilt Live](https://github.com/SuperInstance/quilt-live) — the
  single-file browser runtime.
- [Quilt Mesh](https://github.com/SuperInstance/quilt-mesh) — peer-to-peer
  cell sync (uses Lamport clocks; complement to time travel).
- [Quilt 5-year roadmap](https://github.com/SuperInstance/quilt/blob/main/quilt-roadmap-2026.md)
  — the bigger picture.

## License

MIT.

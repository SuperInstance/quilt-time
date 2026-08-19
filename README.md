# ⏱ quilt-time

> **Every cell has a past. Fork, rewind, replay, merge.**

Time travel for Quilt cells. A standalone TypeScript library. No dependencies. Drop it in, give your cells a past.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-17%2F17-brightgreen)]()
[![Size](https://img.shields.io/badge/size-~3KB-green)]()
[![Try it](https://img.shields.io/badge/try-live-7ec699)](https://superinstance.github.io/quilt/landing/quilt-time.html)

**[→ Try it live in your browser](https://superinstance.github.io/quilt/landing/quilt-time.html)** — interactive timeline demo, no install.

---

## ⚡ See it in 30 seconds

```typescript
import { QuiltTime } from 'quilt-time';

const q = new QuiltTime();

q.set('counter', 0);   // t=1
q.set('counter', 1);   // t=2
q.set('counter', 2);   // t=3

q.get('counter');     // → 2 (current)
q.at('counter', 1);   // → 0 (at t=1)
q.at('counter', 2);   // → 1 (at t=2)

// git branch.
const v1 = q.fork('experiment');
q.set('counter', 999); // diverged
q.rewind(v1);          // back to 2
q.get('counter');      // → 2
```

That's the whole API. `at`, `diff`, `fork`, `rewind`, `replay`, `merge`. Like git, but for cell data.

---

## 🎬 Time travel, visualized

```
   t=0         t=1         t=2         t=3         t=4
   │           │           │           │           │
   ▼           ▼           ▼           ▼           ▼
   counter = 0 → counter = 1 → counter = 2 ─┬─ counter = 999
                                            │
                                       fork('experiment')
                                            │
                                            ▼
                                       rewind
                                            │
                                            ▼
                                       counter = 2  (back in time!)
```

Every `set` is a new version. Every cell has a history. The engine is undoable, branchable, replayable.

---

## 🎁 What you get

- **at(t)** — the value of any cell at any past time
- **diff(from, to)** — what changed between two times
- **fork(label)** — snapshot the engine (like `git branch`)
- **rewind(forkId)** — restore the engine to a fork
- **replay(forkId)** — walk forward from a fork
- **merge(other)** — combine two engines with deterministic conflict resolution
- **JSON serialization** — save/load to disk
- **~3 KB** minified, **0 dependencies**

---

## 🌊 The five operations, illustrated

### `at(t)` — value at any past time
```
   value    100        150        200        250
            │          │          │          │
   t=0 ──── ● ──────● ──────● ──────● ──────● ─── now
            │          │          │          │
   at(1)  → 100        │          │          │
   at(2)  →            150        │          │
   at(3)  →                       200        │
   at(4)  →                                  250  (current)
```

### `fork()` — like git branch
```
   main:        ●──●──●──●──●  (counter = 5)
                  │
                  └─ fork('experiment')
                       ●──●  (counter = 99, diverged)
```

### `diff()` — what changed
```
   between t=2 and t=4:
   counter: { from: 200, to: 250 }
   flag:    { from: null, to: true }
```

### `replay()` — walk forward
```
   for (const e of q.replay('main')) {
     console.log(e.cid, e.value, e.t);
   }
   // counter 250 4
   // counter 999 5
```

### `merge()` — combine two engines
```
   alice:  { x: 1, t: 1 }
   bob:    { y: 2, t: 1 }
   merge → { x: 1, y: 2 }  (union of histories)
```

---

## 🏗️ Architecture

```
   ┌──────────────────────────────────────────────────────────────┐
   │                       QuiltTime                              │
   │                                                              │
   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
   │   │   CellHistory │  │   Forks      │  │   Lamport clock  │    │
   │   │              │  │              │  │                  │    │
   │   │   versions[] │  │   fork.id    │  │   clock = 5      │    │
   │   │   subscribe  │─▶│   fork.t     │─▶│   tick()         │    │
   │   │   at(t)      │  │   snapshot   │  │   observe()      │    │
   │   │   diff()     │  │              │  │                  │    │
   │   └──────────────┘  └──────────────┘  └──────────────────┘    │
   │            │                  │                    │        │
   │            └──────────────────┼────────────────────┘        │
   │                               ▼                             │
   │                      ┌──────────────────┐                    │
   │                      │   JSON serialize │  save/load         │
   │                      └──────────────────┘                    │
   │                                                              │
   └──────────────────────────────────────────────────────────────┘
```

Three structures, three responsibilities:
- **CellHistory** — the version log per cell
- **Forks** — named snapshots of the engine
- **Lamport clock** — the causal ordering

---

## 💡 Use cases

| Use case | What you build |
| --- | --- |
| **Undo without a stack** | A rewind is just `rewind(previousFork)`. No more undo stack bugs. |
| **"What was my balance 6 months ago?"** | `at(sixMonthsAgo)` — the cell knows. |
| **Branching scenarios** | "Try this budget. If it doesn't work, rewind." |
| **Real-time collab** | Two peers, two engines, `merge()`. No server. |
| **Audit log** | Every cell knows every change. Compliance is built in. |
| **Time-travel debugging** | Replay the cell graph. See what the state was at each step. |

---

## 🛠️ Develop

```bash
git clone https://github.com/SuperInstance/quilt-time
cd quilt-time
npm install
npm test
```

17 tests, 0 failures. ~250 lines of code.

---

## 📚 API reference

```typescript
class QuiltTime {
  // Set a cell value (monotonic timestamp).
  set(id: string, value: any, opts?: { t?: number; author?: string }): QuiltTime;

  // Get the current value of a cell.
  get(id: string): any;

  // Get the value of a cell at a specific time.
  at(id: string, t: number): any;

  // Get all versions of a cell.
  history(id: string): Version[];

  // Diff two times. Returns per-cell change summary.
  diff(from: number, to: number): { [cellId: string]: { from: any; to: any; changed: boolean } };

  // Fork the engine. Returns fork id.
  fork(label?: string): string;

  // Rewind to a fork.
  rewind(forkId: string): QuiltTime;

  // Replay events from a fork forward (generator).
  *replay(forkId: string): Generator<{ cid: string; value: any; t: number; author: string }>;

  // Merge two engines. Returns a new QuiltTime.
  static merge(a: QuiltTime, b: QuiltTime): QuiltTime;

  // Serialize.
  toJSON(): object;

  // Deserialize.
  static fromJSON(json: object): QuiltTime;
}
```

---

## 🛣️ Roadmap

1. **Persist to disk** — append-only log + periodic snapshot
2. **Real CRDT merge** — use Yjs or Automerge for true concurrent editing
3. **Subscribe to history events** — "cell changed from X to Y at time T"
4. **Time-based queries** — `cells.changedBetween(t1, t2)`
5. **Compression** — old versions can be garbage-collected or compressed
6. **WASM port** — every cell engine should have time travel

---

## 🔗 Related

- [Quilt (TypeScript)](https://github.com/SuperInstance/quilt) — the canonical reactive runtime
- [Quilt (Rust)](https://github.com/SuperInstance/quilt-rust) — the desktop runtime
- [Quilt Live](https://github.com/SuperInstance/quilt-live) — single-file browser runtime
- [Quilt Mesh](https://github.com/SuperInstance/quilt-mesh) — peer-to-peer cell sync (uses Lamport clocks)
- [Quilt 5-year roadmap](https://github.com/SuperInstance/quilt/blob/main/quilt-roadmap-2026.md)

## License

MIT.

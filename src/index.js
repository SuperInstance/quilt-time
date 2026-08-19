// quilt-time — time travel for Quilt cells.
//
// Every cell has a history. You can:
//   - get the current value
//   - get the value at any past time
//   - get the diff between two times
//   - fork the engine from any point (like git branch)
//   - rewind to a point
//   - replay forward
//   - merge two forks
//
// Time travel is the killer feature. Without it, Quilt is just a
// reactive system. With it, Quilt is a database that you can also
// run programs in.
//
// This is a design sketch — the public surface is stable, the
// internals are simple and probably naive. The full implementation
// will use a real CRDT for merges and proper persistent data
// structures for snapshots.

/**
 * A single version of a cell. Ordered by `t` (timestamp in
 * milliseconds since epoch). The newest version whose `t <= when`
 * is the value at that time.
 */
export class Version {
  constructor({ value, t, author = 'local' }) {
    this.value = value;
    this.t = t;
    this.author = author;
  }
}

/**
 * The history of one cell. A list of versions, ordered by time.
 * The current value is the last version.
 */
export class CellHistory {
  constructor() {
    this.versions = [];
    this.subscribers = new Set();
  }

  set(value, { t = Date.now(), author = 'local' } = {}) {
    const v = new Version({ value, t, author });
    this.versions.push(v);
    for (const sub of this.subscribers) {
      sub({ type: 'set', value, t, author });
    }
  }

  get current() {
    return this.versions.length > 0
      ? this.versions[this.versions.length - 1].value
      : undefined;
  }

  /** Get the value as of a given time. */
  at(t) {
    let result;
    for (const v of this.versions) {
      if (v.t <= t) result = v.value;
      else break;
    }
    return result;
  }

  /** Get all versions in a time range. */
  range(from, to) {
    return this.versions.filter(v => v.t >= from && v.t <= to);
  }

  /** Get the diff between two times. Returns { added, removed, changed }. */
  diff(from, to) {
    const a = this.at(from);
    const b = this.at(to);
    if (a === b) return { changed: false };
    return { changed: true, from: a, to: b };
  }

  /** Number of versions. */
  get length() {
    return this.versions.length;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

/**
 * A fork — a snapshot of the engine at a point in time. You can
 * rewind to a fork (make the engine match it again) or replay
 * forward from it (apply new events on top).
 */
export class Fork {
  constructor({ id, label, t, snapshot }) {
    this.id = id;
    this.label = label;
    this.t = t;
    this.snapshot = snapshot; // map of cell id -> versions
  }
}

/**
 * The main time-traveling engine. Wraps a set of cell histories
 * and provides fork/rewind/replay/merge operations.
 */
export class QuiltTime {
  constructor() {
    this.cells = new Map();
    this.forks = new Map();
    this.forkCounter = 0;
    this.clock = 0;
  }

  _now() {
    // Use a monotonic clock for tests; real impl uses Date.now().
    return ++this.clock;
  }

  /**
   * Set a cell's value. The history grows by one version.
   */
  set(cellId, value, opts = {}) {
    let h = this.cells.get(cellId);
    if (!h) {
      h = new CellHistory();
      this.cells.set(cellId, h);
    }
    h.set(value, { t: this._now(), ...opts });
    return this;
  }

  /**
   * Get the current value of a cell.
   */
  get(cellId) {
    return this.cells.get(cellId)?.current;
  }

  /**
   * Get the value of a cell at a given time.
   */
  at(cellId, t) {
    return this.cells.get(cellId)?.at(t);
  }

  /**
   * Get the entire history of a cell.
   */
  history(cellId) {
    return this.cells.get(cellId)?.versions || [];
  }

  /**
   * Get the diff between two times. Returns a per-cell summary.
   */
  diff(from, to) {
    const result = {};
    for (const [id, h] of this.cells) {
      const d = h.diff(from, to);
      if (d.changed) {
        result[id] = { from: d.from, to: d.to };
      }
    }
    return result;
  }

  /**
   * Fork the engine. Creates a snapshot that can be returned to
   * later. Returns the fork's id.
   */
  fork(label = `fork-${this.forkCounter}`) {
    const id = `f${++this.forkCounter}`;
    const snapshot = new Map();
    for (const [cid, h] of this.cells) {
      // Deep clone the versions.
      snapshot.set(cid, h.versions.map(v => new Version(v)));
    }
    const f = new Fork({
      id,
      label,
      t: this._now(),
      snapshot,
    });
    this.forks.set(id, f);
    return id;
  }

  /**
   * Rewind to a fork. All cells are reset to the values they had
   * at the fork's time. Future sets build on top of the fork.
   */
  rewind(forkId) {
    const f = this.forks.get(forkId);
    if (!f) throw new Error(`No such fork: ${forkId}`);
    // Truncate histories to the fork time.
    for (const [cid, h] of this.cells) {
      h.versions = h.versions.filter(v => v.t <= f.t);
    }
    // Add any cells that existed at fork time but not now.
    for (const [cid, versions] of f.snapshot) {
      if (!this.cells.has(cid)) {
        const h = new CellHistory();
        h.versions = versions;
        this.cells.set(cid, h);
      } else {
        // Restore versions from the fork that we may have lost.
        const existing = this.cells.get(cid);
        const existingTs = new Set(existing.versions.map(v => v.t));
        for (const v of versions) {
          if (!existingTs.has(v.t)) {
            existing.versions.push(new Version(v));
          }
        }
        existing.versions.sort((a, b) => a.t - b.t);
      }
    }
    return this;
  }

  /**
   * Replay from a fork to the current state, step by step.
   * Yields the values as they were set.
   */
  *replay(forkId) {
    const f = this.forks.get(forkId);
    if (!f) throw new Error(`No such fork: ${forkId}`);
    // Build a sorted list of all events across all cells after the
    // fork.
    const events = [];
    for (const [cid, h] of this.cells) {
      for (const v of h.versions) {
        if (v.t > f.t) {
          events.push({ cid, t: v.t, value: v.value, author: v.author });
        }
      }
    }
    events.sort((a, b) => a.t - b.t);
    for (const e of events) {
      yield e;
    }
  }

  /**
   * Merge two forks. Returns a new engine with the union of both
   * histories. Conflicts (same cell, different values, same time)
   * are resolved by keeping the value with the higher Lamport
   * counter (encoded as the timestamp here). For real cross-fork
   * merge, the user is expected to call `rebase()` first to align
   * the clocks; this is a sketch.
   */
  static merge(a, b) {
    const merged = new QuiltTime();
    const cells = new Map();
    // Collect all cells from both engines.
    for (const [cid, h] of a.cells) {
      cells.set(cid, [...h.versions]);
    }
    for (const [cid, h] of b.cells) {
      if (cells.has(cid)) {
        // Append B's versions. Sort by time. On ties, keep B's
        // (assumed to be the "later" fork).
        const a_vers = cells.get(cid);
        const b_vers = [...h.versions];
        // Mark each with a unique tiebreaker: A's events have a
        // "tie=0" tag, B's have "tie=1" tag. Higher wins on tie.
        const tagged = [
          ...a_vers.map(v => ({ v, tie: 0 })),
          ...b_vers.map(v => ({ v, tie: 1 })),
        ].sort((x, y) => {
          if (x.v.t !== y.v.t) return x.v.t - y.v.t;
          return x.tie - y.tie;
        });
        // Dedupe: skip events with the same (t, tie).
        const seen = new Set();
        const out = [];
        for (const { v, tie } of tagged) {
          const key = `${v.t}:${tie}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(new Version(v));
          }
        }
        cells.set(cid, out);
      } else {
        cells.set(cid, [...h.versions]);
      }
    }
    // Install in the new engine.
    for (const [cid, versions] of cells) {
      const h = new CellHistory();
      h.versions = versions;
      merged.cells.set(cid, h);
    }
    merged.clock = Math.max(a.clock, b.clock);
    return merged;
  }

  /**
   * Export to JSON. Useful for save/load and for transport.
   */
  toJSON() {
    return {
      cells: Object.fromEntries(
        [...this.cells].map(([id, h]) => [id, h.versions])
      ),
      forks: Object.fromEntries(
        [...this.forks].map(([id, f]) => [id, { id, label: f.label, t: f.t, snapshot: Object.fromEntries(f.snapshot) }])
      ),
      clock: this.clock,
    };
  }

  static fromJSON(json) {
    const q = new QuiltTime();
    for (const [id, versions] of Object.entries(json.cells)) {
      const h = new CellHistory();
      h.versions = versions.map(v => new Version(v));
      q.cells.set(id, h);
    }
    for (const [id, fork] of Object.entries(json.forks || {})) {
      const snapshot = new Map();
      for (const [cid, versions] of Object.entries(fork.snapshot || {})) {
        snapshot.set(cid, versions.map(v => new Version(v)));
      }
      q.forks.set(id, new Fork({ id, label: fork.label, t: fork.t, snapshot }));
    }
    q.clock = json.clock || 0;
    return q;
  }
}

export default QuiltTime;

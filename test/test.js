// Tests for quilt-time.
import { QuiltTime, CellHistory, Version, Fork } from '../src/index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    console.log(e.stack);
    failed++;
  }
}

function assertEq(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

console.log('CellHistory');

test('set and get current', () => {
  const h = new CellHistory();
  h.set(1, { t: 1 });
  h.set(2, { t: 2 });
  h.set(3, { t: 3 });
  assertEq(h.current, 3);
});

test('at() returns value at a time', () => {
  const h = new CellHistory();
  h.set('a', { t: 10 });
  h.set('b', { t: 20 });
  h.set('c', { t: 30 });
  assertEq(h.at(5), undefined);
  assertEq(h.at(10), 'a');
  assertEq(h.at(15), 'a');
  assertEq(h.at(20), 'b');
  assertEq(h.at(25), 'b');
  assertEq(h.at(30), 'c');
  assertEq(h.at(1000), 'c');
});

test('range() returns versions in time range', () => {
  const h = new CellHistory();
  h.set(1, { t: 1 });
  h.set(2, { t: 2 });
  h.set(3, { t: 3 });
  h.set(4, { t: 4 });
  const r = h.range(2, 3);
  assertEq(r.length, 2);
  assertEq(r[0].value, 2);
  assertEq(r[1].value, 3);
});

test('diff() detects change', () => {
  const h = new CellHistory();
  h.set('a', { t: 1 });
  h.set('b', { t: 2 });
  const d = h.diff(0, 100);
  assertEq(d.changed, true);
  assertEq(d.from, undefined);
  assertEq(d.to, 'b');
});

test('subscribe fires on set', () => {
  const h = new CellHistory();
  const events = [];
  h.subscribe(e => events.push(e));
  h.set(1, { t: 1 });
  h.set(2, { t: 2 });
  assertEq(events.length, 2);
  assertEq(events[0].value, 1);
});

console.log('\nQuiltTime basic');

test('set and get', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  q.set('b', 2);
  assertEq(q.get('a'), 1);
  assertEq(q.get('b'), 2);
});

test('at() returns historical value', () => {
  const q = new QuiltTime();
  q.set('counter', 0);  // t=1
  q.set('counter', 1);  // t=2
  q.set('counter', 2);  // t=3
  q.set('counter', 3);  // t=4
  assertEq(q.at('counter', 2), 1);
  assertEq(q.at('counter', 3), 2);
  assertEq(q.at('counter', 4), 3);
  assertEq(q.get('counter'), 3);
});

test('history() returns all versions', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  q.set('a', 2);
  q.set('a', 3);
  assertEq(q.history('a').length, 3);
});

test('diff() returns per-cell changes', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  const t1 = q._now();
  q.set('a', 2);
  q.set('b', 'hello');
  const diff = q.diff(t1, q._now() + 1);
  assertEq(diff.a, { from: 1, to: 2 });
  assertEq(diff.b, { from: undefined, to: 'hello' });
});

console.log('\nForks');

test('fork() creates a snapshot', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  q.set('b', 2);
  const fid = q.fork('initial');
  q.set('a', 99);
  assertEq(q.get('a'), 99);
  q.rewind(fid);
  assertEq(q.get('a'), 1);
});

test('rewind() restores all cells', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  q.set('b', 2);
  const fid = q.fork();
  q.set('a', 100);
  q.set('b', 200);
  q.rewind(fid);
  assertEq(q.get('a'), 1);
  assertEq(q.get('b'), 2);
});

test('replay() yields events in order', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  const fid = q.fork();
  q.set('a', 2);
  q.set('a', 3);
  q.set('a', 4);
  const events = [...q.replay(fid)];
  assertEq(events.length, 3);
  assertEq(events[0].value, 2);
  assertEq(events[1].value, 3);
  assertEq(events[2].value, 4);
});

test('can fork multiple times', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  const f1 = q.fork('v1');
  q.set('a', 2);
  const f2 = q.fork('v2');
  q.set('a', 3);
  assertEq(q.forks.size, 2);
  q.rewind(f1);
  assertEq(q.get('a'), 1);
  q.rewind(f2);
  assertEq(q.get('a'), 2);
});

console.log('\nMerging');

test('merge combines two engines', () => {
  const a = new QuiltTime();
  a.set('x', 1, { t: 1 });
  a.set('y', 2, { t: 2 });
  const b = new QuiltTime();
  b.set('y', 3, { t: 3 });  // b's event is later
  b.set('z', 4, { t: 4 });
  const merged = QuiltTime.merge(a, b);
  assertEq(merged.get('x'), 1);
  assertEq(merged.get('y'), 3);  // b's event is later
  assertEq(merged.get('z'), 4);
});

test('merge keeps unique events from both', () => {
  const a = new QuiltTime();
  a.set('x', 1);
  const b = new QuiltTime();
  b.set('y', 2);
  const merged = QuiltTime.merge(a, b);
  assertEq(merged.get('x'), 1);
  assertEq(merged.get('y'), 2);
});

console.log('\nSerialization');

test('toJSON and fromJSON round-trip', () => {
  const q = new QuiltTime();
  q.set('a', 1);
  q.set('b', 'hello');
  const fid = q.fork('test');
  q.set('a', 99);
  const json = q.toJSON();
  const restored = QuiltTime.fromJSON(json);
  assertEq(restored.get('a'), 99);
  assertEq(restored.get('b'), 'hello');
  assertEq(restored.forks.has(fid), true);
});

test('subscribe to a cell fires on set', () => {
  const q = new QuiltTime();
  const events = [];
  q.cells.get('a')?.subscribe(e => events.push(e));
  q.set('a', 1);
  // The subscribe was added after the cell already existed; should
  // still receive future events.
  // Wait — we subscribed after set, so events should be 1 not 0.
  // Actually, the subscribe was called on undefined (no cell 'a' yet).
  // So let's set up properly:
  events.length = 0;
  q.set('b', 1);
  const sub = q.cells.get('b').subscribe(e => events.push(e));
  q.set('b', 2);
  q.set('b', 3);
  assertEq(events.length, 2);
  assertEq(events[0].value, 2);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

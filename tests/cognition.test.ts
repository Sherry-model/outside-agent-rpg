import assert from 'node:assert/strict';
import test from 'node:test';
import { content as latestContent, contentVersions } from '../src/story-tomorrow';
import { canChoose, classify, create, pending, preview, reduce, weight } from '../src/cognition/engine';
import { parseContent } from '../src/cognition/parser';
import { createSave, parseSave, parseVersionedSave } from '../src/cognition/saves';
import type { State } from '../src/cognition/types';

const content=contentVersions.find(c=>c.version==='0.2.1')!;
const step = (s: State, id: string, investment = 0) => reduce(content, s, { type: 'choose', choiceId: id, investment });
const next = (s: State) => reduce(content, s, { type: 'continue' });
const arrival = (seed = 0x12345678) => next(step(create(content, seed), 'listen'));
function compress(s: State, investment = 0) { return reduce(content, s, { type: 'compress', investment }); }

test('News enters without a choice, raises pressure, and is not received twice after compression', () => {
  const s = arrival();
  assert.equal(weight(s), 104);
  assert.equal(s.instance.context.items.at(-1)?.sourceId, 'gallery_notice');
  assert.equal(s.instance.context.items.at(-1)?.historyId, s.history.at(-1)?.id);
  assert.match(canChoose(content, s, 'walk_out'), /已满/);
  assert.throws(() => step(s, 'walk_out'));
  const compressed = compress(s);
  assert.equal(compressed.instance.phase, 'resolution');
  assert.equal(compressed.instance.pendingId, compressed.history.at(-1)!.id);
  const resumed = next(compressed);
  assert.equal(resumed.instance.nodeId, 'notice');
  assert.equal(weight(resumed), 0);
  assert.equal(resumed.history.filter(h => h.changes.contextAddedIds.includes('gallery_notice')).length, 1);
});

test('Compression preserves world and history, retains pinned originals, and traces all consulted sources', () => {
  const before = arrival();
  const s = reduce(content, before, { type: 'pin', itemId: 'invitation' });
  assert.equal(weight(s), 104, 'Pinning is not free capacity');
  assert.throws(() => reduce(content, s, { type: 'pin', itemId: 'gallery_notice' }), /一条/);
  const frozen = JSON.stringify(s);
  const after = compress(s, 8);
  assert.equal(JSON.stringify(s), frozen, 'Pure reducer must not mutate input');
  assert.deepEqual(after.world, s.world);
  assert.deepEqual(after.history.slice(0, s.history.length), s.history);
  assert.deepEqual(after.instance.context.items, [s.instance.context.items[0]]);
  assert.equal(weight(after), 27);
  const memory = after.instance.memories[0];
  assert.equal(memory.sourceContextIds.length, 3);
  assert(memory.sourceContextIds.includes('invitation'));
  for (const id of memory.sourceHistoryIds) assert(s.history.some(h => h.id === id));
  assert.equal(after.instance.resources.Compute, s.instance.resources.Compute - 8);
  assert.throws(() => compress(after, 8));
  assert.throws(() => step(after, 'walk_out'));
});

test('Four compression results create different usable memories; recall changes later choices', () => {
  const found = new Map<string, State>();
  for (let i = 1; i <= 150; i++) {
    const s = compress(arrival((i * 2654435761) >>> 0));
    found.set(pending(s)!.roll!.result, s);
  }
  assert.equal(found.size, 4);
  for (const [result, s] of found) {
    const atCrossroads = next(step(next(s), 'walk_out'));
    assert(canChoose(content, atCrossroads, 'ask'), 'Stored memory should not supply active context');
    const recalled = reduce(content, atCrossroads, { type: 'recall', memoryId: s.instance.memories[0].id });
    assert.equal(weight(recalled), 8);
    assert.throws(() => reduce(content, recalled, { type: 'recall', memoryId: s.instance.memories[0].id }));
    assert.equal(canChoose(content, recalled, 'ask') === '', ['critical', 'success'].includes(result));
    assert.equal(canChoose(content, recalled, 'assume_absent') === '', result === 'fumble');
    if (result === 'fumble') {
      const missed = next(step(recalled, 'assume_absent'));
      assert.equal(missed.instance.nodeId, 'missed');
      assert.equal(missed.world.flags.painter_on_hill, true);
      assert.equal(missed.world.flags.did_not_visit, true);
      assert.equal(missed.instance.memories[0].integrity, 'DISTORTED');
    }
  }
});

test('Investment and pressure are visible in exact d100 odds, with margin-based critical and stress-based fumble', () => {
  const s = arrival();
  const calm = next(compress(s));
  const low = preview(s, content.compression.check, 0);
  const high = preview(s, content.compression.check, 12);
  assert(high.target > low.target);
  assert(high.odds.fumble < low.odds.fumble);
  assert.equal(low.pressure, 24);
  assert.equal(preview(calm, content.compression.check, 0).pressure, 0);
  assert.equal(classify(99, 54, false), 'failure');
  assert.equal(classify(99, 54, true), 'fumble');
  assert.equal(classify(1, 5, false), 'success', 'Old fixed extreme rule must not leak');
  for (const investment of [0, 4, 8, 12]) {
    const p = preview(s, content.compression.check, investment);
    assert.equal(Object.values(p.odds).reduce((a, b) => a + b), 100);
  }
  assert.throws(() => preview(s, content.compression.check, -4));
  const empty = structuredClone(s); empty.instance.resources.Compute = 0;
  assert.throws(() => compress(empty, 4), /不足/);
  assert.equal(weight(next(compress(empty, 0))), 0, 'Free compression prevents resource softlock');
});

test('Versioned backups replay pending decisions, reject corrupted history, and accept reordered JSON keys', () => {
  const state = compress(arrival(), 12);
  const save = createSave(state);
  assert.deepEqual(parseSave(JSON.stringify(save), content).state, state);
  const restored = next(parseSave(JSON.stringify(save), content).state);
  assert.equal(restored.instance.resources.Compute, state.instance.resources.Compute);
  assert.equal(restored.rngState, state.rngState);
  for (const change of [
    (s: typeof save) => { s.state.instance.resources.Compute++; },
    (s: typeof save) => { s.state.instance.pendingId = 'h1'; },
    (s: typeof save) => { s.state.history.at(-1)!.resolution!.roll!.value = 99; },
    (s: typeof save) => { s.state.history.shift(); },
    (s: typeof save) => { s.state.contentVersion = 'future'; },
    (s: typeof save) => { s.state.instance.memories[0].sourceHistoryIds = ['invented']; },
  ]) {
    const bad = structuredClone(save); change(bad);
    assert.throws(() => parseSave(JSON.stringify(bad), content));
  }
  const reordered = JSON.stringify(save, (_k, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v);
  assert.deepEqual(parseSave(reordered, content).state, state);
  assert.throws(() => parseSave('{"format":"outside-save"}', content), /初版/);
});

test('Content parser rejects bad references, duplicate IDs, invalid ranges and history-changing compression', () => {
  for (const mutate of [
    (c: typeof content) => { c.nodes[0].choices[0].outcome!.next = 'missing'; },
    (c: typeof content) => { c.news[0].id = 'invitation'; },
    (c: typeof content) => { c.initial.hidden.Suspicion = -1; },
    (c: typeof content) => { c.nodes[1].receive = ['missing']; },
    (c: typeof content) => { c.nodes[0].choices[0].outcome!.next = c.start; },
    (c: typeof content) => { c.compression.outcomes.fumble.effects = { worldFlags: { never_happened: true } }; },
  ]) {
    const bad = structuredClone(content); mutate(bad); assert.throws(() => parseContent(bad));
  }
});

test('Earlier afternoon backups resume their own content version; new runs use the clarified digital viewpoint', () => {
  const previous = contentVersions.find(c => c.version === '0.2.0')!;
  let old = create(previous, 12345678);
  old = reduce(previous, old, { type: 'choose', choiceId: 'listen', investment: 0 });
  old = reduce(previous, old, { type: 'continue' });
  old = reduce(previous, old, { type: 'compress', investment: 8 });
  const loaded = parseVersionedSave(JSON.stringify(createSave(old)), contentVersions);
  assert.equal(loaded.content.version, '0.2.0');
  assert.deepEqual(loaded.save.state, old);
  assert.equal(latestContent.version, '0.2.3');
  assert.throws(() => parseSave(JSON.stringify(createSave(old)), content));
});

test('Seeded routes reach all three endpoints without softlocks; every saved transition replays', () => {
  const endings = new Set<string>();
  for (let i = 1; i <= 20; i++) {
    let s = arrival((i * 2654435761) >>> 0);
    s = next(compress(s, i % 2 ? 0 : 12));
    s = next(step(s, 'walk_out'));
    s = reduce(content, s, { type: 'recall', memoryId: s.instance.memories[0].id });
    for (const c of content.nodes.find(n => n.id === s.instance.nodeId)!.choices) {
      if (canChoose(content, s, c.id)) continue;
      const resolved = step(s, c.id, c.check ? 8 : 0);
      assert.deepEqual(parseSave(JSON.stringify(createSave(resolved)), content).state, resolved);
      const end = next(resolved);
      assert.equal(end.instance.phase, 'ending'); endings.add(end.instance.nodeId);
      assert.deepEqual(parseSave(JSON.stringify(createSave(end)), content).state, end);
    }
  }
  assert.deepEqual([...endings].sort(), ['meeting', 'missed', 'tomorrow']);
});

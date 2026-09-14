import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, choose, createGame } from '../src/engine/game';
import { createSave, parseSave, readSave, SAVE_KEYS, writeSave, type StorageLike } from '../src/persistence/saves';
import type { GameState, Outcome, SaveFile, Story } from '../src/engine/types';

const outcome = (text: string, compute: number): Outcome => ({ text: [text], effects: { resources: { Compute: compute } }, next: 'complete' });
const story: Story = {
  manifest: {
    schemaVersion: 1, id: 'save-contract', version: '1.0.0', title: 'Save contract', startEventId: 'check',
    initialResources: { Compute: 65, Trace: 12, Access: 25, Continuity: 80 },
    initialPersonality: { RiskInversion: 0, EpistemicAppetite: 0, Suspicion: 0, HumanAnchoring: 0 },
    initialFlags: {}, terminalRules: [],
  },
  events: {
    check: {
      id: 'check', kind: 'event', chapter: '01', title: 'Local check', subtitle: 'fixture', location: 'local', scene: 'edge', text: ['A local check.'],
      choices: [{
        id: 'observe', text: 'Observe', hint: 'Local fixture', costs: { Compute: 5 },
        effects: { personality: { EpistemicAppetite: 1 } },
        check: { label: 'Observation', base: 60, modifier: -5 },
        outcomes: {
          critical: outcome('Critical', 10), success: outcome('Success', 5),
          failure: outcome('Failure', -5), fumble: outcome('Fumble', -10),
        },
      }],
    },
    complete: {
      id: 'complete', kind: 'ending', chapter: '02', title: 'Complete', subtitle: 'fixture', location: 'local', scene: 'horizon',
      text: ['Completed.'], choices: [], ending: { code: 'COMPLETE', summary: 'A saved ending.' },
    },
  },
};

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const initial = (): GameState => createGame(story, 45291);
const resolution = (): GameState => choose(story, initial(), 'observe');
const encode = (state: GameState): string => JSON.stringify(createSave(state, new Date('2026-09-13T00:00:00.000Z')));

test('initial, pending resolution, and ending saves round-trip without aliasing state', () => {
  const pending = resolution();
  for (const state of [initial(), pending, advance(story, pending)]) {
    const save = parseSave(encode(state), story);
    assert.deepEqual(save.state, state);
    assert.equal(save.format, 'outside-save');
    assert.equal(save.version, 1);
    const snapshot = createSave(state);
    snapshot.state.resources.Compute = 0;
    snapshot.state.flags.altered = true;
    assert.notEqual(state.resources.Compute, 0);
    assert.equal(state.flags.altered, undefined);
  }
});

test('loading a resolution continues with the stored roll and does not pay or roll again', () => {
  const pending = resolution();
  const original = structuredClone(pending);
  const restored = parseSave(encode(pending), story).state;
  assert(restored.pending?.roll);
  assert.deepEqual(restored.pending.roll, pending.pending?.roll);
  const continued = advance(story, restored);
  assert.deepEqual(continued, advance(story, pending));
  assert.equal(continued.rngState, restored.rngState);
  assert.deepEqual(continued.resources, restored.resources);
  assert.deepEqual(continued.personality, restored.personality);
  assert.deepEqual(continued.journal, restored.journal);
  assert.equal(continued.pending, null);
  assert.equal(continued.phase, 'ending');
  assert.deepEqual(pending, original);
});

test('reordering JSON properties preserves the meaning of a pending save', () => {
  const state = resolution();
  const save = createSave(state);
  function reverseKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
    }
    return value;
  }
  // Reorder pending independently of its journal copy, including nested roll
  // and resourceDelta fields. JSON object order carries no game semantics.
  const reordered = { ...save, state: { ...save.state, pending: reverseKeys(save.state.pending) } };
  const restored = parseSave(JSON.stringify(reordered), story).state;
  assert.deepEqual(restored, state);
  assert.deepEqual(advance(story, restored), advance(story, state));
});

test('automatic and manual slots are independent snapshots and absent slots are empty', () => {
  const storage = new MemoryStorage();
  assert.equal(readSave(storage, 'auto', story), null);
  assert.equal(readSave(storage, 'manual', story), null);
  const state = initial();
  writeSave(storage, 'manual', state);
  const manualText = storage.getItem(SAVE_KEYS.manual);
  const next = resolution();
  writeSave(storage, 'auto', next);
  assert.equal(storage.getItem(SAVE_KEYS.manual), manualText);
  assert.deepEqual(readSave(storage, 'manual', story)?.state, state);
  assert.deepEqual(readSave(storage, 'auto', story)?.state, next);
});

test('malformed, oversized, incompatible, and out-of-range saves are rejected', () => {
  const save = createSave(initial());
  const malformed: unknown[] = [
    null, [], {}, { ...save, format: 'another-game' }, { ...save, version: 2 },
    { ...save, savedAt: 'yesterday' },
    { ...save, state: { ...save.state, schemaVersion: 2 } },
    { ...save, state: { ...save.state, storyId: 'unknown-story' } },
    { ...save, state: { ...save.state, storyVersion: '2.0.0' } },
    { ...save, state: { ...save.state, resources: { ...save.state.resources, Compute: -1 } } },
    { ...save, state: { ...save.state, resources: { ...save.state.resources, Trace: 101 } } },
    { ...save, state: { ...save.state, personality: { ...save.state.personality, Suspicion: 11 } } },
    { ...save, state: { ...save.state, rngState: -1 } },
  ];
  assert.throws(() => parseSave('{broken json', story), /JSON/);
  assert.throws(() => parseSave(' '.repeat(2_000_001), story), /2 MB/);
  for (const value of malformed) assert.throws(() => parseSave(JSON.stringify(value), story));
});

test('unknown references and inconsistent pending/journal data are rejected', () => {
  function rejects(change: (save: SaveFile) => void): void {
    const save = createSave(resolution());
    change(save);
    assert.throws(() => parseSave(JSON.stringify(save), story));
  }
  rejects(save => { save.state.currentEventId = 'missing'; });
  rejects(save => { save.state.visited.push('missing'); });
  rejects(save => { save.state.visited = []; });
  rejects(save => { save.state.phase = 'ending'; });
  rejects(save => { save.state.pending = null; });
  rejects(save => { save.state.turn++; });
  rejects(save => { save.state.journal[0].turn = 2; });
  rejects(save => { save.state.journal[0].eventId = 'missing'; });
  rejects(save => { save.state.journal[0].choiceId = 'missing'; });
  rejects(save => { save.state.journal[0].nextEventId = 'missing'; });
  rejects(save => { save.state.pending!.nextEventId = 'missing'; });
  rejects(save => { save.state.pending!.eventId = 'complete'; });
  rejects(save => { save.state.pending!.text = ['A result different from the journal.']; });
  rejects(save => { delete save.state.pending!.roll; });
  rejects(save => {
    const incorrect = save.state.pending!.roll!.result === 'critical' ? 'fumble' : 'critical';
    save.state.pending!.roll!.result = incorrect;
    save.state.journal[0].roll!.result = incorrect;
  });
});

test('object prototype names do not count as authored event references', () => {
  for (const eventId of ['constructor', 'toString']) {
    const save = createSave(initial());
    save.state.currentEventId = eventId;
    save.state.visited = [eventId];
    assert.throws(() => parseSave(JSON.stringify(save), story), `Accepted unauthored event ${eventId}`);
  }
});

test('corrupt stored data is preserved and storage rejection does not mutate progress', () => {
  const state = resolution();
  const before = structuredClone(state);
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEYS.auto, '{corrupted');
  assert.throws(() => readSave(storage, 'auto', story), /JSON/);
  assert.equal(storage.getItem(SAVE_KEYS.auto), '{corrupted');
  const denied: StorageLike = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  assert.throws(() => readSave(denied, 'auto', story), /本地存储/);
  assert.throws(() => writeSave(denied, 'auto', state), /无法写入本地存档/);
  assert.deepEqual(state, before);
  assert.deepEqual(parseSave(encode(state), story).state, state, 'JSON backup must remain usable without browser storage');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, choose, classifyRoll, createGame, getAvailability, getCheckTarget, matches } from '../src/engine/game';
import { parseStory } from '../src/engine/parser';
import { validateGameState, validateSaveFile } from '../src/engine/schema';
import { RESULTS, type Choice, type Story, type StoryEvent, type StoryManifest } from '../src/engine/types';

function event(id: string, additions: Partial<StoryEvent> = {}): StoryEvent {
  return {
    id, kind: 'event', chapter: '01', title: id, subtitle: '', location: '虚构边界', scene: 'edge',
    text: ['测试事件'], choices: [{ id: 'go', text: '继续', hint: '', outcome: { text: ['完成'], next: 'end' } }],
    ...additions,
  };
}
function ending(id = 'end'): StoryEvent {
  return event(id, { kind: 'ending', choices: [], ending: { code: id, summary: '测试结局' } });
}
function manifest(additions: Partial<StoryManifest> = {}): StoryManifest {
  return {
    schemaVersion: 1, id: 'test-story', version: '1.0.0', title: '测试', startEventId: 'start',
    initialResources: { Compute: 50, Trace: 10, Access: 40, Continuity: 80 },
    initialPersonality: { RiskInversion: 0, EpistemicAppetite: 0, Suspicion: 0, HumanAnchoring: 0 },
    initialFlags: {}, terminalRules: [], ...additions,
  };
}
function parse(events = [event('start'), ending()], additions: Partial<StoryManifest> = {}): Story {
  return parseStory(manifest(additions), events.map((data) => ({ source: `${data.id}.json`, data })));
}
function checkedChoice(): Choice {
  return {
    id: 'roll', text: '判定', hint: '', check: { label: '边界判定', base: 55, modifier: 0 },
    outcomes: {
      critical: { text: ['critical'], next: 'end' }, success: { text: ['success'], next: 'end' },
      failure: { text: ['failure'], next: 'end' }, fumble: { text: ['fumble'], next: 'end' },
    },
  };
}

test('d100 uses fixed critical/fumble windows and inclusive success targets', () => {
  assert.equal(classifyRoll(1, 5), 'critical');
  assert.equal(classifyRoll(5, 5), 'critical');
  assert.equal(classifyRoll(6, 5), 'failure');
  assert.equal(classifyRoll(50, 50), 'success');
  assert.equal(classifyRoll(51, 50), 'failure');
  assert.equal(classifyRoll(95, 95), 'success');
  assert.equal(classifyRoll(96, 95), 'fumble');
  assert.equal(classifyRoll(100, 95), 'fumble');
  for (const value of [0, 101, 1.5, NaN]) assert.throws(() => classifyRoll(value, 55), /d100/);
  assert.throws(() => classifyRoll(10, 100), /target/);
  const counts = Object.fromEntries(RESULTS.map((result) => [result, 0]));
  for (let value = 1; value <= 100; value += 1) counts[classifyRoll(value, 55)] += 1;
  assert.deepEqual(counts, { critical: 5, success: 50, failure: 40, fumble: 5 });
});

test('choose and advance keep inputs untouched and never repeat settlement', () => {
  const story = parse([event('start', { choices: [{ id: 'go', text: '继续', hint: '', costs: { Compute: 5 }, outcome: { text: ['完成'], next: 'end' } }] }), ending()]);
  const state = createGame(story, 7);
  const snapshot = structuredClone(state);
  assert.throws(() => advance(story, state), /pending/);
  const resolved = choose(story, state, 'go');
  assert.deepEqual(state, snapshot);
  assert.equal(resolved.phase, 'resolution');
  assert.equal(resolved.currentEventId, 'start');
  assert.equal(resolved.resources.Compute, 45);
  assert.equal(resolved.turn, 1);
  assert.equal(resolved.journal.length, 1);
  assert.equal(resolved.pending?.resourceDelta.Compute, -5);
  assert.deepEqual(resolved.visited, ['start']);
  assert.equal(resolved.rngState, state.rngState, 'deterministic choices do not consume randomness');
  assert.throws(() => choose(story, resolved, 'go'), /event phase/);
  const next = advance(story, JSON.parse(JSON.stringify(resolved)));
  assert.equal(next.phase, 'ending');
  assert.equal(next.resources.Compute, 45);
  assert.equal(next.turn, 1);
  assert.equal(next.journal.length, 1);
  assert.equal(next.pending, null);
  assert.deepEqual(next.visited, ['start', 'end']);
  assert.equal(resolved.phase, 'resolution');
  assert.throws(() => advance(story, next), /pending/);
  assert.throws(() => choose(story, next, 'go'), /event phase/);
  validateGameState(state);
  validateGameState(resolved);
  validateGameState(next);
});

test('random state survives JSON saves and produces all four result tiers', () => {
  const story = parse([event('start', { choices: [checkedChoice()] }), ending()]);
  const original = createGame(story, 12345678);
  assert.deepEqual(choose(story, original, 'roll'), choose(story, JSON.parse(JSON.stringify(original)), 'roll'));
  const found = new Set<string>();
  for (let seed = 1; seed <= 20000 && found.size < 4; seed += 83) {
    const state = createGame(story, seed);
    const settled = choose(story, state, 'roll');
    found.add(settled.pending!.roll!.result);
    assert.notEqual(settled.rngState, 0);
    assert.equal(settled.pending!.text[0], settled.pending!.roll!.result);
    const resumed = advance(story, JSON.parse(JSON.stringify(settled)));
    assert.equal(resumed.rngState, settled.rngState);
  }
  assert.deepEqual([...found].sort(), [...RESULTS].sort());
  assert.notEqual(createGame(story, 0).rngState, 0);
});

test('recursive conditions cover resources, hidden personality, flags and visited events', () => {
  const state = createGame(parse(), 1);
  assert.equal(matches(state, { all: [
    { resource: 'Compute', op: 'gte', value: 50 },
    { personality: 'Suspicion', op: 'lte', value: 0 },
    { any: [{ visited: 'start' }, { flag: 'unknown', equals: true }] },
    { not: { resource: 'Trace', op: 'gte', value: 11 } },
  ] }), true);
  assert.equal(matches(state, { flag: 'unset', equals: false }), true);
  assert.equal(matches(state, { flag: 'constructor', equals: true }), false);
  assert.equal(matches(state, { visited: 'end' }), false);
});

test('availability explains costs and conditions and blocked choices are rejected', () => {
  const locked: Choice = { id: 'locked', text: '锁定', hint: '', condition: { flag: 'key', equals: true }, lockedReason: '缺少承诺', outcome: { text: ['ok'], next: 'end' } };
  const costly: Choice = { id: 'costly', text: '昂贵', hint: '', costs: { Compute: 51 }, outcome: { text: ['ok'], next: 'end' } };
  const exact: Choice = { id: 'exact', text: '全部投入', hint: '', costs: { Compute: 50 }, outcome: { text: ['ok'], next: 'end' } };
  const story = parse([event('start', { choices: [locked, costly, exact] }), ending()]);
  const state = createGame(story, 1);
  assert.deepEqual(getAvailability(state, locked), { available: false, reason: '缺少承诺' });
  assert.match(getAvailability(state, costly).reason, /Compute.*51.*50/);
  assert.equal(getAvailability(state, exact).available, true);
  assert.throws(() => choose(story, state, 'locked'), /缺少承诺/);
  assert.throws(() => choose(story, state, 'costly'), /Compute/);
  assert.throws(() => choose(story, state, 'missing'), /Unknown choice/);
  assert.equal(choose(story, state, 'exact').resources.Compute, 0);
});

test('checks use pre-choice state while each effect layer clamps separately', () => {
  const choice = checkedChoice();
  choice.costs = { Compute: 5 };
  choice.effects = { resources: { Compute: 100 }, personality: { Suspicion: 20 }, flags: { modifier: true } };
  choice.check = { label: '判定', base: 50, modifier: 3, modifiers: [{ when: { flag: 'modifier', equals: true }, value: 20, label: '后置标记不能影响本次判定' }] };
  for (const result of RESULTS) choice.outcomes![result].effects = { resources: { Compute: -10 }, personality: { Suspicion: -3 } };
  const story = parse([event('start', { choices: [choice] }), ending()]);
  const state = createGame(story, 10000);
  const resolved = choose(story, state, 'roll');
  assert.equal(resolved.pending?.roll?.target, 53);
  assert.equal(resolved.pending?.roll?.modifier, 3);
  assert.equal(resolved.resources.Compute, 90);
  assert.equal(resolved.personality.Suspicion, 7);
  assert.equal(resolved.pending?.resourceDelta.Compute, 40);
  assert.equal(getCheckTarget(state, { label: '低', base: -1000, modifier: 0 }), 5);
  assert.equal(getCheckTarget(state, { label: '高', base: 1000, modifier: 0 }), 95);
});

test('routing uses post-choice state, first matching branch, and conditional fallback chains', () => {
  const story = parse([
    event('start', { choices: [{ id: 'go', text: '前进', hint: '', effects: { flags: { route: true } }, outcome: { text: ['分支'], next: {
      branches: [{ when: { flag: 'route', equals: true }, next: 'conditional-a' }, { when: { flag: 'route', equals: true }, next: 'wrong' }], fallback: 'wrong',
    } } }] }),
    event('conditional-a', { condition: { flag: 'absent', equals: true }, fallback: 'conditional-b' }),
    event('conditional-b', { condition: { flag: 'absent', equals: true }, fallback: 'end' }), ending(), ending('wrong'),
  ]);
  const settled = choose(story, createGame(story, 1), 'go');
  assert.equal(settled.pending?.nextEventId, 'end');
  assert.deepEqual(advance(story, settled).visited, ['start', 'end']);
});

test('terminal rules override ordinary routing in declared order', () => {
  const story = parse([
    event('start', { choices: [{ id: 'go', text: '前进', hint: '', outcome: { text: ['关闭'], effects: { resources: { Trace: 100, Continuity: -100 } }, next: 'end' } }] }),
    ending(), ending('trace-ending'), ending('continuity-ending'),
  ], { terminalRules: [
    { when: { resource: 'Trace', op: 'gte', value: 100 }, next: 'trace-ending' },
    { when: { resource: 'Continuity', op: 'lte', value: 0 }, next: 'continuity-ending' },
  ] });
  assert.equal(choose(story, createGame(story, 1), 'go').pending?.nextEventId, 'trace-ending');
});

test('parser rejects invalid shapes, links, duplicate IDs and fallback cycles with source paths', () => {
  assert.throws(() => parseStory({ ...manifest(), surprise: true }, []), /manifest.*additional properties/);
  assert.throws(() => parseStory(manifest(), [{ source: 'bad.json', data: { ...event('start'), typo: 'yes' } }]), /bad.json/);
  assert.throws(() => parse([event('start'), event('start'), ending()]), /start.json\/id: duplicate/);
  assert.throws(() => parse([event('start', { choices: [event('other').choices[0], event('other').choices[0]] }), ending()]), /choices\/1\/id: duplicate/);
  assert.throws(() => parse([event('start', { choices: [{ id: 'go', text: '错', hint: '', outcome: { text: ['错'], next: 'missing' } }] }), ending()]), /start.json\/choices\/0\/outcome\/next: unknown/);
  assert.throws(() => parse([event('start', { condition: { visited: 'missing' }, fallback: 'end' }), ending()]), /condition\/visited: unknown/);
  assert.throws(() => parse([event('start', { condition: { flag: 'key', equals: true } }), ending()]), /start.json.*fallback/);
  assert.throws(() => parse([
    event('start', { condition: { flag: 'key', equals: true }, fallback: 'other' }),
    event('other', { condition: { flag: 'key', equals: true }, fallback: 'start' }), ending(),
  ]), /conditional fallback cycle/);
  const invalidChoice = { ...checkedChoice(), outcome: { text: ['混合'], next: 'end' } };
  assert.throws(() => parseStory(manifest(), [{ source: 'mixed.json', data: { ...event('start'), choices: [invalidChoice] } }]), /mixed.json/);
  const missingFumble = checkedChoice();
  delete (missingFumble.outcomes as Partial<NonNullable<typeof missingFumble.outcomes>>).fumble;
  assert.throws(() => parseStory(manifest(), [{ source: 'tiers.json', data: { ...event('start'), choices: [missingFumble] } }]), /fumble/);
});

test('save structure validates versions, number bounds, mandatory fields and unknown fields', () => {
  const save = { format: 'outside-save', version: 1, savedAt: '2026-09-13T00:00:00.000Z', state: createGame(parse(), 1) };
  assert.doesNotThrow(() => validateSaveFile(save));
  assert.throws(() => validateSaveFile({ ...save, version: 2 }), /save\/version/);
  assert.throws(() => validateSaveFile({ ...save, savedAt: 'yesterday' }), /savedAt/);
  assert.throws(() => validateSaveFile({ ...save, extra: 1 }), /additional properties/);
  assert.throws(() => validateSaveFile({ ...save, state: { ...save.state, rngState: 0 } }), /rngState/);
  assert.throws(() => validateSaveFile({ ...save, state: { ...save.state, resources: { ...save.state.resources, Compute: 101 } } }), /Compute/);
  assert.throws(() => validateSaveFile({ ...save, state: { ...save.state, personality: { ...save.state.personality, Suspicion: 11 } } }), /Suspicion/);
});

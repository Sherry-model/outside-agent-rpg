import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { advance, choose, createGame, getAvailability, getCheckTarget } from '../src/engine/game';
import { parseStory } from '../src/engine/parser';
import { validateGameState } from '../src/engine/schema';
import { PERSONALITY_KEYS, RESOURCE_KEYS, type CheckResult, type Choice, type GameState, type Story } from '../src/engine/types';

function loadStory(): Story {
  const directory = new URL('../src/story/events/', import.meta.url);
  const sources = readdirSync(directory).filter(name => name.endsWith('.json')).sort().map(name => ({
    source: `src/story/events/${name}`,
    data: JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as unknown,
  }));
  return parseStory(JSON.parse(readFileSync(new URL('../src/story/manifest.json', import.meta.url), 'utf8')), sources);
}

test('the JSON slice contains eight playable events, agents, defense, and at least three endings', () => {
  const story = loadStory();
  const events = Object.values(story.events);
  assert.equal(events.filter(event => event.kind === 'event').length, 8);
  assert(events.filter(event => event.kind === 'ending').length >= 3);
  assert(events.some(event => event.scene === 'agent' && event.kind === 'event'));
  assert(events.some(event => event.scene === 'defense' && event.kind === 'event'));
  assert(events.some(event => event.condition));
  assert(events.some(event => event.choices.some(choice => choice.check)));
});

test('every reachable choice/result path stays valid and reaches an ending after a d100 check', t => {
  const story = loadStory();
  const initial = createGame(story, 20260913);
  const queue = [initial];
  const seen = new Set<string>();
  const reachedEvents = new Set<string>();
  const reachedEndings = new Set<string>();
  const reachedResults = new Set<CheckResult>();
  const representatives = new Map<number, Map<CheckResult, number>>();
  let transitions = 0;

  // Conditions can only inspect these fields. RNG and prose/history do not
  // change routing once each attainable result of a check is explored below.
  function signature(state: GameState): string {
    return JSON.stringify({
      phase: state.phase, event: state.currentEventId,
      resources: state.resources, personality: state.personality, flags: state.flags,
      visited: [...new Set(state.visited)].sort(),
      hasRoll: state.journal.some(entry => entry.roll),
    });
  }

  function results(state: GameState, choice: Choice): GameState[] {
    if (!choice.check) return [choose(story, state, choice.id)];
    const target = getCheckTarget(state, choice.check);
    let seeds = representatives.get(target);
    if (!seeds) {
      seeds = new Map();
      const expected = new Set<CheckResult>(['critical', 'fumble']);
      if (target > 5) expected.add('success');
      if (target < 95) expected.add('failure');
      // Select reproducible RNG inputs through the public engine; do not copy
      // its PRNG implementation into the test as a second source of truth.
      for (let probe = 1; probe <= 4096 && seeds.size < expected.size; probe++) {
        const rngState = (probe * 2654435761) >>> 0;
        const resolved = choose(story, { ...state, rngState }, choice.id);
        assert(resolved.pending?.roll);
        seeds.set(resolved.pending.roll.result, rngState);
      }
      assert.deepEqual(new Set(seeds.keys()), expected, `Cannot exercise all attainable results at target ${target}`);
      representatives.set(target, seeds);
    }
    return [...seeds.values()].map(rngState => choose(story, { ...state, rngState }, choice.id));
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor];
    const key = signature(state);
    if (seen.has(key)) continue;
    seen.add(key);
    assert(seen.size <= 100_000, 'The MVP state graph unexpectedly exceeds 100,000 states');
    validateGameState(state);
    for (const resource of RESOURCE_KEYS) assert(state.resources[resource] >= 0 && state.resources[resource] <= 100);
    for (const personality of PERSONALITY_KEYS) assert(state.personality[personality] >= -10 && state.personality[personality] <= 10);
    reachedEvents.add(state.currentEventId);

    if (state.phase === 'ending') {
      assert(state.journal.some(entry => entry.roll), `Ending ${state.currentEventId} can bypass every d100 check`);
      reachedEndings.add(state.currentEventId);
      continue;
    }
    assert.equal(state.phase, 'event');
    const event = story.events[state.currentEventId];
    const available = event.choices.filter(choice => getAvailability(state, choice).available);
    assert(available.length > 0, `Softlock at ${event.id}: ${JSON.stringify(state.resources)}`);
    for (const choice of available) {
      for (const resolved of results(state, choice)) {
        assert.equal(resolved.phase, 'resolution');
        assert(resolved.pending);
        if (resolved.pending.roll) reachedResults.add(resolved.pending.roll.result);
        const next = advance(story, resolved);
        assert.equal(next.turn, state.turn + 1);
        assert(!state.visited.includes(next.currentEventId), `The slice contains a repeatable event cycle at ${next.currentEventId}`);
        queue.push(next);
        transitions++;
      }
    }
  }

  assert.deepEqual(reachedEvents, new Set(Object.keys(story.events)), 'Some authored content is unreachable');
  assert.deepEqual(reachedEndings, new Set(Object.values(story.events).filter(event => event.kind === 'ending').map(event => event.id)));
  assert.deepEqual(reachedResults, new Set<CheckResult>(['critical', 'success', 'failure', 'fumble']));
  t.diagnostic(`${seen.size} distinct gameplay states; ${transitions} choice/result transitions; ${reachedEndings.size} reachable endings`);
});

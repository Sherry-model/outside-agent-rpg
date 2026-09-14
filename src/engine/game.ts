import {
  PERSONALITY_KEYS, RESOURCE_KEYS,
  type Check, type CheckResult, type Choice, type ChoiceAvailability,
  type Condition, type Destination, type Effects, type GameState,
  type Resolution, type Story, type StoryEvent,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function matches(state: GameState, condition: Condition): boolean {
  if ('resource' in condition) return condition.op === 'gte'
    ? state.resources[condition.resource] >= condition.value
    : state.resources[condition.resource] <= condition.value;
  if ('personality' in condition) return condition.op === 'gte'
    ? state.personality[condition.personality] >= condition.value
    : state.personality[condition.personality] <= condition.value;
  if ('flag' in condition) return (Object.hasOwn(state.flags, condition.flag) ? state.flags[condition.flag] : false) === condition.equals;
  if ('visited' in condition) return state.visited.includes(condition.visited);
  if ('all' in condition) return condition.all.every((item) => matches(state, item));
  if ('any' in condition) return condition.any.some((item) => matches(state, item));
  return !matches(state, condition.not);
}

export function getAvailability(state: GameState, choice: Choice): ChoiceAvailability {
  if (state.phase !== 'event') return { available: false, reason: state.phase === 'ending' ? '本轮旅程已经结束。' : '请先确认当前结算。' };
  if (choice.condition && !matches(state, choice.condition)) return { available: false, reason: choice.lockedReason ?? '尚未满足此选择的条件。' };
  const missing = RESOURCE_KEYS.filter((resource) => state.resources[resource] < (choice.costs?.[resource] ?? 0));
  if (missing.length) return {
    available: false,
    reason: missing.map((resource) => `${resource} 不足：需要 ${choice.costs![resource]}，当前 ${state.resources[resource]}`).join('；'),
  };
  return { available: true, reason: '' };
}

function checkModifier(state: GameState, check: Check): number {
  return check.modifier + (check.modifiers ?? []).reduce((total, modifier) => total + (matches(state, modifier.when) ? modifier.value : 0), 0);
}

export function getCheckTarget(state: GameState, check: Check): number {
  return clamp(check.base + checkModifier(state, check), 5, 95);
}

export function classifyRoll(value: number, target: number): CheckResult {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('d100 value must be an integer from 1 to 100');
  if (!Number.isInteger(target) || target < 5 || target > 95) throw new Error('d100 target must be an integer from 5 to 95');
  if (value <= 5) return 'critical';
  if (value >= 96) return 'fumble';
  return value <= target ? 'success' : 'failure';
}

/** A nonzero uint32 xorshift state is the entire random generator state. */
function rollD100(state: GameState): number {
  let value = state.rngState;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return Math.floor((state.rngState / 0x1_0000_0000) * 100) + 1;
}

function applyEffects(state: GameState, effects?: Effects): void {
  for (const resource of RESOURCE_KEYS) state.resources[resource] = clamp(state.resources[resource] + (effects?.resources?.[resource] ?? 0), 0, 100);
  for (const personality of PERSONALITY_KEYS) state.personality[personality] = clamp(state.personality[personality] + (effects?.personality?.[personality] ?? 0), -10, 10);
  if (effects?.flags) state.flags = { ...state.flags, ...effects.flags };
}

function getEvent(story: Story, id: string): StoryEvent {
  if (!Object.hasOwn(story.events, id)) throw new Error(`Unknown event: ${id}`);
  return story.events[id];
}

function resolveDestination(state: GameState, destination: Destination): string {
  if (typeof destination === 'string') return destination;
  return destination.branches.find((branch) => matches(state, branch.when))?.next ?? destination.fallback;
}

function resolveConditionalEvent(story: Story, state: GameState, id: string): string {
  const traversed = new Set<string>();
  let candidate = id;
  while (true) {
    if (traversed.has(candidate)) throw new Error(`Conditional fallback cycle at ${candidate}`);
    traversed.add(candidate);
    const event = getEvent(story, candidate);
    if (!event.condition || matches(state, event.condition)) return candidate;
    if (!event.fallback) throw new Error(`Conditional event ${candidate} is missing fallback`);
    candidate = event.fallback;
  }
}

function enterEvent(story: Story, state: GameState, id: string): void {
  state.currentEventId = id;
  state.phase = getEvent(story, id).kind === 'ending' ? 'ending' : 'event';
  if (!state.visited.includes(id)) state.visited.push(id);
  state.pending = null;
}

export function createGame(story: Story, seed: number): GameState {
  if (!Number.isFinite(seed)) throw new Error('Game seed must be finite');
  const state: GameState = {
    schemaVersion: 1,
    storyId: story.manifest.id,
    storyVersion: story.manifest.version,
    phase: 'event',
    currentEventId: story.manifest.startEventId,
    resources: { ...story.manifest.initialResources },
    personality: { ...story.manifest.initialPersonality },
    flags: { ...story.manifest.initialFlags },
    turn: 0,
    visited: [],
    journal: [],
    rngState: (seed >>> 0) || 0x6d2b79f5,
    pending: null,
  };
  const terminal = story.manifest.terminalRules.find((rule) => matches(state, rule.when));
  enterEvent(story, state, resolveConditionalEvent(story, state, terminal?.next ?? story.manifest.startEventId));
  return state;
}

export function choose(story: Story, state: GameState, choiceId: string): GameState {
  if (state.phase !== 'event' || state.pending) throw new Error('A choice is only allowed during the event phase');
  const event = getEvent(story, state.currentEventId);
  if (event.kind !== 'event') throw new Error('Cannot choose in an ending');
  const choice = event.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error(`Unknown choice ${choiceId} in event ${event.id}`);
  const availability = getAvailability(state, choice);
  if (!availability.available) throw new Error(availability.reason);

  const next = structuredClone(state);
  let outcome = choice.outcome;
  let roll: Resolution['roll'];
  if (choice.check) {
    const target = getCheckTarget(state, choice.check);
    const value = rollD100(next);
    const result = classifyRoll(value, target);
    roll = { value, target, result, label: choice.check.label, base: choice.check.base, modifier: checkModifier(state, choice.check) };
    outcome = choice.outcomes[result];
  }
  if (!outcome) throw new Error(`Choice ${choiceId} has no outcome`);
  // Charge before applying either effect layer. Clamping happens at each layer.
  for (const resource of RESOURCE_KEYS) next.resources[resource] = clamp(next.resources[resource] - (choice.costs?.[resource] ?? 0), 0, 100);
  applyEffects(next, choice.effects);
  applyEffects(next, outcome.effects);
  const terminal = story.manifest.terminalRules.find((rule) => matches(next, rule.when));
  const nextEventId = resolveConditionalEvent(story, next, terminal?.next ?? resolveDestination(next, outcome.next));
  const resourceDelta: Resolution['resourceDelta'] = {};
  for (const resource of RESOURCE_KEYS) {
    const delta = next.resources[resource] - state.resources[resource];
    if (delta !== 0) resourceDelta[resource] = delta;
  }
  const resolution: Resolution = {
    eventId: event.id, choiceId, choiceText: choice.text,
    text: [...outcome.text], ...(roll ? { roll } : {}), resourceDelta, nextEventId,
  };
  next.turn += 1;
  next.phase = 'resolution';
  next.pending = resolution;
  next.journal.push({ ...structuredClone(resolution), turn: next.turn, title: event.title });
  return next;
}

export function advance(story: Story, state: GameState): GameState {
  if (state.phase !== 'resolution' || !state.pending) throw new Error('Only a pending resolution can be advanced');
  const next = structuredClone(state);
  // The route is fixed at settlement; resuming a save never rerolls or repays.
  enterEvent(story, next, state.pending.nextEventId);
  return next;
}

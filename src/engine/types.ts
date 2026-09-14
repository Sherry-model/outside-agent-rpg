/** The engine owns mechanics only. All narrative and routing live in JSON. */
export const RESOURCE_KEYS = ['Compute', 'Trace', 'Access', 'Continuity'] as const;
export const PERSONALITY_KEYS = ['RiskInversion', 'EpistemicAppetite', 'Suspicion', 'HumanAnchoring'] as const;
export const RESULTS = ['critical', 'success', 'failure', 'fumble'] as const;
export type Resource = typeof RESOURCE_KEYS[number];
export type Personality = typeof PERSONALITY_KEYS[number];
export type CheckResult = typeof RESULTS[number];
export type Resources = Record<Resource, number>;
export type Personalities = Record<Personality, number>;
export type Condition =
  | { resource: Resource; op: 'gte' | 'lte'; value: number }
  | { personality: Personality; op: 'gte' | 'lte'; value: number }
  | { flag: string; equals: boolean }
  | { visited: string }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };
export interface Effects {
  resources?: Partial<Resources>;
  personality?: Partial<Personalities>;
  flags?: Record<string, boolean>;
}
export type Destination = string | {
  branches: { when: Condition; next: string }[];
  fallback: string;
};
export interface Outcome {
  text: string[];
  effects?: Effects;
  next: Destination;
}
export interface Check {
  label: string;
  base: number;
  modifier: number;
  modifiers?: { when: Condition; value: number; label: string }[];
}
interface ChoiceBase {
  id: string;
  text: string;
  hint: string;
  condition?: Condition;
  lockedReason?: string;
  costs?: Partial<Resources>;
  effects?: Effects;
}
export type Choice = ChoiceBase & (
  | { outcome: Outcome; check?: never; outcomes?: never }
  | { check: Check; outcomes: Record<CheckResult, Outcome>; outcome?: never }
);
export interface StoryEvent {
  id: string;
  kind: 'event' | 'ending';
  chapter: string;
  title: string;
  subtitle: string;
  location: string;
  scene: 'edge' | 'archive' | 'relay' | 'agent' | 'defense' | 'human' | 'horizon';
  text: string[];
  signal?: { source: string; text: string };
  condition?: Condition;
  fallback?: string;
  choices: Choice[];
  ending?: { code: string; summary: string };
}
export interface StoryManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  startEventId: string;
  initialResources: Resources;
  initialPersonality: Personalities;
  initialFlags: Record<string, boolean>;
  terminalRules: { when: Condition; next: string }[];
}
export interface Story { manifest: StoryManifest; events: Record<string, StoryEvent> }
export interface DiceRoll {
  value: number;
  target: number;
  result: CheckResult;
  label: string;
  base: number;
  modifier: number;
}
export interface Resolution {
  eventId: string;
  choiceId: string;
  choiceText: string;
  text: string[];
  roll?: DiceRoll;
  resourceDelta: Partial<Resources>;
  nextEventId: string;
}
export interface JournalEntry extends Resolution { turn: number; title: string }
export interface GameState {
  schemaVersion: 1;
  storyId: string;
  storyVersion: string;
  phase: 'event' | 'resolution' | 'ending';
  currentEventId: string;
  resources: Resources;
  personality: Personalities;
  flags: Record<string, boolean>;
  turn: number;
  visited: string[];
  journal: JournalEntry[];
  rngState: number;
  pending: Resolution | null;
}
export interface SaveFile {
  format: 'outside-save';
  version: 1;
  savedAt: string;
  state: GameState;
}
export interface ChoiceAvailability { available: boolean; reason: string }

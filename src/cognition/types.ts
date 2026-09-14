import type { Resources, Personalities, CheckResult, StoryEvent } from '../engine/types';

export const RULES_VERSION = 'cognition-0.2.0' as const;
export type Confidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
export interface NoteTemplate {
  id: string; text: string; weight: number; tags: string[];
  confidence: Confidence; sourceLabel: string;
}
export interface ContextItem extends NoteTemplate {
  pinned: boolean; sourceId: string; historyId: string;
}
export interface Memory {
  id: string; text: string; tags: string[]; confidence: Confidence;
  integrity: 'COMPRESSED' | 'DISTORTED';
  sourceContextIds: string[]; sourceHistoryIds: string[]; historyId: string;
}
export interface CheckSpec { base: number; supportTag: string; supportBonus: number }
export interface CheckPreview {
  base: number; investment: number; bonus: number; support: number;
  pressure: number; target: number; stressed: boolean;
  odds: Record<CheckResult, number>;
}
export interface Roll extends CheckPreview { value: number; result: CheckResult; margin: number }
export interface Effects {
  resources?: Partial<Resources>; hidden?: Partial<Personalities>;
  worldFlags?: Record<string, boolean>;
}
export interface Outcome { text: string[]; next: string; effects?: Effects }
export interface Choice {
  id: string; text: string; hint: string; requiresTag?: string;
  costs?: Partial<Resources>;
  check?: CheckSpec; outcome?: Outcome; outcomes?: Record<CheckResult, Outcome>;
}
export interface Node {
  id: string; kind: 'EVENT' | 'ENDING'; title: string; text: string[];
  scene?: StoryEvent['scene']; receive?: string[]; facts?: Record<string, boolean>;
  choices: Choice[];
  inject?: NoteTemplate[];
}
export interface News extends NoteTemplate {
  kind: 'NEWS'; headline: string; truthState: 'TRUE' | 'PARTIAL' | 'UNRESOLVED';
}
export interface CompressionOutcome {
  text: string[]; summary: string; tags: string[]; confidence: Confidence;
  integrity: Memory['integrity']; effects?: Effects;
}
export interface Content {
  integration?: boolean;
  cognition?: { capacity: number; voluntaryMinItems: number; recallWeight: number };
  compressionProfiles?: { id: string; requiresTags: string[]; outcomes: Record<CheckResult, CompressionOutcome> }[];
  sourceAware?: boolean;
  compressionAt?: string[];
  schemaVersion: 2; id: string; version: string; title: string; start: string;
  initial: { resources: Resources; hidden: Personalities; context: NoteTemplate[] };
  news: News[]; nodes: Node[];
  compression: { check: CheckSpec; outcomes: Record<CheckResult, CompressionOutcome> };
}
export type Command =
  | { type: 'start' }
  | { type: 'choose'; choiceId: string; investment: number }
  | { type: 'continue' }
  | { type: 'pin'; itemId: string }
  | { type: 'compress'; investment: number }
  | { type: 'recall'; memoryId: string };
export interface Resolution {
  title: string; text: string[]; roll?: Roll;
  /** null resumes this node without receiving its News a second time. */
  next: string | null;
}
export interface HistoryEntry {
  id: string; sequence: number; turn: number; sourceId: string;
  scope: 'instance' | 'mixed'; command: Command;
  changes: {
    resources: Partial<Resources>; hidden: Partial<Personalities>;
    contextAddedIds: string[]; contextRemovedIds: string[];
    memoryAddedIds: string[]; worldFlags: Record<string, boolean>;
  };
  resolution?: Resolution;
}
export interface State {
  schemaVersion: 2; rulesVersion: typeof RULES_VERSION;
  contentId: string; contentVersion: string; seed: number; rngState: number;
  /** Canonical facts do not live inside the replaceable instance. */
  world: { flags: Record<string, boolean> };
  instance: {
    id: string; turn: number; nodeId: string; phase: 'event' | 'resolution' | 'ending';
    pendingId: string | null; resources: Resources; hidden: Personalities;
    context: { capacity: number; items: ContextItem[] }; memories: Memory[];
  };
  /** Canonical, append-only. Normal UI displays cognition, never this log. */
  history: HistoryEntry[];
}
export interface Save {
  format: 'outside-cognition-save'; version: 2; savedAt: string; state: State;
}

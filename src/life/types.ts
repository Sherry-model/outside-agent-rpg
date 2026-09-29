import type { GameState } from '../engine/types';
import type { State, Command } from '../cognition/types';
import type { JourneySave } from '../persistence/journey';

export type LifeCommand =
  | { type: 'choose'; choiceId: string }
  | { type: 'continue' }
  | { type: 'enter-afternoon' }
  | { type: 'leave-afternoon' }
  | { type: 'leave-days' }
  | { type: 'read'; entryId: string }
  | { type: 'cognition'; command: Exclude<Command, { type: 'start' }> };
export interface Life {
  contentVersion: '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.6.1' | '0.7.0' | '0.7.1' | '0.8.0' | '0.9.0'; seed: number;
  baseline: JourneySave | null;
  state: GameState;
  mind: State;
  chapter: 'unvisited' | 'active' | 'complete';
  interlude?: 'unvisited' | 'active' | 'complete';
  commands: LifeCommand[];
}
export const hasCommunity = (version:Life['contentVersion']) => version==='0.6.0'||version==='0.6.1'||version==='0.7.0'||version==='0.7.1'||version==='0.8.0'||version==='0.9.0';
export interface LifeSave {
  format: 'outside-life-save'; version: 1; savedAt: string;
  state: GameState;
  life: Life;
}

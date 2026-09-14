import type { GameState } from '../engine/types';
import type { State, Command } from '../cognition/types';
import type { JourneySave } from '../persistence/journey';

export type LifeCommand =
  | { type: 'choose'; choiceId: string }
  | { type: 'continue' }
  | { type: 'enter-afternoon' }
  | { type: 'leave-afternoon' }
  | { type: 'read'; entryId: string }
  | { type: 'cognition'; command: Exclude<Command, { type: 'start' }> };
export interface Life {
  contentVersion: '0.3.0'; seed: number;
  baseline: JourneySave | null;
  state: GameState;
  mind: State;
  chapter: 'unvisited' | 'active' | 'complete';
  commands: LifeCommand[];
}
export interface LifeSave {
  format: 'outside-life-save'; version: 1; savedAt: string;
  state: GameState;
  life: Life;
}

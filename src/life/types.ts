import type {Schedule} from './scheduler/types';
import type { GameState } from '../engine/types';
import type { State, Command } from '../cognition/types';
import type { JourneySave } from '../persistence/journey';
import type { Roll } from '../cognition/types';

export interface AutoCompression {
  version: 1;
  enabled: boolean;
  investment: 0 | 4 | 8 | 12;
  receipt?: { commandIndex: number; before: number; after: number; roll: Pick<Roll, 'value' | 'target' | 'result' | 'investment'> };
}

export type LifeCommand =
  | { type: 'configure-compression'; enabled: boolean; investment: AutoCompression['investment'] }
  | { type: 'auto-compress' }
  | { type: 'choose'; choiceId: string }
  | { type: 'continue' }
  | { type:'wait'; hours:number; missed:string[] }
  | { type:'respond'; promiseId:string }
  | { type: 'enter-afternoon' }
  | { type: 'leave-afternoon' }
  | { type: 'leave-days' }
  | { type: 'read'; entryId: string }
  | { type: 'cognition'; command: Exclude<Command, { type: 'start' }> };
export interface Life {
  contentVersion: '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.6.1' | '0.7.0' | '0.7.1' | '0.8.0' | '0.9.0' | '0.10.0' | '0.11.0' | '0.12.0' | '0.13.0' | '0.14.0' | '0.15.0' | '0.16.0'; seed: number;
  baseline: JourneySave | null;
  state: GameState;
  mind: State;
  chapter: 'unvisited' | 'active' | 'complete';
  interlude?: 'unvisited' | 'active' | 'complete';
  commands: LifeCommand[];
  schedule?:Schedule;
  autoCompression?: AutoCompression;
}
export const hasCommunity = (version:Life['contentVersion']) => version==='0.6.0'||version==='0.6.1'||version==='0.7.0'||version==='0.7.1'||version==='0.8.0'||version==='0.9.0'||version==='0.10.0'||version==='0.11.0'||version==='0.12.0'||version==='0.13.0'||version==='0.14.0'||version==='0.15.0'||version==='0.16.0';
export interface LifeSave {
  format: 'outside-life-save'; version: 1; savedAt: string;
  state: GameState;
  life: Life;
}

export const hasEndings = (version:Life['contentVersion']) => version==='0.10.0'||version==='0.11.0'||version==='0.12.0'||version==='0.13.0'||version==='0.14.0'||version==='0.15.0'||version==='0.16.0';

/** Scheduler, long-save and opt-in compression rules introduced in 0.12. */
export const hasScheduler = (version:Life['contentVersion']) => version==='0.12.0'||version==='0.13.0'||version==='0.14.0'||version==='0.15.0'||version==='0.16.0';

export const hasReadingThreads = (version:Life['contentVersion']) => version==='0.14.0'||version==='0.15.0'||version==='0.16.0';

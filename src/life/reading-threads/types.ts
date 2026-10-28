import type {Node} from '../../cognition/types';
import type {SemanticContent} from '../../cognition/semantic-types';
import type {PromiseSpec} from '../scheduler/types';

export interface ReadingThread {
  id:string; rootPost:string; entry:string; maxScenes:number;
  phases:string[]; channels:string[]; themeNodes:string[];
  /** Every choice must explicitly close the line or schedule its next scene. */
  steps:Record<string,Record<string,{remaining:number; promise?:PromiseSpec}>>;
}
export interface ReadingProfile {
  id:string; threads:ReadingThread[]; nodes:Node[];
  /** Optional isolated fixture version. Production version selection lives in profiles.ts. */
  fixtureVersion?:'0.14.0'|'0.15.0'|'0.16.0';
  semantic:Pick<SemanticContent,'topics'|'sources'>;
}
export interface ReadingState {
  profile:string; opened:Record<string,number>; themes:Record<string,number>;
  shown:number; entrances:number; reserved:number; misses:number; closed:string[];
  active?:{id:string; status:'offered'|'accepted'};
}
export interface ReadingWindow {
  state:ReadingState; threads:ReadingThread[]; load:number; capacity:number;
  weights:Record<string,number>; entrances?:boolean;
}

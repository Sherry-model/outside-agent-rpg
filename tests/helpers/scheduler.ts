import {baseStory,nextCommand,nodeId,type Route} from './endings';
import {createLife,step} from '../../src/life/engine';
import {pending} from '../../src/cognition/engine';
import type {Life} from '../../src/life/types';
export {baseStory,nextCommand,nodeId};
export function schedulerJourney(seed=1234,stop?:string,route:Route={}):Life {
  let life=createLife(baseStory,seed);
  for(let i=0;i<600;i++){
    if(stop&&nodeId(life)===stop&&!pending(life.mind)&&life.state.phase!=='resolution')return life;
    const command=nextCommand(life,route);
    if(!command){if(stop)throw new Error('Did not reach '+stop);return life;}
    life=step(baseStory,life,command);
  }
  throw new Error('Scheduler journey exceeded bound');
}

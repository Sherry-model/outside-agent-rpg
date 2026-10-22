import {createLife,step} from '../../src/life/engine';
import {loadPercent,pending} from '../../src/cognition/engine';
import type {Life} from '../../src/life/types';
import {baseStory,nextCommand} from './endings';
export {baseStory};
/** The route helper usually compresses at 90%; suppress that preference only when selecting a narrative action. */
export function narrativeCommand(life:Life) {
  const projection=structuredClone(life);
  projection.mind.instance.context.capacity=1_000_000;
  return nextCommand(projection);
}
export function firstFull(seed=1234):Life {
  let l=createLife(baseStory,seed);
  for(let i=0;i<250;i++){
    if(loadPercent(l.mind)>=100&&l.mind.instance.phase==='event'&&!pending(l.mind))return l;
    const c=narrativeCommand(l);if(!c)throw new Error('Ended before full');l=step(baseStory,l,c);
  }
  throw new Error('Full fixture exceeded bound');
}

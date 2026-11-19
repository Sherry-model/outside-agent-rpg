import {createLife,step} from '../../src/life/engine';
import {baseStory,nextCommand,nodeId} from './scheduler';
import {painterOffer} from '../../src/life/painter-life/integration';
import {safeToRespond,canWait} from '../../src/life/scheduler/integration';
import {pending} from '../../src/cognition/engine';
import type {Life,LifeCommand} from '../../src/life/types';
export {baseStory,nodeId};
export const cog=(life:Life,command:Extract<LifeCommand,{type:'cognition'}>['command'])=>step(baseStory,life,{type:'cognition',command});
export function drivePainter(life:Life,stop:(life:Life)=>boolean){
 for(let n=0;n<600;n++){
  if(stop(life))return life;
  const command=nextCommand(life,{overrides:{days_revision:'daily_open_crop',daily_crop:'crop_check',days_painter:'painter_visit'}});
  if(!command)throw Error('Route ended before target');life=step(baseStory,life,command);
 }throw Error('Painter route exceeded bound');
}
export function offer(seed=17){return drivePainter(createLife(baseStory,seed),l=>painterOffer(l)&&safeToRespond(l));}
export function sync(seed=17){let life=step(baseStory,offer(seed),{type:'invitation',response:'accept'});return step(baseStory,life,{type:'respond',promiseId:'painter_sync'});}
export function revisit(start:Life){
 let life=start,before=start;
 for(let n=0;n<600;n++){
  if(nodeId(life)==='painter_revisit')return {life,before};
  before=life;
  const command=canWait(life)&&!pending(life.mind)?{type:'wait' as const,hours:24,missed:[]}:nextCommand(life);
  if(!command)throw Error('No route to revisit');life=step(baseStory,life,command);
 }throw Error('No revisit');
}

import {baseStory,nextCommand,nodeId} from './scheduler';
import {createLife,step} from '../../src/life/engine';
import {pending,canChoose} from '../../src/cognition/engine';
import {contentFor} from '../../src/life/content';
import type {Life,LifeCommand} from '../../src/life/types';
import type {Route} from './endings';
export {baseStory,nodeId};
export const cog=(l:Life,command:Extract<LifeCommand,{type:'cognition'}>['command'])=>step(baseStory,l,{type:'cognition',command});
export const take=(l:Life,choiceId:string)=>cog(l,{type:'choose',choiceId,investment:0});
export const ready=(id:string)=>(l:Life)=>nodeId(l)===id&&!pending(l.mind)&&l.state.phase!=='resolution';
export function drive(l:Life,stop:(l:Life)=>boolean,route:Route={}) {
  for(let i=0;i<600;i++){
    if(stop(l))return l;
    const command=nextCommand(l,route);if(!command)throw new Error('Ended before requested state');
    l=step(baseStory,l,command);
  }
  throw new Error('Route exceeded bound');
}
export function productionBefore(kind:'persona'|'registration',version:Life['contentVersion']='0.15.0'):Life {
  let l=createLife(baseStory,40,null,version);
  const route:Route={line:kind==='persona'?'b':'c'};
  l=drive(l,ready('days_tickets'),route);
  if(kind==='registration'){
    l=step(baseStory,l,{type:'read',entryId:'quiet_newcomer'});
    l=cog(l,{type:'pin',itemId:l.mind.instance.context.items.find(i=>i.sourceId==='quiet_newcomer')!.id});
  }
  l=drive(l,x=>ready(kind==='persona'?nodeId(x):'pg_e11')(x)&&(kind!=='persona'||/^pg_e07_/.test(nodeId(x))),route);
  // Stay within legal cognition commands; a filled context is not a usable before-choice fixture.
  const choice=kind==='persona'?'pg_e07_persona':'pg_e11_reply';
  while(canChoose(contentFor(version),l.mind,choice)){
    const item=l.mind.instance.context.items.find(i=>!i.pinned);if(!item)throw new Error('No space to prepare choice');
    l=cog(l,{type:'drop',itemId:item.id});
  }
  return l;
}

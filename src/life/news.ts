import {contentFor} from './content';
import {weight,pending,receiveNews} from '../cognition/engine';
import {location,scheduled} from './scheduler/integration';
import {manifestFor} from './scheduler/content';
import type {Life,LifeCommand} from './types';
export interface NewsDelivery {id:string;hour:number;scene:number;commandIndex:number}
const releases=[{id:'painter_move_plan',hour:24},{id:'painter_move_done',hour:96}];
/** Only successful authored transitions and legal waits can deliver. No UI or wall clock. */
export function deliverNews(before:Life,life:Life,command:LifeCommand):void {
 if(life.contentVersion!=='0.18.0'||!life.schedule)return;
 const s=life.schedule,m=manifestFor(life.contentVersion);
 const boundary=command.type==='wait'||((command.type==='continue'||command.type==='cognition'&&command.command.type==='continue')&&s.coreScenes>(before.schedule?.coreScenes??0));
 if(!boundary||scheduled(life)||life.state.phase!=='event'||life.mind.instance.phase!=='event'||pending(life.mind)||!m.safeNodes.includes(location(life)))return;
 const delivered=life.news??=[];const last=delivered.at(-1);
 if(last&&last.hour>=s.hour&&last.scene>=s.coreScenes)return;
 const entry=releases.find(r=>r.hour<=s.hour&&!delivered.some(d=>d.id===r.id));if(!entry)return;
 const note=contentFor(life.contentVersion).news.find(n=>n.id===entry.id)!;
 if(weight(life.mind)+note.weight>life.mind.instance.context.capacity)return;
 receiveNews(contentFor(life.contentVersion),life.mind,entry.id,`life-${life.commands.length}`);
 delivered.push({id:entry.id,hour:s.hour,scene:s.coreScenes,commandIndex:life.commands.length});
}
export const newsPublishedHour=(id:string)=>releases.find(r=>r.id===id)?.hour;

import type {Life,LifeCommand} from '../types';
import type {PromiseSpec} from '../scheduler/types';
import {safeToRespond} from '../scheduler/integration';
import {addPromises} from '../scheduler/engine';
import {manifestFor} from '../scheduler/content';
import {effects,inject} from '../../cognition/engine';
import type {Content,NoteTemplate} from '../../cognition/types';
import returnNotes from './return-notes.json';
export const painterPromise=(id:string,eventId:string,afterHours:number):PromiseSpec=>({id,eventId,fallbackEventId:eventId,role:'branch',title:eventId==='painter_sync'?'画师的同步邀请':'三天后的画师回访',afterHours,afterScenes:0,mode:'choice',channels:['public','mail'],entryWeight:4});
export function painterOffer(l:Life):boolean {const f=l.mind.world.flags;return l.contentVersion==='0.18.0'&&!!l.schedule&&l.schedule.hour>=24&&!!f.daily_painter_connected&&!!f.daily_opinion_seen&&!f.painter_no_invites&&!l.schedule.commitments.some(p=>p.id==='painter_sync');}
export function invitation(l:Life,c:Extract<LifeCommand,{type:'invitation'}>) {
 if(!painterOffer(l)||!safeToRespond(l))throw new Error('当前没有可回应的画师邀请。');
 if(c.response==='decline'){l.mind.world.flags.painter_no_invites=true;return;}
 const m=manifestFor(l.contentVersion);addPromises(l.schedule!,{...m,promises:{invite:[painterPromise('painter_sync','painter_sync',0)]}},'invite');
}

/** A present-tense external receipt, delivered only on an actual return, never by a timer. */
export function painterReturn(before:Life,life:Life,content:Content):boolean {
 const flags=life.mind.world.flags;
 if(life.contentVersion!=='0.18.0'||life.schedule?.active?.id!=='painter_revisit'
  ||life.mind.instance.nodeId!=='painter_revisit'||before.mind.instance.nodeId==='painter_revisit'
  ||!flags.painter_sync_helped||flags.painter_return_paid)return false;
 const previous=life.mind.instance.resources.Compute;
 effects(life.mind,{resources:{Compute:4},worldFlags:{painter_return_paid:true}});
 const credited=life.mind.instance.resources.Compute-previous;
 const note=returnNotes[credited] as NoteTemplate;
 inject(life.mind,{...note,meaning:structuredClone(content.semantic!.sources[note.id])},'painter_return_quota',`life-${life.commands.length}`);
 return true;
}

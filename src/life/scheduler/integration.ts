import type {Life,LifeCommand} from '../types';
import {contentFor} from '../content';
import {pending,reduce,weight} from '../../cognition/engine';
import {manifest} from './content';
import {addPromises,advanceClock,createSchedule,deliverBeforeJump,due,jump,jumpPreview,setPhase,settleSummaries,windowDecision} from './engine';
export {createSchedule,jumpPreview};
export const scheduled=(life:Life)=>Boolean(life.schedule?.active);
export function location(life:Life) {return life.interlude==='active'||life.chapter==='active'||scheduled(life)?life.mind.instance.nodeId:life.state.currentEventId;}
export function safeToRespond(life:Life) {return !!life.schedule&&!scheduled(life)&&manifest.safeNodes.includes(location(life))&&life.mind.instance.phase==='event'&&life.state.phase!=='ending'&&!pending(life.mind)&&life.state.phase!=='resolution'&&weight(life.mind)<100;}
export function canWait(life:Life) {return safeToRespond(life)&&life.interlude==='complete';}
export function allowedWaits(life:Life):number[] {
  const s=life.schedule;if(!s)return [];
  const next=s.commitments.filter(p=>p.status==='pending'&&p.dueHour>s.hour&&p.dueScene<=s.scenes).map(p=>p.dueHour-s.hour).sort((a,b)=>a-b)[0];
  return [...new Set([24,168,720,...(next?[next]:[])])].sort((a,b)=>a-b);
}
function inject(life:Life,nodeId:string) {
  const node=contentFor(life.contentVersion).nodes.find(n=>n.id===nodeId)!;
  const mind=life.mind.instance;mind.nodeId=nodeId;mind.phase='event';mind.pendingId=null;
  Object.assign(life.mind.world.flags,node.facts??{});
  for(const note of node.inject??[])mind.context.items.push({...structuredClone(note),id:`${note.id}-schedule-${life.commands.length}`,sourceId:nodeId,historyId:`life-${life.commands.length}`,pinned:false});
}
function start(life:Life,selected:NonNullable<ReturnType<typeof windowDecision>>,driver:'main'|'mind'|'idle') {
  const i=life.mind.instance;
  life.schedule!.active={id:selected.id,kind:selected.kind,role:selected.role,resume:{driver,nodeId:i.nodeId,phase:i.phase,pendingId:i.pendingId}};
  inject(life,selected.nodeId);
}
function receipts(life:Life,from:number) {
  const s=life.schedule!,content=contentFor(life.contentVersion);
  for(const r of s.receipts.slice(from)) {
    const p=s.commitments.find(p=>p.id===r.id),source=p?.receiptSource;if(!source)continue;
    const meaning=content.semantic!.sources[source];if(!meaning)throw new Error('回执缺少语义。');
    life.mind.instance.context.items.push({id:`receipt-${r.id}`,sourceId:source,historyId:`life-${life.commands.length}`,text:r.text,weight:2,tags:[],confidence:'HIGH',sourceLabel:'外部回执',pinned:false,meaning:structuredClone(meaning)});
  }
}
/** Called before the original continue: the destination and its notes have NOT arrived yet. */
export function intercept(life:Life,command:LifeCommand):boolean {
  const s=life.schedule;if(!s||s.active)return false;
  let driver:'main'|'mind',node:string;
  if(command.type==='continue'&&life.state.pending){driver='main';node=life.state.currentEventId;}
  else if(command.type==='cognition'&&command.command.type==='continue'&&pending(life.mind)?.next){driver='mind';node=life.mind.instance.nodeId;}
  else return false;
  s.scenes++;s.coreScenes++;
  if(life.state.resources.Compute<=0||life.state.resources.Continuity<=0)return false;
  const spec=manifest.windows[node];if(!spec)return false;
  advanceClock(s,spec.hours);const from=s.receipts.length;settleSummaries(s);receipts(life,from);
  const selected=windowDecision(s,manifest,`story:${s.coreScenes}:${node}`,spec,life.mind.world.flags);
  if(!selected)return false;
  start(life,selected,driver);return true;
}
export function finishedScheduled(life:Life,command:LifeCommand) {
  return !!life.schedule?.active&&command.type==='cognition'&&command.command.type==='continue'&&pending(life.mind)?.next==='schedule_return';
}
export function finishScheduled(life:Life,replaying=false) {
  const s=life.schedule!,resume=s.active!.resume;
  life.mind=reduce(contentFor(life.contentVersion),life.mind,{type:'continue'},8192,replaying);
  s.scenes++;s.scheduledScenes[s.active!.role]++;delete s.active;
  Object.assign(life.mind.instance,{nodeId:resume.nodeId,phase:resume.phase,pendingId:resume.pendingId});
  return resume.driver;
}
export function afterScheduledChoice(life:Life,command:LifeCommand) {
  if(!life.schedule?.active||command.type!=='cognition'||command.command.type!=='choose')return;
  const id=command.command.choiceId;
  advanceClock(life.schedule,manifest.hoursByChoice[id]??0);
  addPromises(life.schedule,manifest,id);
}
export function scheduleCommand(life:Life,command:Extract<LifeCommand,{type:'wait'|'respond'}>) {
  const s=life.schedule;if(!s)throw new Error('旧版本没有生活调度。');
  if(command.type==='respond') {
    if(!safeToRespond(life))throw new Error('先完成眼前的连续场景或整理近处，再处理回信。');
    const p=s.commitments.find(p=>p.id===command.promiseId);
    let selected:NonNullable<ReturnType<typeof windowDecision>>;
    if(p?.mode==='choice')selected=deliverBeforeJump(s,manifest,p.id);
    else {
      if(!p||!due(s).some(q=>q.id===p.id))throw new Error('这项回应还没有到达。');
      // Manual inbox handling uses the same oldest-deadline-first queue, not arbitrary cherry-picking.
      const next=due(s).find(q=>q.mode!=='summary');if(next?.id!==p.id)throw new Error('请先处理期限更早的回信。');
      selected=windowDecision(s,manifest,`inbox:${p.id}`,{phase:s.phase,hours:0,channel:s.channel,chance:0},life.mind.world.flags,false)!;
    }
    start(life,selected,'idle');return;
  }
  if(!canWait(life)||!allowedWaits(life).includes(command.hours))throw new Error('当前没有这个等待空档。');
  const from=s.receipts.length;
  jump(s,command.hours,command.missed);
  settleSummaries(s);receipts(life,from);
  setPhase(s,manifest,'open','mail');
  const selected=windowDecision(s,manifest,`wait:${life.commands.length}`,{phase:'open',hours:0,channel:'mail',chance:0.65},life.mind.world.flags,!s.waited);
  s.waited=true;if(selected)start(life,selected,'idle');
}

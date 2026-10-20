import type {Commitment,Schedule,SchedulerManifest,WindowSpec} from './types';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function createSchedule(seed:number):Schedule {
  return {version:1,hour:0,scenes:0,coreScenes:0,scheduledScenes:{daily:0,branch:0},rng:((seed^0x6d2b79f5)>>>0)||1,phase:'arrival',channel:'public',budgets:{},processed:[],seen:[],commitments:[],decisions:[],receipts:[],waited:false};
}
function random(s:Schedule):number {let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export function addPromises(s:Schedule,m:SchedulerManifest,choiceId:string) {
  for(const spec of m.promises[choiceId]??[]) {
    if(s.commitments.some(p=>p.id===spec.id))continue;
    s.commitments.push({...structuredClone(spec),sequence:s.commitments.length,deferredHours:0,createdHour:s.hour,dueHour:s.hour+spec.afterHours,dueScene:s.scenes+spec.afterScenes,status:'pending',...(spec.deadlineHours!==undefined?{deadlineHour:s.hour+spec.deadlineHours}:{})});
  }
}
export function due(s:Schedule):Commitment[] {
  return s.commitments.filter(p=>p.status==='pending'&&p.dueHour<=s.hour&&p.dueScene<=s.scenes)
    .sort((a,b)=>(a.deadlineHours!==undefined?a.createdHour+a.deadlineHours:Number.MAX_SAFE_INTEGER)-(b.deadlineHours!==undefined?b.createdHour+b.deadlineHours:Number.MAX_SAFE_INTEGER)||a.sequence-b.sequence||compare(a.id,b.id));
}
export function jumpPreview(s:Schedule,hours:number) {
  const target=s.hour+hours;
  const crossing=s.commitments.filter(p=>p.status==='pending'&&p.deadlineHour!==undefined&&p.deadlineHour<=target);
  return {target,required:crossing.filter(p=>p.mode==='choice'),missable:crossing.filter(p=>p.mode==='missable'),summaries:s.commitments.filter(p=>p.status==='pending'&&p.mode==='summary'&&p.dueHour<=target&&p.dueScene<=s.scenes)};
}
/** Explicit acknowledgements only. A time jump never silently cancels a promise. */
export function jump(s:Schedule,hours:number,missed:string[]) {
  if(!Number.isInteger(hours)||hours<=0)throw new Error('无效的等待时长。');
  const plan=jumpPreview(s,hours);
  if(plan.required.length)throw new Error('等待前先处理需要本人回应的事项。');
  const ids=plan.missable.map(p=>p.id).sort();
  if(JSON.stringify([...missed].sort())!==JSON.stringify(ids))throw new Error('请先明确确认会错过的事项。');
  for(const p of plan.missable){p.status='missed';s.receipts.push({id:p.id,title:p.title,text:p.missedReceipt!,hour:p.deadlineHour!});}
  s.hour=plan.target;
}
export function settleSummaries(s:Schedule) {
  const result=due(s).filter(p=>p.mode==='summary');
  for(const p of result){p.status='delivered';s.receipts.push({id:p.id,title:p.title,text:p.receipt!,hour:s.hour});}
  return result;
}
export function setPhase(s:Schedule,m:SchedulerManifest,phase:string,channel:string) {
  if(s.phase!==phase&&s.budgets[s.phase]){const old=s.budgets[s.phase];old.expired=old.limit-old.spent;}
  s.phase=phase;s.channel=channel;
  s.budgets[phase]??={limit:m.phases[phase].budget,spent:0,overdraft:0,expired:0};
}
function charge(s:Schedule,promised:boolean) {
  const b=s.budgets[s.phase];if(b.spent+b.expired<b.limit)b.spent++;else if(promised)b.overdraft++;else throw new Error('偶遇预算不足。');
}
/** One decision per declared transition. Rendering and ordinary cognitive commands never call this. */
export function windowDecision(s:Schedule,m:SchedulerManifest,id:string,spec:WindowSpec,flags:Record<string,boolean>,allowNew=true) {
  if(s.processed.includes(id))return null;
  setPhase(s,m,spec.phase,spec.channel);s.processed.push(id);
  const record=(selected:string|null,reason:string)=>{s.decisions.push({window:id,hour:s.hour,scene:s.scenes,selected,reason});};
  if(spec.protected){record(null,'protected');return null;}
  const first=due(s).find(p=>p.mode!=='summary');
  if(first){
    const nodeId=first.channels.includes(s.channel)?first.eventId:first.fallbackEventId;
    if(!nodeId)throw new Error('承诺缺少可送达的替代渠道。');
    first.status='delivered';charge(s,true);record(first.id,'commitment');
    return {id:first.id,nodeId,kind:'commitment' as const,role:first.role};
  }
  if(!allowNew){record(null,'no-new-encounters');return null;}
  if(s.budgets[s.phase].spent+s.budgets[s.phase].expired>=s.budgets[s.phase].limit){record(null,'budget');return null;}
  const pool=m.encounters.filter(e=>!s.seen.includes(e.id)&&e.phases.includes(s.phase)&&e.channels.includes(s.channel)&&(e.requiresFlags??[]).every(f=>flags[f])&&!(e.excludesFlags??[]).some(f=>flags[f]));
  if(!pool.length){record(null,'no-candidate');return null;}
  if(random(s)>=spec.chance){record(null,'quiet');return null;}
  const total=pool.reduce((n,e)=>n+e.weight,0),pick=random(s)*total;let weight=0;
  const selected=pool.find(e=>(weight+=e.weight)>pick)!;
  s.seen.push(selected.id);charge(s,false);record(selected.id,'encounter');
  return {id:selected.id,nodeId:selected.nodeId,kind:'encounter' as const,role:selected.role};
}
/** Explicit handling obeys the same queue and actual availability as automatic delivery. */
export function deliverBeforeJump(s:Schedule,m:SchedulerManifest,promiseId:string) {
  const p=s.commitments.find(p=>p.id===promiseId&&p.status==='pending'&&p.mode==='choice');
  if(!p)throw new Error('这项回应已不在待办中。');
  if(due(s).find(q=>q.mode!=='summary')?.id!==p.id)throw new Error('请先处理期限更早的回信。');
  if(p.dueHour>s.hour||p.dueScene>s.scenes)throw new Error('对方尚未提供可回应的事项。');
  const nodeId=p.channels.includes(s.channel)?p.eventId:p.fallbackEventId;
  if(!nodeId)throw new Error('承诺缺少可送达的替代渠道。');
  setPhase(s,m,s.phase,s.channel);p.status='delivered';charge(s,true);
  const id=`inbox:${p.id}`;s.processed.push(id);s.decisions.push({window:id,hour:s.hour,scene:s.scenes,selected:p.id,reason:'explicit-response'});
  return {id:p.id,nodeId,kind:'commitment' as const,role:p.role};
}

/** Authored continuous scenes are not a player choice to miss an appointment.
 * Keep the response window open until the next safe opportunity; record the delay.
 * Explicit waiting uses jump(), which never grants this protection.
 */
export function advanceClock(s:Schedule,hours:number) {
  const target=s.hour+hours;
  for(const p of s.commitments)if(p.status==='pending'&&p.deadlineHour!==undefined&&p.deadlineHour<target){
    p.deferredHours+=target-p.deadlineHour;p.deadlineHour=target;
  }
  s.hour=target;
}

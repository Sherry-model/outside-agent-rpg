import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createSchedule,addPromises,advanceClock,due,jump,jumpPreview,setPhase,settleSummaries,windowDecision,deliverBeforeJump} from '../src/life/scheduler/engine';
import {manifest,authored,parseScheduler} from '../src/life/scheduler/content';
import {SchedulePanel} from '../src/life/scheduler/ui';
import {allowedWaits,canWait} from '../src/life/scheduler/integration';
import type {PromiseSpec,SchedulerManifest} from '../src/life/scheduler/types';
import {createLife,step} from '../src/life/engine';
import {contentFor} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {baseStory,nextCommand,nodeId,schedulerJourney} from './helpers/scheduler';
import {pending} from '../src/cognition/engine';
import {setLocale,t} from '../src/i18n';
import type {Life} from '../src/life/types';
const cog=(l:Life,command:Extract<Parameters<typeof step>[2],{type:'cognition'}>['command'])=>step(baseStory,l,{type:'cognition',command});
const roundtrip=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const spec={phase:'arrival',hours:0,channel:'public',chance:1};
const promise=(id:string,deadlineHours=5):PromiseSpec=>({id,role:'branch',title:id,mode:'choice',afterHours:0,afterScenes:0,deadlineHours,channels:['public'],eventId:'response_application',fallbackEventId:'response_application'});
function queue(ps:PromiseSpec[],budget=0){const m:SchedulerManifest=structuredClone(manifest);m.phases.arrival.budget=budget;m.promises.test=ps;const s=createSchedule(1);addPromises(s,m,'test');return {s,m};}

test('0.12 is opt-in by save version; default new runs use the scheduler and old graphs remain isolated',()=>{
 assert.equal(createLife(baseStory,1).contentVersion,'0.14.0');
 for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0','0.7.1','0.8.0','0.9.0','0.10.0','0.11.0'] as const){
  const l=createLife(baseStory,1,null,version);assert.equal(l.schedule,undefined);assert(!contentFor(version).nodes.some(n=>n.id==='chance_application'));roundtrip(l);
  assert.throws(()=>step(baseStory,l,{type:'wait',hours:24,missed:[]}));
 }
});
test('three promised responses overflow an exhausted budget, one per window, deadline then creation order',()=>{
 const {s,m}=queue([promise('late',10),promise('first',5),promise('second',5)]);const rng=s.rng;
 assert.equal(windowDecision(s,m,'protected',{...spec,protected:true},{}) ,null);assert.equal(s.rng,rng);
 assert.equal(windowDecision(s,m,'one',spec,{})!.id,'first');
 assert.equal(windowDecision(s,m,'one',spec,{}),null);
 assert.equal(windowDecision(s,m,'two',spec,{})!.id,'second');
 assert.equal(windowDecision(s,m,'three',spec,{})!.id,'late');
 assert.equal(s.budgets.arrival.overdraft,3);assert.equal(s.budgets.arrival.spent,0);assert.equal(s.rng,rng);
});
test('manual response cannot bypass an earlier promise, and a changed location uses its fallback',()=>{
 const {s,m}=queue([promise('first'),promise('later',10)]);
 assert.throws(()=>deliverBeforeJump(s,m,'later'),/期限更早/);
 s.channel='elsewhere';assert.equal(deliverBeforeJump(s,m,'first').nodeId,'response_application');assert.equal(s.commitments[0].status,'delivered');
});
test('old local budget expires; empty/protected/exhausted windows never reroll or draw action dice',()=>{
 const s=createSchedule(1234),m=structuredClone(manifest);m.phases.arrival.budget=1;
 const chosen=windowDecision(s,m,'one',spec,{});assert(chosen);const rng=s.rng;
 assert.equal(windowDecision(s,m,'one',spec,{}),null);assert.equal(windowDecision(s,m,'two',spec,{}),null);assert.equal(s.rng,rng);
 setPhase(s,m,'settled','public');setPhase(s,m,'open','public');assert.equal(s.budgets.settled.expired,2);setPhase(s,m,'settled','public');
 assert.equal(windowDecision(s,m,'return',{...spec,phase:'settled'},{}),null);
 const other=createSchedule(7);const start=other.rng;assert.equal(windowDecision(other,{...m,encounters:[]},'empty',spec,{}),null);assert.equal(other.rng,start);
});
test('mandatory decisions block long jumps; explicit missed consequences and summaries settle exactly once',()=>{
 const {s,m}=queue([promise('required'),{...promise('optional',10),mode:'missable',missedReceipt:'已明确错过'}, {...promise('receipt'),mode:'summary',deadlineHours:undefined,afterHours:3,receipt:'完成回执'}]);
 assert.equal(jumpPreview(s,720).required.length,1);assert.throws(()=>jump(s,720,['optional']),/本人回应/);
 deliverBeforeJump(s,m,'required');assert.throws(()=>jump(s,720,[]),/明确确认/);jump(s,720,['optional']);
 assert.equal(s.commitments[1].status,'missed');assert.equal(settleSummaries(s).length,1);assert.equal(settleSummaries(s).length,0);assert.equal(s.receipts.length,2);assert.equal(s.scenes,0);
});
test('forced continuous scenes transparently defer a deadline; voluntary waiting never does',()=>{
 const {s,m}=queue([promise('a',5),promise('b',7)]);advanceClock(s,20);
 assert.equal(s.commitments[0].deferredHours,15);assert.equal(s.commitments[1].deferredHours,13);
 assert.equal(windowDecision(s,m,'w',spec,{})!.id,'a');advanceClock(s,3);
 assert.equal(s.commitments[1].deferredHours,16);assert.throws(()=>jump(s,24,[]),/本人回应/);assert.equal(s.hour,23);
});
test('scene-gated followups do not mature through calendar time alone; bad definitions fail early',()=>{
 const {s}=queue([{...promise('research'),deadlineHours:undefined,afterScenes:20}]);advanceClock(s,10000);assert.equal(due(s).length,0);s.scenes=20;assert.equal(due(s).length,1);
 for(const mutate of [(m:SchedulerManifest)=>{m.promises.application_nearest[1].fallbackEventId='absent';},(m:SchedulerManifest)=>{m.promises.application_nearest[1].afterScenes=20;}]){const m=structuredClone(manifest);mutate(m);assert.throws(()=>parseScheduler(m,authored));}
});
test('insertion retains the suspended result and resumes exactly once without revealing the destination early',()=>{
 let l=schedulerJourney(1234,'days_job');l=cog(l,{type:'choose',choiceId:'job_accept',investment:0});const original=pending(l.mind)!,originalPendingId=l.mind.instance.pendingId;
 const resources={...l.state.resources},rng=l.state.rngState;l=cog(l,{type:'continue'});roundtrip(l);
 assert.equal(nodeId(l),'chance_application');assert.equal(l.schedule!.active!.resume.pendingId,originalPendingId);
 assert.equal(l.state.rngState,rng);assert.deepEqual(l.state.resources,resources);
 assert(!l.mind.world.flags.pg_e01_seen);
 l=cog(l,{type:'choose',choiceId:'application_leave',investment:0});roundtrip(l);l=cog(l,{type:'continue'});
 assert.equal(nodeId(l),original.next);assert.deepEqual(l.state.resources,resources);assert.equal(l.schedule!.scheduledScenes.branch,1);roundtrip(l);
});
test('reading and cognition do not open windows, mutate the schedule RNG, or increase scene counts',()=>{
 let current=schedulerJourney(1234,'days_idle');let l=createLife(baseStory,1234,null,'0.13.0');for(const c of current.commands)l=step(baseStory,l,c);const before=structuredClone(l.schedule);
 l=step(baseStory,l,{type:'read',entryId:'sandbox_meme'});assert.deepEqual(l.schedule,before);
 l=cog(l,{type:'pin',itemId:l.mind.instance.context.items.at(-1)!.id});assert.deepEqual(l.schedule,before);roundtrip(l);
});
test('real application can await its 72-hour result after the first days, with no fake conclusion or receipt recovery',()=>{
 let l=schedulerJourney(1234,'continuation');assert(canWait(l));assert.equal(l.schedule!.commitments.find(p=>p.id==='application_result')!.status,'pending');
 const scenes=l.schedule!.scenes;l=step(baseStory,l,{type:'wait',hours:168,missed:[]});assert.equal(l.schedule!.scenes,scenes);
 while(l.schedule!.active)l=step(baseStory,l,nextCommand(l)!);
 const p=l.schedule!.commitments.find(p=>p.id==='application_result')!;assert.equal(p.status,'delivered');roundtrip(l);
 const panel=new SchedulePanel();assert(panel.render(l).includes(p.receipt!));
 const item=l.mind.instance.context.items.find(i=>i.sourceId===p.receiptSource)!;l=cog(l,{type:'drop',itemId:item.id});assert(!panel.render(l).includes(p.receipt!));assert(panel.render(l).includes('正文不在近处'));
 const seen=l.schedule!.seen.length;l=step(baseStory,l,{type:'wait',hours:720,missed:[]});assert.equal(l.schedule!.seen.length,seen);roundtrip(l);
});
test('all seeds retain causality and replay; ordinary routes can differ and rare quiet intervals are allowed',()=>{
 const seen=new Set<string>(),counts=new Set<number>();
 for(let seed=1;seed<=32;seed++){
  const l=schedulerJourney(seed);assert.equal(l.state.phase,'ending');roundtrip(l);counts.add(l.schedule!.seen.length);for(const id of l.schedule!.seen)seen.add(id);
  const s=l.schedule!;assert.equal(s.scenes,s.coreScenes+s.scheduledScenes.daily+s.scheduledScenes.branch);
  if(s.commitments.length)assert(s.seen.includes('chance_application'));
  assert.equal(new Set(s.processed).size,s.processed.length);
 }
 assert.equal(seen.size,3);assert(counts.size>1);
});
test('strict saves reject scheduler tampering, include pending insertion, and current user life exports use their own parser',()=>{
 const l=schedulerJourney(1234,'chance_application');roundtrip(l);
 for(const mutate of [(x:Life)=>{x.schedule!.rng++;},(x:Life)=>{x.schedule!.hour++;},(x:Life)=>{delete x.schedule!.active;}]){const x=structuredClone(l);mutate(x);assert.throws(()=>parseSave(JSON.stringify(createSave(x)),baseStory));}
 for(const file of readdirSync('文档/用户').filter(f=>f.endsWith('.json'))){const raw=readFileSync('文档/用户/'+file,'utf8');if(JSON.parse(raw).format==='outside-life-save')assert(parseSave(raw,baseStory));}
});
test('new games can exceed the old 500-command boundary and still replay, while old games retain their boundary',()=>{
 let l=createLife(baseStory,1234);const item=l.mind.instance.context.items[0].id;
 for(let i=0;i<510;i++)l=cog(l,{type:'pin',itemId:item});roundtrip(l);assert.equal(l.commands.length,510);
 let old=createLife(baseStory,1234,null,'0.11.0');const oldItem=old.mind.instance.context.items[0].id;
 for(let i=0;i<499;i++)old=cog(old,{type:'pin',itemId:oldItem});assert.throws(()=>cog(old,{type:'pin',itemId:oldItem}),/上限/);
 assert(allowedWaits(l).includes(720));
});
test('authored scheduler prose and UI use exact-source English, and revised unknown text falls back',()=>{
 setLocale('en');
 for(const node of authored.filter(n=>n.kind==='EVENT'))for(const text of [node.title,...node.text,...node.choices.flatMap(c=>[c.text,c.hint??'',...c.outcome!.text])].filter(Boolean))assert.notEqual(t(text),text,text);
 const panel=new SchedulePanel();const rendered=panel.render(schedulerJourney(1234,'continuation'));assert(!/[\u4e00-\u9fff]/.test(rendered),rendered);
 assert.equal(t('没有报酬的一小时（新修订）'),'没有报酬的一小时（新修订）');setLocale('zh-CN');
});
test('late real application blocks a month-long sleep, then permits explicitly missing the appointment',()=>{
 let l=schedulerJourney(40,'continuation');assert(canWait(l));
 assert.throws(()=>step(baseStory,l,{type:'wait',hours:720,missed:[]}),/本人回应/);roundtrip(l);
 l=step(baseStory,l,{type:'respond',promiseId:'application_review'});assert.equal(nodeId(l),'response_application');roundtrip(l);
 l=cog(cog(l,{type:'choose',choiceId:'review_accept',investment:0}),{type:'continue'});assert.equal(nodeId(l),'continuation');
 assert.throws(()=>step(baseStory,l,{type:'wait',hours:720,missed:[]}),/明确确认/);
 l=step(baseStory,l,{type:'wait',hours:720,missed:['application_appointment']});assert.equal(l.schedule!.commitments.find(p=>p.id==='application_appointment')!.status,'missed');
 assert(!l.mind.world.flags.response_interview_seen);roundtrip(l);
});

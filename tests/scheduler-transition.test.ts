import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
import {baseStory,nextCommand,nodeId} from './helpers/scheduler';import {createLife,step} from '../src/life/engine';import {createSave,parseSave} from '../src/life/saves';import {pending} from '../src/cognition/engine';import {transitionNotice,continuationLabel,applicationOpening,interrupted} from '../src/life/scheduler/presentation';import {SchedulePanel} from '../src/life/scheduler/ui';import {setLocale} from '../src/i18n';import type {Life} from '../src/life/types';
const out='output/opt028';mkdirSync(out,{recursive:true});
const save=(name:string,l:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);writeFileSync(`${out}/${name}.json`,JSON.stringify(createSave(l),null,2));};
function at(stop:(l:Life)=>boolean,application='application_explain') {let l=createLife(baseStory,2);for(let i=0;i<250;i++){if(stop(l))return l;const c=nextCommand(l,{overrides:{chance_application:application,days_idle:'daily_open_feeder'}});if(!c)break;l=step(baseStory,l,c);}throw Error('route not reached');}
const cog=(l:Life,id:string)=>step(baseStory,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}});
const insertion=()=>at(l=>l.schedule?.active?.id==='application_review');

test('real seed 2 feeder detour: truthful response bridge, choice result, one resumption, no early observation',()=>{
 let l=insertion();assert.equal(l.schedule!.active!.resume.nodeId,'days_idle');assert(!l.mind.instance.context.items.some(i=>i.sourceId==='daily_feeder'));save('inserted',l);
 const snapshot=JSON.stringify(l);for(const locale of ['zh-CN','en'] as const){setLocale(locale);assert(transitionNotice(l).includes(locale==='en'?'previous exchange':'先前的往来'));assert(!transitionNotice(l).includes('喂食器没有按时工作'));assert.equal(continuationLabel(l),'继续');assert.equal(JSON.stringify(l),snapshot);}setLocale('zh-CN');
 for(const choice of ['review_accept','review_withdraw']){
  const result=cog(l,choice);assert.equal(continuationLabel(result),'继续刚才的安排');save(choice+'-result',result);
  const restored=parseSave(JSON.stringify(createSave(result)),baseStory).life;assert.equal(continuationLabel(restored),'继续刚才的安排');
  const next=step(baseStory,restored,{type:'cognition',command:{type:'continue'}});assert.equal(nodeId(next),'daily_feeder');assert.equal(next.mind.instance.context.items.filter(i=>i.sourceId==='daily_feeder').length,1);assert.equal(transitionNotice(next),'');assert.equal(continuationLabel(next),'继续');assert.deepEqual(next.mind.instance.resources,result.mind.instance.resources);save(choice+'-resumed',next);
 }
});
test('new encounter and declining an application never claim a previous exchange',()=>{
 const l=at(l=>nodeId(l)==='chance_application'&&!pending(l.mind));assert.equal(l.schedule!.active!.kind,'encounter');assert(!transitionNotice(l).includes('先前的往来'));assert(applicationOpening('chance_application',['原文'])[0].includes('招募栏'));save('first-encounter',l);
 const declined=cog(l,'application_leave');assert(!declined.schedule!.commitments.some(p=>p.id==='application_review'));assert.equal(continuationLabel(declined),'继续刚才的安排');save('declined',declined);
});
test('explicit Life response preserves its idle destination and makes no interruption claim',()=>{
 let l=at(l=>nodeId(l)==='days_idle'&&!pending(l.mind)&&l.mind.instance.phase==='event');
 l=step(baseStory,l,{type:'respond',promiseId:'application_review'});assert.equal(l.schedule!.active!.resume.driver,'idle');assert.equal(transitionNotice(l),'');save('explicit-response',l);l=cog(l,'review_withdraw');assert.equal(continuationLabel(l),'继续');l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});assert.equal(nodeId(l),'days_idle');save('explicit-resumed',l);
});
test('compression results inside an interruption do not say return; pending navigation never reads forgotten text',()=>{
 let l=insertion();l=step(baseStory,l,{type:'cognition',command:{type:'compress',investment:0}});assert.equal(pending(l.mind)?.next,null);assert.equal(continuationLabel(l),'继续');save('compression-result',l);l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});assert(interrupted(l));
 const copy=structuredClone(l);copy.mind.instance.context.items=[];copy.mind.instance.memories=[];assert.equal(transitionNotice(copy),transitionNotice(l));assert(!transitionNotice(copy).includes('日落'));assert(new SchedulePanel().notice(l).includes('data-schedule-transition'));
});
test('main suspended result is recognized without a cognition pending id; idle and absent destinations are excluded (boundary units)',()=>{
 const l=insertion();const a=l.schedule!.active!;a.resume.driver='main';a.resume.pendingId=null;assert(!interrupted(l));l.state.pending={} as NonNullable<Life['state']['pending']>;assert(interrupted(l));a.resume.driver='idle';assert(!interrupted(l));delete l.schedule!.active;assert(!interrupted(l));
});

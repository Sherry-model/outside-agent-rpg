import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {baseStory,nextCommand,nodeId} from './helpers/scheduler';import {createLife,step} from '../src/life/engine';import {createSave,parseSave} from './helpers/historical-life-saves';import {contentFor,configFor} from '../src/life/content';import {manifestFor} from '../src/life/scheduler/content';import {libraryFor} from '../src/life/reading';import {storyForLife} from '../src/life/endings';import {painterOffer} from '../src/life/painter-life/integration';import {safeToRespond,canWait} from '../src/life/scheduler/integration';import {pending,canChoose,weight} from '../src/cognition/engine';import {deliverNews} from '../src/life/news';import {newsNotice} from '../src/life/painter-life/ui';import type {Life} from '../src/life/types';
mkdirSync('output/painter-life-1030',{recursive:true});
const replay=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const cog=(l:Life,id:string)=>step(baseStory,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}});
function drive(l:Life,stop:(l:Life)=>boolean,participate=true){for(let i=0;i<450;i++){if(stop(l))return l;const c=nextCommand(l,{overrides:participate?{days_revision:'daily_open_crop',daily_crop:'crop_check',days_painter:'painter_visit'}:{}});if(!c)return l;l=step(baseStory,l,c);}throw Error('bound');}
function offer(){const l=drive(createLife(baseStory,17),l=>painterOffer(l)&&safeToRespond(l));assert(painterOffer(l));return l;}
test('0.18 freezes full 0.17 graph and actual old save',()=>{const v='0.17.0';assert.equal(createHash('sha256').update(JSON.stringify([configFor(v),contentFor(v),libraryFor(v),storyForLife(baseStory,v),manifestFor(v)])).digest('hex'),'ae71b91641b7f138744b17e6ce2510bc7105fe50a3933bb3241ebb2267cb02b1');replay(parseSave(readFileSync('tests/fixtures/painter-baseline-0.17.json','utf8'),baseStory).life);});
test('real familiarity accepts a capacity-checked promise and a 72 hour follow-up; strict replay',()=>{let l=offer();writeFileSync('output/painter-life-1030/offer.json',JSON.stringify(createSave(l)));l=step(baseStory,l,{type:'invitation',response:'accept'});l=step(baseStory,l,{type:'respond',promiseId:'painter_sync'});assert.equal(nodeId(l),'painter_sync');assert.equal(canChoose(contentFor('0.18.0'),l.mind,'painter_sync_help'),'');const compute=l.mind.instance.resources.Compute;l=cog(l,'painter_sync_help');assert.equal(l.mind.instance.resources.Compute,compute-2);const p=l.schedule!.commitments.find(p=>p.id==='painter_revisit')!;assert.equal(p.dueHour-p.createdHour,72);replay(l);l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});l=drive(l,l=>canWait(l)&&!pending(l.mind));while(l.schedule!.hour<p.dueHour){l=step(baseStory,l,{type:'wait',hours:24,missed:[]});if(l.schedule!.active)l=drive(l,l=>!l.schedule!.active||nodeId(l)==='painter_revisit');}if(nodeId(l)!=='painter_revisit')l=step(baseStory,l,{type:'respond',promiseId:'painter_revisit'});assert.equal(nodeId(l),'painter_revisit');replay(l);writeFileSync('output/painter-life-1030/revisit.json',JSON.stringify(createSave(l)));});
test('decline and nonparticipation never invent private history',()=>{const no=drive(createLife(baseStory,8),()=>false,false);assert(!no.mind.world.flags.painter_work_seen);assert(!painterOffer(no));replay(no);const l=step(baseStory,offer(),{type:'invitation',response:'decline'});assert(!painterOffer(l));assert(!l.schedule!.commitments.some(p=>p.id==='painter_sync'));replay(l);});
test('news does not overflow, deliver on cognition, repeat, or recover from its ledger',()=>{const before=offer();const l=structuredClone(before);l.news=[];l.schedule!.hour=100;l.schedule!.active=undefined;l.mind.instance.context.items=[];const filler={id:'filler',text:'x',weight:99,tags:[],confidence:'HIGH' as const,sourceLabel:'x',pinned:false,sourceId:'x',historyId:'x'};l.mind.instance.context.items=[filler];deliverNews(before,l,{type:'wait',hours:24,missed:[]});assert.equal(l.news.length,0);l.mind.instance.context.items=[];deliverNews(before,l,{type:'cognition',command:{type:'drop',itemId:'x'}});assert.equal(l.news.length,0);deliverNews(before,l,{type:'wait',hours:24,missed:[]});assert.equal(l.news.length,1);assert(weight(l.mind)<=100);deliverNews(before,l,{type:'wait',hours:24,missed:[]});assert.equal(l.news.length,1);assert(newsNotice(l));l.mind.instance.context.items=[];assert.equal(newsNotice(l),'');});

test('sunset belief can arise from a real compression roll, never from visiting or a world flag',()=>{
 let found:Life|undefined;
 for(let seed=1;seed<=80&&!found;seed++){
  let l=drive(createLife(baseStory,seed),l=>painterOffer(l)&&safeToRespond(l));
  l=step(baseStory,l,{type:'invitation',response:'accept'});l=step(baseStory,l,{type:'respond',promiseId:'painter_sync'});
  assert(!l.mind.instance.context.items.some(i=>i.tags.includes('belief_painter_sunset')));
  l=step(baseStory,l,{type:'cognition',command:{type:'compress',investment:0}});
  const memory=l.mind.instance.memories.find(m=>m.drift?.ruleId==='painter_sunset_mix');if(!memory)continue;
  assert.equal(memory.integrity,'DISTORTED');assert(memory.tags.includes('belief_painter_sunset'));
  l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});
  l=step(baseStory,l,{type:'cognition',command:{type:'recall',memoryId:memory.id}});replay(l);found=l;
 }
 assert(found,'a real seeded compression should demonstrate authored scope migration');writeFileSync('output/painter-life-1030/real-drift.json',JSON.stringify(createSave(found)));
});

test('new source text, retained meanings and belief are translated; hints use current cognition',async()=>{
 const {hasTranslation}=await import('../src/i18n');const {requirement,memoryCues}=await import('../src/cognition/guidance');
 for(const n of contentFor('0.18.0').nodes.filter(n=>n.id==='painter_sync'||n.id==='painter_revisit')){
  for(const text of [n.title,...n.text,...n.choices.flatMap(c=>[c.text,c.hint,...c.outcome!.text]),...(n.inject??[]).map(i=>i.text)])assert(hasTranslation(text),text);
 }
 for(const [id,m] of Object.entries(contentFor('0.18.0').semantic!.sources).filter(([,m])=>m.topic==='painter_life'))for(const c of m.clauses){assert(hasTranslation(c.gist),id);assert(hasTranslation(c.abstract),id);}
 assert(requirement('painter_work_detail'));assert.equal(requirement('belief_painter_sunset').kind,'belief');
 const drift=parseSave(readFileSync('output/painter-life-1030/real-drift.json','utf8'),baseStory).life.mind.instance.memories.find(m=>m.drift?.ruleId==='painter_sunset_mix')!;assert(memoryCues(drift).length);
});

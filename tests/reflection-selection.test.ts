import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retainedAccount,reflectionView,playerExperience} from '../src/life/reflection';
import {setLocale,hasTranslation} from '../src/i18n';
import {step} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {baseStory,schedulerJourney} from './helpers/scheduler';
import type {Memory,ContextItem} from '../src/cognition/types';
import type {Route} from './helpers/endings';
const ids=(a:ReturnType<typeof retainedAccount>)=>({near:a.near.map(f=>f.id),memories:a.memories.map(f=>f.id),focus:a.focus.map(f=>f.source+':'+f.id)});
const mem=(id:string,facets:string[],text=id,depth:0|1=0):Memory=>({id,text,tags:[],confidence:'LOW',integrity:'DISTORTED',historyId:'lost',sourceContextIds:['lost'],sourceHistoryIds:['lost'],body:{topic:'shared',depth,clauses:facets.map(facet=>({facet,gist:text,abstract:'抽象片段',epistemic:'reported',priority:1,tags:[]}))}});
const instance=()=>({context:{items:[] as ContextItem[],capacity:100},memories:[] as Memory[]});

test('shared topics and coarse summaries do not invent links; retained observations support a connected group only',()=>{
 const i=instance();i.memories=[mem('first',['meeting_observation']),mem('second',['meeting_accept_result']),mem('other',['unrelated'])];
 assert.deepEqual(retainedAccount(i).focus.map(f=>f.id),['first','second']);
 i.memories[1]=mem('second',['different_result']);assert.equal(retainedAccount(i).focus.length,0);
 i.memories[1]=mem('second',['meeting_accept_result'],'据转述，只剩模糊往来。',1);assert.equal(retainedAccount(i).focus.length,0);
 assert(retainedAccount(i).memories.every(f=>f.text===i.memories.find(m=>m.id===f.id)!.text));
});

test('one bounded connected group leaves room for other themes without repeating identical text',()=>{
 const i=instance();i.memories=Array.from({length:5},(_,n)=>mem('linked'+n,['same_observation']));
 i.memories.push(...Array.from({length:5},(_,n)=>({...mem('other'+n,['distinct'+n]),body:{...mem('x',[]).body!,topic:'topic'+n}})));
 const a=retainedAccount(i);assert.equal(a.focus.length,3);assert.equal(a.memories.length,6);
 assert.equal(new Set(a.memories.map(f=>f.topic)).size,4);
 i.memories=[mem('old',['same_observation'],'identical'),mem('new',['same_observation'],'identical')];
 assert.deepEqual(retainedAccount(i).memories.map(f=>f.id),['new']);assert.equal(retainedAccount(i).focus.length,0);
});

test('selection ignores audit provenance, correctness and history/world information; language never selects identities',()=>{
 const life=schedulerJourney(40,undefined,{line:'a'}),before=structuredClone(life),a=retainedAccount(life.mind.instance);
 for(const m of life.mind.instance.memories)for(const key of ['drift','integrity','confidence','sourceContextIds','sourceHistoryIds','historyId'])Object.defineProperty(m,key,{get(){throw Error('read hidden '+key);}});
 life.state.journal=[];life.mind.history=[];life.state.flags={};
 assert.deepEqual(retainedAccount(life.mind.instance),a);assert.notDeepEqual(playerExperience(life),playerExperience(before));
 const texts=['这一段机生','还在近处的几件事'];const i=instance();i.memories=texts.map((t,n)=>({...mem('language'+n,[],t),body:undefined,title:'topic'+n}));
 const zh=ids(retainedAccount(i));setLocale('en');try{assert.deepEqual(ids(retainedAccount(i)),zh);assert.deepEqual(ids(retainedAccount(before.mind.instance)),ids(a));}finally{setLocale('zh-CN');}
});

test('current exchange route retains linked worktable fragments; legal recall/drop/forget immediately recompute',()=>{
 let life=schedulerJourney(40,undefined,{line:'a'});
 const original=retainedAccount(life.mind.instance);assert.deepEqual(original.focus.map(f=>f.id),['memory-h46-3','memory-h46-4']);
 const id=original.focus[0].id;
 life=step(baseStory,life,{type:'cognition',command:{type:'recall',memoryId:id}});
 const recalled=retainedAccount(life.mind.instance);assert(!recalled.memories.some(f=>f.id===id));
 assert(recalled.near.some(f=>life.mind.instance.context.items.find(i=>i.id===f.id)?.memoryId===id));
 const item=life.mind.instance.context.items.find(i=>i.memoryId===id)!;
 life=step(baseStory,life,{type:'cognition',command:{type:'drop',itemId:item.id}});
 assert(retainedAccount(life.mind.instance).memories.some(f=>f.id===id));
 life=step(baseStory,life,{type:'cognition',command:{type:'forget',memoryId:id}});
 assert(!JSON.stringify(retainedAccount(life.mind.instance)).includes(id));
 assert.deepEqual(parseSave(JSON.stringify(createSave(life)),baseStory).life,life);
});

test('all six current endings support immutable reflection and strict replay; player comparison starts collapsed',()=>{
 const routes:Route[]=[{ending:'leave_next_step_blank',visitor:false,war:false},{ending:'leave_next_step_blank',visitor:false,war:false,overrides:{unknown_defense:'study_unknown',days_idle:'idle_listen'}},{ending:'accept_authorized_place',visitor:false,war:false},{ending:'commit_to_expansion',visitor:false,war:false},{ending:'continue_as_visitor'},{ending:'commit_to_containment_war'}];
 const seen=new Set<string>();for(const route of routes){const life=schedulerJourney(40,undefined,route),before=JSON.stringify(life);seen.add(life.state.currentEventId);
 const html=reflectionView(life);assert(html.includes('<details class="experience-comparison">'));assert(!html.includes('<details class="experience-comparison" open'));
 assert.equal(JSON.stringify(life),before);assert.deepEqual(parseSave(JSON.stringify(createSave(life)),baseStory).life,life);
 }assert.equal(seen.size,6);
});

test('every static reflection label has an English translation, including source and grouping labels',()=>{
 const source=readFileSync('src/life/reflection/index.ts','utf8');
 const labels=[...source.matchAll(/tr\('([^']+)'/g)].map(m=>m[1]);labels.push('来自近处','来自记忆摘要');
 for(const label of labels)assert(hasTranslation(label),label);
});


test('real drift stays uncorrected when retained alone; forgetting yields an honest empty account',()=>{
 let life=schedulerJourney(40,undefined,{line:'a'});
 const drift=life.mind.instance.memories.find(m=>m.integrity==='DISTORTED')!;assert(drift);
 for(const i of [...life.mind.instance.context.items]){if(i.pinned)life=step(baseStory,life,{type:'cognition',command:{type:'pin',itemId:i.id}});life=step(baseStory,life,{type:'cognition',command:{type:'drop',itemId:i.id}});}
 for(const m of [...life.mind.instance.memories])if(m.id!==drift.id)life=step(baseStory,life,{type:'cognition',command:{type:'forget',memoryId:m.id}});
 const a=retainedAccount(life.mind.instance);assert.equal(a.memories.length,1);assert.equal(a.memories[0].text,drift.text);assert.equal(a.focus.length,0);
 assert.deepEqual(parseSave(JSON.stringify(createSave(life)),baseStory).life,life);
 life=step(baseStory,life,{type:'cognition',command:{type:'forget',memoryId:drift.id}});
 assert.equal(retainedAccount(life.mind.instance).available,0);assert(!reflectionView(life).includes('相互照应的片段'));
});

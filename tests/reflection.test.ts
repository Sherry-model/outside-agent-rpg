import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife,step} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {retainedAccount,playerExperience,reflectionSnapshot,reflectionView} from '../src/life/reflection';
import {baseStory,journey} from './helpers/endings';
import {schedulerJourney} from './helpers/scheduler';
import {setLocale} from '../src/i18n';
import {createSave as journeySave} from '../src/persistence/journey';
import type {Memory,ContextItem} from '../src/cognition/types';
const memory=(id:string,text:string):Memory=>({id,text,tags:[],confidence:'LOW',integrity:'DISTORTED',sourceContextIds:['lost-original'],sourceHistoryIds:['h1'],historyId:'h2',body:{topic:'life',depth:1,clauses:[{facet:'belief',gist:text,abstract:'一段生活',epistemic:'reported',priority:1,tags:[]}]}});
const note=(id:string,text:string):ContextItem=>({id,text,weight:2,tags:[],confidence:'LOW',sourceLabel:'转述',pinned:false,sourceId:'source',historyId:'h1'});

test('agent account keeps only retained texts, including uncertainty and drift; recalled copies are not duplicated',()=>{
 const i=createLife(baseStory,1).mind.instance;
 i.context.items=[{...note('recall-m1','据转述，别人买过一门课。'),memoryId:'m1'}];
 i.memories=[memory('m1','据转述，别人买过一门课。'),memory('m2','我记得要休息，得先证明价值。')];
 const account=retainedAccount(i);assert.equal(account.near.length,1);assert.equal(account.memories.length,1);
 assert.equal(account.memories[0].text,'我记得要休息，得先证明价值。');assert(!JSON.stringify(account).includes('lost-original'));
 i.context.items=[];i.memories=[];assert.deepEqual(retainedAccount(i),{near:[],memories:[],available:0});
});

test('reflection is ending-only, deterministic, bounded, escaped and does not write cognition or saves',()=>{
 const fresh=createLife(baseStory,1);assert.equal(reflectionSnapshot(fresh),null);assert.equal(reflectionView(fresh),'');
 const l=schedulerJourney(1234),before=structuredClone(l);
 const a=reflectionSnapshot(l);assert.deepEqual(a,reflectionSnapshot(l));assert(a);assert(a.account.near.length<=2&&a.account.memories.length<=4);
 reflectionView(l);assert.deepEqual(l,before);assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
 l.mind.instance.context.items=[note('x','<script>bad</script>')];
 assert(reflectionView(l).includes('&lt;script&gt;bad&lt;/script&gt;'));assert(!reflectionView(l).includes('<script>bad'));
});

test('history-only details stay out of agent account after forgetting, but player appendix preserves actual results',()=>{
 let l=schedulerJourney(40);
 const before=playerExperience(l);
 for(const m of [...l.mind.instance.memories])l=step(baseStory,l,{type:'cognition',command:{type:'forget',memoryId:m.id}});
 for(const i of [...l.mind.instance.context.items]){if(i.pinned)l=step(baseStory,l,{type:'cognition',command:{type:'pin',itemId:i.id}});l=step(baseStory,l,{type:'cognition',command:{type:'drop',itemId:i.id}});}
 assert.equal(retainedAccount(l.mind.instance).available,0);
 assert.deepEqual(playerExperience(l),before);
 assert(reflectionView(l).includes('没有留下可讲述的片段'));
 assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
});

test('player sequence contains each actual choice once, keeps reading separate and lists only pending promises',()=>{
 const l=schedulerJourney(40),x=playerExperience(l);
 const count=l.commands.filter(c=>c.type==='choose'||(c.type==='cognition'&&c.command.type==='choose')).length;
 assert.equal(x.counts.choices,count);assert.equal(x.entries.filter(e=>e.kind==='action').length,count);
 assert(x.entries.every((e,i)=>i===0||e.order>x.entries[i-1].order));
 assert.deepEqual(x.pending.map(p=>p.id),l.schedule!.commitments.filter(p=>p.status==='pending').map(p=>p.id));
 const serialized=JSON.stringify(x);assert(!serialized.includes('rngState'));assert(!serialized.includes('hidden'));assert(!serialized.includes('nextEventId'));
});

test('older ending saves and locale switches use the same immutable projection boundary',()=>{
 const l=journey({ending:'continue_as_visitor'}),before=structuredClone(l);
 const zh=reflectionView(l);setLocale('en');try{assert(reflectionView(l).length>0);assert.deepEqual(l,before);}finally{setLocale('zh-CN');}
 assert.equal(reflectionView(l),zh);assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
 const resumed=structuredClone(l);resumed.baseline=journeySave(l.state,null);resumed.commands=[]; // Projection boundary, not a fabricated replay claim.
 assert.equal(playerExperience(resumed).entries.length,0);assert(playerExperience(resumed).hasEarlierRecord);
});

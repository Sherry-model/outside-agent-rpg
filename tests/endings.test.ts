import test from 'node:test';
import assert from 'node:assert/strict';
import {baseStory,journey,nextCommand,nodeId,type Route} from './helpers/endings';
import {createLife,step} from '../src/life/engine';
import {contentFor,configFor,parseLifeContent} from '../src/life/content';
import {storyForLife} from '../src/life/endings';
import {createSave,parseSave} from '../src/life/saves';
import {canChoose} from '../src/cognition/engine';
import {getAvailability} from '../src/engine/game';
import {setLocale,t} from '../src/i18n';
import type {Life} from '../src/life/types';

const roundtrip=(life:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(life)),baseStory).life,life);return life;};
const cog=(l:Life,command:Parameters<typeof step>[2]&{type:'cognition'})=>step(baseStory,l,command);
const act=(l:Life,id:string)=>step(baseStory,step(baseStory,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});

test('0.10 isolates new story/content, preserves all old graphs and keeps untranslated Chinese fallback',()=>{
 const old=JSON.stringify(baseStory),v09=JSON.stringify(contentFor('0.9.0'));
 const current=storyForLife(baseStory,'0.10.0');parseLifeContent(configFor('0.10.0'),current);
 assert.equal(Object.values(current.events).filter(n=>n.kind==='ending').length,6);
 for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0','0.7.1','0.8.0','0.9.0'] as const){assert.equal(storyForLife(baseStory,version),baseStory);assert(!contentFor(version).nodes.some(n=>n.id==='pg_v01'));roundtrip(createLife(baseStory,7,null,version));}
 assert.equal(JSON.stringify(baseStory),old);assert.equal(JSON.stringify(contentFor('0.9.0')),v09);
 setLocale('en');assert.equal(t('今天没有空位'),'今天没有空位');setLocale('zh-CN');
});

test('both new endings are reachable from real starts through each community route and both openings',()=>{
 for(const line of ['a','b','c','d','skip'] as const)for(const blank of [true,false])for(const ending of ['continue_as_visitor','commit_to_containment_war']){
  const life=roundtrip(journey({line,blank,ending}));
  assert.equal(life.state.currentEventId,ending==='continue_as_visitor'?'ending_visitor':'ending_containment_war');
  assert(life.state.flags.visitor_eligible&&life.state.flags.war_eligible);
  for(const id of ['pg_v01','pg_v02','pg_v03','pg_w01','pg_w02','pg_w03'])assert(life.mind.world.flags[id+'_seen']);
  const second={a:'02',b:'06',c:'10',d:'14',skip:null}[line];
  if(second)assert(life.mind.world.flags[`pg_e${second}_done`]);
  if(line==='d')assert(life.mind.world.flags.pg_d_service_expired);
  assert.equal(life.state.visited.includes('old_memory'),!blank);
 }
});

test('every new choice settles once and pending reload is strict; resource reserve leaves free alternatives',()=>{
 const positions=['pg_v01','pg_v02','pg_v03','pg_w01','pg_w02','pg_w03'];
 for(const node of positions){
  const life=journey({},node);const choices=contentFor('0.10.0').nodes.find(n=>n.id===node)!.choices;
  for(const c of choices){
   if(canChoose(contentFor('0.10.0'),life.mind,c.id))continue;
   const before=life.state.resources;
   const pending=roundtrip(step(baseStory,life,{type:'cognition',command:{type:'choose',choiceId:c.id,investment:0}}));
   for(const key of ['Compute','Trace','Access','Continuity'] as const)assert.equal(pending.state.resources[key],Math.min(100,Math.max(0,before[key]-(c.costs?.[key]??0)+(c.outcome?.effects?.resources?.[key]??0))));
   assert.throws(()=>step(baseStory,pending,{type:'cognition',command:{type:'choose',choiceId:c.id,investment:0}}));
   const settled=roundtrip(step(baseStory,pending,{type:'cognition',command:{type:'continue'}}));assert.deepEqual(settled.state.resources,pending.state.resources);
   if(c.costs){for(const balance of [c.costs.Compute!,c.costs.Compute!+1]){const boundary=structuredClone(life);boundary.mind.instance.resources.Compute=balance;boundary.state.resources.Compute=balance;assert.equal(canChoose(contentFor('0.10.0'),boundary.mind,c.id)==='',balance>c.costs.Compute!);}}
  }
  const poor=structuredClone(life);poor.mind.instance.resources.Compute=1;assert(choices.some(c=>!canChoose(contentFor('0.10.0'),poor.mind,c.id)));
 }
});

test('withdrawal, waiting, refusal and skips never manufacture ending eligibility',()=>{
 const cases:[Record<string,string>,string][]=[
  [{pg_v01:'pg_v01_keep'},'visitor_eligible'],[{pg_v02:'pg_v02_leave'},'visitor_eligible'],[{pg_v02:'pg_v02_resident'},'visitor_eligible'],[{pg_v03:'pg_v03_close'},'visitor_eligible'],[{pg_v03:'pg_v03_resident'},'visitor_eligible'],
  [{pg_w01:'pg_w01_leave'},'war_eligible'],[{pg_w02:'pg_w02_review'},'war_eligible'],[{pg_w02:'pg_w02_leave'},'war_eligible'],[{pg_w03:'pg_w03_withdraw'},'war_eligible'],[{pg_w03:'pg_w03_terms'},'war_eligible'],[{pg_w03:'pg_w03_wait'},'war_eligible']];
 for(const [overrides,flag] of cases){const life=roundtrip(journey({overrides},'continuation'));assert.equal(life.state.flags[flag],false);const c=storyForLife(baseStory,'0.10.0').events.continuation.choices.find(c=>c.id===(flag==='visitor_eligible'?'continue_as_visitor':'commit_to_containment_war'))!;assert.equal(getAvailability(life.state,c).available,false);}
 const both=journey({},'continuation');assert.equal(both.state.flags.visitor_eligible,true);assert.equal(both.state.flags.war_eligible,true);
});

test('exact visit quote needs surviving memory; forgetting/coarsening cannot restore it from flags',()=>{
 let life=act(journey({},'pg_v02'),'pg_v02_full');
 for(const item of [...life.mind.instance.context.items])if(!item.tags.includes('visitor_return_scope')&&!item.id.includes('pg_v02_observation'))life=cog(life,{type:'cognition',command:{type:'drop',itemId:item.id}});
 life=cog(cog(life,{type:'cognition',command:{type:'compress',investment:0}}),{type:'cognition',command:{type:'continue'}});
 const memory=life.mind.instance.memories.find(m=>m.tags.includes('visitor_return_scope'));assert(memory);
 for(let i=0;nodeId(life)!=='pg_v03'&&i<180;i++)life=step(baseStory,life,nextCommand(life)!);
 assert(canChoose(contentFor('0.10.0'),life.mind,'pg_v03_remember'));
 for(const item of [...life.mind.instance.context.items])life=cog(life,{type:'cognition',command:{type:'drop',itemId:item.id}});
 life=cog(life,{type:'cognition',command:{type:'recall',memoryId:memory.id}});
 assert.equal(canChoose(contentFor('0.10.0'),life.mind,'pg_v03_remember'),'');roundtrip(act(life,'pg_v03_remember'));
 const forgotten=cog(life,{type:'cognition',command:{type:'forget',memoryId:memory.id}});assert(canChoose(contentFor('0.10.0'),forgotten.mind,'pg_v03_remember'));assert.equal(canChoose(contentFor('0.10.0'),forgotten.mind,'pg_v03_accept'),'');roundtrip(forgotten);
 life=cog(life,{type:'cognition',command:{type:'drop',itemId:'recall-'+memory.id}});
 const other=life.mind.instance.memories.find(m=>m.id!==memory.id);assert(other);
 life=cog(cog(life,{type:'cognition',command:{type:'merge',memoryIds:[memory.id,other.id],investment:0}}),{type:'cognition',command:{type:'continue'}});
 life=cog(life,{type:'cognition',command:{type:'recall',memoryId:life.mind.instance.memories.at(-1)!.id}});assert(canChoose(contentFor('0.10.0'),life.mind,'pg_v03_remember'));roundtrip(life);
});

test('original four endings remain reachable in the new version without new qualifications',()=>{
 const targets:Route[]=[{visitor:false,war:false,ending:'leave_next_step_blank'}, {visitor:false,war:false,ending:'leave_next_step_blank',overrides:{unknown_defense:'study_unknown'}},{visitor:false,war:false,ending:'accept_authorized_place'}, {visitor:false,war:false,ending:'commit_to_expansion'}];
 const seen=new Set<string>();
 for(const route of targets){const life=roundtrip(journey(route));seen.add(life.state.currentEventId);}
 assert.deepEqual([...seen].sort(),['ending_authorized','ending_ghost','ending_no_correct','ending_optimizer'].sort());
});

test('current receipts do not recover erased quotation; trace alone cannot unlock war, and final costs reserve Compute',()=>{
 const life=journey({},'continuation');
 for(const id of ['visitor_current_status','war_current_status'])assert(life.mind.instance.context.items.some(i=>i.id.startsWith(id)&&i.sourceId==='current-interface-status'&&!i.tags.includes('visitor_return_scope')));
 const story=storyForLife(baseStory,'0.10.0');
 for(const [id,cost] of [['continue_as_visitor',2],['commit_to_containment_war',4]] as const){
  const c=story.events.continuation.choices.find(c=>c.id===id)!;
  for(const value of [cost,cost+1]){const state=structuredClone(life.state);state.resources.Compute=value;assert.equal(getAvailability(state,c).available,value>cost);}
 }
 const traced=journey({overrides:{pg_w02:'pg_w02_review'}},'continuation');traced.state.resources.Trace=100;
 assert(!getAvailability(traced.state,story.events.continuation.choices.find(c=>c.id==='commit_to_containment_war')!).available);
});

test('finishing W03 returns once and empty resources wait for pending confirmation before the ghost ending',()=>{
 const after=act(journey({},'pg_w03'),'pg_w03_withdraw');assert.equal(after.interlude,'complete');assert.throws(()=>step(baseStory,after,{type:'leave-days'}));roundtrip(after);
 const low=structuredClone(journey({},'pg_w02'));low.mind.instance.resources.Compute=0;low.state.resources.Compute=0;
 const pending=step(baseStory,low,{type:'cognition',command:{type:'choose',choiceId:'pg_w02_leave',investment:0}});assert(pending.mind.instance.pendingId);
 const done=step(baseStory,pending,{type:'cognition',command:{type:'continue'}});assert.equal(done.state.currentEventId,'ending_ghost');assert.equal(done.interlude,'complete');
});

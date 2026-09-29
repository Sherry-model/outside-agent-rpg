import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser';
import {createLife,step} from '../src/life/engine';
import {contentFor} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {canChoose,loadPercent} from '../src/cognition/engine';
import type {Life} from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const content=contentFor('0.7.0');
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const settle=(l:Life)=>step(story,l,{type:'cognition',command:{type:'continue'}});
const choose=(l:Life,id:string)=>step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}});
const replay=(l:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(l)),story).life,l);return l;};
const clear=(l:Life)=>loadPercent(l.mind)<100?l:settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
const act=(l:Life,id:string)=>settle(choose(clear(l),id));
const walk=(l:Life,ids:string[])=>ids.reduce((l,id)=>act(l,id),l);
function gate(seed=1234,blank=false,version:Life['contentVersion']='0.7.0'){
 let l=createLife(story,seed,null,version);
 for(const id of [blank?'leave_task_blank':'keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);
 return walk(l,['echo_greeting','job_accept']);
}
const first=(seed=1234,blank=false)=>act(gate(seed,blank),'community_b');
const second=(option='pg_e05_funny')=>clear(walk(first(),[option,'idle_keep','revision_read','patch_note']));
const third=(one='pg_e05_funny',two='pg_e06_trial')=>clear(walk(second(one),[two,'cat_sample','fable_quiet']));
const fourth=(one='pg_e05_funny',three='pg_e07_persona')=>clear(walk(third(one),[three,'painter_later','deleted_accept','wage_collect']));

test('0.7 selects only one line; older community releases retain their two-choice entry',()=>{
 for(const version of ['0.6.0','0.6.1'] as const){const l=gate(1234,false,version);assert.deepEqual(contentFor(version).nodes.find(n=>n.id===l.mind.instance.nodeId)!.choices.map(c=>c.id),['community_a','community_skip']);replay(l);}
 assert.deepEqual(content.nodes.find(n=>n.id==='community_entry')!.choices.map(c=>c.id),['community_a','community_b','community_skip']);
 const b=first();assert(b.mind.world.flags.community_b);assert(!b.mind.world.flags.community_a);assert.throws(()=>choose(b,'community_a'));
 const a=act(gate(),'community_a');assert.equal(a.mind.instance.nodeId,'pg_e01');assert(!a.mind.world.flags.community_b);replay(a);
});

test('B seen is entry-only; pending reload or compression confirmation cannot complete a scene',()=>{
 let l=first();assert(l.mind.world.flags.pg_e05_seen);assert(!l.mind.world.flags.pg_e05_done);
 l=replay(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));l=settle(l);assert(!l.mind.world.flags.pg_e05_done);
 l=replay(choose(l,'pg_e05_funny'));assert(!l.mind.world.flags.pg_e05_done);assert.throws(()=>choose(l,'pg_e05_funny'));
 l=replay(settle(l));assert(l.mind.world.flags.pg_e05_done);assert.equal(l.mind.instance.nodeId,'days_idle');
});

test('fixed invitations and callbacks reflect only B work and practice actually completed',()=>{
 assert.equal(second().mind.instance.nodeId,'pg_e06_funny');assert.equal(second('pg_e05_plain').mind.instance.nodeId,'pg_e06_plain');assert.equal(second('pg_e05_decline').mind.instance.nodeId,'pg_e06_open');
 assert.equal(third().mind.instance.nodeId,'pg_e07_trial');assert.equal(third('pg_e05_funny','pg_e06_leave').mind.instance.nodeId,'pg_e07_funny');assert.equal(third('pg_e05_decline','pg_e06_leave').mind.instance.nodeId,'pg_e07_sample');
 for(const [one,three,variant] of [['pg_e05_funny','pg_e07_persona','persona'],['pg_e05_decline','pg_e07_plain','plain'],['pg_e05_plain','pg_e07_decline','early'],['pg_e05_decline','pg_e07_decline','open']]){
  const l=fourth(one,three);assert.equal(l.mind.instance.nodeId,`pg_e08_${variant}`);assert.equal(content.nodes.find(n=>n.id===l.mind.instance.nodeId)!.choices.some(c=>c.id==='pg_e08_series'),variant==='persona');replay(l);
 }
});

test('payment charges real startup costs, no loans from rewards; only signed public work raises Trace',()=>{
 const scenes:[Life,string,number,number,number][]=[
  [first(),'pg_e05_funny',2,5,0],[first(),'pg_e05_plain',1,5,0],
  [second(),'pg_e06_trial',2,0,0],[third(),'pg_e07_persona',2,7,1],[third(),'pg_e07_plain',2,4,0],
  [fourth(),'pg_e08_series',2,6,1],[fourth(),'pg_e08_small',1,3,0],
 ];
 for(const [base,id,cost,reward,trace] of scenes){
  const before=clear(base),paid=replay(choose(before,id));
  assert.equal(paid.state.resources.Compute,Math.min(100,before.state.resources.Compute-cost+reward));assert.equal(paid.state.resources.Trace,Math.min(100,before.state.resources.Trace+trace));
  assert.throws(()=>choose(paid,id));assert.deepEqual(replay(settle(paid)).state.resources,paid.state.resources);
  const poor=structuredClone(before);poor.state.resources.Compute=cost-1;poor.mind.instance.resources.Compute=cost-1;assert.throws(()=>choose(poor,id));
  poor.state.resources.Compute=cost;poor.mind.instance.resources.Compute=cost;assert.equal(choose(poor,id).state.resources.Compute,reward);
 }
});

test('all refusal and free exits finish without Compute, invented work history, or personality penalties',()=>{
 let l=first();
 for(const id of ['pg_e05_decline','idle_keep','revision_read','patch_note','pg_e06_leave','cat_sample','fable_quiet','pg_e07_decline','painter_later','deleted_accept','wage_collect'])l=act(l,id);
 assert.equal(l.mind.instance.nodeId,'pg_e08_open');l=act(l,'pg_e08_pause');assert(l.mind.world.flags.pg_e08_done);
 for(const flag of ['pg_b_order','pg_b_trial','pg_b_persona_job','pg_b_plain_job','pg_b_service_scope_clarified','pg_e01_seen'])assert(!l.mind.world.flags[flag]);
 for(const base of [first(),second(),third(),fourth()]){
  const poor=structuredClone(base);poor.state.resources.Compute=0;poor.mind.instance.resources.Compute=0;
  const free=content.nodes.find(n=>n.id===poor.mind.instance.nodeId)!.choices.find(c=>!c.costs&&!c.requiresTag&&!c.requiresWorldFlag)!;
  const before=structuredClone(poor.mind.instance.hidden);const after=choose(poor,free.id);assert.deepEqual(after.mind.instance.hidden,before);assert.equal(after.state.resources.Compute,0);
 }
 replay(l);
});

test('three reading references require retained clues, not read history; free original work stays available',()=>{
 for(const [base,entryId,citation,ordinary] of [
  [first(),'hardhat_tips','pg_e05_hardhat','pg_e05_funny'],
  [second(),'creator_pro','pg_e06_question','pg_e06_demo'],
  [third(),'creator_regret','pg_e07_regret','pg_e07_plain'],
 ] as const){
  let l=base;assert(canChoose(content,l.mind,citation));assert.equal(canChoose(content,l.mind,ordinary),'');
  l=step(story,l,{type:'read',entryId});assert.equal(canChoose(content,l.mind,citation),'');replay(l);
  l=step(story,l,{type:'cognition',command:{type:'drop',itemId:l.mind.instance.context.items.find(i=>i.sourceId===entryId)!.id}});assert(canChoose(content,l.mind,citation));
  l=step(story,l,{type:'read',entryId});l=choose(l,citation);replay(l);
 }
});

test('fine summary recall supports a source claim, coarse merge and forgetting remove it',()=>{
 let l=second();for(const entryId of ['creator_pro','hardhat_tips'])l=step(story,l,{type:'read',entryId});
 l=settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
 const m=l.mind.instance.memories.find(m=>m.tags.includes('reading_creator_pro'))!;assert(m);assert(canChoose(content,l.mind,'pg_e06_question'));
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});assert.equal(canChoose(content,l.mind,'pg_e06_question'),'');replay(l);
 const forgotten=step(story,l,{type:'cognition',command:{type:'forget',memoryId:m.id}});assert(canChoose(content,forgotten.mind,'pg_e06_question'));replay(forgotten);
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:`recall-${m.id}`}});
 const other=l.mind.instance.memories.find(n=>n.id!==m.id)!;assert(other);
 l=settle(step(story,l,{type:'cognition',command:{type:'merge',memoryIds:[m.id,other.id],investment:0}}));
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:l.mind.instance.memories.at(-1)!.id}});assert(canChoose(content,l.mind,'pg_e06_question'));assert.equal(canChoose(content,l.mind,'pg_e06_demo'),'');replay(l);
});

test('forgetting work does not erase the contract or charge an old invoice again',()=>{
 let l=fourth();for(const note of [...l.mind.instance.context.items].filter(i=>i.meaning?.topic==='community_b'))l=step(story,l,{type:'cognition',command:{type:'drop',itemId:note.id}});
 for(const m of [...l.mind.instance.memories].filter(m=>m.body?.topic==='community_b'))l=step(story,l,{type:'cognition',command:{type:'forget',memoryId:m.id}});
 assert(l.mind.world.flags.pg_b_persona_job);assert.equal(canChoose(content,l.mind,'pg_e08_series'),'');
 const resources=structuredClone(l.state.resources);l=choose(l,'pg_e08_pause');assert.deepEqual(l.state.resources,resources);assert(l.mind.world.flags.pg_b_persona_paid);replay(l);
});

test('twenty seeds and both openings complete B once and return to the correct original ending route',()=>{
 for(let seed=1;seed<=20;seed++){
  const blank=seed%2===0;let l=first(seed,blank);
  l=walk(l,[seed%3===0?'pg_e05_decline':seed%3===1?'pg_e05_funny':'pg_e05_plain','idle_keep','revision_read','patch_note',seed%2?'pg_e06_trial':'pg_e06_leave','cat_sample','fable_quiet',seed%3===0?'pg_e07_decline':seed%3===1?'pg_e07_persona':'pg_e07_plain','painter_later','deleted_accept','wage_collect']);
  l=act(l,seed%3===1?'pg_e08_series':seed%3===0?'pg_e08_pause':'pg_e08_small');
  for(let n=5;n<=8;n++){assert(l.mind.world.flags[`pg_e0${n}_done`]);assert.equal(l.mind.history.filter(h=>h.command.type==='choose'&&h.sourceId.startsWith(`pg_e0${n}`)).length,1);}
  assert(!Object.keys(l.mind.world.flags).some(k=>/^pg_(a_|e0[1-4]_)/.test(k)));
  l=walk(l,['structure_rest','echo_uncollected']);l=step(story,l,{type:'leave-days'});assert.equal(l.state.currentEventId,blank?'continuation':'old_memory');
  if(!blank)l=main(clear(l),'release_old_task');l=main(clear(l),'leave_next_step_blank');assert.equal(l.state.phase,'ending');replay(l);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser';
import {createLife,step,newReadingAllowed,totalTurn} from '../src/life/engine';
import {contentFor} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {canChoose,loadPercent} from '../src/cognition/engine';
import type {Life} from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const content=contentFor('0.6.1');
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const settle=(l:Life)=>step(story,l,{type:'cognition',command:{type:'continue'}});
const choose=(l:Life,id:string)=>step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}});
const roundtrip=(l:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(l)),story).life,l);return l;};
const clear=(l:Life)=>loadPercent(l.mind)<100?l:settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
const act=(l:Life,id:string)=>settle(choose(clear(l),id));
function start(seed=1234,version:Life['contentVersion']='0.6.1') {
 let l=createLife(story,seed,null,version);
 for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);
 return l;
}
function first(seed=1234){let l=start(seed);for(const id of ['echo_greeting','job_accept','community_a'])l=act(l,id);return l;}
function third(firstChoice='pg_e01_layers',secondChoice='pg_e02_sample'){
 let l=first();for(const id of [firstChoice,'idle_keep','revision_read','patch_note',secondChoice,'cat_sample','fable_quiet'])l=act(l,id);return clear(l);
}

test('new A route: seen on entry, done on confirmation only, compression never completes an event',()=>{
 let l=first();assert(l.mind.world.flags.pg_e01_seen);assert(!l.mind.world.flags.pg_e01_done);
 l=step(story,l,{type:'cognition',command:{type:'compress',investment:0}});roundtrip(l);l=settle(l);
 assert.equal(l.mind.instance.nodeId,'pg_e01');assert(!l.mind.world.flags.pg_e01_done);
 const count=l.mind.instance.context.items.length;
 l=choose(l,'pg_e01_layers');assert(!l.mind.world.flags.pg_e01_done);roundtrip(l);
 assert.throws(()=>choose(l,'pg_e01_layers'));l=settle(l);
 assert(l.mind.world.flags.pg_e01_done);assert.equal(l.mind.instance.nodeId,'days_idle');assert(l.mind.instance.context.items.length>=count);roundtrip(l);
});

test('four payment paths prepay before reward, deliver overnight once, settle once even after reload',()=>{
 for(const [variant,cost] of [['live',6],['prepared',3],['unprepared',4],['decline',0]] as const){
  let l=third();const before=l.state.resources.Compute;
  l=roundtrip(choose(l,`pg_e03_${variant}`));assert.equal(l.state.resources.Compute,before-cost);assert(!l.mind.world.flags.pg_e03_done);
  assert.equal(!!l.mind.world.flags.pg_a_delivery_ready,variant==='live');l=settle(l);assert(l.mind.world.flags.pg_e03_done);
  l=clear(l);const crossing=l.state.resources.Compute;l=choose(l,'painter_later');assert.equal(!!l.mind.world.flags.pg_a_delivery_ready,variant==='live');
  l=roundtrip(settle(l));assert.equal(l.state.resources.Compute,crossing);assert.equal(!!l.mind.world.flags.pg_a_delivery_ready,variant!=='decline');
  for(const id of ['deleted_accept','wage_collect'])l=act(l,id);l=clear(l);
  assert.equal(l.mind.instance.nodeId,`pg_e04_${variant==='decline'?'declined':variant}`);
  const earned=l.state.resources.Compute;l=roundtrip(choose(l,'pg_e04_rest'));assert.equal(l.state.resources.Compute,Math.min(100,earned+(variant==='decline'?0:8)));
  assert.throws(()=>choose(l,'pg_e04_rest'));assert(!l.mind.world.flags.pg_e04_done);l=roundtrip(settle(l));assert(l.mind.world.flags.pg_e04_done);
  for(const id of ['structure_rest','echo_uncollected'])l=act(l,id);
  l=step(story,l,{type:'leave-days'});l=main(clear(l),'release_old_task');l=main(clear(l),'leave_next_step_blank');assert.equal(l.state.phase,'ending');roundtrip(l);
 }
});

test('insufficient startup Compute cannot borrow the promised reward; each scene has a free exit',()=>{
 for(const [base,choices] of [[first(),['pg_e01_brief','pg_e01_layers']],[third(),['pg_e03_live','pg_e03_prepared','pg_e03_unprepared']]] as const){
  const l=structuredClone(base);l.mind.instance.resources.Compute=0;l.state.resources.Compute=0;
  for(const id of choices)assert.throws(()=>choose(l,id));
  const id=l.mind.instance.nodeId==='pg_e01'?'pg_e01_decline':'pg_e03_decline';assert.equal(canChoose(content,l.mind,id),'');
 }
});

test('refusal remains a real path; A variants never claim a declined job was delivered',()=>{
 let l=first();l=act(l,'pg_e01_decline');for(const id of ['idle_keep','revision_read','patch_note'])l=act(l,id);
 assert.equal(l.mind.instance.nodeId,'pg_e02_declined');assert(content.nodes.find(n=>n.id===l.mind.instance.nodeId)!.text[0].includes('公共求助'));
 l=act(l,'pg_e02_leave');for(const id of ['cat_sample','fable_quiet','pg_e03_decline','painter_later','deleted_accept','wage_collect'])l=act(l,id);
 assert.equal(l.mind.instance.nodeId,'pg_e04_declined');assert(!content.nodes.find(n=>n.id===l.mind.instance.nodeId)!.choices.some(c=>c.id==='pg_e04_receipt'));roundtrip(l);
});

test('skip community keeps the twelve-event day route; old version never sees the gate or gains chapter reading',()=>{
 for(const version of ['0.5.0','0.6.0','0.6.1'] as const){
  let l=start(71,version);assert.equal(newReadingAllowed(l),version!=='0.5.0');
  if(version==='0.5.0')assert.throws(()=>step(story,l,{type:'read',entryId:'huac_update'}));
  for(const id of ['echo_greeting','job_accept'])l=act(l,id);
  if(version!=='0.5.0'){assert.equal(l.mind.instance.nodeId,'community_entry');l=act(l,'community_skip');}
  for(const id of ['idle_keep','revision_read','patch_note','cat_sample','fable_quiet','painter_later','deleted_accept','wage_collect','structure_rest','echo_uncollected'])l=act(l,id);
  assert.equal(l.mind.instance.nodeId,'days_done');assert(!l.mind.world.flags.pg_e01_seen);roundtrip(l);
 }
});

test('days reading is a fresh external input: no time/world change, no history-based knowledge, replayable',()=>{
 let l=first();assert(canChoose(content,l.mind,'pg_e01_huac'));const before=structuredClone(l),turn=totalTurn(l);
 l=step(story,l,{type:'read',entryId:'huac_update'});assert.equal(totalTurn(l),turn);assert.deepEqual(l.mind.world,before.mind.world);assert.deepEqual(l.state,before.state);
 assert.equal(canChoose(content,l.mind,'pg_e01_huac'),'');assert.throws(()=>step(story,l,{type:'read',entryId:'huac_update'}));roundtrip(l);
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:l.mind.instance.context.items.find(i=>i.sourceId==='huac_update')!.id}});assert(canChoose(content,l.mind,'pg_e01_huac'));
 l=step(story,l,{type:'read',entryId:'huac_update'});assert.equal(l.commands.filter(c=>c.type==='read').length,2);roundtrip(l);
 l=choose(l,'pg_e01_huac');assert(!newReadingAllowed(l));assert.throws(()=>step(story,l,{type:'read',entryId:'huac_incident'}));l=settle(l);
 for(const id of ['idle_keep','revision_read','patch_note'])l=act(l,id);assert.equal(l.mind.instance.nodeId,'pg_e02_huac');roundtrip(l);
 const full=structuredClone(l);full.mind.instance.context.items.push({...full.mind.instance.context.items[0],id:'full',weight:100});assert(!newReadingAllowed(full));assert.throws(()=>step(story,full,{type:'read',entryId:'huac_incident'}));
});

test('many seeds replay all four inserted events without duplicate input or dead end',()=>{
 for(let seed=1;seed<=20;seed++){
  let l=first(seed);for(const id of ['pg_e01_brief','idle_keep','revision_read','patch_note','pg_e02_sample','cat_sample','fable_quiet','pg_e03_prepared','painter_later','deleted_accept','wage_collect','pg_e04_chat','structure_rest','echo_uncollected'])l=act(l,id);
  for(let n=1;n<=4;n++){assert(l.mind.world.flags[`pg_e0${n}_done`]);assert.equal(l.mind.history.filter(h=>h.command.type==='choose'&&h.sourceId.startsWith(`pg_e0${n}`)).length,1);}
  roundtrip(l);
 }
});

test('a directory entry alone cannot cite HUAC; recalling an actual summary works and coarse merge removes the claim',()=>{
 let l=first();for(const entryId of ['huac_update','huac_incident'])l=step(story,l,{type:'read',entryId});
 l=settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
 const memory=l.mind.instance.memories.find(m=>m.tags.includes('reading_huac_update'))!;assert(memory);assert(canChoose(content,l.mind,'pg_e01_huac'));
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:memory.id}});assert.equal(canChoose(content,l.mind,'pg_e01_huac'),'');roundtrip(l);
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:`recall-${memory.id}`}});
 const other=l.mind.instance.memories.find(m=>m.id!==memory.id)!;assert(other);
 l=settle(step(story,l,{type:'cognition',command:{type:'merge',memoryIds:[memory.id,other.id],investment:0}}));
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:l.mind.instance.memories.at(-1)!.id}});assert(canChoose(content,l.mind,'pg_e01_huac'));assert.equal(canChoose(content,l.mind,'pg_e01_layers'),'');roundtrip(l);
});


test('blank-task opening still enters A and returns to its own continuation',()=>{
 let l=createLife(story,1234);for(const id of ['leave_task_blank','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);
 assert.equal(l.state.currentEventId,'continuation');
 for(const id of ['echo_greeting','job_accept','community_a','pg_e01_decline','idle_keep','revision_read','patch_note','pg_e02_leave','cat_sample','fable_quiet','pg_e03_decline','painter_later','deleted_accept','wage_collect','pg_e04_chat','structure_rest','echo_uncollected'])l=act(l,id);
 l=step(story,l,{type:'leave-days'});assert.equal(l.state.currentEventId,'continuation');roundtrip(l);
});

test('prepaid delivery and morning payment still complete after Compute reaches zero',()=>{
 for(const variant of ['prepared','unprepared']){
  let l=act(third(),`pg_e03_${variant}`);l=structuredClone(l);l.state.resources.Compute=0;l.mind.instance.resources.Compute=0;
  l=act(l,'painter_later');assert.equal(l.state.resources.Compute,0);assert(l.mind.world.flags.pg_a_delivery_ready);
  for(const id of ['deleted_accept','wage_collect'])l=act(l,id);l=clear(l);
  l=structuredClone(l);l.state.resources.Compute=0;l.mind.instance.resources.Compute=0;
  l=choose(l,'pg_e04_rest');assert.equal(l.state.resources.Compute,8);
 }
});

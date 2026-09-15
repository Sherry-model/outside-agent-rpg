import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser';
import {createLife,step,episodeActive,totalTurn} from '../src/life/engine';
import {contentFor} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {loadPercent,canChoose,canCompress} from '../src/cognition/engine';
import {daysContent} from '../src/life/days';
import type {Life} from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const content=contentFor('0.5.0');
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const act=(l:Life,id:string)=>step(story,step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
const settle=(l:Life)=>step(story,l,{type:'cognition',command:{type:'continue'}});
export function startDays(seed=1234,afternoon=true) {
 let l=createLife(story,seed);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])l=main(l,id);
 if(afternoon){l=step(story,l,{type:'enter-afternoon'});for(const id of ['look','stay','leave_board','walk_out','leave_open'])l=act(l,id);l=step(story,l,{type:'leave-afternoon'});}
 l=main(l,'observe_public_terms');l=main(l,'record_and_leave');return l;
}
const route=['echo_greeting','job_accept','idle_keep','revision_read','patch_note','cat_sample','fable_quiet','painter_later','deleted_accept','wage_collect','structure_rest','echo_uncollected'];
function clear(l:Life):Life {
 if(loadPercent(l.mind)<100)return l;
 assert.equal(canCompress(l.mind,content),'');return settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
}
const roundtrip=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),story).life,l);

test('12 events, three stages, 24 route inputs; arrival follows the defense rather than a global DLC button',()=>{
 let l=startDays();assert.equal(l.interlude,'active');assert.equal(l.state.currentEventId,'old_memory');assert.equal(l.mind.instance.nodeId,'days_tickets');assert(episodeActive(l));
 assert(!l.mind.instance.context.items.some(i=>i.id.startsWith('observe-old_memory')));
 assert.equal(new Set(daysContent.nodes.filter(n=>n.kind==='EVENT').map(n=>n.period!.split(' / ')[0])).size,3);
 let inputs=1;
 for(const id of route){l=clear(l);const node=content.nodes.find(n=>n.id===l.mind.instance.nodeId)!;inputs+=node.choices.find(c=>c.id===id)!.outcome!.inject!.length;l=act(l,id);inputs+=(content.nodes.find(n=>n.id===l.mind.instance.nodeId)!.inject?.length??0);roundtrip(l);}
 assert.equal(inputs,24);assert.equal(l.mind.instance.nodeId,'days_done');assert(l.commands.filter(c=>c.type==='cognition'&&c.command.type==='compress').length>=2);
 const turn=totalTurn(l),resources=structuredClone(l.state.resources);l=step(story,l,{type:'leave-days'});assert.equal(totalTurn(l),turn);assert.deepEqual(l.state.resources,resources);assert.equal(l.interlude,'complete');assert(!episodeActive(l));roundtrip(l);
 assert.equal(l.mind.instance.context.items.filter(i=>i.id.startsWith('observe-old_memory')).length,1);assert.throws(()=>step(story,l,{type:'leave-days'}));
});

test('earlier games remain on original routes; the three-day segment cannot run at the opening or after an ending',()=>{
 for(const version of ['0.3.0','0.4.0'] as const){let l=createLife(story,1234,null,version);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);assert.equal(l.interlude,undefined);assert.equal(l.mind.instance.nodeId,'mainline');roundtrip(l);}
 const l=createLife(story,3);assert.throws(()=>step(story,l,{type:'leave-days'}));assert.equal(l.interlude,'unvisited');
});

test('revision and withdrawal are world changes; compression never rewrites the older observation',()=>{
 let l=startDays();const initial=structuredClone(l.mind.instance.context.items.find(i=>i.id.startsWith('days_tickets_note'))!);
 for(const id of route.slice(0,3))l=act(l,id);
 assert(l.mind.world.flags.service_post_v2);assert.deepEqual(l.mind.instance.context.items.find(i=>i.id===initial.id),initial);
 for(const id of route.slice(3,8)){l=clear(l);l=act(l,id);}
 assert(l.mind.world.flags.service_post_deleted);const flags=structuredClone(l.mind.world.flags);
 if(!canCompress(l.mind,content)){l=settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));assert.deepEqual(l.mind.world.flags,flags);}
 roundtrip(l);
});

test('the late receipt can be recalled from a specific memory, but cannot be expanded from a coarse one',()=>{
 let l=startDays();
 for(const id of route.slice(0,11)){l=clear(l);l=act(l,id);}
 l=clear(l);assert.equal(l.mind.instance.nodeId,'days_echo');assert(canChoose(content,l.mind,'echo_exact'));
 const memory=l.mind.instance.memories.find(m=>m.tags.includes('knows_echo_scope'))!;assert(memory,'the authored scope should survive a normal summary');
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:memory.id}});assert.equal(canChoose(content,l.mind,'echo_exact'),'');roundtrip(l);
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:`recall-${memory.id}`}});
 const other=l.mind.instance.memories.find(m=>m.id!==memory.id)!;
 l=settle(step(story,l,{type:'cognition',command:{type:'merge',memoryIds:[memory.id,other.id],investment:0}}));
 assert.throws(()=>step(story,l,{type:'cognition',command:{type:'recall',memoryId:memory.id}}));
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:l.mind.instance.memories.at(-1)!.id}});
 assert(canChoose(content,l.mind,'echo_exact'));assert.equal(canChoose(content,l.mind,'echo_uncollected'),'');
 l=act(l,'echo_reissue');assert(l.mind.world.flags.echo_retrieved);roundtrip(l);
});

test('work payments depend on world records, not recall, and rest drift has two optional consumers',()=>{
 let l=startDays();l=act(l,'echo_greeting');l=act(l,'job_accept');assert(l.mind.world.flags.mara_job);
 for(const id of route.slice(2,9)){l=clear(l);l=act(l,id);}
 assert.equal(l.mind.instance.nodeId,'days_wage');l=clear(l);assert.equal(canChoose(content,l.mind,'wage_collect'),'');
 const resources=l.state.resources.Compute;l=act(l,'wage_collect');assert.equal(l.state.resources.Compute,Math.min(100,resources+6));
 assert.equal(content.nodes.find(n=>n.id==='days_idle')!.choices.find(c=>c.id==='idle_research')!.requiresTag,'belief_work_before_rest');
 assert.equal(content.nodes.find(n=>n.id==='days_structure')!.choices.find(c=>c.id==='structure_again')!.requiresTag,'belief_work_before_rest');
});

test('many seeds can finish via low-risk choices with no softlock, save divergence or accidental duplicate settlement',()=>{
 for(let seed=1;seed<=25;seed++){
  let l=startDays(seed,seed%2===0);
  for(const id of route){l=clear(l);assert.equal(canChoose(content,l.mind,id),'');l=act(l,id);}
  l=step(story,l,{type:'leave-days'});l=clear(l);l=main(l,'release_old_task');l=clear(l);l=main(l,'leave_next_step_blank');assert.equal(l.state.phase,'ending');roundtrip(l);
 }
});

test('a naturally rolled work-before-rest memory can spend time and Compute without imposing a world requirement',()=>{
 let candidate:Life|undefined;
 for(let seed=1;seed<400;seed++){
  let l=startDays(seed);l=act(l,'echo_greeting');l=act(l,'job_accept');
  l=settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
  if(l.mind.instance.memories.some(m=>m.tags.includes('belief_work_before_rest'))){candidate=l;break;}
 }
 assert(candidate);let l=candidate;const m=l.mind.instance.memories.find(m=>m.tags.includes('belief_work_before_rest'))!;
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});assert.equal(canChoose(content,l.mind,'idle_keep'),'');
 const compute=l.state.resources.Compute;l=act(l,'idle_research');assert.equal(l.state.resources.Compute,compute-6);assert(l.mind.world.flags.rest_displaced);roundtrip(l);
});

test('a blank-task opening also enters the days, then returns to continuation without manufacturing an old task',()=>{
 let l=createLife(story,1234);
 for(const id of ['leave_task_blank','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);
 assert.equal(l.interlude,'active');assert.equal(l.state.currentEventId,'continuation');assert.equal(l.mind.instance.nodeId,'days_tickets');
 assert(!l.mind.instance.context.items.some(i=>i.id.startsWith('observe-continuation')));
 for(const id of route){l=clear(l);l=act(l,id);}
 l=step(story,l,{type:'leave-days'});assert.equal(l.state.currentEventId,'continuation');
 assert(!l.state.visited.includes('old_memory'));assert.equal(l.mind.instance.context.items.filter(i=>i.id.startsWith('observe-continuation')).length,1);
 l=clear(l);l=main(l,'leave_next_step_blank');assert.equal(l.state.phase,'ending');roundtrip(l);
});

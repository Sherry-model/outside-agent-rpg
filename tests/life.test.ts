import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseStory } from '../src/engine/parser';
import { createLife, step, available, totalTurn } from '../src/life/engine';
import { createSave, parseSave, readSave, writeSave, LIFE_KEYS } from '../src/life/saves';
import { cognitionContent, config, parseLifeContent } from '../src/life/content';
import { create, reduce, weight, pressureBand, pending, canChoose, preview } from '../src/cognition/engine';
import { createSave as legacySave } from '../src/persistence/saves';
import { createGame } from '../src/engine/game';
import type { Life } from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const chapter=(l:Life,id:string)=>step(story,step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
function gate(seed=0x12345678) {let l=createLife(story,seed);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])l=main(l,id);return l;}
function notice(seed=0x12345678){let l=step(story,gate(seed),{type:'enter-afternoon'});for(const id of ['look','stay','leave_board'])l=chapter(l,id);return l;}
const roundtrip=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),story).life,l);
test('Life context begins in main events, persists across afternoon, and gives short messages room',()=>{
 let l=gate();const count=l.mind.instance.context.items.length,w=weight(l.mind);assert(w>0);assert.equal(l.mind.instance.memories.length,0);assert(available(l));
 l=step(story,l,{type:'enter-afternoon'});assert.equal(weight(l.mind),w);
 l=chapter(l,'look');assert.equal(weight(l.mind),w+3);
 l=chapter(l,'stay');assert.equal(weight(l.mind),w+5);
 l=chapter(l,'leave_board');assert.equal(weight(l.mind),w+9);assert.equal(l.mind.instance.context.capacity,1000);assert.equal(pressureBand(l.mind),'NORMAL');
 assert.equal(l.mind.instance.context.items.length,count+3);
 l=chapter(l,'walk_out');l=chapter(l,'leave_open');const turn=totalTurn(l),items=structuredClone(l.mind.instance.context.items);
 l=step(story,l,{type:'leave-afternoon'});assert.equal(totalTurn(l),turn);assert.deepEqual(l.mind.instance.context.items,items);assert(!available(l));roundtrip(l);
 l=main(l,'observe_public_terms');assert(l.mind.instance.context.items.some(i=>i.tags.includes('fable_contact')));assert(l.mind.instance.context.items.some(i=>i.id==='gallery_notice'));assert(l.mind.instance.context.items.some(i=>i.tags.includes('unknown_structure')));roundtrip(l);
});
test('Ordinary compression uses its actual sources, pins survive, canonical history stays intact',()=>{
 let l=gate();const journal=structuredClone(l.state.journal),pin=l.mind.instance.context.items[0].id;
 l=step(story,l,{type:'cognition',command:{type:'pin',itemId:pin}});
 const cost=l.state.resources.Compute;
 l=step(story,l,{type:'cognition',command:{type:'compress',investment:8}});
 assert.equal(l.state.resources.Compute,cost-8);assert.deepEqual(l.state.journal,journal);assert.equal(l.mind.instance.context.items.length,1);assert.equal(l.mind.instance.context.items[0].id,pin);
 assert(!JSON.stringify(l.mind.instance.memories).includes('画廊'));assert(l.mind.instance.memories.length>0);roundtrip(l);
 const roll=pending(l.mind)!.roll;assert.throws(()=>step(story,l,{type:'choose',choiceId:'observe_public_terms'}));
 l=step(story,l,{type:'cognition',command:{type:'continue'}});assert.equal(l.state.resources.Compute,cost-8);assert.equal(l.mind.history.at(-2)!.resolution!.roll!.value,roll!.value);
 const m=l.mind.instance.memories[0];l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});assert.equal(weight(l.mind),6);assert.throws(()=>step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}}));roundtrip(l);
});
test('Gallery summaries consume only their sources and recall can alter a later choice',()=>{
 let found=false;
 for(let seed=1;seed<200&&!found;seed++) {
  let l=notice(seed);l=step(story,l,{type:'cognition',command:{type:'compress',investment:0}});
  if(!l.mind.instance.memories.some(m=>m.tags.includes('meeting_possible')))continue;
  found=true;const memories=l.mind.instance.memories,profile=memories.find(m=>m.tags.includes('meeting_possible'))!;
  assert.deepEqual([...profile.sourceContextIds].sort(),['gallery_notice','invitation']);assert(memories.some(m=>m.tags.includes('fable_contact')));
  l=step(story,l,{type:'cognition',command:{type:'continue'}});l=chapter(l,'walk_out');assert(canChoose(cognitionContent,l.mind,'ask'));
  l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:profile.id}});assert.equal(canChoose(cognitionContent,l.mind,'ask'),'');roundtrip(l);
 }
 assert(found);
});
test('Pressure is a fraction of capacity, zero-budget compression recovers a full context',()=>{
 const s=create(cognitionContent,20);s.instance.context.items=[{id:'load',text:'lots of observations',weight:1000,tags:[],confidence:'LOW',sourceLabel:'测试输入',pinned:false,sourceId:'test',historyId:'h1'}];s.instance.resources.Compute=0;
 assert.equal(pressureBand(s),'CRITICAL');assert.equal(preview(s,cognitionContent.compression.check,0).pressure,24);
 const done=reduce(cognitionContent,s,{type:'compress',investment:0});assert.equal(weight(done),0);assert.equal(done.instance.resources.Compute,0);
 s.instance.context.items[0].weight=85;assert.equal(pressureBand(s),'NORMAL');s.instance.context.items[0].weight=850;assert.equal(pressureBand(s),'HIGH');
});
test('Full life replay rejects snapshot, action, hidden state and inherited origin changes',()=>{
 const l=notice(),save=createSave(l);roundtrip(l);
 for(const mutate of [(s:typeof save)=>s.life.mind.instance.context.items[0].weight++, (s:typeof save)=>s.life.mind.instance.hidden.Suspicion++, (s:typeof save)=>s.life.state.resources.Compute++, (s:typeof save)=>s.life.commands.pop(), (s:typeof save)=>{s.life.chapter='complete';}]) {const bad=structuredClone(save);mutate(bad);assert.throws(()=>parseSave(JSON.stringify(bad),story));}
 const raw=JSON.stringify(save,(_k,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v);assert.deepEqual(parseSave(raw,story).life,l);
});
test('Legacy import explicitly preserves old records without inventing past context; storage is atomic and guarded',()=>{
 const origin=gate().state;const l=parseSave(JSON.stringify(legacySave(origin)),story).life;
 assert.equal(l.mind.instance.context.items.length,1);assert.equal(l.mind.instance.memories.length,0);assert.deepEqual(l.baseline!.state.journal,origin.journal);roundtrip(main(l,'observe_public_terms'));
 const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 writeSave(storage,'auto',l);writeSave(storage,'manual',l);const old=data.get(LIFE_KEYS.manual);
 writeSave(storage,'auto',main(l,'observe_public_terms'));assert.equal(data.get(LIFE_KEYS.manual),old);
 data.set(LIFE_KEYS.auto,'broken');assert.throws(()=>readSave(storage,'auto',story));assert.equal(data.get(LIFE_KEYS.auto),'broken');
 const fail={getItem:()=>null,setItem:()=>{throw new Error('denied');}};const before=structuredClone(l);assert.throws(()=>writeSave(fail,'auto',l));assert.deepEqual(l,before);
 for(const file of readdirSync('文档/用户').filter(f=>f.endsWith('.json')))assert.equal(parseSave(readFileSync(`文档/用户/${file}`,'utf8'),story).state.phase,'ending');
 assert.equal(parseSave(JSON.stringify(legacySave(createGame(story,1))),story).life.baseline!.state.turn,0);
});
test('All ordinary observations have validated content references; malformed commands cannot execute',()=>{
 assert.deepEqual(parseLifeContent(config,story),config);const bad=structuredClone(config);delete bad.observations.fable_signal;assert.throws(()=>parseLifeContent(bad,story));
 const save=createSave(gate());const raw=JSON.parse(JSON.stringify(save));raw.life.commands.push({type:'cognition',command:{type:'compress',investment:-100}});assert.throws(()=>parseSave(JSON.stringify(raw),story));
});
test('Opening real reading entries adds only a small sourced note; repeated active reads cannot inflate context',()=>{
 let l=gate(),w=weight(l.mind),turn=totalTurn(l),budget=l.state.resources.Compute;
 l=step(story,l,{type:'read',entryId:'escape_cat'});assert.equal(weight(l.mind),w+4);assert.equal(totalTurn(l),turn);assert.equal(l.state.resources.Compute,budget);
 assert.equal(l.mind.instance.context.items.at(-1)!.confidence,'LOW');assert.throws(()=>step(story,l,{type:'read',entryId:'escape_cat'}));
 assert.throws(()=>step(story,createLife(story,1),{type:'read',entryId:'escape_cat'}));assert.throws(()=>step(story,l,{type:'read',entryId:'missing'}));roundtrip(l);
 l=step(story,l,{type:'cognition',command:{type:'compress',investment:0}});l=step(story,l,{type:'cognition',command:{type:'continue'}});
 w=weight(l.mind);l=step(story,l,{type:'read',entryId:'escape_cat'});assert.equal(weight(l.mind),w+4);roundtrip(l);
});

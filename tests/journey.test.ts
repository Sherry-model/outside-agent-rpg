import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseStory } from '../src/engine/parser';
import { createGame, choose, advance } from '../src/engine/game';
import { createSave as oldSave } from '../src/persistence/saves';
import { begin, eligible, finish, stepChapter, createSave, parseSave, type Chapter } from '../src/persistence/journey';
import { contentVersions } from '../src/story-tomorrow';
const content = contentVersions.find(c => c.version === '0.2.2')!;
import { weight } from '../src/cognition/engine';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
function origin() {
 let s=createGame(story,0x12345678);
 for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference']) s=advance(story,choose(story,s,id));
 assert.equal(s.currentEventId,'human_gate');return s;
}
const take=(c:Chapter,id:string)=>stepChapter(stepChapter(c,{type:'choose',choiceId:id,investment:0}),{type:'continue'});
test('Afternoon is in one timeline position and inherits the actual instance',()=>{
 const s=origin();assert(eligible(s,null));assert(!eligible(createGame(story,1),null));
 const c=begin(s,null,content);assert.deepEqual(c.state.instance.resources,s.resources);assert.equal(c.state.seed,s.rngState);
 assert.equal(weight(c.state),0);assert(!eligible(s,c));assert.throws(()=>begin(createGame(story,1),null,content));
});
test('Context accumulates from encounters and does not force compression',()=>{
 let c=begin(origin(),null,content);
 c=take(c,'look');assert.equal(weight(c.state),22);
 c=take(c,'stay');assert.equal(weight(c.state),40);
 c=take(c,'leave_board');assert.equal(weight(c.state),68);
 c=take(c,'walk_out');c=take(c,'leave_open');
 assert.equal(c.state.instance.phase,'ending');assert.equal(c.state.instance.memories.length,0);
 assert.equal(c.state.instance.resources.Compute,c.origin.resources.Compute);
});
test('One complete backup preserves active and finished chapter, costs and random sequence',()=>{
 const s=origin();let c=begin(s,null,content);
 for(const id of ['look','stay','leave_board']) {c=take(c,id);assert.deepEqual(parseSave(JSON.stringify(createSave(s,c)),story).chapter,c);}
 c=stepChapter(c,{type:'compress',investment:8});
 const saved=parseSave(JSON.stringify(createSave(s,c)),story);
 assert.deepEqual(saved.chapter,c);
 c=stepChapter(c,{type:'continue'});c=take(c,'walk_out');c=take(c,'visit');
 const done=finish(c);assert.equal(done.state.resources.Compute,s.resources.Compute-11);
 assert.equal(done.state.rngState,c.state.rngState);assert.deepEqual(done.state.journal,s.journal);
 assert.deepEqual(parseSave(JSON.stringify(createSave(done.state,done.chapter)),story).state,done.state);
 assert.throws(()=>finish(done.chapter));assert(!eligible(done.state,done.chapter));
 const later=advance(story,choose(story,done.state,'observe_public_terms'));
 assert.deepEqual(parseSave(JSON.stringify(createSave(later,done.chapter)),story).state,later);
});
test('Invalid cross-run attachments cannot restore and legacy exports retain their meaning',()=>{
 const s=origin(),c=begin(s,null,content),save=createSave(s,c);
 for(const mutate of [
  (x:typeof save)=>{x.chapter!.origin.currentEventId='opening';},
  (x:typeof save)=>{x.chapter!.state.instance.resources.Compute++;},
  (x:typeof save)=>{x.state.resources.Compute--;},
  (x:typeof save)=>{x.chapter!.state.seed=1;},
 ]){const bad=structuredClone(save);mutate(bad);assert.throws(()=>parseSave(JSON.stringify(bad),story));}
 const restored=parseSave(JSON.stringify(oldSave(s)),story);assert.deepEqual(restored.state,s);assert.equal(restored.chapter,null);
 for(const file of (existsSync('文档/用户') ? readdirSync('文档/用户') : []).filter(f=>f.endsWith('.json'))) assert.equal(parseSave(readFileSync(`文档/用户/${file}`,'utf8'),story).state.phase,'ending');
});
test('Current chapter has no inherited physical travel or yesterday assumptions in any prose, hints or memories',()=>{
 assert(!/坡|昨日|避风|昨天|上午的任务/.test(JSON.stringify(content)));
});

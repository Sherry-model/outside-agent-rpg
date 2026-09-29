import test from 'node:test';
import assert from 'node:assert/strict';
import original from '../src/life/reading.json';
import forum from '../src/life/forum.json';
import {library,parseReading,entriesInSection} from '../src/life/reading';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser';
const story=parseStory(JSON.parse(readFileSync("src/story/manifest.json","utf8")),readdirSync("src/story/events").filter(f=>f.endsWith(".json")).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,"utf8"))})));
import {createLife,step,totalTurn} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {contentFor} from '../src/life/content';
import {weight} from '../src/cognition/engine';

function gate(version:'0.3.0'|'0.4.0'|'0.5.0'|'0.6.0'|'0.6.1'|'0.7.0') {
 let life=createLife(story,0x12345678,null,version);
 for(const choiceId of ['keep_history','stable_boot','take_small_window','withhold_inference']) {
  life=step(story,step(story,life,{type:'choose',choiceId}),{type:'continue'});
 }
 return life;
}
test('Directory validates category references and preserves the original archive exactly',()=>{
 for(const entry of original.entries){const {section,...unchanged}=library.entries.find(e=>e.id===entry.id)!;assert(section);assert.deepEqual(unchanged,entry);}
 assert.equal(forum.length,14);
 assert.deepEqual(new Set(library.sections.flatMap(s=>entriesInSection(s.id).map(e=>e.id))),new Set(library.entries.map(e=>e.id)));
 for(const mutate of [(d:typeof library)=>{d.entries[0].section='missing';},(d:typeof library)=>{d.sections[0].id='all';},(d:typeof library)=>{d.entries.push(d.entries[0]);}]) {
  const copy=structuredClone(library);mutate(copy);assert.throws(()=>parseReading(copy));
 }
 const text=JSON.stringify(forum);assert(!/🔵用户|🟢ChatGPT|https?:\/\/|\*\*@|制作人/.test(text));
 assert(forum.find(e=>e.id==='creator_bootcamp')!.posts.some(p=>p.author==='@skeptic_human'));
 assert.equal(forum.find(e=>e.id==='cat_resolved')!.posts.at(-1)!.author,'论坛系统');
});
test('Every new post opens and replays in each supported life version without changing the world',()=>{
 for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0'] as const) for(const entry of forum) {
  const before=gate(version);let life=step(story,before,{type:'read',entryId:entry.id});
  assert.deepEqual(life.state,before.state);assert.equal(totalTurn(life),totalTurn(before));
  assert.equal(weight(life.mind),weight(before.mind)+entry.weight);
  assert.throws(()=>step(story,life,{type:'read',entryId:entry.id}));
  if(version!=='0.3.0') assert(contentFor(version).semantic!.sources[`reading:${entry.id}`].clauses.every(c=>c.epistemic==='reported'));
  life=step(story,life,{type:'cognition',command:{type:'compress',investment:0}});
  assert.deepEqual(parseSave(JSON.stringify(createSave(life)),story).life,life);
  life=step(story,life,{type:'cognition',command:{type:'continue'}});
  if(!life.mind.instance.context.items.some(i=>i.sourceId===entry.id))life=step(story,life,{type:'read',entryId:entry.id});
  assert.deepEqual(parseSave(JSON.stringify(createSave(life)),story).life,life);
 }
});

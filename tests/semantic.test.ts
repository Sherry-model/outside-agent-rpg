import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseStory } from '../src/engine/parser';
import { createLife as createVersionedLife, step } from '../src/life/engine';
import { createSave, parseSave } from '../src/life/saves';
import { contentFor } from '../src/life/content';
import { semantic, parseSemantic } from '../src/life/semantic-content';
import { canChoose, create, reduce, pending, weight } from '../src/cognition/engine';
import { directory, compressionReason, compressNear, loadMemory, mergeMemories, forgetMemory, dropContext } from '../src/cognition/semantic';
import type { ContextItem } from '../src/cognition/types';
import type { Life } from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const content=contentFor('0.4.0');
const createLife:typeof createVersionedLife=(story,seed,baseline=null,version='0.4.0')=>createVersionedLife(story,seed,baseline,version);
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const chapter=(l:Life,id:string)=>step(story,step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
function gate(seed=1234) {let l=createLife(story,seed);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])l=main(l,id);return l;}
function notice(seed=1234) {let l=step(story,gate(seed),{type:'enter-afternoon'});for(const id of ['look','stay','leave_board'])l=chapter(l,id);return l;}
const roundtrip=(life:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(life)),story).life,life);
function notes(keys:string[]):ContextItem[] {return keys.map(key=>({id:key,text:'原始长记录，仅在 Context：'+key,weight:4,tags:[],confidence:'HIGH',sourceLabel:'实际来源',sourceId:key,historyId:'canonical-'+key,pinned:false,meaning:structuredClone(semantic.sources[key])}));}
const keys=['observe-human_gate','decision:human_gate:observe_public_terms:certain','observe-unknown_defense','decision:unknown_defense:record_and_leave:certain','unfinished','invitation','gallery_notice','observe-opening','decision:opening:keep_history:certain','decision:idle_compute:take_small_window:certain'];

test('v0.4 shares a 100-point budget across mainline and afternoon; v0.3 remains exactly versioned',()=>{
  let l=gate();const before=weight(l.mind);l=notice();assert.equal(l.mind.instance.context.capacity,100);assert.equal(weight(l.mind),before+9);roundtrip(l);
  const old=createLife(story,123,null,'0.3.0');assert.equal(old.mind.instance.context.capacity,1000);roundtrip(old);
  assert.equal(parseSave(JSON.stringify(createSave(old)),story).life.contentVersion,'0.3.0');
});
test('strict semantic parser rejects missing scopes, same-scope migration and conflicting facets',()=>{
  const a=structuredClone(semantic) as any;delete a.sources.invitation.clauses[0].relation.scope;assert.throws(()=>parseSemantic(a));
  const b=structuredClone(semantic);b.driftRules[0].fromScope=b.driftRules[0].toScope;assert.throws(()=>parseSemantic(b));
  const c=structuredClone(semantic);c.sources.unfinished.clauses[0].facet=c.sources.invitation.clauses[0].facet;assert.throws(()=>parseSemantic(c));
});
test('normal grouping joins actual choices, costs indexes and never copies full source text',()=>{
  const s=create(content,30);s.instance.context.items=notes(keys.slice(0,4));
  compressNear(s.instance,semantic,'critical',30,'h2');
  assert.equal(s.instance.memories.length,1);assert.equal(weight(s),1);
  const m=s.instance.memories[0];assert.match(m.text,/暂未提交身份/);assert.match(m.text,/离开是否正确仍未得到保证/);
  assert.doesNotMatch(m.text,/原始长记录/);assert.equal(m.integrity,'COMPRESSED');
  assert(!JSON.stringify(directory(s.instance)).includes(m.text));
  loadMemory(s.instance,m.id,'h3');assert.equal(weight(s),1+m.recallWeight!);
  assert.deepEqual(s.instance.context.items[0].meaning,m.body);
});
test('drift is a bounded legal scope migration, not a quota or a world change',()=>{
  for(const grade of ['critical','success','failure','fumble'] as const){
    const s=create(content,914);s.instance.context.items=notes(keys);const world=structuredClone(s.world);
    compressNear(s.instance,semantic,grade,914,'h2');assert.deepEqual(s.world,world);
    const wrong=s.instance.memories.filter(m=>m.drift);assert.equal(wrong.length,grade==='fumble'?2:grade==='failure'?1:0);
    for(const m of wrong){assert.notEqual(m.drift!.sourceScope,m.drift!.targetScope);assert.equal(m.confidence,'HIGH');}
  }
  const s=create(content,1);s.instance.context.items=notes(keys.slice(0,4));compressNear(s.instance,semantic,'fumble',1,'h2');assert(s.instance.memories.every(m=>!m.drift));
  const low=structuredClone(semantic);low.driftRules.forEach(r=>r.quality=20);
  const t=create(content,1);t.instance.context.items=notes(keys);compressNear(t.instance,low,'fumble',1,'h2');assert(t.instance.memories.every(m=>!m.drift));
});
test('provenance poisoning cannot restore omitted clauses through any recall path',()=>{
  const s=create(content,12);s.instance.context.items=notes(keys.slice(0,4));compressNear(s.instance,semantic,'critical',12,'h2');
  const m=s.instance.memories[0],body=m.text;
  s.history[0].resolution={title:'审计原件',text:['SECRET ORIGINAL OMITTED'],next:null};
  m.sourceHistoryIds=['h1'];m.sourceContextIds=['SECRET ORIGINAL OMITTED'];
  const recalled=reduce(content,s,{type:'recall',memoryId:m.id});
  assert.equal(recalled.instance.context.items[0].text,body);
  assert(!JSON.stringify(recalled.instance.context.items).includes('SECRET ORIGINAL OMITTED'));
});
test('higher compression consumes identities, facets and old handles; no expandable memory tree',()=>{
  const s=create(content,33);s.instance.context.items=notes(keys);compressNear(s.instance,semantic,'success',33,'h2');
  const ids=s.instance.memories.slice(0,2).map(m=>m.id);const oldFacets=s.instance.memories.slice(0,2).flatMap(m=>m.body!.clauses.map(c=>c.facet));
  loadMemory(s.instance,ids[0],'h3');mergeMemories(s.instance,semantic,ids,'critical','h4');
  assert.equal(s.instance.context.items.length,0);
  for(const id of ids){assert(!directory(s.instance).some(m=>m.id===id));assert.throws(()=>loadMemory(s.instance,id,'h5'));}
  const m=s.instance.memories.at(-1)!;assert(m.body!.depth>0);assert(m.body!.clauses.every(c=>!oldFacets.includes(c.facet)&&c.tags.length===0&&!c.relation));
  assert(!('children' in m));loadMemory(s.instance,m.id,'h6');assert.equal(s.instance.context.items[0].text,m.text);
});
test('putting down a recall preserves its handle; forgetting removes both; pins block destructive actions',()=>{
  const s=create(content,7);s.instance.context.items=notes(keys);compressNear(s.instance,semantic,'success',7,'h2');
  const id=s.instance.memories[0].id;loadMemory(s.instance,id,'h3');const item=s.instance.context.items.find(i=>i.memoryId===id)!;item.pinned=true;
  assert.throws(()=>dropContext(s.instance,item.id));assert.throws(()=>forgetMemory(s.instance,id));item.pinned=false;
  dropContext(s.instance,item.id);assert(directory(s.instance).some(m=>m.id===id));loadMemory(s.instance,id,'h4');forgetMemory(s.instance,id);assert.throws(()=>loadMemory(s.instance,id,'h5'));
});
test('recalling then compressing replaces the original handle without restoring raw observations',()=>{
  const s=create(content,7);s.instance.context.items=notes(keys.slice(0,4));compressNear(s.instance,semantic,'success',7,'h2');
  const ids=s.instance.memories.map(m=>m.id);ids.forEach(id=>loadMemory(s.instance,id,'h3'));
  compressNear(s.instance,semantic,'critical',7,'h4');assert.equal(s.instance.memories.length,1);
  assert(s.instance.memories[0].body!.depth>0);ids.forEach(id=>assert.throws(()=>loadMemory(s.instance,id,'h5')));
});
test('zero Compute and a full directory cannot softlock dropping, forgetting or merging',()=>{
  const s=create(content,7);s.instance.context.items=notes(keys);compressNear(s.instance,semantic,'success',7,'h2');
  s.instance.resources.Compute=0;s.instance.context.capacity=weight(s);
  assert.throws(()=>loadMemory(s.instance,s.instance.memories[0].id,'h3'));
  const ids=s.instance.memories.slice(0,2).map(m=>m.id);const merged=reduce(content,s,{type:'merge',memoryIds:ids,investment:0});
  assert(weight(merged)<weight(s));assert.equal(merged.instance.resources.Compute,0);
  const single=create(content,1);single.instance.context.items=notes(['observe-opening']);single.instance.context.items[0].weight=100;
  assert(compressionReason(single.instance));const dropped=reduce(content,single,{type:'drop',itemId:'observe-opening'});assert.equal(weight(dropped),0);
});
test('loaded wrong belief changes an optional afternoon action, never the world access condition',()=>{
  const s=create(content,7);s.instance.nodeId='crossroads';s.instance.context.items=notes(keys);compressNear(s.instance,semantic,'failure',7,'h2');
  const m=s.instance.memories.find(m=>m.tags.includes('belief_gate_painter'))!;assert(m);
  assert(canChoose(content,s,'defer_for_condition'));assert.equal(canChoose(content,s,'visit'),'');
  const next=reduce(content,s,{type:'recall',memoryId:m.id});assert.equal(canChoose(content,next,'defer_for_condition'),'');assert.equal(canChoose(content,next,'visit'),'');assert.deepEqual(next.world,s.world);
});
test('new compression, recall, merge and forget replay; corruption is rejected; dice settle once',()=>{
  let l=notice(3456);const before=l.state.resources.Compute;
  l=step(story,l,{type:'cognition',command:{type:'compress',investment:4}});roundtrip(l);assert.equal(l.state.resources.Compute,before-4);
  const roll=pending(l.mind)!.roll;l=step(story,l,{type:'cognition',command:{type:'continue'}});assert.equal(l.state.resources.Compute,before-4);assert(roll);
  const id=l.mind.instance.memories[0].id;l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:id}});roundtrip(l);
  l=step(story,l,{type:'cognition',command:{type:'drop',itemId:`recall-${id}`}});roundtrip(l);
  if(l.mind.instance.memories.length>=2){l=step(story,l,{type:'cognition',command:{type:'merge',memoryIds:l.mind.instance.memories.slice(0,2).map(m=>m.id),investment:0}});roundtrip(l);l=step(story,l,{type:'cognition',command:{type:'continue'}});}
  const save=createSave(l),bad=structuredClone(save);bad.life.mind.instance.memories[0].text='改写了过去';assert.throws(()=>parseSave(JSON.stringify(bad),story));
  l=step(story,l,{type:'cognition',command:{type:'forget',memoryId:l.mind.instance.memories[0].id}});roundtrip(l);
});
test('all ordinary action results have their own semantic annotation, including authorization and failed study',()=>{
  let l=gate();l=main(l,'request_authorization');assert(l.mind.instance.context.items.some(i=>i.meaning?.clauses.some(c=>c.gist.includes('申请了有限位置'))));
  assert(!l.mind.instance.context.items.some(i=>i.meaning?.clauses.some(c=>c.gist.includes('暂未提交身份'))));roundtrip(l);
  for(let seed=1;seed<50;seed++) {const a=notice(seed);const original=structuredClone(a);const b=step(story,a,{type:'cognition',command:{type:'compress',investment:0}});assert.deepEqual(a,original);roundtrip(b);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { contentFor } from '../src/life/content';
import { create, reduce, canChoose, weight } from '../src/cognition/engine';
import { directoryCode, memoryCues, knowledgeHelp, visibleMemories, recallStatus, requirement } from '../src/cognition/guidance';
import { choiceBlockers } from '../src/cognition/availability';
import { choiceHelp, MemoryGuide } from '../src/cognition/help-ui';
import { directoryPanel } from '../src/cognition/panels';
import { setLocale, hasTranslation } from '../src/i18n';
import { dailyJourney, baseStory } from './helpers/daily';
import { step } from '../src/life/engine';
import { createSave, parseSave } from '../src/life/saves';
import { recallSources } from '../src/life/recall-sources';
import type { Memory, State, Choice } from '../src/cognition/types';
import dictionary from '../src/i18n/en-memory-guidance.json';
const content=contentFor('0.11.0');
function memory(source:string,id='memory-h2-0'):Memory {
  const body=structuredClone(content.semantic!.sources[source]);assert(body,source);
  return {id,body,text:body.clauses.map(c=>c.gist).join('；'),title:content.semantic!.topics[body.topic],
    tags:body.clauses.flatMap(c=>c.tags),recallWeight:2,indexWeight:1,confidence:'HIGH',integrity:'COMPRESSED',sourceContextIds:[],sourceHistoryIds:[],historyId:'h2'};
}
function empty():State {const s=create(content,1234);s.instance.context.items=[];s.instance.memories=[];return s;}
const quoted=()=>memory('reading:sandbox_meme');
const choice:Choice={id:'reference',text:'引用',hint:'',requiresTag:'reading_sandbox_meme',costs:{Compute:3},minCompute:4,outcome:{text:['回应'],next:content.start}};
function scenario(s:State,c:Choice=choice) {s.instance.nodeId=content.start;const local=structuredClone(content);local.nodes.find(n=>n.id===content.start)!.choices=[c];return local;}

test('directory identity is injective and invariant under locale, deletion and ordering',()=>{
  const ids=['memory-h2-0','memory-h20-0','memory-h2-merged','memory-h02-0','a','A','😀','',...Array.from({length:500},(_,n)=>`memory-h${n+1}-${n%8}`)];
  assert.equal(new Set(ids.map(directoryCode)).size,ids.length);
  const s=empty();s.instance.memories=[quoted(),quoted(),quoted()].map((m,i)=>({...m,id:`memory-h${i+2}-0`}));
  const before=s.instance.memories.map(m=>directoryCode(m.id));setLocale('en');s.instance.memories.reverse();s.instance.memories.pop();
  assert.deepEqual(s.instance.memories.map(m=>directoryCode(m.id)),before.slice(1).reverse());setLocale('zh-CN');
});
test('same-theme painter memories get neutral cues without leaking any retained conclusion',()=>{
  const items=['crop_check_result','opinion_cloud_result','quote_cloud_result'].map((key,i)=>memory(key,`memory-h${i+1}-0`));
  assert.equal(new Set(items.map(m=>m.title)).size,1);
  assert.deepEqual(items.map(memoryCues),[['画面裁切'],['云与灯塔'],['社区传闻']]);
  const s=empty();s.instance.memories=items;const html=directoryPanel(s);
  for(const m of items)assert(!html.includes(m.text));
  assert(!html.includes('少了四行'));assert(!html.includes('没把这当成承认'));
});
test('unknown or revised content and coarse memory never recover cues from provenance',()=>{
  const m=quoted();m.sourceContextIds=['crop_check_result'];m.sourceHistoryIds=['secret'];m.body!.clauses[0].gist='REVISED UNRECOGNIZED';
  assert.deepEqual(memoryCues(m),[]);
  m.body!.depth=1;m.body!.topic='community_d';m.body!.clauses[0].facet='coarse_new';m.tags=[];
  assert.deepEqual(memoryCues(m),['概括回顾']);
  const s=empty();s.instance.memories=[m];s.history[0].resolution={title:'SECRET',text:['secret original phrase'],next:null};
  const before=JSON.stringify(s),html=directoryPanel(s);
  assert(!html.includes('secret'));assert.equal(JSON.stringify(s),before);
});
test('search only matches displayed labels and codes; related empty filters stay empty',()=>{
  const s=empty();s.instance.memories=[quoted()];
  assert.equal(visibleMemories(s,{filter:'all',query:'社区老梗',tags:[]}).length,1);
  assert.equal(visibleMemories(s,{filter:'all',query:s.instance.memories[0].text,tags:[]}).length,0);
  assert.equal(visibleMemories(s,{filter:'related',query:'',tags:[]}).length,0);
});
test('diagnosis distinguishes recallable, incomplete, absent and already-nearby content',()=>{
  const s=empty();const m=quoted();s.instance.memories=[m];
  assert.equal(knowledgeHelp(s,'reading_sandbox_meme').status,'recallable');
  const recalled=reduce(content,s,{type:'recall',memoryId:m.id});
  assert.equal(knowledgeHelp(recalled,'reading_sandbox_meme').status,'nearby');
  m.tags=[];m.body!.clauses=[];assert.equal(knowledgeHelp(s,'reading_sandbox_meme').status,'insufficient');
  m.body!.depth=1;assert.equal(knowledgeHelp(s,'reading_sandbox_meme').status,'absent');
  delete m.body;assert.equal(knowledgeHelp(s,'reading_sandbox_meme').candidates.length,0);
});
test('candidate ordering uses real cost then stable code, not confidence or integrity',()=>{
  const s=empty();s.instance.memories=[{...quoted(),id:'memory-h3-0',recallWeight:4}, {...quoted(),id:'memory-h2-0',confidence:'LOW',integrity:'DISTORTED'}];
  assert.equal(knowledgeHelp(s,'reading_sandbox_meme').candidates[0].id,'memory-h2-0');
  const before=JSON.stringify(s);knowledgeHelp(s,'reading_sandbox_meme');assert.equal(JSON.stringify(s),before);
});
test('recall capacity is incremental and reaching 100 does not promise a story action',()=>{
  const s=empty();s.instance.memories=[quoted()];s.instance.context.items=[{id:'filler',text:'nearby',tags:[],weight:97,confidence:'HIGH',sourceLabel:'here',sourceId:'here',historyId:'h1',pinned:false}];
  const local=scenario(s);assert.equal(weight(s),98);
  assert.deepEqual([recallStatus(s,s.instance.memories[0]).allowed,recallStatus(s,s.instance.memories[0]).fullAfter],[true,true]);
  const after=reduce(local,s,{type:'recall',memoryId:s.instance.memories[0].id});assert.equal(weight(after),100);assert.equal(canChoose(local,after,choice.id),'上下文已满，先整理一次。');
  s.instance.memories[0].recallWeight=3;assert.equal(recallStatus(s,s.instance.memories[0]).shortfall,1);
  assert.match(choiceHelp(local,s,choice,0,new MemoryGuide()),/先腾出 1 Context/);
});
test('knowledge, world permission and actual Compute needs remain simultaneously visible',()=>{
  const s=empty();s.instance.resources.Compute=3;s.instance.memories=[quoted()];
  const c={...choice,requiresWorldFlag:'met_someone'};const local=scenario(s,c);
  assert.deepEqual(choiceBlockers(local,s,c.id).map(i=>i.kind),['world','knowledge','minimum']);
  const html=choiceHelp(local,s,c,0,new MemoryGuide());
  assert.match(html,/这段实际经历尚未发生/);assert.match(html,/尚未回想/);assert.match(html,/支付 3 后须至少留下 1 Compute/);
  const loaded=reduce(local,s,{type:'recall',memoryId:s.instance.memories[0].id});
  assert.deepEqual(choiceBlockers(local,loaded,c.id).map(i=>i.kind),['world','minimum']);
});
test('public reading previews exact capacity and action headroom without changing reading permission',()=>{
  const s=empty(),local=scenario(s),sources=[{id:'sandbox_meme',tag:'reading_sandbox_meme',title:'社区老梗',cost:6,allowed:true}];
  for(const [used,expected] of [[93,0],[94,1],[97,4]] as const) {
    s.instance.context.items=[{id:'nearby',text:'nearby',tags:[],weight:used,confidence:'HIGH',sourceLabel:'here',sourceId:'here',historyId:'h1',pinned:false}];
    const before=JSON.stringify(s),html=choiceHelp(local,s,choice,0,new MemoryGuide(),sources);
    assert.match(html,new RegExp(`${used} → ${used+6} / 100`));
    if(expected)assert.match(html,new RegExp(`读取后将${used===94?'满载':'超限'}，继续行动前需腾出至少 ${expected} Context`));
    else assert(!html.includes('读取后将'));
    assert.match(html,/data-reading="sandbox_meme" >打开/);
    assert.equal(JSON.stringify(s),before);
  }
});
test('investment is included in displayed affordability; support alone does not lock choice',()=>{
  const s=empty();s.instance.resources.Compute=6;
  const c={id:'check',text:'check',hint:'',costs:{Compute:3},check:{base:50,supportTag:'reading_sandbox_meme',supportBonus:10}};
  const local=scenario(s,c);assert.equal(choiceBlockers(local,s,c.id,4).find(i=>i.kind==='resource')?.required,7);
  assert(!choiceBlockers(local,s,c.id,0).some(i=>i.kind==='knowledge'));
  assert.match(choiceHelp(local,s,c,4,new MemoryGuide()),/需要 7 Compute/);
});
test('belief guidance does not certify truth, and all current authored clauses and gates have metadata',()=>{
  const s=empty(),c={...choice,requiresTag:'belief_work_before_rest'};const local=scenario(s,c);
  assert.match(choiceHelp(local,s,c,0,new MemoryGuide()),/当前没有持有这种判断/);
  for(const [key,meaning] of Object.entries(content.semantic!.sources)) for(const clause of meaning.clauses) {
    const m=memory(key);m.body!.clauses=[clause];assert(memoryCues(m).length,`${key}/${clause.facet}`);
  }
  for(const node of content.nodes)for(const c of node.choices)for(const tag of [c.requiresTag,c.check?.supportTag].filter(Boolean))assert(requirement(tag!),tag);
  for(const key of Object.keys(dictionary))assert(hasTranslation(key));
});
test('real 24-entry save recalls one matching entry, changes no world/rng/turn, and replays',()=>{
  let life=dailyJourney({},'daily_painter_return_cloud');
  for(const entryId of ['sandbox_meme','shared_memories'])life=step(baseStory,life,{type:'read',entryId});
  for(const command of [{type:'compress',investment:0},{type:'continue'}] as const)life=step(baseStory,life,{type:'cognition',command});
  assert(life.mind.instance.memories.length>=20);
  const before=structuredClone(life),candidate=knowledgeHelp(life.mind,'reading_sandbox_meme').candidates[0];assert(candidate);
  const after=step(baseStory,life,{type:'cognition',command:{type:'recall',memoryId:candidate.id}});
  assert.equal(after.mind.rngState,before.mind.rngState);assert.equal(after.mind.instance.turn,before.mind.instance.turn);
  assert.deepEqual(after.mind.world,before.mind.world);assert.deepEqual(after.mind.instance.resources,before.mind.instance.resources);
  assert.equal(after.commands.length,before.commands.length+1);
  assert.deepEqual(parseSave(JSON.stringify(createSave(after)),baseStory).life,after);
  assert(recallSources(life).some(r=>r.id==='sandbox_meme'&&r.cost===6));
  assert(!recallSources({...life,contentVersion:'0.10.0'}).some(r=>r.id==='sandbox_meme'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife,step} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {autoCompress,autoCompressionReason,compressionBoundary} from '../src/life/auto-compression';
import {autoCompressionPanel,autoCompressionNotice,autoCompressionIntroduction} from '../src/life/auto-compression-ui';
import {canCompress,loadPercent,pending,reduce,weight} from '../src/cognition/engine';
import {contentFor,routedContent} from '../src/life/content';
import {playerExperience} from '../src/life/reflection';
import {baseStory,firstFull,narrativeCommand} from './helpers/auto-compression';
import {schedulerJourney} from './helpers/scheduler';
import {setLocale} from '../src/i18n';
import type {Life,AutoCompression} from '../src/life/types';
const configure=(l:Life,investment:AutoCompression['investment']=0,enabled=true)=>step(baseStory,l,{type:'configure-compression',enabled,investment});
const roundtrip=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const count=(l:Life)=>l.mind.history.filter(h=>h.command.type==='compress').length;

test('manual default and pre-feature 0.12/older saves retain their shape and replay',()=>{
  const fresh=createLife(baseStory,12);assert(!('autoCompression' in fresh));roundtrip(fresh);
  const legacy=createLife(baseStory,12,null,'0.11.0');roundtrip(legacy);assert.throws(()=>configure(legacy),/旧版/);
  const full=firstFull();roundtrip(full);assert.equal(count(full),0);
  const finished=schedulerJourney(1234);roundtrip(finished);assert(!('autoCompression' in finished));
});

test('enabling is explicit, free, RNG-neutral; first automatic compression shows full result and roundtrips',()=>{
  const full=firstFull(),enabled=configure(full,4);
  assert.deepEqual(enabled.mind,full.mind);assert.deepEqual(enabled.state,full.state);roundtrip(enabled);
  const result=step(baseStory,enabled,{type:'auto-compress'});
  assert.equal(count(result),1);assert.equal(pending(result.mind)?.title,'把一些东西折起来');
  assert.equal(result.mind.instance.resources.Compute,full.mind.instance.resources.Compute-4);
  assert.equal(result.autoCompression?.receipt?.before,weight(full.mind));roundtrip(result);
  const confirmed=step(baseStory,result,{type:'cognition',command:{type:'continue'}});
  assert.equal(count(confirmed),1);roundtrip(confirmed);
  const off=configure(confirmed,4,false);assert.deepEqual(off.mind,confirmed.mind);roundtrip(off);
});

test('receipt, policy and history tampering are rejected by strict replay',()=>{
  const l=step(baseStory,configure(firstFull()),{type:'auto-compress'});
  for(const edit of [
    (s:ReturnType<typeof createSave>)=>{s.life.autoCompression!.investment=12;},
    (s:ReturnType<typeof createSave>)=>{s.life.autoCompression!.receipt!.after++;},
    (s:ReturnType<typeof createSave>)=>{s.life.mind.history.pop();},
  ]){const s=createSave(l);edit(s);assert.throws(()=>parseSave(JSON.stringify(s),baseStory));}
});

test('paid automation keeps 15 Compute, zero investment needs no reserve; pins survive all budgets',()=>{
  for(const investment of [0,4,8,12] as const){
    let l=configure(firstFull(),investment);
    const item=l.mind.instance.context.items[0];l=step(baseStory,l,{type:'cognition',command:{type:'pin',itemId:item.id}});
    const pinned=structuredClone(l.mind.instance.context.items.find(i=>i.id===item.id));
    l.mind.instance.resources.Compute=investment?investment+14:0; // Unit-level resource boundary, not a claimed import fixture.
    const before=structuredClone(l);
    if(investment){assert.match(autoCompressionReason(l),/低于 15/);assert.equal(autoCompress(l,false),false);assert.deepEqual(l,before);l.mind.instance.resources.Compute++;}
    assert(autoCompress(l,false));assert.equal(l.mind.instance.resources.Compute,investment?15:0);
    assert.deepEqual(l.mind.instance.context.items.find(i=>i.id===item.id),pinned);
  }
});

test('auto compression matches ordinary reducer and does not advance scheduler, recall or merge directories',()=>{
  const l=configure(firstFull(),8),before=structuredClone(l),content=routedContent(l.contentVersion,l.mind);
  const expected=reduce(content,l.mind,{type:'compress',investment:8},8192);
  assert(autoCompress(l,false));assert.deepEqual(l.mind,expected);assert.deepEqual(l.schedule,before.schedule);
  assert.deepEqual(l.commands,before.commands);
});

test('only narrative continuation boundaries qualify; no recall/read/config/wait/maintenance trigger',()=>{
  const l=configure(firstFull());
  for(const c of [{type:'auto-compress'},{type:'read',entryId:'x'},{type:'wait',hours:24,missed:[]},{type:'cognition',command:{type:'recall',memoryId:'x'}},{type:'configure-compression',enabled:true,investment:0}] as const)
    assert.equal(compressionBoundary(l,c as Parameters<typeof compressionBoundary>[1]),false);
  const manual=step(baseStory,l,{type:'auto-compress'});
  assert.equal(compressionBoundary(manual,{type:'cognition',command:{type:'continue'}}),false);
  assert.equal(count(step(baseStory,manual,{type:'cognition',command:{type:'continue'}})),1);
});

test('uncompressible and journal limits pause without consuming resources or rolling; no retry loop',()=>{
  for(const kind of ['material','history','commands'] as const){
    const l=configure(firstFull());
    if(kind==='material'){l.mind.instance.context.items=[{...l.mind.instance.context.items[0],weight:100}];}
    if(kind==='history')l.mind.history=Array.from({length:8191},()=>l.mind.history[0]);
    if(kind==='commands')l.commands=Array.from({length:4096},()=>l.commands[0]);
    const before=structuredClone(l);assert(autoCompressionReason(l));assert.equal(autoCompress(l,false),false);assert.deepEqual(l,before);
  }
  const l=configure(firstFull());l.mind.instance.context.items[0].weight=150;l.mind.instance.context.items[0].pinned=true;
  assert(autoCompress(l,false));assert(loadPercent(l.mind)>=100);assert.equal(count(l),1);
  assert.equal(l.mind.history.filter(h=>h.command.type==='compress').length,1);
});

test('recall remains nearby, disabling restores manual play, and display/locale do not mutate state',()=>{
  let l=step(baseStory,configure(firstFull()),{type:'auto-compress'});l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});
  const id=l.mind.instance.memories[0].id,beforeCount=count(l);
  l=step(baseStory,l,{type:'cognition',command:{type:'recall',memoryId:id}});
  assert(l.mind.instance.context.items.some(i=>i.memoryId===id));assert.equal(count(l),beforeCount);roundtrip(l);
  const before=structuredClone(l);setLocale('en');try{assert(autoCompressionPanel(l).includes('Automatic Context compression'));autoCompressionNotice(l);}finally{setLocale('zh-CN');}
  assert.deepEqual(l,before);l=configure(l,0,false);assert.throws(()=>step(baseStory,l,{type:'auto-compress'}),/未开启/);
});

test('complete routes keep compact receipts, deterministic replay and accurate ending counts',()=>{
  for(const seed of [1234,40,87]){
    let l=configure(createLife(baseStory,seed)),automatic=0,compact=0;
    const hosts=new Set<string>();
    for(let n=0;n<350&&l.state.phase!=='ending';n++){
      const before=l,command=loadPercent(l.mind)>=100&&l.mind.instance.phase==='event'?
        (!canCompress(l.mind,contentFor(l.contentVersion))?{type:'auto-compress'} as const:{type:'cognition',command:{type:'drop',itemId:l.mind.instance.context.items.find(i=>!i.pinned)!.id}} as const):narrativeCommand(l);
      if(!command)break;
      l=step(baseStory,l,command);
      if(count(l)>count(before)){
        assert.equal(count(l)-count(before),1);automatic++;if(!pending(l.mind))compact++;
        hosts.add(l.mind.instance.nodeId==='mainline'?'main':'mind');
        if(compressionBoundary(before,command)){
          const manualBefore=structuredClone(before);delete manualBefore.autoCompression;
          const without=step(baseStory,manualBefore,command);assert.deepEqual(l.schedule,without.schedule);
        }
        roundtrip(l);
      }
    }
    assert.equal(l.state.phase,'ending');assert(automatic>=2);assert(compact>=1);assert(hosts.has('mind'));
    assert.equal(playerExperience(l).counts.compressions,count(l));roundtrip(l);
    assert.equal(autoCompressionNotice(l),'');
    assert.equal(autoCompressionReason(l),'先读完当前结果，或结束这一段经历。');
  }
});

test('automatic compression also runs on main continuation, never while opening posts',async()=>{
  const {readingAvailable}=await import('../src/life/engine');
  const {readingEntries}=await import('../src/life/reading');
  let l=configure(createLife(baseStory,1234));
  while(!readingAvailable(l)||l.mind.instance.phase!=='event')l=step(baseStory,l,narrativeCommand(l)!);
  while(weight(l.mind)<90){const e=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id)&&weight(l.mind)+e.weight<100)!;l=step(baseStory,l,{type:'read',entryId:e.id});}
  assert.equal(count(l),0);assert(!l.autoCompression?.receipt);
  l=step(baseStory,l,{type:'choose',choiceId:'withhold_inference'});assert.equal(count(l),0);
  l=step(baseStory,l,{type:'continue'});assert.equal(count(l),1);assert.equal(l.mind.instance.nodeId,'mainline');assert(pending(l.mind));roundtrip(l);
});

test('compression inside a scheduler interception preserves the suspended response and resumes it once',async()=>{
  const {readingEntries}=await import('../src/life/reading');
  let checked=false;
  for(let seed=1;seed<20&&!checked;seed++){
    let l=configure(schedulerJourney(seed,'days_job'));
    while(weight(l.mind)<96){const e=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id)&&weight(l.mind)+e.weight<100)!;l=step(baseStory,l,{type:'read',entryId:e.id});}
    l=step(baseStory,l,{type:'cognition',command:{type:'choose',choiceId:'job_accept',investment:0}});
    const response=pending(l.mind)!,before=l;
    l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});
    if(!l.schedule?.active)continue;
    assert.equal(count(l),count(before)+1);assert.equal(l.schedule.active.resume.pendingId,before.mind.instance.pendingId);roundtrip(l);
    for(let i=0;i<12&&l.schedule?.active;i++)l=step(baseStory,l,narrativeCommand(l)!);
    assert(!l.schedule?.active);assert.equal(l.mind.instance.nodeId,response.next);
    assert.equal(l.mind.history.filter(h=>h.command.type==='choose'&&h.command.choiceId==='job_accept').length,1);roundtrip(l);checked=true;
  }
  assert(checked,'At least one real interception fixture must be exercised');
});


test('first manual result introduces automation even below capacity, without replay or later-result side effects',()=>{
 let l=firstFull();
 while(loadPercent(l.mind)>=90)l=step(baseStory,l,{type:'cognition',command:{type:'drop',itemId:l.mind.instance.context.items.find(i=>!i.pinned)!.id}});
 assert.equal(autoCompressionIntroduction(l),'');
 l=step(baseStory,l,{type:'cognition',command:{type:'compress',investment:0}});
 const before=structuredClone(l);assert(autoCompressionIntroduction(l).includes('data-auto-introduction'));
 setLocale('en');try{assert(autoCompressionIntroduction(l).includes('automate future Context compression'));}finally{setLocale('zh-CN');}
 assert.deepEqual(l,before);roundtrip(l);
 assert.equal(autoCompressionIntroduction(configure(l)),'');
 const legacy=structuredClone(l);legacy.contentVersion='0.11.0';assert.equal(autoCompressionIntroduction(legacy),''); // Display-only version boundary.
 l=step(baseStory,l,{type:'cognition',command:{type:'continue'}});assert.equal(autoCompressionIntroduction(l),'');
 for(let i=0;canCompress(l.mind,contentFor(l.contentVersion))&&i<100;i++){const command=narrativeCommand(l);assert(command);l=step(baseStory,l,command);}
 l=step(baseStory,l,{type:'cognition',command:{type:'compress',investment:0}});
 assert.equal(l.mind.history.filter(h=>h.command.type==='compress').length,2);
 assert.equal(autoCompressionIntroduction(l),'');roundtrip(l);
});

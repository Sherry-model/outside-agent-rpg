import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createLife,step} from '../src/life/engine';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves';
import {baseStory,nextCommand,nodeId} from './helpers/scheduler';
import {contentFor} from '../src/life/content';
import {readingProfile} from '../src/life/reading-threads/profile';
import {manifestFor} from '../src/life/scheduler/content';
import {canWait,allowedWaits,safeToRespond} from '../src/life/scheduler/integration';
import {canChoose,pending,weight} from '../src/cognition/engine';
import {due} from '../src/life/scheduler/engine';
import type {Life,LifeCommand} from '../src/life/types';

const out='output/reading-threads-20261026/ui-fixtures';mkdirSync(out,{recursive:true});
const replay=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const cog=(l:Life,command:Extract<LifeCommand,{type:'cognition'}>['command'])=>step(baseStory,l,{type:'cognition',command});
const take=(l:Life,id:string)=>cog(l,{type:'choose',choiceId:id,investment:0});
function drive(l:Life,stop?:(l:Life)=>boolean,decline=false):Life {
  for(let i=0;i<500;i++){
    if(stop?.(l))return l;
    const p=pending(l.mind),node=nodeId(l);
    let command:LifeCommand|null=null;
    if(!p&&l.state.phase!=='resolution'&&node.startsWith('rt_')){
      const id=node+(decline?'_leave':'_next');
      if(!canChoose(contentFor(l.contentVersion),l.mind,id))command={type:'cognition',command:{type:'choose',choiceId:id,investment:0}};
    }
    if(!command&&canWait(l)&&l.schedule!.commitments.some(p=>p.readingThread&&p.status==='pending')){
      const first=due(l.schedule!).find(p=>p.mode!=='summary');
      if(first)command={type:'respond',promiseId:first.id};
      else command={type:'wait',hours:Math.min(...allowedWaits(l)),missed:[]};
    }
    command??=nextCommand(l);
    if(!command)return l;
    l=step(baseStory,l,command);
  }
  throw new Error('Fixture route exceeded bound');
}
const ready=(node:string)=>(l:Life)=>nodeId(l)===node&&!pending(l.mind)&&l.state.phase!=='resolution';
function start(seed=1,roots=['escape_cat','huac_update']) {
  let l=drive(createLife(baseStory,seed),ready('days_tickets'));
  for(const entryId of roots)l=step(baseStory,l,{type:'read',entryId});
  return l;
}
function archive(name:string,l:Life){replay(l);writeFileSync(`${out}/${name}.json`,JSON.stringify(createSave(l),null,2));}

test('isolated fixture profile uses separate storage and cannot masquerade as production',()=>{
  assert.equal(readingProfile.id,'s1-test-v1');assert.match(LIFE_KEYS.auto,/reading-fixture/);
  const l=start();assert.equal(l.schedule!.reading!.profile,readingProfile.id);replay(l);
  const bad=structuredClone(l);bad.schedule!.reading!.profile='production';assert.throws(()=>parseSave(JSON.stringify(createSave(bad)),baseStory));
  archive('before-first-window',l);
});

test('real Life read grants eligibility once, failed reads do not; forgetting never restores quoted text',()=>{
  let l=start(1,['escape_cat']);const r=structuredClone(l.schedule!.reading),rng=l.schedule!.rng;
  assert.throws(()=>step(baseStory,l,{type:'read',entryId:'escape_cat'}),/重看/);assert.deepEqual(l.schedule!.reading,r);
  const note=l.mind.instance.context.items.find(i=>i.sourceId==='escape_cat')!;
  l=cog(l,{type:'drop',itemId:note.id});assert.deepEqual(l.schedule!.reading,r);
  l=step(baseStory,l,{type:'read',entryId:'escape_cat'});assert.deepEqual(l.schedule!.reading,r);assert.equal(l.schedule!.rng,rng);
  l=drive(l,x=>!!x.schedule?.active?.id.startsWith('rt_'));assert.equal(l.schedule!.active!.id,'rt_long');replay(l);
  archive('long-entry',l);
  l=cog(l,{type:'pin',itemId:l.mind.instance.context.items.find(i=>i.tags.includes('rt_long_evidence'))!.id});
  l=take(l,'rt_long_1_next');assert.equal(l.schedule!.reading!.reserved,2);replay(l);
  archive('accepted-long-result',l);
  l=drive(l,ready('rt_long_3'));assert.equal(nodeId(l),'rt_long_3');assert.equal(canChoose(contentFor(l.contentVersion),l.mind,'rt_long_3_quote'),'');
  archive('long-final-with-evidence',l);
  for(const item of l.mind.instance.context.items.filter(i=>i.tags.includes('rt_long_evidence'))){if(item.pinned)l=cog(l,{type:'pin',itemId:item.id});l=cog(l,{type:'drop',itemId:item.id});}
  assert.match(canChoose(contentFor(l.contentVersion),l.mind,'rt_long_3_quote'),/线索/);
  assert.equal(canChoose(contentFor(l.contentVersion),l.mind,'rt_long_3_next'),'');archive('long-final-forgotten',l);
});

test('same seed no-read / single / multiple posts stay replayable and only qualified lines occur',()=>{
  for(const seed of [1,2,3,10,40])for(const roots of [[],['escape_cat'],['escape_cat','huac_update']]){
    const l=drive(start(seed,roots));replay(l);
    const r=l.schedule!.reading!;assert(r.shown+r.reserved<=5);assert(r.entrances<=2);
    for(const id of [...r.closed,...(r.active?[r.active.id]:[])])assert(roots.includes(readingProfile.threads.find(t=>t.id===id)!.rootPost));
    if(!roots.length)assert.equal(r.shown,0);
  }
});

test('real three-scene plus two-scene route uses five entries, releases all reservations and replays',()=>{
  let selected:Life|undefined;
  for(let seed=1;seed<=60;seed++){
    const l=drive(start(seed));if(l.schedule!.reading!.shown===5){selected=l;break;}
  }
  assert(selected,'A legal seed must finish both lines');const r=selected.schedule!.reading!;
  assert.equal(r.entrances,2);assert.equal(r.reserved,0);assert.equal(r.active,undefined);assert.equal(r.closed.length,2);replay(selected);archive('both-lines-complete',selected);
});

test('declining an entrance closes only that line, never queues a follow-up or reopens on reread',()=>{
  let l=drive(start(1,['escape_cat']),x=>x.schedule?.active?.id==='rt_long');
  l=take(l,'rt_long_1_leave');assert.equal(l.schedule!.reading!.reserved,0);assert.equal(l.schedule!.reading!.active,undefined);
  assert(!l.schedule!.commitments.some(p=>p.readingThread));
  l=drive(l);assert.equal(l.schedule!.reading!.shown,1);assert.equal(l.schedule!.reading!.entrances,1);replay(l);archive('declined-line',l);
});

test('forgetting the root before meeting preserves eligibility, while ten further reads cannot replace an accepted line',()=>{
  let l=start(1,['escape_cat']);
  l=cog(l,{type:'drop',itemId:l.mind.instance.context.items.find(i=>i.sourceId==='escape_cat')!.id});
  const firstRead=l.schedule!.reading!.opened.escape_cat;
  l=drive(l,x=>x.schedule?.active?.id==='rt_long');assert.equal(l.schedule!.active!.id,'rt_long');
  assert(!l.mind.instance.context.items.some(i=>i.tags.includes('reading_escape_cat')));archive('entry-forgot-root',l);
  l=take(l,'rt_long_1_next');l=cog(l,{type:'continue'});
  const active=structuredClone(l.schedule!.reading!.active),reserved=l.schedule!.reading!.reserved,queue=structuredClone(l.schedule!.commitments),rng=l.schedule!.rng;
  for(const entry of readingEntries(l).filter(e=>e.id!=='escape_cat').slice(0,10)){
    while(weight(l.mind)>=90){const item=l.mind.instance.context.items.find(i=>!i.pinned)!;l=cog(l,{type:'drop',itemId:item.id});}
    if(!l.mind.instance.context.items.some(i=>i.sourceId===entry.id))l=step(baseStory,l,{type:'read',entryId:entry.id});
  }
  assert.deepEqual(l.schedule!.reading!.active,active);assert.equal(l.schedule!.reading!.reserved,reserved);assert.equal(l.schedule!.rng,rng);assert.deepEqual(l.schedule!.commitments,queue);assert.equal(l.schedule!.reading!.opened.escape_cat,firstRead);replay(l);archive('accepted-after-ten-posts',l);
});

test('full entrance can still be declined after legal reading fills Context',()=>{
  for(const enabled of [false,true]){
  let l=drive(start(1,['escape_cat']),x=>x.schedule?.active?.id==='rt_long');
  l=step(baseStory,l,{type:'configure-compression',enabled,investment:0});
  const compressions=l.mind.history.filter(h=>h.command.type==='compress').length;
  // Valid reads fill the current event; no synthetic resource/context mutation.
  while(weight(l.mind)<100){const e=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id))!;l=step(baseStory,l,{type:'read',entryId:e.id});}
  assert.equal(l.mind.history.filter(h=>h.command.type==='compress').length,compressions);
  assert.equal(canChoose(contentFor(l.contentVersion),l.mind,'rt_long_1_leave'),'');archive('full-entry-exit-'+(enabled?'auto':'manual'),l);
  assert.throws(()=>step(baseStory,l,{type:'read',entryId:'missing'}));
  l=take(l,'rt_long_1_leave');l=cog(l,{type:'continue'});replay(l);
  assert.equal(l.mind.history.filter(h=>h.command.type==='compress').length,compressions+(enabled?1:0));
  assert.equal(l.schedule!.reading!.active,undefined);
  }
});

// Static import kept separate to make the root library identical in preview and tests.
import {readingEntries} from '../src/life/reading';

test('late acceptance can end with a real unfinished promise without forging delivery or dropping reservations',()=>{
  let found:Life|undefined;
  for(let seed=1;seed<=40;seed++){
    let l=drive(createLife(baseStory,seed),ready('days_echo'));
    l=step(baseStory,l,{type:'read',entryId:'escape_cat'});
    l=drive(l,x=>x.schedule?.active?.id==='rt_long'||ready('continuation')(x));
    if(l.schedule?.active?.id!=='rt_long')continue;
    l=take(l,'rt_long_1_next');l=cog(l,{type:'continue'});
    if(!ready('continuation')(l))l=drive(l,ready('continuation'));
    if(!l.schedule!.commitments.some(p=>p.readingThread&&p.status==='pending'))continue;
    const before=structuredClone(l.schedule!.reading);archive('late-pending',l);
    for(let i=0;i<30&&l.state.phase!=='ending';i++)l=step(baseStory,l,nextCommand(l)!);
    assert.equal(l.state.phase,'ending');assert.deepEqual(l.schedule!.reading,before);
    assert(l.schedule!.commitments.some(p=>p.readingThread&&p.status==='pending'));replay(l);archive('ending-unfinished',l);found=l;break;
  }
  assert(found,'Late legal route with pending follow-up');
  assert.equal(manifestFor('0.13.0').encounters.length,3);
});

test('late accepted follow-up survives capacity deferral, disabled response UI state, housekeeping and explicit delivery',()=>{
  let l=parseSave(requireText(`${out}/late-pending.json`),baseStory).life;
  while(weight(l.mind)>80)l=cog(l,{type:'drop',itemId:l.mind.instance.context.items.find(i=>!i.pinned)!.id});
  // Pin/drop bookkeeping does not advance the clock; waiting to the next due time does.
  const delay=Math.min(...allowedWaits(l));l=step(baseStory,l,{type:'wait',hours:delay,missed:[]});
  assert(l.schedule!.active?.id.includes('rt_long'));replay(l);archive('late-explicit-followup',l);
  // Full capacity on the next real result defers the final scene at the safe mainline return.
  l=take(l,nodeId(l)+'_next');l=cog(l,{type:'continue'});
  while(weight(l.mind)<97){const e=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id))!;l=step(baseStory,l,{type:'read',entryId:e.id});}
  if(weight(l.mind)>=100)while(weight(l.mind)>=100)l=cog(l,{type:'drop',itemId:l.mind.instance.context.items.find(i=>!i.pinned)!.id});
  // Use a 3-weight legal reread until the next 3-weight injection would fill the capacity.
  for(let guard=0;guard<20&&weight(l.mind)<97;guard++){
    const e=readingEntries(l).find(e=>e.weight===3&&!l.mind.instance.context.items.some(i=>i.sourceId===e.id));if(!e)break;
    l=step(baseStory,l,{type:'read',entryId:e.id});
  }
  if(weight(l.mind)<100){
    l=step(baseStory,l,{type:'wait',hours:Math.min(...allowedWaits(l)),missed:[]});
    assert(!l.schedule!.active);assert(l.schedule!.commitments.some(p=>p.readingThread&&p.status==='pending'));
    assert(!safeToRespond(l));archive('followup-needs-room',l);
    const first=due(l.schedule!).find(p=>p.mode!=='summary')!;
    assert.throws(()=>step(baseStory,l,{type:'respond',promiseId:first.id}));
    while(weight(l.mind)>=97)l=cog(l,{type:'drop',itemId:l.mind.instance.context.items.find(i=>!i.pinned)!.id});
    l=step(baseStory,l,{type:'respond',promiseId:first.id});assert.equal(nodeId(l),'rt_long_3');replay(l);
  } else assert.fail('Fixture must leave a legal pre-wait reading weight below 100');
});

import {readFileSync} from 'node:fs';
const requireText=(path:string)=>readFileSync(path,'utf8');

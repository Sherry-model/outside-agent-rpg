import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createSchedule,windowDecision,addPromises,advanceClock,deliverBeforeJump,setPhase} from '../src/life/scheduler/engine';
import {manifest,manifestFor} from '../src/life/scheduler/content';
import {createReadingState,opened,chosen,completedCore,withReadingSchedule} from '../src/life/reading-threads/engine';
import {validateReadingProfile} from '../src/life/reading-threads/content';
import {readingProfile as fixture} from './fixtures/reading-profile';
import {readingProfile} from '../src/life/reading-threads/profile';
import {contentFor,configFor} from '../src/life/content';
import {libraryFor} from '../src/life/reading';
import {storyForLife} from '../src/life/endings';
import {createLife,step} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {baseStory} from './helpers/scheduler';
import type {ReadingWindow} from '../src/life/reading-threads/types';
import type {Life} from '../src/life/types';

const spec={phase:'arrival',channel:'public',hours:0,chance:0};
function setup(seed=1){
  const s=createSchedule(seed);s.reading=createReadingState('s1-test-v1');
  const m=withReadingSchedule(manifest,fixture);
  const w:ReadingWindow={state:s.reading,threads:fixture.threads,load:50,capacity:100,weights:Object.fromEntries(fixture.nodes.map(n=>[n.id,3]))};
  opened(s,'escape_cat');s.coreScenes=1;
  return {s,m,w};
}
test('S1 production is empty; new default records only successful opening facts and legacy graphs stay frozen',()=>{
  assert.equal(readingProfile.threads.length,0);assert.equal(contentFor('0.14.0').nodes.length,contentFor('0.13.0').nodes.length);
  assert.equal(createLife(baseStory,1).contentVersion,'0.16.0');
  const rows=JSON.parse(readFileSync('tests/fixtures/life-content-through-0.13.json','utf8')) as {version:Life['contentVersion'];sha256:string}[];
  for(const {version,sha256} of rows)assert.equal(createHash('sha256').update(JSON.stringify([configFor(version),contentFor(version),libraryFor(version),storyForLife(baseStory,version)])).digest('hex'),sha256,version);
  assert.equal(manifestFor('0.13.0'),manifest);assert.equal(manifestFor('0.12.0'),manifest);
});
test('conditional first-entry guarantee counts two eligible misses only and disappears permanently after entry',()=>{
  const {s,m,w}=setup();
  for(const id of ['one','two'])assert.equal(windowDecision(s,m,id,spec,{},true,w),null);
  assert.equal(s.reading!.misses,2);const r=windowDecision(s,m,'three',spec,{},true,w)!;
  assert.equal(r.id,'rt_long');assert.equal(s.reading!.entrances,1);assert.equal(s.reading!.shown,1);
  chosen(s,fixture.threads,'rt_long_1','rt_long_1_leave');opened(s,'huac_update');s.coreScenes++;
  for(let i=0;i<6;i++)windowDecision(s,m,'later'+i,spec,{},true,w);
  assert.equal(s.reading!.entrances,1);assert.equal(s.reading!.misses,0);
});
test('read progress, explicit theme cooldown, capacity including injection, active lines and budgets all exclude misses',()=>{
  const changes=[
    (x:ReturnType<typeof setup>)=>{x.s.coreScenes=0;},
    (x:ReturnType<typeof setup>)=>{x.w.load=97;},
    (x:ReturnType<typeof setup>)=>{x.w.load=100;},
    (x:ReturnType<typeof setup>)=>{x.s.reading!.active={id:'rt_short',status:'accepted'};},
    (x:ReturnType<typeof setup>)=>{x.m.phases.arrival.budget=0;},
    (x:ReturnType<typeof setup>)=>{x.s.reading!.shown=3;},
    (x:ReturnType<typeof setup>)=>{x.w.entrances=false;},
    (x:ReturnType<typeof setup>)=>{x.s.reading!.opened={};},
  ];
  for(const mutate of changes){const x=setup();mutate(x);windowDecision(x.s,x.m,'w',spec,{},true,x.w);assert.equal(x.s.reading!.misses,0);}
  const x=setup();x.s.reading!.opened={};opened(x.s,'huac_update');completedCore(x.s,'pg_e01',fixture.threads);x.s.coreScenes++;
  windowDecision(x.s,x.m,'near',spec,{},true,x.w);assert.equal(x.s.reading!.misses,0);
  x.s.coreScenes++;windowDecision(x.s,x.m,'far',spec,{},true,x.w);assert.equal(x.s.reading!.misses,1);
});
test('no candidate consumes no extra random draw; duplicate window and repeated read never reroll or reset time',()=>{
  const {s,m,w}=setup();m.encounters=m.encounters.filter(e=>e.readingThread);s.coreScenes=0;
  const rng=s.rng;windowDecision(s,m,'empty',spec,{},true,w);assert.equal(s.rng,rng);
  s.coreScenes=2;opened(s,'escape_cat');assert.equal(s.reading!.opened.escape_cat,0);
  windowDecision(s,m,'next',spec,{},true,w);const after=structuredClone(s);
  assert.equal(windowDecision(s,m,'next',spec,{},true,w),null);assert.deepEqual(s,after);
});
test('ordinary encounters can count as eligible misses; candidate sorting is stable',()=>{
  const a=setup(),b=setup();opened(a.s,'huac_update');opened(b.s,'huac_update');a.s.coreScenes++;b.s.coreScenes++;
  b.m.encounters.reverse();
  const x=windowDecision(a.s,a.m,'x',{...spec,chance:1},{},true,a.w),y=windowDecision(b.s,b.m,'x',{...spec,chance:1},{},true,b.w);
  assert.deepEqual(x,y);assert.deepEqual(a.s,b.s);
  if(!x!.id.startsWith('rt_'))assert.equal(a.s.reading!.misses,1);
});
test('accepted follow-ups use the unified queue, retain reservation across phases, and overdraft exhausted budgets',()=>{
  const {s,m,w}=setup();m.encounters=m.encounters.filter(e=>e.id==='rt_long');
  windowDecision(s,m,'entry',{...spec,chance:1},{},true,w);
  chosen(s,fixture.threads,'rt_long_1','rt_long_1_next');addPromises(s,m,'rt_long_1_next');assert.equal(s.reading!.reserved,2);
  addPromises(s,m,'application_nearest');advanceClock(s,2);m.phases.settled.budget=0;setPhase(s,m,'settled','mail');
  const settled={...spec,phase:'settled',channel:'mail'};
  assert.equal(windowDecision(s,m,'existing',settled,{},true,w)!.id,'application_review');assert.equal(s.reading!.reserved,2);
  assert.equal(windowDecision(s,m,'followup',settled,{},true,w)!.nodeId,'rt_long_2');assert.equal(s.budgets.settled.overdraft,2);assert.equal(s.reading!.reserved,1);assert.equal(s.reading!.shown,2);
  chosen(s,fixture.threads,'rt_long_2','rt_long_2_leave');assert.equal(s.reading!.reserved,0);assert.equal(s.reading!.active,undefined);
});
test('accepted full-capacity follow-up remains pending, retains its reservation and can be explicitly delivered later',()=>{
  const {s,m,w}=setup();m.encounters=m.encounters.filter(e=>e.id==='rt_long');
  windowDecision(s,m,'entry',{...spec,chance:1},{},true,w);chosen(s,fixture.threads,'rt_long_1','rt_long_1_next');addPromises(s,m,'rt_long_1_next');advanceClock(s,2);
  w.load=97;assert.equal(windowDecision(s,m,'full',spec,{},true,w),null);assert.equal(s.commitments[0].status,'pending');assert.equal(s.reading!.reserved,2);
  assert.throws(()=>deliverBeforeJump(s,m,s.commitments[0].id,w),/整理/);assert.equal(s.commitments[0].status,'pending');
  w.load=50;assert.equal(deliverBeforeJump(s,m,s.commitments[0].id,w).nodeId,'rt_long_2');assert.equal(s.reading!.reserved,1);
});
test('a live accepted line blocks other reading entrances but not ordinary due commitments',()=>{
  const {s,m,w}=setup();s.reading!.active={id:'rt_long',status:'accepted'};s.reading!.reserved=2;
  addPromises(s,m,'application_nearest');assert.equal(windowDecision(s,m,'due',spec,{},true,w)!.id,'application_review');assert.equal(s.reading!.active.id,'rt_long');assert.equal(s.reading!.misses,0);
});
test('invalid branching graphs cannot reserve too little, omit exits, loop, or silently route to continuous scenes',()=>{
  validateReadingProfile(fixture,contentFor('0.13.0'));
  for(const mutate of [
    (p:typeof fixture)=>{p.threads[0].maxScenes=2;},
    (p:typeof fixture)=>{p.threads[0].steps.rt_long_1.rt_long_1_next.remaining=1;},
    (p:typeof fixture)=>{delete p.threads[0].steps.rt_long_1.rt_long_1_leave;},
    (p:typeof fixture)=>{p.threads[0].steps.rt_long_1.rt_long_1_next.promise!.afterScenes=1;},
    (p:typeof fixture)=>{p.nodes[0].choices[0].outcome!.next='rt_long_2';},
  ]){const p=structuredClone(fixture);mutate(p);assert.throws(()=>validateReadingProfile(p,contentFor('0.13.0')));}
});
test('isolated real-Life fixture tests and production parser separation',()=>{
  execFileSync(process.execPath,['scripts/test-reading-threads.mjs'],{stdio:'pipe'});
  const raw=readFileSync('output/reading-threads-20261026/ui-fixtures/before-first-window.json','utf8');
  assert.throws(()=>parseSave(raw,baseStory));
  const l=createLife(baseStory,1);for(const mutate of [
    (x:Life)=>{x.schedule!.reading!.opened.escape_cat=0;},
    (x:Life)=>{x.schedule!.reading!.shown=1;},
    (x:Life)=>{x.schedule!.reading!.reserved=1;},
    (x:Life)=>{x.schedule!.reading!.misses=1;},
  ]){const x=structuredClone(l);mutate(x);assert.throws(()=>parseSave(JSON.stringify(createSave(x)),baseStory));}
  const old=parseSave(readFileSync('tests/fixtures/ending-b-0.12.json','utf8'),baseStory).life;
  let copy=createLife(baseStory,old.seed,null,'0.12.0');for(const command of old.commands)copy=step(baseStory,copy,command);assert.deepEqual(copy,old);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {baseStory,nextCommand,nodeId} from './helpers/scheduler';
import {createLife,step,newReadingAllowed} from '../src/life/engine';
import {contentFor} from '../src/life/content';
import {readingEntries,libraryFor} from '../src/life/reading';
import {recallSources} from '../src/life/recall-sources';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves';
import {pending,weight} from '../src/cognition/engine';
import {readingProfile,publications} from './fixtures/publication-profile';
import {validatePublications,publicationFact} from '../src/life/publications/rules';
import {eligible} from '../src/life/reading-threads/engine';
import {readingWindow,canWait,allowedWaits,safeToRespond} from '../src/life/scheduler/integration';
import {due} from '../src/life/scheduler/engine';
import type {Life,LifeCommand} from '../src/life/types';

const out='output/publications-20261028/fixture-saves';mkdirSync(out,{recursive:true});
const cog=(l:Life,command:Extract<LifeCommand,{type:'cognition'}>['command'])=>step(baseStory,l,{type:'cognition',command});
const choose=(l:Life,id:string)=>cog(l,{type:'choose',choiceId:id,investment:0});
const ready=(id:string)=>(l:Life)=>nodeId(l)===id&&!pending(l.mind)&&l.state.phase!=='resolution';
const replay=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const save=(id:string,l:Life)=>{replay(l);writeFileSync(`${out}/${id}.json`,JSON.stringify(createSave(l),null,2));};
function drive(l:Life,stop:(l:Life)=>boolean,autoRead=false):Life {
  for(let i=0;i<450;i++){
    if(stop(l))return l;
    let cmd:LifeCommand|null=null;
    if(autoRead&&newReadingAllowed(l)&&l.mind.world.flags[publicationFact('test_public_followup')]&&l.schedule!.reading!.opened.test_public_followup===undefined)cmd={type:'read',entryId:'test_public_followup'};
    if(!cmd&&safeToRespond(l)){const p=due(l.schedule!).find(p=>p.mode!=='summary');if(p)cmd={type:'respond',promiseId:p.id};}
    if(!cmd&&canWait(l)&&l.schedule!.commitments.some(p=>p.readingThread&&p.status==='pending'))cmd={type:'wait',hours:Math.min(...allowedWaits(l)),missed:[]};
    cmd??=nextCommand(l);if(!cmd)return l;l=step(baseStory,l,cmd);
  }throw new Error('Fixture route exceeded bound');
}
function start(seed=1,at='days_tickets'){
  let l=drive(createLife(baseStory,seed),ready(at));
  assert(ready(at)(l));l=step(baseStory,l,{type:'read',entryId:'insurance'});return l;
}

test('versioned full library admits the unpublished root, while direct read and reread help reject it',()=>{
  const l=start();assert.match(LIFE_KEYS.auto,/publication-test/);assert(libraryFor('0.15.0').entries.some(e=>e.id==='test_public_followup'));
  assert(!libraryFor('0.14.0').entries.some(e=>e.id==='test_public_followup'));
  assert(!readingEntries(l).some(e=>e.id==='test_public_followup'));assert(!recallSources(l).some(e=>e.id==='test_public_followup'));
  assert.throws(()=>step(baseStory,l,{type:'read',entryId:'test_public_followup'}));save('before-first-window',l);
});

test('real two-scene A publishes P, only reading P permits B, and publication does not spend another slot or RNG',()=>{
  let successful=false;
  for(let seed=1;seed<=16;seed++){
    let l=drive(start(seed),ready('rt_pub_a2'));if(!ready('rt_pub_a2')(l))continue;
    const before=structuredClone(l),rng=l.schedule!.rng,ledger=structuredClone(l.schedule!.reading);save('before-publish',l);
    l=choose(l,'rt_pub_a2_publish');assert.equal(l.schedule!.rng,rng);assert.equal(weight(l.mind)-weight(before.mind),2);
    assert.equal(l.schedule!.reading!.shown,ledger!.shown);assert.equal(l.schedule!.reading!.entrances,ledger!.entrances);
    assert(readingEntries(l).some(e=>e.id==='test_public_followup'));assert.equal(l.schedule!.reading!.opened.test_public_followup,undefined);
    assert.throws(()=>step(baseStory,l,{type:'read',entryId:'test_public_followup'}));save('published-result',l);
    const refused=choose(before,'rt_pub_a2_leave');assert(!readingEntries(refused).some(e=>e.id==='test_public_followup'));replay(refused);
    const noRead=drive(l,()=>false);assert(!noRead.schedule!.reading!.closed.includes('rt_pub_b'));assert.equal(noRead.schedule!.reading!.entrances,1);replay(noRead);
    const finish=drive(l,ready('rt_pub_b1'),true);
    if(!ready('rt_pub_b1')(finish))continue;
    assert.equal(finish.schedule!.reading!.entrances,2);assert.equal(finish.schedule!.reading!.shown,3);save('successor-entry',finish);
    const closed=choose(finish,'rt_pub_b1_leave');assert(readingEntries(closed).some(e=>e.id==='test_public_followup'));replay(closed);successful=true;break;
  }assert(successful,'At least one legal seed must complete the bounded connection');
});

test('published and read post does not bypass remaining-route capacity, reservations, entry count or no more windows',()=>{
  let l=drive(start(),ready('rt_pub_a2'));assert(ready('rt_pub_a2')(l));l=choose(l,'rt_pub_a2_publish');l=cog(l,{type:'continue'});
  if(!newReadingAllowed(l))l=drive(l,newReadingAllowed);
  l=step(baseStory,l,{type:'read',entryId:'test_public_followup'});save('published-read',l);
  for(const change of [
    (x:Life)=>{x.schedule!.reading!.shown=4;},
    (x:Life)=>{x.schedule!.reading!.active={id:'rt_pub_a',status:'accepted'};x.schedule!.reading!.reserved=1;},
    (x:Life)=>{x.schedule!.reading!.entrances=2;},
  ]){const x=structuredClone(l);x.schedule!.coreScenes++;change(x);const w=readingWindow(x)!;w.threads=structuredClone(w.threads);w.threads.find(t=>t.id==='rt_pub_b')!.maxScenes=2;assert(!eligible(x.schedule!,w,'rt_pub_b'));assert(readingEntries(x).some(e=>e.id==='test_public_followup'));}
  const final=drive(l,()=>false);replay(final);const n=final.schedule!.reading!.entrances;assert(readingEntries(final).some(e=>e.id==='test_public_followup'));assert.equal(final.state.phase,'ending');assert.throws(()=>step(baseStory,final,{type:'read',entryId:'test_public_followup'}));assert.equal(final.schedule!.reading!.entrances,n);
});

test('late explicit promise delivers at a main host and can publish before confirmation without forcing another window',()=>{
  let found=false;
  for(let seed=1;seed<=30;seed++){
    let l=drive(start(seed,'days_echo'),ready('rt_pub_a1'));if(!ready('rt_pub_a1')(l))continue;
    l=choose(l,'rt_pub_a1_next');l=cog(l,{type:'continue'});l=drive(l,ready('continuation'));
    const p=l.schedule!.commitments.find(p=>p.readingThread&&p.status==='pending');if(!p)continue;
    save('late-promise',l);
    l=drive(l,ready('rt_pub_a2'));if(!ready('rt_pub_a2')(l))continue;
    assert.equal(l.schedule!.active!.resume.driver,'idle');l=choose(l,'rt_pub_a2_publish');save('late-published-result',l);
    l=cog(l,{type:'continue'});assert(ready('continuation')(l));const count=l.schedule!.reading!.entrances;
    l=step(baseStory,l,{type:'read',entryId:'test_public_followup'});l=drive(l,()=>false);assert.equal(l.schedule!.reading!.entrances,count);replay(l);found=true;break;
  }assert(found);
});

test('self-open, cycles, more than one successor layer and hidden source roots are invalid',()=>{
  const content=contentFor('0.15.0'),entries=libraryFor('0.15.0').entries;
  for(const change of [
    (r:typeof readingProfile,_p:typeof publications)=>{r.threads[0].rootPost='test_public_followup';},
    (_r:typeof readingProfile,p:typeof publications)=>{p.hiddenPosts=['insurance'];},
    (_r:typeof readingProfile,p:typeof publications)=>{p.links.push({node:'rt_pub_b1',choice:'rt_pub_b1_next',post:'test_public_followup'});},
  ]){const r=structuredClone(readingProfile),p=structuredClone(publications);change(r,p);assert.throws(()=>validatePublications(p,content,r,entries));}
  const cycle=structuredClone(readingProfile),cyclePosts=structuredClone(publications);
  const back={...structuredClone(cyclePosts.posts[0]),id:'test_cycle_back',sourceRecord:'cycle'};
  cyclePosts.posts.push(back);cyclePosts.links.push({node:'rt_pub_b1',choice:'rt_pub_b1_next',post:back.id});
  cycle.threads[0].rootPost=back.id;
  assert.throws(()=>validatePublications(cyclePosts,content,cycle,[...entries,back]),/循环/);
  // A -> P -> B -> Q -> C is rejected without adding a generic runtime graph.
  const r=structuredClone(readingProfile),p=structuredClone(publications),c=structuredClone(content);
  const q={...structuredClone(p.posts[0]),id:'test_second_followup',sourceRecord:'second'};p.posts.push(q);
  p.links.push({node:'rt_pub_b1',choice:'rt_pub_b1_next',post:q.id});
  const third=structuredClone(r.threads[1]);third.id='rt_pub_c';third.entry='rt_pub_c1';third.rootPost=q.id;third.steps={rt_pub_c1:{c_leave:{remaining:0}}};r.threads.push(third);
  c.nodes.push({id:'rt_pub_c1',kind:'EVENT',title:'test',text:['test'],choices:[{id:'c_leave',text:'Leave',hint:'test',capacityExempt:'exit',outcome:{text:['Left'],next:'schedule_return'}}]});
  assert.throws(()=>validatePublications(p,c,r,[...entries,q]),/一层/);
});

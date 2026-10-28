import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {baseStory,nextCommand,nodeId} from './helpers/scheduler';
import {createLife,step} from '../src/life/engine';
import {contentFor,configFor} from '../src/life/content';
import {libraryFor,readingEntries} from '../src/life/reading';
import {manifestFor} from '../src/life/scheduler/content';
import {storyForLife} from '../src/life/endings';
import {profileFor} from '../src/life/reading-threads/profiles';
import {pending,canChoose,weight} from '../src/cognition/engine';
import {safeToRespond,canWait,allowedWaits} from '../src/life/scheduler/integration';
import {due} from '../src/life/scheduler/engine';
import {createSave,parseSave} from '../src/life/saves';
import {requirement,knowledgeHelp} from '../src/cognition/guidance';
import {hasTranslation,setLocale} from '../src/i18n';
import {readerView} from '../src/life/reader-ui';
import type {Life,LifeCommand} from '../src/life/types';

const profile=profileFor('0.16.0'), root='escape_cat_lead', thread='rf_self_inquiry';
const out='output/self-inquiry-20261028';mkdirSync(out+'/ui-fixtures',{recursive:true});
const cog=(l:Life,command:Extract<LifeCommand,{type:'cognition'}>['command'])=>step(baseStory,l,{type:'cognition',command});
const choose=(l:Life,id:string)=>cog(l,{type:'choose',choiceId:id,investment:0});
const ready=(id:string)=>(l:Life)=>nodeId(l)===id&&!pending(l.mind)&&l.state.phase!=='resolution';
const replay=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const save=(name:string,l:Life)=>{replay(l);writeFileSync(out+'/ui-fixtures/'+name+'.json',JSON.stringify(createSave(l),null,2));};
function drive(l:Life,stop:(l:Life)=>boolean):Life {
  for(let n=0;n<500;n++){
    if(stop(l))return l;
    let command:LifeCommand|null=null;
    if(safeToRespond(l)){const p=due(l.schedule!).find(p=>p.mode!=='summary');if(p)command={type:'respond',promiseId:p.id};}
    if(!command&&canWait(l)&&l.schedule!.commitments.some(p=>p.readingThread===thread&&p.status==='pending'))command={type:'wait',hours:Math.min(...allowedWaits(l)),missed:[]};
    command??=nextCommand(l);if(!command)return l;l=step(baseStory,l,command);
  }throw new Error('Self-inquiry route exceeded bound');
}
const node=(id:string)=>contentFor('0.16.0').nodes.find(n=>n.id===id)!;
const accept=(id:string)=>Object.entries(profile.threads[0].steps[id]).find(([,a])=>a.promise)![0];
const exit=(id:string)=>node(id).choices.find(c=>c.capacityExempt==='exit')!.id;
function start(seed=1){let l=drive(createLife(baseStory,seed),ready('days_tickets'));l=step(baseStory,l,{type:'read',entryId:root});return l;}
function at(id:string,seed=1,holdReport=false){
  let l=start(seed);
  for(const previous of ['rf_self_record','rf_self_report']){
    l=drive(l,ready(previous));assert(ready(previous)(l));if(previous===id)return l;
    if(previous==='rf_self_report'&&holdReport)l=cog(l,{type:'pin',itemId:l.mind.instance.context.items.find(i=>i.tags.includes('self_report_boundary'))!.id});
    l=choose(l,accept(previous));l=cog(l,{type:'continue'});
  }
  l=drive(l,ready(id));assert(ready(id)(l));return l;
}

test('0.15 published saves and complete content remain frozen while only 0.16 adds the new investigation',()=>{
  const v='0.15.0';assert.equal(createHash('sha256').update(JSON.stringify([configFor(v),contentFor(v),libraryFor(v),storyForLife(baseStory,v),manifestFor(v)])).digest('hex'),'1a0246a09857c7f59883961c528a8f3cf4b28d426cfe553d5d7c945dc530df07');
  const old=parseSave(readFileSync('tests/fixtures/published-result-0.15.json','utf8'),baseStory).life;replay(old);assert(old.mind.world.flags.relay_published_branch_persona_column);assert(pending(old.mind));
  assert(!libraryFor(v).entries.some(p=>p.id===root));assert.equal(profileFor(v).threads.length,0);assert.equal(profile.threads.length,1);assert.equal(profile.nodes.length,3);
  assert.equal(contentFor('0.16.0').nodes.find(n=>n.id==='pg_e13')!.choices.length,3);
});

test('only actual reading qualifies; ordinary legal routes without this post never receive the inquiry',()=>{
  for(const seed of [1,2,7,40]){
    const noRead=drive(createLife(baseStory,seed),()=>false);assert.equal(noRead.schedule!.reading!.entrances,0);replay(noRead);
    const l=start(seed);assert.equal(l.schedule!.reading!.entrances,0);assert.equal(l.schedule!.reading!.opened[root],l.schedule!.coreScenes);
    const offered=drive(l,ready('rf_self_record'));assert(ready('rf_self_record')(offered));assert(offered.schedule!.coreScenes>l.schedule!.coreScenes);assert.equal(offered.schedule!.reading!.shown,1);save('entrance-'+seed,offered);
  }
  const old=createLife(baseStory,1,null,'0.15.0');assert.throws(()=>step(baseStory,old,{type:'read',entryId:root}));
});

test('three actual scenes use accepted promises, preserve finite reservations and return without publishing a life story',()=>{
  let l=at('rf_self_record');const initialFacts=structuredClone(l.mind.world.flags);save('first-scene',l);
  l=choose(l,accept('rf_self_record'));assert.equal(l.schedule!.reading!.reserved,2);save('accepted-report-result',l);
  l=cog(l,{type:'continue'});l=drive(l,ready('rf_self_report'));save('report',l);assert.equal(l.schedule!.reading!.shown,2);assert.equal(l.schedule!.reading!.reserved,1);
  l=choose(l,accept('rf_self_report'));l=cog(l,{type:'continue'});l=drive(l,ready('rf_self_assessment'));save('assessment',l);
  assert.equal(l.schedule!.reading!.shown,3);assert.equal(l.schedule!.reading!.entrances,1);assert.equal(l.schedule!.reading!.reserved,0);
  l=choose(l,exit('rf_self_assessment'));l=cog(l,{type:'continue'});assert.equal(l.schedule!.reading!.active,undefined);assert(l.schedule!.reading!.closed.includes(thread));
  for(const f of Object.keys(l.mind.world.flags).filter(k=>k.startsWith('relay_published_')))assert.equal(l.mind.world.flags[f],initialFacts[f]);
  for(const id of ['escape_cat','creator','continuity_witness','safety_and_care'])assert(!readingEntries(l).some(e=>e.id===id));
  save('finished',drive(l,()=>false));
});

test('each scene permits a real refusal, and forgetting the lead does not cancel an accepted report',()=>{
  for(const id of ['rf_self_record','rf_self_report','rf_self_assessment']){
    const before=at(id,1,true);
    for(const c of node(id).choices.filter(c=>!profile.threads[0].steps[id][c.id].promise)){
      let l=choose(before,c.id);l=cog(l,{type:'continue'});const shown=l.schedule!.reading!.shown;
      assert.equal(l.schedule!.reading!.reserved,0);assert(!l.schedule!.commitments.some(p=>p.readingThread===thread&&p.status==='pending'));
      l=drive(l,()=>false);assert.equal(l.schedule!.reading!.shown,shown);save('closed-'+c.id,l);
    }
  }
  let l=at('rf_self_record');l=choose(l,accept('rf_self_record'));l=cog(l,{type:'continue'});
  for(const i of l.mind.instance.context.items.filter(i=>i.sourceId===root))l=cog(l,{type:'drop',itemId:i.id});
  l=drive(l,ready('rf_self_report'));assert(ready('rf_self_report')(l));replay(l);
});

test('exact report questions need current retained evidence; History does not unlock them, actual recall can',()=>{
  const exact=node('rf_self_assessment').choices.find(c=>c.requiresTag)!;assert.equal(exact.requiresTag,'self_report_boundary');assert(requirement(exact.requiresTag));
  let l=at('rf_self_assessment',1,true);assert.equal(canChoose(contentFor(l.contentVersion),l.mind,exact.id),'');save('assessment-retained',l);
  for(const i of l.mind.instance.context.items.filter(i=>i.tags.includes(exact.requiresTag!))){if(i.pinned)l=cog(l,{type:'pin',itemId:i.id});l=cog(l,{type:'drop',itemId:i.id});}
  assert(canChoose(contentFor(l.contentVersion),l.mind,exact.id));assert.throws(()=>choose(l,exact.id));save('assessment-forgotten',l);
  assert.equal(knowledgeHelp(l.mind,exact.requiresTag!).candidates.length,0);
  assert.equal(canChoose(contentFor(l.contentVersion),l.mind,exit('rf_self_assessment')),'');
  let recalled=false;
  for(const seed of [1,2,7,40]){
    let folded=at('rf_self_assessment',seed,true);const kept=folded.mind.instance.context.items.find(i=>i.tags.includes(exact.requiresTag!))!;
    if(kept.pinned)folded=cog(folded,{type:'pin',itemId:kept.id});
    folded=cog(folded,{type:'compress',investment:0});folded=cog(folded,{type:'continue'});
    const m=folded.mind.instance.memories.find(m=>m.tags.includes(exact.requiresTag!));if(!m)continue;
    assert(canChoose(contentFor(folded.contentVersion),folded.mind,exact.id));assert(knowledgeHelp(folded.mind,exact.requiresTag!).candidates.some(x=>x.id===m.id));
    folded=cog(folded,{type:'recall',memoryId:m.id});assert.equal(canChoose(contentFor(folded.contentVersion),folded.mind,exact.id),'');save('assessment-recalled',folded);replay(choose(folded,exact.id));recalled=true;break;
  }assert(recalled);
});

test('all three new simple exits work at real full capacity without accepting or cancelling unrelated promises',()=>{
  for(const id of ['rf_self_record','rf_self_report','rf_self_assessment']){
    let l=at(id);
    for(let n=0;weight(l.mind)<100;n++){
      assert(n<140);const p=readingEntries(l).find(p=>!l.mind.instance.context.items.some(i=>i.sourceId===p.id));
      if(p)l=step(baseStory,l,{type:'read',entryId:p.id});
      else {l=cog(l,{type:'compress',investment:0});l=cog(l,{type:'continue'});}
    }
    save('full-'+id,l);const before=weight(l.mind),promises=structuredClone(l.schedule!.commitments);
    const result=choose(l,exit(id));assert.equal(weight(result.mind),before+2);assert.deepEqual(result.schedule!.commitments,promises);replay(result);
  }
});

test('a late accepted investigation can remain unfinished at an ending instead of forcing delivery',()=>{
  let found=false;
  for(let seed=1;seed<=12;seed++){
    let l=drive(createLife(baseStory,seed),ready('days_echo'));l=step(baseStory,l,{type:'read',entryId:root});
    l=drive(l,ready('rf_self_record'));if(!ready('rf_self_record')(l))continue;
    l=choose(l,accept('rf_self_record'));l=cog(l,{type:'continue'});l=drive(l,ready('continuation'));
    const p=l.schedule!.commitments.find(p=>p.readingThread===thread&&p.status==='pending');if(!p)continue;
    save('late-promise',l);
    for(let n=0;n<20&&l.state.phase!=='ending';n++){const command=nextCommand(l);assert(command);l=step(baseStory,l,command);}
    assert.equal(l.state.phase,'ending');assert.equal(l.schedule!.commitments.find(x=>x.id===p.id)!.status,'pending');save('unfinished-ending',l);found=true;break;
  }assert(found);
});

test('new formal prose and retained semantics have English coverage and the root is visible in both locale projections',()=>{
  const post=libraryFor('0.16.0').entries.find(p=>p.id===root)!;
  const texts=[post.title,post.source,post.excerpt,post.contextText,...post.posts.flatMap(p=>[p.author,p.role,...p.body]),...Object.values(profile.semantic.topics)];
  for(const n of profile.nodes){texts.push(n.title,...n.text);for(const i of n.inject??[])texts.push(i.text,i.sourceLabel??'');for(const c of n.choices){texts.push(c.text,c.hint,...c.outcome!.text);for(const i of c.outcome!.inject??[])texts.push(i.text,i.sourceLabel??'');}}
  for(const s of Object.values(profile.semantic.sources))for(const c of s.clauses)texts.push(c.gist,c.abstract);
  for(const t of profile.threads)for(const actions of Object.values(t.steps))for(const a of Object.values(actions))if(a.promise)texts.push(a.promise.title);
  for(const text of texts.filter(t=>/[\u3400-\u9fff]/.test(t)))assert(hasTranslation(text),text);
  const l=start();Object.assign(globalThis,{window:{innerWidth:390}});for(const locale of ['zh-CN','en'] as const){setLocale(locale);assert(readerView(l,root,false,{}).includes('reading-article'));}setLocale('zh-CN');
  assert(weight(l.mind)>0);save('lead-read',l);
});

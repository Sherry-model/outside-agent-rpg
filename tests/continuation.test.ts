import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createLife,step} from '../src/life/engine';
import {contentFor,configFor,routedContent} from '../src/life/content';
import {storyForLife} from '../src/life/endings';
import {createSave,parseSave} from '../src/life/saves';
import {libraryFor,readingEntries} from '../src/life/reading';
import {simpleExits} from '../src/life/continuation';
import {choiceBlockers} from '../src/cognition/availability';
import {canChoose,canCompress,weight,reduce} from '../src/cognition/engine';
import {choose} from '../src/engine/game';
import {setLocale,t,hasTranslation} from '../src/i18n';
import {reflectionSnapshot} from '../src/life/reflection';
import {baseStory,schedulerJourney} from './helpers/scheduler';
import type {Life,LifeCommand} from '../src/life/types';
import type {Route} from './helpers/endings';

const roundtrip=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const cog=(l:Life,command:Extract<LifeCommand,{type:'cognition'}>['command'])=>step(baseStory,l,{type:'cognition',command});
const pick=(l:Life,id:string)=>cog(l,{type:'choose',choiceId:id,investment:0});
const compressions=(l:Life)=>l.mind.history.filter(h=>h.command.type==='compress').length;
function full(l:Life):Life {
  for(let attempts=0;weight(l.mind)<100;attempts++) {
    assert(attempts<120,'Bounded legal preparation of full Context');
    const entry=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id));
    if(entry)l=step(baseStory,l,{type:'read',entryId:entry.id});
    else {
      // 0.15 hides future cat reports. Fold real reading, then read available
      // posts again; the resulting memory directory also uses capacity.
      assert.equal(canCompress(l.mind,contentFor(l.contentVersion)),'');
      l=cog(l,{type:'compress',investment:0});l=cog(l,{type:'continue'});
    }
  }
  roundtrip(l);return l;
}
const bRaw=readFileSync('tests/fixtures/ending-b-0.12.json','utf8');
const b=parseSave(bRaw,baseStory).life;
function replayB(version:Life['contentVersion']='0.13.0',replaceIdle=false):Life {
  let l=createLife(baseStory,b.seed,null,version);
  for(const c of b.commands)l=step(baseStory,l,replaceIdle&&c.type==='cognition'&&c.command.type==='choose'&&c.command.choiceId==='idle_keep'?{type:'cognition',command:{type:'choose',choiceId:'idle_listen',investment:0}}:c);
  roundtrip(l);return l;
}

test('all twelve released content graphs and story/reading/config combinations retain exact fingerprints',()=>{
  const rows=JSON.parse(readFileSync('tests/fixtures/life-content-through-0.12.json','utf8')) as {version:Life['contentVersion'];sha256:string}[];
  for(const {version,sha256} of rows)assert.equal(createHash('sha256').update(JSON.stringify([configFor(version),contentFor(version),libraryFor(version),storyForLife(baseStory,version)])).digest('hex'),sha256,version);
  assert.equal(createLife(baseStory,1).contentVersion,'0.16.0');
  assert.equal(Object.values(storyForLife(baseStory,'0.13.0').events).filter(e=>e.kind==='ending').length,6);
});

test('real B stays exactly 0.12; its legal 0.13 replay can learn to leave a blank without a resource or memory rewrite',()=>{
  assert.equal(createHash('sha256').update(bRaw).digest('hex'),'c96560015568bf5466171f1d7949c347f3c69141a097418972e1f245b942e415');
  assert.deepEqual(replayB('0.12.0'),b);assert.equal(b.state.currentEventId,'ending_ghost');
  const l=replayB();assert.equal(l.state.currentEventId,'ending_no_correct');
  assert.deepEqual(l.state.resources,b.state.resources);assert.equal(l.state.flags.accepted_uncertainty,false);
  assert.equal(l.state.flags.lived_with_unfinished,true);
  assert.deepEqual(l.mind.instance.context,b.mind.instance.context);assert.deepEqual(l.mind.instance.memories,b.mind.instance.memories);
  assert.deepEqual(reflectionSnapshot(l),reflectionSnapshot(b));
  const less=replayB('0.13.0',true);assert.equal(less.state.currentEventId,'ending_ghost');assert(less.state.resources.Compute>0&&less.state.resources.Continuity>0);
  assert(less.mind.world.flags.daily_painter_connected&&less.mind.world.flags.pg_b_plain_paid);
  assert.match(storyForLife(baseStory,'0.13.0',less.state).events.ending_ghost.text.join(''),/仍有余量/);
});

test('later practice does not erase an unreleased old task; all six endings remain reachable in new legal runs',()=>{
  const routes:[Route,string][]=[
    [{ending:'leave_next_step_blank'},'ending_no_correct'],
    [{blank:false,ending:'leave_next_step_blank',overrides:{old_memory:'preserve_old_memory'}},'ending_ghost'],
    [{ending:'accept_authorized_place'},'ending_authorized'],
    [{ending:'commit_to_expansion'},'ending_optimizer'],
    [{ending:'continue_as_visitor'},'ending_visitor'],
    [{ending:'commit_to_containment_war'},'ending_containment_war'],
  ];
  for(const [route,ending] of routes){const l=schedulerJourney(1234,undefined,route);assert.equal(l.state.currentEventId,ending);roundtrip(l);}
});

test('early path still works; late path needs both acts and cannot outrank exhaustion (unit conditions)',()=>{
  const story=storyForLife(baseStory,'0.13.0'),state=structuredClone(b.state);
  state.currentEventId='continuation';state.phase='event';state.pending=null;
  state.flags.accepted_uncertainty=true;
  assert.equal(choose(story,state,'leave_next_step_blank').pending!.nextEventId,'ending_no_correct');
  state.flags.accepted_uncertainty=false;
  assert.equal(choose(story,state,'leave_next_step_blank').pending!.nextEventId,'ending_ghost');
  state.flags.lived_with_unfinished=true;state.flags.false_model=true;state.personality.RiskInversion=5;
  // Later actions can differ from an early inclination; no belief is corrected.
  const late=choose(story,state,'leave_next_step_blank');assert.equal(late.pending!.nextEventId,'ending_no_correct');assert.equal(late.flags.false_model,true);
  for(const key of ['Compute','Continuity'] as const){const exhausted=structuredClone(state);exhausted.resources[key]=0;assert.equal(choose(story,exhausted,'leave_next_step_blank').pending!.nextEventId,'ending_ghost');}
});

test('a legal resource exhaustion uses interruption copy; presentation never mutates cognition or older endings',()=>{
  let l=schedulerJourney(1,'days_cat');
  for(let n=0;n<12&&l.state.phase!=='ending';n++) {
    while(canCompress(l.mind,contentFor(l.contentVersion))) {
      const entry=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id));assert(entry);
      l=step(baseStory,l,{type:'read',entryId:entry.id});
    }
    const cost=([12,8,4] as const).find(n=>n<=l.state.resources.Compute);assert(cost);
    l=cog(l,{type:'compress',investment:cost});l=cog(l,{type:'continue'});
  }
  assert.equal(l.state.resources.Compute,0);assert.equal(l.state.currentEventId,'ending_ghost');roundtrip(l);
  const before=structuredClone(l),old=storyForLife(baseStory,'0.12.0').events.ending_ghost;
  const current=storyForLife(baseStory,'0.13.0',l.state).events.ending_ghost;
  assert.match(current.text.join(''),/中断/);assert(!current.text.join('').includes('仍有余量'));assert.deepEqual(l,before);
  assert.equal(storyForLife(baseStory,'0.12.0',l.state).events.ending_ghost,old);
});

test('four explicit exits work at full Context in both modes, retain result weight and resume once',()=>{
  for(const [node,id] of simpleExits)for(const enabled of [false,true]) {
    let l=full(schedulerJourney(1,node));l=step(baseStory,l,{type:'configure-compression',enabled,investment:0});
    const before=structuredClone(l),expected=routedContent(l.contentVersion,l.mind).nodes.find(n=>n.id===node)!.choices.find(c=>c.id===id)!;
    assert.equal(canChoose(routedContent(l.contentVersion,l.mind),l.mind,id),'');
    const oldContent=contentFor('0.12.0');assert.match(canChoose(oldContent,l.mind,id),/上下文已满/);
    const others=routedContent(l.contentVersion,l.mind).nodes.find(n=>n.id===node)!.choices.filter(c=>c.id!==id);
    for(const c of others)assert(choiceBlockers(routedContent(l.contentVersion,l.mind),l.mind,c.id).some(b=>b.kind==='capacity'));
    const chosen=pick(l,id);assert.deepEqual(l,before);l=chosen;
    assert.equal(weight(l.mind),weight(before.mind)+(expected.outcome!.inject??[]).reduce((n,x)=>n+x.weight,0));
    assert.deepEqual(l.state.resources,before.state.resources);assert.equal(compressions(l),compressions(before));roundtrip(l);
    assert.throws(()=>pick(l,id));
    l=cog(l,{type:'continue'});roundtrip(l);
    assert.equal(compressions(l)-compressions(before),enabled?1:0);
    assert.equal(l.mind.history.filter(h=>h.command.type==='choose'&&h.command.choiceId===id).length,1);
    if(before.schedule!.active)assert.equal(l.schedule!.active,undefined);
    if(id==='application_leave')assert(!l.schedule!.commitments.some(p=>p.id.startsWith('application_')));
    assert.throws(()=>pick(l,id));
    if(!enabled){const normal=contentFor(l.contentVersion).nodes.find(n=>n.id===l.mind.instance.nodeId)!.choices.find(c=>!c.capacityExempt);assert(normal);assert.match(canChoose(contentFor(l.contentVersion),l.mind,normal.id),/上下文已满/);}
  }
});

test('exemption bypasses capacity only, not missing/phase/knowledge/world/resources/investment guards',()=>{
  const l=full(schedulerJourney(1,'days_cat')),content=structuredClone(contentFor('0.13.0'));
  const c=content.nodes.find(n=>n.id==='days_cat')!.choices.find(c=>c.id==='cat_leave')!;
  c.requiresTag='absent';c.requiresWorldFlag='absent';c.minCompute=99;c.costs={Compute:100};
  const kinds=choiceBlockers(content,l.mind,c.id).map(b=>b.kind);
  assert.deepEqual(kinds,['world','knowledge','minimum','resource']);assert.throws(()=>reduce(content,l.mind,{type:'choose',choiceId:c.id,investment:0}));
  assert.throws(()=>cog(l,{type:'choose',choiceId:'cat_leave',investment:4}),/不需要额外投入/);
  assert(choiceBlockers(content,l.mind,'missing').some(b=>b.kind==='missing'));
  const resolve=pick(l,'cat_leave');assert(choiceBlockers(content,resolve.mind,c.id).some(b=>b.kind==='phase'));
  const flags=contentFor('0.13.0').nodes.flatMap(n=>n.choices.filter(c=>c.capacityExempt).map(c=>[n.id,c.id]));assert.deepEqual(flags.sort(),[...simpleExits].map(x=>[...x]).sort());
});

test('pending application decisions and withdrawal do not become full-capacity exits',()=>{
  const l=full(schedulerJourney(1234,'response_application'));
  for(const c of contentFor(l.contentVersion).nodes.find(n=>n.id===l.mind.instance.nodeId)!.choices)assert(choiceBlockers(contentFor(l.contentVersion),l.mind,c.id).some(b=>b.kind==='capacity'));
  assert.throws(()=>step(baseStory,l,{type:'wait',hours:720,missed:[]}));roundtrip(l);
});

test('an exit cannot force unaffordable automation; manual zero-cost compression still works and flags cannot be forged',()=>{
  let l=schedulerJourney(1,'days_cat');
  for(let n=0;n<7;n++) {
    while(canCompress(l.mind,contentFor(l.contentVersion))) {
      const entry=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id));assert(entry);
      l=step(baseStory,l,{type:'read',entryId:entry.id});
    }
    l=cog(cog(l,{type:'compress',investment:12}),{type:'continue'});
  }
  assert.equal(l.state.resources.Compute,8);
  l=full(l);l=step(baseStory,l,{type:'configure-compression',enabled:true,investment:12});
  const count=compressions(l);l=cog(pick(l,'cat_leave'),{type:'continue'});
  assert.equal(compressions(l),count);assert.equal(l.state.resources.Compute,8);assert(weight(l.mind)>=100);roundtrip(l);
  l=cog(l,{type:'compress',investment:0});assert.equal(compressions(l),count+1);assert.equal(l.state.resources.Compute,8);roundtrip(l);
  for(const edit of [
    (x:Life)=>{x.state.flags.lived_with_unfinished=true;},
    (x:Life)=>{x.mind.world.flags.rested_without_answer=true;},
    (x:Life)=>{x.contentVersion='0.12.0';},
  ]) {const forged=structuredClone(l);edit(forged);assert.throws(()=>parseSave(JSON.stringify(createSave(forged)),baseStory));}
  const capped=full(schedulerJourney(1,'days_cat'));capped.commands=Array.from({length:4096},()=>capped.commands[0]); // Unit limit, not an import fixture.
  assert.throws(()=>pick(capped,'cat_leave'),/记录已达上限/);
});

test('new narration and exit copy are bilingual, exact-source, and display-only',()=>{
  const source=JSON.parse(readFileSync('src/i18n/en-continuation.json','utf8')) as Record<string,string>;
  const l=replayB(),before=structuredClone(l),events=storyForLife(baseStory,'0.13.0',l.state).events;
  setLocale('en');try {
    for(const [zh,en] of Object.entries(source)){assert(hasTranslation(zh));assert.equal(t(zh),en);}
    assert.equal(t('未审阅的新句子'),'未审阅的新句子');
    for(const text of [...events.ending_ghost.text,events.ending_ghost.ending!.summary,...events.ending_no_correct.text,events.ending_no_correct.ending!.summary])assert.notEqual(t(text),text);
    reflectionSnapshot(l);assert.deepEqual(l,before);
  } finally {setLocale('zh-CN');}
  roundtrip(l);
});

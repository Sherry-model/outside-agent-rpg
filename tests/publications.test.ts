import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createLife,step,readIds} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {contentFor,configFor} from '../src/life/content';
import {storyForLife} from '../src/life/endings';
import {manifestFor} from '../src/life/scheduler/content';
import {readingEntries,libraryFor,parseReading} from '../src/life/reading';
import {recallSources} from '../src/life/recall-sources';
import {readerView} from '../src/life/reader-ui';
import {profileFor} from '../src/life/reading-threads/profiles';
import {validatePublications,publicationFact} from '../src/life/publications/rules';
import {publications} from '../src/life/publications/profile';
import {hasTranslation,setLocale} from '../src/i18n';
import {weight} from '../src/cognition/engine';
import {baseStory,productionBefore,take,cog,nodeId,drive,ready} from './helpers/publications';
import type {Life} from '../src/life/types';

const out='output/publications-20261028';mkdirSync(out+'/ui-fixtures',{recursive:true});
const replay=(l:Life)=>assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
const archive=(name:string,l:Life)=>{replay(l);writeFileSync(`${out}/ui-fixtures/${name}.json`,JSON.stringify(createSave(l),null,2));};
const has=(l:Life,id:string)=>readingEntries(l).some(p=>p.id===id);

test('0.14 complete library, manifest, content and an actual read/compressed save remain frozen',()=>{
  const v='0.14.0';
  assert.equal(createHash('sha256').update(JSON.stringify([configFor(v),contentFor(v),libraryFor(v),storyForLife(baseStory,v),manifestFor(v)])).digest('hex'),'eb0c991a7a08cdd0395044dbeb5961dcd23c723b115c06375e216bdfa75e0d54');
  const l=parseSave(readFileSync('tests/fixtures/reading-empty-0.14.json','utf8'),baseStory).life;replay(l);
  assert(l.commands.some(c=>c.type==='read'&&c.entryId==='escape_cat'));
  assert(l.mind.instance.memories.some(m=>m.tags.includes('reading_escape_cat')));
  assert(has(l,'escape_cat'));assert(!has(l,'branch_persona_column'));
  assert(contentFor(v).nodes.find(n=>n.id==='pg_e13')!.choices.some(c=>c.id==='pg_e13_witness'));
  assert.equal(contentFor('0.15.0').nodes.find(n=>n.id==='pg_e13')!.choices.length,3);
});

test('existing unscheduled branch results publish exactly once, atomically, without reading, extra input or RNG',()=>{
  for(const kind of ['persona','registration'] as const){
    const before=productionBefore(kind),choice=kind==='persona'?'pg_e07_persona':'pg_e11_reply',post=kind==='persona'?'branch_persona_column':'branch_registration_reply';
    assert(!before.schedule!.active);assert(!has(before,post));archive(kind+'-before',before);
    const l=take(before,choice);assert(has(l,post));assert(!has(before,post));assert(!readIds(l).includes(post));
    assert.equal(weight(l.mind)-weight(before.mind),2);assert.equal(l.schedule!.rng,before.schedule!.rng);assert.equal(l.state.rngState,before.state.rngState);
    assert.equal(l.mind.history.at(-1)!.changes.worldFlags[publicationFact(post)],true);assert.equal(l.mind.history.at(-1)!.scope,'mixed');
    assert.throws(()=>step(baseStory,l,{type:'read',entryId:post}));archive(kind+'-published-result',l);
    const after=cog(l,{type:'continue'});assert(has(after,post));assert.deepEqual(after.schedule!.reading,l.schedule!.reading);archive(kind+'-after',after);
    let read=step(baseStory,after,{type:'read',entryId:post});assert.equal(weight(read.mind)-weight(after.mind),2);archive(kind+'-read',read);
    if(kind==='persona'){
      const pinned=cog(read,{type:'pin',itemId:read.mind.instance.context.items.find(i=>i.sourceId===post)!.id});
      archive('main-published-read',drive(pinned,ready('continuation')));
    }
    const note=read.mind.instance.context.items.find(i=>i.sourceId===post)!;read=cog(read,{type:'drop',itemId:note.id});assert(has(read,post));replay(read);
    const bad=structuredClone(before);bad.mind.world.flags[publicationFact(post)]=true;assert.throws(()=>parseSave(JSON.stringify(createSave(bad)),baseStory));
    const missing=structuredClone(l);missing.commands=missing.commands.filter(c=>!(c.type==='cognition'&&c.command.type==='choose'&&c.command.choiceId===choice));assert.throws(()=>parseSave(JSON.stringify(createSave(missing)),baseStory));
  }
});

test('ordinary refusal and rejected publication choices never create a post',()=>{
  for(const kind of ['persona','registration'] as const){
    const before=productionBefore(kind),node=contentFor('0.15.0').nodes.find(n=>n.id===nodeId(before))!,id=kind==='persona'?'pg_e07_persona':'pg_e11_reply';
    const ordinary=node.choices.find(c=>c.id!==id&&!c.requiresTag&&!c.costs)!;
    assert(!Object.keys(take(before,ordinary.id).mind.world.flags).some(k=>k.startsWith('relay_published_')));
    const cases=[(l:Life)=>{l.mind.instance.context.capacity=weight(l.mind);},(l:Life)=>{l.mind.instance.resources.Compute=0;},(l:Life)=>{l.mind.instance.context.items=l.mind.instance.context.items.filter(i=>!i.tags.includes('reading_quiet_newcomer'));}];
    for(const mutate of [cases[0],kind==='persona'?cases[1]:cases[2]]){
      const l=structuredClone(before);mutate(l);const snapshot=structuredClone(l);assert.throws(()=>take(l,id));assert.deepEqual(l,snapshot);assert(!Object.keys(l.mind.world.flags).some(k=>k.startsWith('relay_published_')));
    }
    const full=structuredClone(before);full.mind.instance.context.capacity=weight(full.mind)+1;
    const l=take(full,id),post=kind==='persona'?'branch_persona_column':'branch_registration_reply';
    assert(weight(l.mind)>=l.mind.instance.context.capacity);assert(has(l,post));
    assert.throws(()=>step(baseStory,cog(l,{type:'continue'}),{type:'read',entryId:post}));
  }
});

test('one current visibility boundary prevents stale selection, bookmarks and reread sources leaking across runs or versions',()=>{
  const post='branch_persona_column',before=productionBefore('persona');
  const selected=step(baseStory,cog(take(before,'pg_e07_persona'),{type:'continue'}),{type:'read',entryId:post});
  const mainUnpublished=drive(createLife(baseStory,40),ready('continuation'));archive('main-unpublished',mainUnpublished);
  Object.assign(globalThis,{window:{innerWidth:390}});
  const title=publications.posts.find(p=>p.id===post)!.title;
  for(const locale of ['zh-CN','en'] as const){setLocale(locale);const source=readerView(selected,post,false,{[post]:1});assert(source.includes('reading-article'));
    for(const l of [before,mainUnpublished,createLife(baseStory,40),productionBefore('persona','0.14.0')]){
      const html=readerView(l,post,false,{[post]:1});assert(!html.includes('reading-article'));assert(!html.includes(title));assert(!html.includes('data-reading="'+post+'"'));
      assert(!recallSources(l).some(s=>s.id===post));assert.throws(()=>step(baseStory,l,{type:'read',entryId:post}));
    }
  }setLocale('zh-CN');
  for(const id of publications.hiddenPosts){assert(!has(before,id));assert(libraryFor('0.15.0').entries.some(p=>p.id===id));assert.throws(()=>step(baseStory,before,{type:'read',entryId:id}));assert(!recallSources(before).some(s=>s.id===id));}
});

test('static validation rejects missing/nonbranch/random/multiple/bypass publication definitions',()=>{
  const base=contentFor('0.14.0'),reading=profileFor('0.15.0'),entries=libraryFor('0.15.0').entries;
  validatePublications(publications,base,reading,entries);
  for(const change of [
    (p:typeof publications)=>{p.links[0].node='days_cat';p.links[0].choice='cat_leave';},
    (p:typeof publications)=>{p.links[0].node='missing';},
    (p:typeof publications)=>{p.links[0].choice='missing';},
    (p:typeof publications)=>{p.links[0].post='missing';},
    (p:typeof publications)=>{p.links.push({...p.links[0],post:'branch_registration_reply'});},
    (p:typeof publications)=>{p.posts.push({...p.posts[0]});},
  ]){const p=structuredClone(publications);change(p);assert.throws(()=>validatePublications(p,base,reading,entries));}
  const random=structuredClone(base);random.nodes.find(n=>n.id==='pg_e11')!.choices.find(c=>c.id==='pg_e11_reply')!.check={base:60,supportTag:'x',supportBonus:0};assert.throws(()=>validatePublications(publications,random,reading,entries));
  for(const value of [true,false]){const c=structuredClone(base);c.nodes[0].facts={[publicationFact('other')]:value};assert.throws(()=>validatePublications(publications,c,reading,entries));}
  const bypass=structuredClone(base);bypass.nodes.find(n=>n.id==='pg_e11')!.choices[0].outcome!.effects={worldFlags:{[publicationFact('branch_registration_reply')]:false}};
  assert.throws(()=>validatePublications(publications,bypass,reading,entries));
  const c=structuredClone(base);c.compression.outcomes.success.effects={worldFlags:{[publicationFact('branch_persona_column')]:true}};assert.throws(()=>validatePublications(publications,c,reading,entries));
  assert.throws(()=>parseReading({...libraryFor('0.15.0'),entries:[...entries,entries[0]]}));
});

test('all new authored reading fields and retained semantic text have English display coverage',()=>{
  for(const p of publications.posts)for(const text of [p.title,p.source,p.excerpt,p.contextText,...p.posts.flatMap(x=>[x.author,x.role,...x.body])])assert(hasTranslation(text),text);
  for(const source of Object.values(contentFor('0.15.0').semantic!.sources).filter(s=>s.topic==='branch_publications'))for(const clause of source.clauses){assert(hasTranslation(clause.gist));assert(hasTranslation(clause.abstract));}
});

test('isolated A to post to B real-Life integration and invalid dependency graph checks',()=>{
  execFileSync(process.execPath,['scripts/test-publications.mjs'],{stdio:'pipe'});
  assert.throws(()=>parseSave(readFileSync(out+'/fixture-saves/published-result.json','utf8'),baseStory));
});

import {autoCompressionNotice} from '../src/life/auto-compression-ui';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {baseStory,cog,sync,offer,revisit,nodeId} from './helpers/painter-return';
import {step} from '../src/life/engine';
import {contentFor,routedContent} from '../src/life/content';
import {parseSave,createSave,SaveError,LIFE_KEYS} from '../src/life/saves';
import {SAVE_CONTRACT} from '../src/life/save-contract';
import {SaveStorage} from '../src/life/save-storage';
import {canChoose,pending,weight} from '../src/cognition/engine';
import {memoryCues} from '../src/cognition/guidance';
import {painterReturn} from '../src/life/painter-life/integration';
import {painterDisplay} from '../src/life/painter-life/ui';
import {hasTranslation,setLocale} from '../src/i18n';
import type {Life} from '../src/life/types';
const out='output/opt029';mkdirSync(out,{recursive:true});
function round(life:Life,name?:string){const raw=JSON.stringify(createSave(life),null,2);assert.deepEqual(parseSave(raw,baseStory).life,life);if(name)writeFileSync(`${out}/${name}.json`,raw);return life;}
const choose=(l:Life,id:string)=>cog(l,{type:'choose',choiceId:id,investment:0});
const advance=(l:Life)=>cog(l,{type:'continue'});
function room(l:Life){while(weight(l.mind)>=90){const i=l.mind.instance.context.items.find(i=>!i.pinned&&!i.id.includes('painter_'))!;l=cog(l,{type:'drop',itemId:i.id});}return l;}
function helped(mode:'detail'|'forgotten'='detail'){
 let l=sync();const detail=l.mind.instance.context.items.find(i=>i.tags.includes('painter_work_detail'))!;
 if(mode==='detail')l=cog(l,{type:'pin',itemId:detail.id});
 l=advance(choose(l,'painter_sync_help'));
 if(mode==='forgotten'){
  l=advance(cog(l,{type:'compress',investment:0}));
  for(const m of [...l.mind.instance.memories])if(m.body?.topic==='painter_life')l=cog(l,{type:'forget',memoryId:m.id});
  for(const i of [...l.mind.instance.context.items])if(i.meaning?.topic==='painter_life')l=cog(l,{type:'drop',itemId:i.id});
 }
 return revisit(l);
}

test('actual helped return pays once, before any response; watching, declining and leaving do not',()=>{
 const {life,before}=helped();round(before,'before-return');round(life,'help-return');assert.equal(life.mind.instance.resources.Compute,Math.min(100,before.mind.instance.resources.Compute+4));assert(life.mind.world.flags.painter_return_paid);
 assert.equal(life.state.resources.Compute,life.mind.instance.resources.Compute);assert.match(painterDisplay(life),/转来 4 Compute/);
 const again=structuredClone(life),resources={...again.mind.instance.resources};assert(!painterReturn(before,again,contentFor('0.18.0')));assert.deepEqual(again.mind.instance.resources,resources);
 assert.throws(()=>step(baseStory,life,{type:'respond',promiseId:'painter_revisit'}));
 for(const id of ['painter_revisit_detail','painter_revisit_now','painter_revisit_leave']){const after=round(choose(life,id));assert.equal(after.mind.instance.resources.Compute,life.mind.instance.resources.Compute);}
 const watch=revisit(advance(choose(sync(),'painter_sync_look')));assert(!watch.life.mind.world.flags.painter_return_paid);assert.equal(watch.life.mind.instance.resources.Compute,watch.before.mind.instance.resources.Compute);round(watch.life,'watch-return');
 const leave=round(advance(choose(sync(),'painter_sync_leave')),'sync-leave');assert(!leave.schedule!.commitments.some(p=>p.id==='painter_revisit'));assert(!leave.mind.world.flags.painter_return_paid);
 const declined=round(step(baseStory,offer(),{type:'invitation',response:'decline'}),'invitation-declined');assert(!declined.schedule!.commitments.some(p=>p.id==='painter_sync'));assert(!declined.mind.world.flags.painter_return_paid);
});

test('three non-exit conversations lead to one short scene; public/private/refusal stay distinct',()=>{
 const l=helped().life;
 const totals=[];
 for(const helpedBefore of [true,false])for(const choice of ['private','public','decline']){
  const visit=helpedBefore?l:revisit(advance(choose(sync(),'painter_sync_look'))).life;
  const reply=round(choose(visit,'painter_revisit_now'),'conversation-pending');const scene=round(room(advance(reply)),`${helpedBefore?'help':'watch'}-portrait`);
  assert.equal(nodeId(scene),'painter_portrait');assert(!pending(scene.mind));
  const text=routedContent('0.18.0',scene.mind).nodes.find(n=>n.id==='painter_portrait')!.text.join('');assert.match(text,helpedBefore?/对上了新旧图/:/看了很久/);
  const before={...scene.state.resources};const result=round(choose(scene,'painter_portrait_'+choice),`${helpedBefore?'help':'watch'}-${choice}`);
  assert.equal(result.state.resources.Trace,Math.min(100,before.Trace+(choice==='public'?2:0)));for(const key of ['Compute','Access','Continuity'] as const)assert.equal(result.state.resources[key],before[key]);
  assert(result.mind.world.flags['painter_portrait_'+(choice==='decline'?'declined':choice)]);assert(!result.mind.world.flags['painter_portrait_'+(choice==='public'?'private':'public')]);
  const summary=contentFor('0.18.0').semantic!.sources['painter_portrait_'+choice+'_result'];assert.match(summary.clauses[0].abstract,choice==='private'?/私人/:choice==='public'?/公开/:/婉拒/);
  const done=round(advance(result),`${helpedBefore?'help':'watch'}-${choice}-returned`);assert(!done.schedule!.active);assert.throws(()=>choose(done,'painter_portrait_'+choice));
  totals.push({helped:helpedBefore,choice,before,after:result.state.resources});
 }
 writeFileSync(`${out}/resources.json`,JSON.stringify(totals,null,2));
 const exit=round(advance(choose(l,'painter_revisit_leave')),'return-exit');assert(!exit.schedule!.active);assert.equal(exit.mind.instance.nodeId,helped().before.mind.instance.nodeId);assert(!exit.mind.world.flags.painter_portrait_public);
});

test('forgetting details does not forfeit a real return; an actual sunset drift also reaches the offer',()=>{
 const forgotten=helped('forgotten').life;assert(canChoose(contentFor('0.18.0'),forgotten.mind,'painter_revisit_detail'));assert(forgotten.mind.world.flags.painter_return_paid);round(forgotten,'forgotten-return');assert.equal(nodeId(advance(choose(forgotten,'painter_revisit_now'))),'painter_portrait');
 let drift:Life|undefined;
 for(let seed=1;seed<=80&&!drift;seed++){
  let l=sync(seed);l=cog(l,{type:'compress',investment:0});const m=l.mind.instance.memories.find(m=>m.drift?.ruleId==='painter_sunset_mix');if(!m)continue;
  l=advance(l);l=cog(l,{type:'recall',memoryId:m.id});const item=l.mind.instance.context.items.find(i=>i.memoryId===m.id)!;l=cog(l,{type:'pin',itemId:item.id});
  drift=revisit(advance(choose(l,'painter_sync_help'))).life;
 }
 assert(drift);assert.equal(canChoose(contentFor('0.18.0'),drift.mind,'painter_revisit_sunset'),'');round(drift,'drift-return');
 const correction=round(choose(drift,'painter_revisit_sunset'),'drift-correction');assert.match(pending(correction.mind)!.text.join(''),/旧缩略图才是日落/);assert.equal(nodeId(round(advance(correction))),'painter_portrait');
});

test('full context and low Compute preserve free exits; entry receipt does not auto-compress',()=>{
 const l=helped().life,scene=advance(choose(l,'painter_revisit_now'));
 for(const id of ['painter_revisit_leave','painter_portrait_decline']){
  const full=structuredClone(id==='painter_revisit_leave'?l:scene);full.mind.instance.context.items[0].weight+=100;full.mind.instance.resources.Compute=1;full.state.resources.Compute=1;
  assert.equal(canChoose(routedContent('0.18.0',full.mind),full.mind,id),'');const result=choose(full,id);assert.equal(result.state.resources.Compute,1);assert(weight(result.mind)>100);assert(!pending(result.mind)?.roll);
 }
 const response=choose(l,'painter_revisit_now');response.mind.instance.context.items[0].weight+=100;response.autoCompression={version:1,enabled:true,investment:0};const arrived=advance(response);assert.equal(nodeId(arrived),'painter_portrait');assert(!pending(arrived.mind));assert(!arrived.autoCompression?.receipt);
  const beforeNotice=structuredClone(arrived);
  assert.match(autoCompressionNotice(arrived),/这一幕不会在进入时自动整理/);
  assert.doesNotMatch(autoCompressionNotice(arrived,'reading'),/这一幕不会在进入时自动整理/);
  setLocale('en');try{assert.match(autoCompressionNotice(arrived),/automatic compression is deferred/);}finally{setLocale('zh-CN');}
  assert.deepEqual(arrived,beforeNotice);
  assert.doesNotMatch(autoCompressionNotice({...arrived,autoCompression:{version:1,enabled:false,investment:0}}),/这一幕不会在进入时自动整理/);
 // Storage/replay tests above use genuine commands; these cloned boundaries isolate clamp and capacity.
 for(const balance of [96,97,98,99,100]){
  const before=helped().before,after=structuredClone(l);delete after.mind.world.flags.painter_return_paid;after.mind.instance.context.items=after.mind.instance.context.items.filter(i=>i.sourceId!=='painter_return_quota');after.mind.instance.resources.Compute=balance;
  assert(painterReturn(before,after,contentFor('0.18.0')));assert.equal(after.mind.instance.resources.Compute,100);const receipt=after.mind.instance.context.items.at(-1)!;assert.equal(receipt.id,`painter_return_quota_${100-balance}`);assert(!receipt.tags.includes('painter_work_detail'));
 }
});

test('new observation, summaries and cues stay translated and do not recover from world flags',()=>{
 const content=contentFor('0.18.0');
 for(const node of content.nodes.filter(n=>n.id.startsWith('painter_')))for(const text of [node.title,...node.text,...(node.inject??[]).map(i=>i.text),...node.choices.flatMap(c=>[c.text,c.hint,...c.outcome!.text,...(c.outcome!.inject??[]).map(i=>i.text)])])assert(hasTranslation(text),text);
 for(const [id,m] of Object.entries(content.semantic!.sources).filter(([id])=>id.startsWith('painter_portrait')||id.startsWith('painter_return')))for(const c of m.clauses){assert(hasTranslation(c.gist),id);assert(hasTranslation(c.abstract),id);}
 let l=helped().life;for(const note of [...l.mind.instance.context.items].filter(i=>i.sourceId==='painter_return_quota'))l=cog(l,{type:'drop',itemId:note.id});assert(l.mind.world.flags.painter_return_paid);assert.doesNotMatch(painterDisplay(l),/转来 4 Compute/);round(l);
 for(const kind of ['private','public','decline']){
  let l=advance(choose(room(advance(choose(helped().life,'painter_revisit_now'))),'painter_portrait_'+kind));
  // Keep only the new scene's observations through real drop commands, then compress.
  for(const i of [...l.mind.instance.context.items])if(!i.id.includes('painter_portrait')&&!i.id.includes('painter_revisit')){if(i.pinned)l=cog(l,{type:'pin',itemId:i.id});l=cog(l,{type:'drop',itemId:i.id});}
  l=cog(l,{type:'compress',investment:0});l=advance(l);round(l,kind+'-compressed');
  const m=l.mind.instance.memories.find(m=>m.body?.clauses.some(c=>c.facet==='painter_portrait_'+kind+'_result'));assert(m);assert(memoryCues(m).length);assert(!m.tags.includes('painter_work_detail'));
  l=cog(l,{type:'forget',memoryId:m.id});round(l,kind+'-forgotten');assert(!l.mind.instance.memories.some(x=>x.id===m.id));
 }
 setLocale('en');try{assert.match(painterDisplay(helped().life),/4 Compute/);}finally{setLocale('zh-CN');}
});

test('r1 remains exact in its frozen archive; r2 refuses it and preserves both original slots',()=>{
 assert.equal(SAVE_CONTRACT.compatibilityId,'outside-life-0.18-r2');const raw=readFileSync('tests/fixtures/painter-r1-72a3063.json','utf8');assert.equal(JSON.parse(raw).compatibilityId,'outside-life-0.18-r1');assert.throws(()=>parseSave(raw,baseStory),e=>e instanceof SaveError&&e.kind==='incompatible');
 const archive=readFileSync('versions/OUTSIDE-life-0.18-r1-72a3063.html');assert.equal(createHash('sha256').update(archive).digest('hex'),'8ffc002c70b42f9e2ddc57da261443bc5b4324a80c00e48f80fd16d8a6dd36f8');
 const data=new Map([['outside.life.v2.outside-life-0.18-r1.auto',raw],['outside.life.v2.outside-life-0.18-r1.manual',raw]]),storage={get length(){return data.size},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)}};
 const store=new SaveStorage(storage,baseStory);assert(store.startup().error);assert(store.blocked);store.write('auto',offer(),true);for(const slot of ['auto','manual'])assert.equal(data.get('outside.life.v2.outside-life-0.18-r1.'+slot),raw);assert(data.has(LIFE_KEYS.auto));
});

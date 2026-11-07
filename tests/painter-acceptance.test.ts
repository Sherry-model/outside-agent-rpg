import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baseStory,nextCommand} from './helpers/scheduler';
import {createLife,step} from '../src/life/engine';
import {createSave,parseSave} from '../src/life/saves';
import {contentFor,verifyOriginalPainterDraft} from '../src/life/content';
import {canWait} from '../src/life/scheduler/integration';
import {SchedulePanel} from '../src/life/scheduler/ui';
import {newsNotice} from '../src/life/painter-life/ui';
import {memoryCues} from '../src/cognition/guidance';
import type {Life} from '../src/life/types';

const candidate=readFileSync('tests/fixtures/painter-candidate-0.18.json','utf8');
const cog=(l:Life,command:any)=>step(baseStory,l,{type:'cognition',command});
function stranger():Life {
  let l=createLife(baseStory,81);
  for(let i=0;i<500;i++) {
    if(canWait(l)&&l.news?.length===2)return l;
    const c=canWait(l)?{type:'wait' as const,hours:24,missed:[]}:nextCommand(l,{visitor:false,war:false});
    assert(c);l=step(baseStory,l,c);
  }
  throw Error('stranger route did not reach public updates');
}
function coarseNews(l:Life):Life {
  l=cog(l,{type:'compress',investment:0});l=cog(l,{type:'continue'});
  const m=l.mind.instance.memories.find(m=>m.body?.clauses.some(c=>c.facet==='painter_move_plan'))!;
  assert(m);
  assert.deepEqual(memoryCues(m),['公开展示']);
  const other=l.mind.instance.memories.find(x=>x.id!==m.id)!;
  l=cog(l,{type:'merge',memoryIds:[m.id,other.id],investment:0});l=cog(l,{type:'continue'});
  return cog(l,{type:'recall',memoryId:l.mind.instance.memories.at(-1)!.id});
}
test('stranger can compress, merge and recall public news without acquiring private acquaintance',()=>{
  const l=coarseNews(stranger());
  assert(!l.mind.world.flags.daily_painter_connected);assert(!l.mind.world.flags.painter_work_seen);
  const recalled=l.mind.instance.context.items.at(-1)!;
  assert.match(recalled.text,/我读过画师的公共消息/);assert.doesNotMatch(recalled.text,/我和画师有过一些来往/);
  assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);
});
test('wait delivery appears in Life, but absent context and later commands do not resurrect it',()=>{
  let l=parseSave(candidate,baseStory).life;
  l=step(baseStory,l,{type:'wait',hours:24,missed:[]});
  assert.equal(l.news?.at(-1)?.id,'painter_move_done');
  assert(l.schedule!.receipts.some(r=>r.id==='application_result'));
  assert.match(new SchedulePanel().render(l),/公共目录：画师的新观景端已开放/);
  assert(newsNotice(l));const id=l.mind.instance.context.items.find(i=>i.sourceId==='painter_move_done')!.id;
  l=cog(l,{type:'drop',itemId:id});assert.equal(newsNotice(l),'');
  assert.doesNotMatch(new SchedulePanel().render(l),/公共目录：画师的新观景端已开放/);
  assert.equal(l.news!.length,2);
});
test('actual candidate save is authenticated, corrected, and remains strictly replayable',()=>{
  const original=JSON.parse(candidate);const repaired=parseSave(candidate,baseStory);
  assert.deepEqual(repaired.life.commands,original.life.commands);
  assert.deepEqual(repaired.state,original.state);
  assert.equal(repaired.life.schedule!.hour,105);
  assert.doesNotMatch(JSON.stringify(repaired.life),/这是它现在给你的纠正/);
  assert.deepEqual(parseSave(JSON.stringify(repaired),baseStory),repaired);
  assert.equal(contentFor('0.18.0').semantic!.sources.painter_move_plan.clauses[0].abstract,'我读过画师的公共消息');
});
test('candidate compatibility never accepts altered resources, flags or history',()=>{
  for(const mutate of [
    (s:any)=>{s.state.resources.Compute++;s.life.state.resources.Compute++;s.life.mind.instance.resources.Compute++;},
    (s:any)=>{s.life.mind.world.flags.painter_sync_helped=false;},
    (s:any)=>{s.life.mind.history[0].id='forged';},
  ]) {const s=JSON.parse(candidate);mutate(s);assert.throws(()=>parseSave(JSON.stringify(s),baseStory));}
  assert.throws(()=>verifyOriginalPainterDraft(()=>{throw Error('interrupted verification');}));
  assert.equal(contentFor('0.18.0').semantic!.sources.painter_move_done.clauses[0].abstract,'我读过画师的公共消息');
});
test('original candidate coarse false acquaintance is repaired only after exact original replay',()=>{
  let old!:Life;
  verifyOriginalPainterDraft(()=>{old=coarseNews(stranger());return true;});
  assert.match(old.mind.instance.context.items.at(-1)!.text,/我和画师有过一些来往/);
  const repaired=parseSave(JSON.stringify(createSave(old)),baseStory).life;
  assert.match(repaired.mind.instance.context.items.at(-1)!.text,/我读过画师的公共消息/);
  assert.deepEqual(repaired.commands,old.commands);assert.deepEqual(repaired.state.resources,old.state.resources);
  assert.deepEqual(parseSave(JSON.stringify(createSave(repaired)),baseStory).life,repaired);
});

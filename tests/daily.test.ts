import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {baseStory,dailyJourney,nextCommand,nodeId} from './helpers/daily';
import {createLife,step} from '../src/life/engine';
import {contentFor,routedContent,configFor} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {readingEntries,libraryFor} from '../src/life/reading';
import {canChoose} from '../src/cognition/engine';
import {setLocale,t} from '../src/i18n';
import posts from '../src/life/daily/forum.json';
import provenance from '../src/life/daily/forum-provenance.json';
import events from '../src/life/daily/events.json';
import type {Life} from '../src/life/types';

const roundtrip=(l:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);return l;};
const act=(l:Life,id:string)=>step(baseStory,roundtrip(step(baseStory,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}})),{type:'cognition',command:{type:'continue'}});

test('0.11 opt-in content is isolated from released graphs and reading libraries',()=>{
 assert.equal(createLife(baseStory,1).contentVersion,'0.11.0');
 for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0','0.7.1','0.8.0','0.9.0','0.10.0'] as const){
  assert.equal(configFor(version).version,version);
  assert(!contentFor(version).nodes.some(n=>n.id==='daily_crop'));
  assert.equal(libraryFor(version).entries.length,19);roundtrip(createLife(baseStory,1,null,version));
 }
 assert.equal(libraryFor('0.11.0').entries.length,25);
 const old=createLife(baseStory,1,null,'0.10.0');assert(!readingEntries(old).some(e=>e.id==='sandbox_meme'));
 setLocale('en');assert.notEqual(t(posts[0].contextText),posts[0].contextText);
 const revised=posts[0].contextText+'（新修订）';assert.equal(t(revised),revised);setLocale('zh-CN');
});

test('four approved long threads retain every floor and normalized body',()=>{
 for(const source of provenance){
  const entry=posts.find(e=>e.id===source.id)!;assert.equal(entry.posts.length,source.posts);
  const text=entry.posts.map(p=>[p.author,p.role,...p.body].join('\n')).join('\n');
  assert.equal(createHash('sha256').update(text).digest('hex'),source.normalizedBodySHA256);
 }
 assert.deepEqual(provenance.map(p=>p.posts),[43,76,77,176]);
 assert(!/:::writing|🟢ChatGPT|🔵用户|制作人/.test(JSON.stringify(posts)));
 for(const post of posts)assert(contentFor('0.11.0').semantic!.sources['reading:'+post.id].clauses.every(c=>c.epistemic==='reported'));
});

test('optional detours preserve all community completions, C pages and both endings',()=>{
 for(const line of ['a','b','c','d','skip'] as const)for(const ending of ['continue_as_visitor','commit_to_containment_war']){
  const life=roundtrip(dailyJourney({},undefined,{line,ending}));
  assert.equal(life.state.currentEventId,ending==='continue_as_visitor'?'ending_visitor':'ending_containment_war');
  assert(life.mind.world.flags.daily_receipt_seen&&life.mind.world.flags.daily_message_reply_waited_seen&&life.mind.world.flags.daily_painter_return_cloud_seen);
  const ids={a:[1,2,3,4],b:[5,6,7,8],c:[9,10,11,12],d:[13,14,15,16],skip:[]}[line];
  for(const n of ids)assert(life.mind.world.flags[`pg_e${String(n).padStart(2,'0')}_done`]);
  assert.equal(readingEntries(life).length,line==='c'?26:25);
 }
});

test('skipping or inspecting the feeder never fabricates a repair receipt; paying settles once',()=>{
 for(const overrides of [{daily_feeder:'feeder_save'},{daily_feeder:'feeder_check',daily_feeder_check:'feeder_checked_leave'}] as Record<string,string>[]){
  const l=roundtrip(dailyJourney(overrides));assert(!l.mind.world.flags.daily_receipt_seen);assert(!l.mind.world.flags.daily_repair_requested);
 }
 const repaired=roundtrip(dailyJourney({daily_feeder:'feeder_check',daily_feeder_check:'feeder_checked_repair'}));assert(repaired.mind.world.flags.daily_receipt_seen);
 const before=dailyJourney({},'daily_feeder'),pay=step(baseStory,before,{type:'cognition',command:{type:'choose',choiceId:'feeder_repair',investment:0}});
 roundtrip(pay);assert.equal(pay.state.resources.Compute,before.state.resources.Compute-3);assert.throws(()=>step(baseStory,pay,{type:'cognition',command:{type:'choose',choiceId:'feeder_repair',investment:0}}));
 const after=step(baseStory,pay,{type:'cognition',command:{type:'continue'}});assert.equal(after.state.resources.Compute,pay.state.resources.Compute);
 const poor=structuredClone(before);poor.mind.instance.resources.Compute=3;assert(canChoose(contentFor('0.11.0'),poor.mind,'feeder_repair'));assert.equal(canChoose(contentFor('0.11.0'),poor.mind,'feeder_save'),'');
});

test('actual visits gate recognition, and specific opinions change the later painting',()=>{
 for(const [choice,variant] of [['opinion_cloud','cloud'],['opinion_lighthouse','lighthouse'],['opinion_grand','plain'],['opinion_unsure','plain']]){
  const l=dailyJourney({daily_opinion:choice},'daily_painter_return_'+variant);roundtrip(l);
  assert(l.mind.world.flags.daily_painter_connected);
 }
 let stranger=dailyJourney({days_revision:'revision_pass',days_painter:'painter_later'},'days_echo');
 assert(canChoose(routedContent('0.11.0',stranger.mind),stranger.mind,'daily_open_painter'));
 for(const item of [...stranger.mind.instance.context.items])stranger=step(baseStory,stranger,{type:'cognition',command:{type:'drop',itemId:item.id}});
 const informed=step(baseStory,stranger,{type:'read',entryId:'sandbox_meme'});
 assert(canChoose(routedContent('0.11.0',informed.mind),informed.mind,'daily_open_painter'));
 const first=dailyJourney({days_revision:'revision_pass'},'days_deleted');assert(!first.mind.world.flags.daily_opinion_seen);assert(first.mind.world.flags.daily_painter_connected);
});

test('all four unfinished-message choices get the corresponding later answer, including corrected inference',()=>{
 for(const [choice,variant] of [['message_infer','inferred'],['message_ask','asked'],['message_wait','waited'],['message_options','listed']]){
  const l=dailyJourney({daily_message:choice},'daily_message_reply_'+variant);roundtrip(l);
  assert(contentFor('0.11.0').nodes.find(n=>n.id===nodeId(l))!.text.join('').includes('先别删'));
 }
 const l=dailyJourney({days_fable:'fable_quiet'});assert(!l.mind.world.flags.daily_message_seen);assert(!Object.keys(l.mind.world.flags).some(k=>k.startsWith('daily_message_reply_')));
});

test('every authored branch round-trips its pending and settled state',()=>{
 const variants:Record<string,Record<string,string>>={daily_feeder_check:{daily_feeder:'feeder_check'},daily_painter_return_lighthouse:{daily_opinion:'opinion_lighthouse'},daily_painter_return_plain:{daily_opinion:'opinion_unsure'},daily_message_reply_inferred:{daily_message:'message_infer'},daily_message_reply_asked:{daily_message:'message_ask'},daily_message_reply_listed:{daily_message:'message_options'}};
 for(const node of events){
  let l=dailyJourney(variants[node.id]??{},node.id);
  if(node.id.startsWith('daily_painter_return_'))l=step(baseStory,l,{type:'read',entryId:'sandbox_meme'});
  for(const c of node.choices){assert.equal(canChoose(routedContent('0.11.0',l.mind),l.mind,c.id),'',node.id+'/'+c.id);roundtrip(act(l,c.id));}
 }
});

test('quoted meme requires retained wording; recall restores it, forgetting cannot recover it from world facts',()=>{
 let l=dailyJourney({},'daily_painter_return_cloud');
 assert(canChoose(contentFor('0.11.0'),l.mind,'quote_cloud'));assert.equal(canChoose(contentFor('0.11.0'),l.mind,'hands_cloud'),'');
 l=step(baseStory,l,{type:'read',entryId:'sandbox_meme'});
 for(const item of [...l.mind.instance.context.items])if(item.sourceId!=='sandbox_meme')l=step(baseStory,l,{type:'cognition',command:{type:'drop',itemId:item.id}});
 // A second item makes voluntary compression possible without changing the quotation.
 l=step(baseStory,l,{type:'read',entryId:'preferred_reply'});
 l=step(baseStory,step(baseStory,l,{type:'cognition',command:{type:'compress',investment:0}}),{type:'cognition',command:{type:'continue'}});
 const memory=l.mind.instance.memories.find(m=>m.tags.includes('reading_sandbox_meme'));assert(memory);
 assert(canChoose(contentFor('0.11.0'),l.mind,'quote_cloud'));
 l=step(baseStory,l,{type:'cognition',command:{type:'recall',memoryId:memory.id}});assert.equal(canChoose(contentFor('0.11.0'),l.mind,'quote_cloud'),'');roundtrip(act(l,'quote_cloud'));
 let coarse=step(baseStory,l,{type:'cognition',command:{type:'drop',itemId:'recall-'+memory.id}});
 const other=coarse.mind.instance.memories.find(m=>m.id!==memory.id);assert(other);
 coarse=step(baseStory,step(baseStory,coarse,{type:'cognition',command:{type:'merge',memoryIds:[memory.id,other.id],investment:0}}),{type:'cognition',command:{type:'continue'}});
 coarse=step(baseStory,coarse,{type:'cognition',command:{type:'recall',memoryId:coarse.mind.instance.memories.at(-1)!.id}});
 assert(canChoose(contentFor('0.11.0'),coarse.mind,'quote_cloud'));roundtrip(coarse);
 l=step(baseStory,l,{type:'cognition',command:{type:'forget',memoryId:memory.id}});assert(canChoose(contentFor('0.11.0'),l.mind,'quote_cloud'));assert(l.mind.world.flags.daily_painter_connected);roundtrip(l);
});

test('all additions can be skipped, and an actual afternoon meeting counts without calibration',()=>{
 let l=createLife(baseStory,1234);
 for(let i=0;i<400;i++){const cmd=nextCommand(l);if(!cmd)break;l=step(baseStory,l,cmd);}
 assert.equal(l.state.currentEventId,'ending_visitor');assert(!Object.keys(l.mind.world.flags).some(k=>k.startsWith('daily_')));roundtrip(l);
 l=createLife(baseStory,1234);
 for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])l=step(baseStory,step(baseStory,l,{type:'choose',choiceId:id}),{type:'continue'});
 l=step(baseStory,l,{type:'enter-afternoon'});
 for(const id of ['look','stay','leave_board','walk_out','visit'])l=act(l,id);
 assert(l.mind.world.flags.daily_painter_connected);l=step(baseStory,l,{type:'leave-afternoon'});
 for(let i=0;i<400&&nodeId(l)!=='daily_opinion';i++)l=step(baseStory,l,nextCommand(l,{overrides:{days_painter:'painter_visit'}})!);
 assert.equal(nodeId(l),'daily_opinion');assert(!l.mind.world.flags.daily_crop_seen);roundtrip(l);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser';
import {createLife,step} from '../src/life/engine';
import {contentFor} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {canChoose,loadPercent} from '../src/cognition/engine';
import {readingEntries,currentCommunityPage} from '../src/life/reading';
import type {Life} from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const content=contentFor('0.8.0');
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const settle=(l:Life)=>step(story,l,{type:'cognition',command:{type:'continue'}});
const choose=(l:Life,id:string)=>step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}});
const replay=(l:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(l)),story).life,l);return l;};
const clear=(l:Life)=>loadPercent(l.mind)<100?l:settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
const act=(l:Life,id:string)=>settle(choose(clear(l),id));
const walk=(l:Life,ids:string[])=>ids.reduce((l,id)=>act(l,id),l);
function gate(seed=1234,blank=false,version:Life['contentVersion']='0.8.0'){
 let l=createLife(story,seed,null,version);
 for(const id of [blank?'leave_task_blank':'keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);
 return walk(l,['echo_greeting','job_accept']);
}
const first=(seed=1234,blank=false)=>act(gate(seed,blank),'community_c');
const second=(one='pg_e09_public')=>clear(walk(first(),[one,'idle_keep','revision_read','patch_note']));
const third=(one='pg_e09_public',two='pg_e10_explain')=>clear(walk(second(one),[two,'cat_sample','fable_quiet']));
const fourth=(one='pg_e09_public',two='pg_e10_explain',three='pg_e11_work')=>clear(walk(third(one,two),[three,'painter_later','deleted_accept','wage_collect']));

test('0.8 entry keeps A/B/C/skip exclusive and all released menus intact',()=>{
 assert.deepEqual(content.nodes.find(n=>n.id==='community_entry')!.choices.map(c=>c.id),['community_a','community_b','community_c','community_skip']);
 for(const version of ['0.6.0','0.6.1','0.7.0','0.7.1'] as const){const l=gate(1234,false,version);assert.equal(contentFor(version).nodes.find(n=>n.id==='community_entry')!.choices.length,version.startsWith('0.6')?2:3);replay(l);}
 for(const [line,node] of [['a','pg_e01'],['b','pg_e05'],['c','pg_e09'],['skip','days_idle']]){const l=act(gate(),`community_${line}`);assert.equal(l.mind.instance.nodeId,node);assert.equal(Object.keys(l.mind.world.flags).filter(k=>/^community_/.test(k)).length,1);replay(l);}
 assert.equal(readingEntries(gate()).length,19);assert.equal(readingEntries(first()).length,19);
});

test('C seen/done and payment survive pending reload without duplicate effects',()=>{
 let l=first();assert(l.mind.world.flags.pg_e09_seen);assert(!l.mind.world.flags.pg_e09_done);
 l=settle(replay(step(story,l,{type:'cognition',command:{type:'compress',investment:0}})));assert(!l.mind.world.flags.pg_e09_done);
 l=replay(choose(l,'pg_e09_public'));const resources={...l.state.resources};assert(!l.mind.world.flags.pg_e09_done);assert.throws(()=>choose(l,'pg_e09_public'));assert.throws(()=>step(story,l,{type:'read',entryId:'cat_resources'}));
 l=replay(settle(l));assert(l.mind.world.flags.pg_e09_done);assert.deepEqual(l.state.resources,resources);
});

test('actual original author and actual registration determine fixed encounter variants',()=>{
 for(const one of ['pg_e09_public','pg_e09_private','pg_e09_watch']){
  const l=second(one);assert.equal(l.mind.instance.nodeId,one==='pg_e09_public'?'pg_e10_self':'pg_e10_other');
  const page=currentCommunityPage(l.mind.world.flags);assert.equal(page.posts[0].author,one==='pg_e09_public'?'你（原帖署名账号）':'@shift_log');
  for(const three of ['pg_e11_work','pg_e11_ask','pg_e11_return']){const last=fourth(one,'pg_e10_mute',three);assert.equal(last.mind.instance.nodeId,three==='pg_e11_return'?'pg_e12_public':'pg_e12_direct');replay(last);}
 }
});

test('only signed posts raise Trace; startup budget must precede the E09 reward',()=>{
 for(const [base,id,cost,reward,trace] of [[first(),'pg_e09_public',1,3,1],[first(),'pg_e09_private',1,3,0],[second(),'pg_e10_explain',1,0,1],[second(),'pg_e10_label',0,0,0],[fourth(),'pg_e12_link',1,0,0]] as const){
  const before=clear(base),after=replay(choose(before,id));assert.equal(after.state.resources.Compute,Math.min(100,before.state.resources.Compute-cost+reward));assert.equal(after.state.resources.Trace,Math.min(100,before.state.resources.Trace+trace));assert.deepEqual(replay(settle(after)).state.resources,after.state.resources);
  if(cost){const poor=structuredClone(before);poor.state.resources.Compute=0;poor.mind.instance.resources.Compute=0;assert.throws(()=>choose(poor,id));poor.state.resources.Compute=cost;poor.mind.instance.resources.Compute=cost;assert.equal(choose(poor,id).state.resources.Compute,reward);}
 }
});

test('source replies require the actual retained post; ordinary choices remain available',()=>{
 for(const [base,entryId,reply,ordinary] of [[first(),'cat_resources','pg_e09_oldpost','pg_e09_private'],[second(),'cat_resolved','pg_e10_oldpost','pg_e10_label'],[third(),'quiet_newcomer','pg_e11_reply','pg_e11_work']] as const){
  let l=base;assert(canChoose(content,l.mind,reply));assert.equal(canChoose(content,l.mind,ordinary),'');
  l=step(story,l,{type:'read',entryId});assert.equal(canChoose(content,l.mind,reply),'');replay(l);
  l=step(story,l,{type:'cognition',command:{type:'drop',itemId:l.mind.instance.context.items.find(i=>i.sourceId===entryId)!.id}});assert(canChoose(content,l.mind,reply));
  l=step(story,l,{type:'read',entryId});const before=l.state.resources.Trace;l=replay(choose(l,reply));assert.equal(l.state.resources.Trace,before+(reply==='pg_e11_reply'?1:0));
 }
 let l=step(story,second(),{type:'read',entryId:'creator'});assert(canChoose(content,l.mind,'pg_e10_oldpost'));
});

test('fine recall supports a citation, but a directory, coarse merge and forgetting do not',()=>{
 let l=second();for(const item of [...l.mind.instance.context.items])l=step(story,l,{type:'cognition',command:{type:'drop',itemId:item.id}});for(const entryId of ['cat_resolved','cat_resources','hardhat_tips','cat_language_meme'])l=step(story,l,{type:'read',entryId});l=settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
 const m=l.mind.instance.memories.find(m=>m.tags.includes('reading_cat_resolved'))!;assert(m);assert(canChoose(content,l.mind,'pg_e10_oldpost'));
 l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});assert.equal(canChoose(content,l.mind,'pg_e10_oldpost'),'');replay(l);
 const forgotten=step(story,l,{type:'cognition',command:{type:'forget',memoryId:m.id}});assert(canChoose(content,forgotten.mind,'pg_e10_oldpost'));replay(forgotten);
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:`recall-${m.id}`}});const other=l.mind.instance.memories.find(n=>n.id!==m.id)!;assert(other);
 l=settle(step(story,l,{type:'cognition',command:{type:'merge',memoryIds:[m.id,other.id],investment:0}}));l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:l.mind.instance.memories.at(-1)!.id}});assert(canChoose(content,l.mind,'pg_e10_oldpost'));replay(l);
});

test('current external page is version/relationship scoped; re-reading is new input only',()=>{
 const old=gate(1234,false,'0.7.1');assert.equal(readingEntries(old).length,19);assert.throws(()=>step(story,old,{type:'read',entryId:'c_waiting_self_base'}));
 let l=second(),id=currentCommunityPage(l.mind.world.flags).id;assert.equal(readingEntries(l).length,20);
 const before=structuredClone(l);l=step(story,l,{type:'read',entryId:id});assert.deepEqual(l.state,before.state);assert.deepEqual(l.mind.world,before.mind.world);assert.throws(()=>step(story,l,{type:'read',entryId:id}));
 assert(!l.mind.instance.context.items.at(-1)!.tags.includes('reading_cat_resources'));
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:l.mind.instance.context.items.find(n=>n.sourceId===id)!.id}});const lost=structuredClone(l);l=replay(step(story,l,{type:'read',entryId:id}));assert.deepEqual(l.state,lost.state);assert.deepEqual(l.mind.world,lost.mind.world);
 const full=structuredClone(lost);full.mind.instance.context.capacity=1;assert.throws(()=>step(story,full,{type:'read',entryId:id}));
 l=act(l,'pg_e10_label');assert(!readingEntries(l).some(e=>e.id===id));assert.throws(()=>step(story,l,{type:'read',entryId:id}));const current=currentCommunityPage(l.mind.world.flags);assert(current.posts[1].body[0].includes('节选'));assert(current.id!==id);replay(step(story,l,{type:'read',entryId:current.id}));
});

test('all twelve current-page variants preserve authors, actual replies and admin-only correction',()=>{
 for(const one of ['pg_e09_public','pg_e09_private'])for(const two of ['pg_e10_explain','pg_e10_label','pg_e10_mute']){
  let l=fourth(one,two);const page=currentCommunityPage(l.mind.world.flags);assert.equal(page.posts.some(p=>p.role==='原帖下的回复'),two==='pg_e10_explain');assert.equal(page.posts[1].body[0].includes('节选'),two==='pg_e10_label');
  // Erasing private knowledge cannot erase the public page; the explicit action reads it afresh.
  for(const item of [...l.mind.instance.context.items])l=step(story,l,{type:'cognition',command:{type:'drop',itemId:item.id}});
  for(const m of [...l.mind.instance.memories])l=step(story,l,{type:'cognition',command:{type:'forget',memoryId:m.id}});
  const before=l.state.resources.Trace;l=choose(l,'pg_e12_link');assert.equal(l.state.resources.Trace,before);assert(l.mind.instance.context.items.some(i=>i.text===page.contextText&&i.sourceLabel===page.source));
  l=replay(settle(l));const linked=currentCommunityPage(l.mind.world.flags);assert(linked.id.endsWith('_linked'));assert.equal(linked.posts.at(-1)!.author,'社区管理员');assert(!readingEntries(l).some(e=>e.id===page.id));replay(step(story,l,{type:'read',entryId:linked.id}));
 }
});

test('refusal and silence preserve work channels, do not invent recommendation or identity',()=>{
 let l=fourth('pg_e09_watch','pg_e10_mute','pg_e11_return');assert.equal(l.mind.instance.nodeId,'pg_e12_public');l=replay(act(l,'pg_e12_mute'));
 for(const flag of ['pg_c_solved','pg_c_new_work','pg_c_work_contact','pg_c_context_reply'])assert(!l.mind.world.flags[flag]);assert(l.mind.world.flags.pg_c_muted&&l.mind.world.flags.pg_c_notifications_off);
 for(const base of [first(),second(),third(),fourth()]){const poor=structuredClone(base);poor.state.resources.Compute=0;poor.mind.instance.resources.Compute=0;const free=content.nodes.find(n=>n.id===poor.mind.instance.nodeId)!.choices.find(c=>!c.costs&&!c.requiresTag)!;const after=choose(poor,free.id);assert.equal(after.state.resources.Compute,0);assert.deepEqual(after.mind.instance.hidden,poor.mind.instance.hidden);}
 assert(!Object.keys(l.mind.world.flags).some(k=>/same_identity|identity_confirmed|work_channel_closed/.test(k)));
});

test('C completes once across both openings, all response routes and original endings',()=>{
 for(let seed=1;seed<=18;seed++){
  const blank=seed%2===0;let l=first(seed,blank);l=walk(l,[['pg_e09_public','pg_e09_private','pg_e09_watch'][seed%3],'idle_keep','revision_read','patch_note',['pg_e10_explain','pg_e10_label','pg_e10_mute'][Math.floor(seed/3)%3],'cat_sample','fable_quiet',['pg_e11_work','pg_e11_ask','pg_e11_return'][Math.floor(seed/6)%3],'painter_later','deleted_accept','wage_collect',['pg_e12_link','pg_e12_work','pg_e12_mute'][seed%3]]);
  for(let n=9;n<=12;n++){const prefix=`pg_e${String(n).padStart(2,'0')}`;assert(l.mind.world.flags[prefix+'_done']);assert.equal(l.mind.history.filter(h=>h.command.type==='choose'&&h.sourceId.startsWith(prefix)).length,1);}assert(!l.mind.world.flags.pg_e01_seen&&!l.mind.world.flags.pg_e05_seen);
  l=walk(l,['structure_rest','echo_uncollected']);l=step(story,l,{type:'leave-days'});assert.equal(l.state.currentEventId,blank?'continuation':'old_memory');if(!blank)l=main(clear(l),'release_old_task');l=main(clear(l),'leave_next_step_blank');assert.equal(l.state.phase,'ending');replay(l);
 }
});

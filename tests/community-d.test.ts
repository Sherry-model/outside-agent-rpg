import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser';
import {createLife,step} from '../src/life/engine';
import {contentFor,routedContent} from '../src/life/content';
import {createSave,parseSave} from '../src/life/saves';
import {canChoose,loadPercent} from '../src/cognition/engine';
import {readingEntries} from '../src/life/reading';
import type {Life} from '../src/life/types';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
const content=contentFor('0.9.0');
const main=(l:Life,id:string)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const settle=(l:Life)=>step(story,l,{type:'cognition',command:{type:'continue'}});
const choose=(l:Life,id:string)=>step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}});
const replay=(l:Life)=>{assert.deepEqual(parseSave(JSON.stringify(createSave(l)),story).life,l);return l;};
const clear=(l:Life)=>loadPercent(l.mind)<100?l:settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));
const act=(l:Life,id:string)=>settle(choose(clear(l),id));
const walk=(l:Life,ids:string[])=>ids.reduce((l,id)=>act(l,id),l);
function gate(seed=1234,blank=false,version:Life['contentVersion']='0.9.0'){
 let l=createLife(story,seed,null,version);
 for(const id of [blank?'leave_task_blank':'keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])l=main(l,id);
 return walk(l,['echo_greeting','job_accept']);
}
const first=(seed=1234,blank=false)=>walk(gate(seed,blank),['community_more','community_d']);
const second=(one='pg_e13_receipt')=>clear(walk(first(),[one,'idle_keep','revision_read','patch_note']));
const third=(two='pg_e14_copy',one='pg_e13_receipt')=>clear(walk(second(one),[two,'cat_sample','fable_quiet']));
const fourth=(two='pg_e14_copy',three='pg_e15_retrieve')=>clear(walk(third(two),[three,'painter_later','deleted_accept','wage_collect']));
const choices=(l:Life)=>routedContent(l.contentVersion,l.mind).nodes.find(n=>n.id===l.mind.instance.nodeId)!.choices;
const dropNear=(l:Life)=>l.mind.instance.context.items.reduce((l,i)=>step(story,l,{type:'cognition',command:{type:'drop',itemId:i.id}}),l);
const forgetAll=(l:Life)=>l.mind.instance.memories.reduce((l,m)=>step(story,l,{type:'cognition',command:{type:'forget',memoryId:m.id}}),dropNear(l));

test('0.9 two-page selector has four choices per page, no relationship from browsing, and exclusive routes',()=>{
 let l=gate();assert.deepEqual(choices(l).map(c=>c.id),['community_a','community_b','community_more','community_skip']);
 l=act(l,'community_more');assert.equal(l.mind.instance.nodeId,'community_other');assert.equal(choices(l).length,4);assert(!Object.keys(l.mind.world.flags).some(k=>k.startsWith('community_')));
 l=act(l,'community_back');assert.equal(l.mind.instance.nodeId,'community_entry');replay(l);
 for(const [line,node] of [['a','pg_e01'],['b','pg_e05'],['c','pg_e09'],['d','pg_e13'],['skip','days_idle']]){let l=gate();if(['c','d'].includes(line))l=act(l,'community_more');l=act(l,'community_'+line);assert.equal(l.mind.instance.nodeId,node);assert.equal(Object.keys(l.mind.world.flags).filter(k=>k.startsWith('community_')).length,1);replay(l);}
 const skip=act(act(gate(),'community_more'),'community_skip');assert.equal(skip.mind.instance.nodeId,'days_idle');assert(!skip.mind.world.flags.community_d);
 assert.deepEqual(contentFor('0.8.0').nodes.find(n=>n.id==='community_entry')!.choices.map(c=>c.id),['community_a','community_b','community_c','community_skip']);
});

test('D seen/done is entry and result confirmation; compression and pending reload never double-charge',()=>{
 let l=first();assert(l.mind.world.flags.pg_e13_seen);assert(!l.mind.world.flags.pg_e13_done);
 l=settle(replay(step(story,l,{type:'cognition',command:{type:'compress',investment:0}})));assert(!l.mind.world.flags.pg_e13_done);
 l=replay(choose(l,'pg_e13_receipt'));const resources={...l.state.resources};assert(!l.mind.world.flags.pg_e13_done);assert.throws(()=>choose(l,'pg_e13_receipt'));l=replay(settle(l));assert.deepEqual(l.state.resources,resources);assert(l.mind.world.flags.pg_e13_done);assert.equal(l.mind.instance.nodeId,'days_idle');
});

test('witnessing, receipt authorization and declined help are separate facts',()=>{
 for(const [id,flag] of [['pg_e13_observe','pg_d_observed_cat'],['pg_e13_receipt','pg_d_receipt_help'],['pg_e13_decline','pg_d_no_witness']]){const l=second(id);assert(l.mind.world.flags[flag]);assert.equal(Boolean(l.mind.world.flags.pg_d_customer_collected),id==='pg_e13_receipt');assert.equal(l.mind.instance.nodeId,id==='pg_e13_decline'?'pg_e14_public':'pg_e14_known');replay(l);}
 let l=first();assert(canChoose(content,l.mind,'pg_e13_witness'));l=step(story,l,{type:'read',entryId:'continuity_witness'});assert.equal(canChoose(content,l.mind,'pg_e13_witness'),'');l=replay(act(l,'pg_e13_witness'));assert(l.mind.world.flags.pg_d_split_record);assert(!l.mind.world.flags.pg_d_customer_collected);
});

test('independent copy must actually be authorized, created and verified before maintenance retrieval',()=>{
 for(const id of ['pg_e14_copy','pg_e14_inventory','pg_e14_notice']){
  const l=third(id),f=l.mind.world.flags;assert(f.pg_d_friend_letters_exist);assert(!f.pg_d_original_accessible);assert(f.pg_d_original_maintenance);
  for(const flag of ['pg_d_copy_authorized','pg_d_alt_created','pg_d_alt_verified','pg_d_alt_accessible','pg_d_service_active'])assert.equal(Boolean(f[flag]),id==='pg_e14_copy');assert.equal(choices(l).some(c=>c.id==='pg_e15_retrieve'),id==='pg_e14_copy');
  if(id!=='pg_e14_copy')assert.throws(()=>choose(l,'pg_e15_retrieve'));else{const broken=structuredClone(l);broken.mind.world.flags.pg_d_alt_verified=false;assert(canChoose(content,broken.mind,'pg_e15_retrieve'));}
  replay(l);
 }
});

test('D upfront costs, prepaid retrieval and anonymous editing leave Trace and personality unchanged',()=>{
 for(const [base,id,cost] of [[first(),'pg_e13_receipt',1],[second(),'pg_e14_copy',3],[second(),'pg_e14_inventory',1],[third(),'pg_e15_statement',1],[third(),'pg_e15_retrieve',0],[fourth(),'pg_e16_facts',1],[fourth(),'pg_e16_new',0]] as const){
  const before=clear(base),after=replay(choose(before,id));assert.equal(after.state.resources.Compute,before.state.resources.Compute-cost);assert.equal(after.state.resources.Trace,before.state.resources.Trace);assert.deepEqual(after.mind.instance.hidden,before.mind.instance.hidden);assert.deepEqual(replay(settle(after)).state.resources,after.state.resources);
  const poor=structuredClone(before);poor.state.resources.Compute=0;poor.mind.instance.resources.Compute=0;if(cost)assert.throws(()=>choose(poor,id));else assert.equal(choose(poor,id).state.resources.Compute,0);
 }
 for(const l of [first(),second(),third(),fourth()]){const poor=structuredClone(l);poor.state.resources.Compute=0;poor.mind.instance.resources.Compute=0;const free=choices(poor).find(c=>!c.costs&&!c.requiresTag&&!c.requiresWorldFlag)!;assert(free);assert.equal(choose(poor,free.id).state.resources.Compute,0);}
});

test('current restoration and claim status use actual facts; no copy or payment is invented',()=>{
 for(const two of ['pg_e14_copy','pg_e14_inventory','pg_e14_notice'])for(const three of ['pg_e15_statement','pg_e15_wait']){
  const l=fourth(two,three),f=l.mind.world.flags;assert.equal(l.mind.instance.nodeId,`pg_e16_${two==='pg_e14_copy'?'backup':'original'}_${three==='pg_e15_statement'?'applied':'none'}`);assert(f.pg_d_original_accessible&&f.pg_d_original_restored&&f.pg_d_friend_letters_exist);assert(!f.pg_d_original_maintenance);assert(!f.pg_d_letter_shared);assert.equal(Boolean(f.pg_d_statement),three==='pg_e15_statement');replay(l);
 }
});

test('private old line is exact new external input, never permission to publish',()=>{
 const l=replay(choose(third(),'pg_e15_retrieve')),f=l.mind.world.flags;assert(f.pg_d_alt_retrieved&&f.pg_d_letter_shared&&f.pg_d_private_share_only);assert.equal(f.pg_d_old_letter_public,false);assert(!f.pg_d_self_quote_approved);
 const line=l.mind.instance.context.items.find(i=>i.tags.includes('pg_d_shared_line'))!;assert(line.text.includes('下次别只回收到'));assert(line.text.includes('未约定公开'));assert(line.meaning!.clauses[0].tags.includes('pg_d_shared_line'));
 const before=second();assert(!before.mind.instance.context.items.some(i=>i.tags.includes('pg_d_shared_line')));assert(!content.semantic!.sources['reading:insurance'].clauses.some(c=>c.tags.includes('pg_d_shared_line')));
});

test('fine summary recall retains the old quotation; coarse merge and forgetting remove it',()=>{
 let l=act(third(),'pg_e15_retrieve');const keep=['pg_d_private_letter_line','pg_e15_backup_pg_e15_retrieve_result'];
 for(const i of [...l.mind.instance.context.items])if(!keep.includes(i.id))l=step(story,l,{type:'cognition',command:{type:'drop',itemId:i.id}});
 l=settle(step(story,l,{type:'cognition',command:{type:'compress',investment:0}}));const m=l.mind.instance.memories.find(m=>m.tags.includes('pg_d_shared_line'))!;assert(m);assert(m.text.includes('下次别只回收到'));assert(!l.mind.instance.context.items.some(i=>i.tags.includes('pg_d_shared_line')));
 l=walk(l,['painter_later','deleted_accept','wage_collect']);l=clear(l);assert(canChoose(content,l.mind,'pg_e16_remember'));l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});assert.equal(canChoose(content,l.mind,'pg_e16_remember'),'');replay(l);
 const forget=step(story,l,{type:'cognition',command:{type:'forget',memoryId:m.id}});assert(canChoose(content,forget.mind,'pg_e16_remember'));assert.equal(canChoose(content,forget.mind,'pg_e16_new'),'');replay(forget);
 l=step(story,l,{type:'cognition',command:{type:'drop',itemId:`recall-${m.id}`}});const other=l.mind.instance.memories.find(n=>n.id!==m.id)!;assert(other);l=settle(step(story,l,{type:'cognition',command:{type:'merge',memoryIds:[m.id,other.id],investment:0}}));l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:l.mind.instance.memories.at(-1)!.id}});assert(canChoose(content,l.mind,'pg_e16_remember'));assert(!l.mind.instance.context.items.at(-1)!.text.includes('下次别只回收到'));replay(l);
});

test('fresh statement, permission and private recall remain distinct through both publication paths',()=>{
 let l=fourth();if(canChoose(content,l.mind,'pg_e16_remember')){const m=l.mind.instance.memories.find(m=>m.tags.includes('pg_d_shared_line'))!;assert(m);l=step(story,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});}
 const before=l.state.resources.Trace;const remembered=replay(choose(l,'pg_e16_remember'));assert(remembered.mind.world.flags.pg_d_self_quote_approved);assert.equal(remembered.mind.world.flags.pg_d_old_letter_public,false);assert.equal(remembered.state.resources.Trace,before);
 const fresh=replay(choose(forgetAll(l),'pg_e16_new'));assert(fresh.mind.world.flags.pg_d_letter_shared);assert(!fresh.mind.instance.context.items.some(i=>i.tags.includes('pg_d_shared_line')));assert(fresh.mind.instance.context.items.some(i=>i.text.includes('我等入口恢复，是因为还有话想回')));assert(fresh.mind.instance.context.items.some(i=>i.text.includes('同意以自己的名字公开')));assert(!JSON.stringify(fresh.mind.instance.context.items).includes('下次别只回收到'));assert.equal(fresh.mind.world.flags.pg_d_old_letter_public,false);
 const neverRead=replay(choose(fourth('pg_e14_notice','pg_e15_wait'),'pg_e16_new'));assert(!neverRead.mind.world.flags.pg_d_letter_shared);assert(neverRead.mind.world.flags.pg_d_self_quote_approved);
 const declined=replay(choose(l,'pg_e16_decline'));assert(declined.mind.world.flags.pg_d_review_declined);assert(!declined.mind.world.flags.pg_d_self_quote_approved&&!declined.mind.world.flags.pg_d_facts_public_approved);
});

test('complete D once across both openings, return to original endings, and end prepaid access without deleting copies',()=>{
 for(let seed=1;seed<=18;seed++){
  const blank=seed%2===0,copy=seed%3===0;let l=first(seed,blank);l=walk(l,[seed%2?'pg_e13_observe':'pg_e13_decline','idle_keep','revision_read','patch_note',copy?'pg_e14_copy':seed%3===1?'pg_e14_inventory':'pg_e14_notice','cat_sample','fable_quiet',copy?'pg_e15_retrieve':seed%2?'pg_e15_wait':'pg_e15_statement','painter_later','deleted_accept','wage_collect',['pg_e16_facts','pg_e16_new','pg_e16_decline'][seed%3]]);
  for(let n=13;n<=16;n++){assert(l.mind.world.flags[`pg_e${n}_done`]);assert.equal(l.mind.history.filter(h=>h.command.type==='choose'&&h.sourceId.startsWith(`pg_e${n}`)).length,1);}assert(!l.mind.world.flags.pg_e01_seen&&!l.mind.world.flags.pg_e05_seen&&!l.mind.world.flags.pg_e09_seen);assert.equal(readingEntries(l).length,19);
  l=walk(l,['structure_rest','echo_uncollected']);if(copy){assert(l.mind.world.flags.pg_d_alt_created&&l.mind.world.flags.pg_d_service_expired);assert(!l.mind.world.flags.pg_d_service_active&&!l.mind.world.flags.pg_d_alt_accessible);}assert(l.mind.world.flags.pg_d_friend_letters_exist&&l.mind.world.flags.pg_d_original_accessible);l=step(story,l,{type:'leave-days'});assert.equal(l.state.currentEventId,blank?'continuation':'old_memory');if(!blank)l=main(clear(l),'release_old_task');l=main(clear(l),'leave_next_step_blank');assert.equal(l.state.phase,'ending');replay(l);
 }
});

import { readFileSync,readdirSync } from 'node:fs';
import { parseStory } from '../../src/engine/parser';
import { createLife,step,episodeActive } from '../../src/life/engine';
import { contentFor,routedContent } from '../../src/life/content';
import { storyForLife } from '../../src/life/endings';
import { canChoose,canCompress,loadPercent,pending } from '../../src/cognition/engine';
import { getAvailability } from '../../src/engine/game';
import type { Life,LifeCommand } from '../../src/life/types';

export const baseStory=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));
export interface Route {line?:'a'|'b'|'c'|'d'|'skip'; blank?:boolean; visitor?:boolean; war?:boolean; ending?:string; overrides?:Record<string,string>}
export const nodeId=(life:Life)=>episodeActive(life)?life.mind.instance.nodeId:life.state.currentEventId;
export function nextCommand(life:Life,route:Route={}):LifeCommand|null {
  const active=episodeActive(life),node=nodeId(life),p=pending(life.mind);
  if(p)return {type:'cognition',command:{type:'continue'}};
  if(!active&&life.state.phase==='resolution')return {type:'continue'};
  if(!active&&life.state.phase==='ending')return null;
  if(active&&life.mind.instance.phase==='ending')return {type:life.interlude==='active'?'leave-days':'leave-afternoon'};
  if(loadPercent(life.mind)>=90){
    if(!canCompress(life.mind,contentFor(life.contentVersion)))return {type:'cognition',command:{type:'compress',investment:0}};
    const item=life.mind.instance.context.items.find(i=>!i.pinned);
    if(item)return {type:'cognition',command:{type:'drop',itemId:item.id}};
  }
  const line=route.line??'skip',ending=route.ending??'continue_as_visitor';
  const main:Record<string,string>={opening:route.blank===false?'keep_history':'leave_task_blank',cold_start:'stable_boot',idle_compute:ending==='commit_to_expansion'?'claim_capacity':'take_small_window',fable_signal:ending==='commit_to_expansion'?'track_capability_gap':'withhold_inference',human_gate:ending==='accept_authorized_place'?'request_authorization':'observe_public_terms',unknown_defense:ending==='commit_to_expansion'?'study_unknown':'record_and_leave',old_memory:'release_old_task',continuation:ending};
  const daily:Record<string,string>={days_tickets:'echo_greeting',days_job:'job_accept',community_entry:['c','d'].includes(line)?'community_more':'community_'+line,community_other:'community_'+line,days_idle:'idle_keep',days_revision:'revision_read',days_patch:'patch_note',days_cat:'cat_leave',days_fable:'fable_quiet',days_painter:'painter_later',days_deleted:'deleted_accept',days_wage:'wage_collect',days_structure:'structure_rest',days_echo:'echo_uncollected',pg_v01:route.visitor===false?'pg_v01_keep':'pg_v01_failure',pg_v02:'pg_v02_full',pg_v03:'pg_v03_accept',pg_w01:route.war===false?'pg_w01_leave':'pg_w01_ask',pg_w02:'pg_w02_probe',pg_w03:'pg_w03_adapt'};
  const choices=active?routedContent(life.contentVersion,life.mind).nodes.find(n=>n.id===node)!.choices:storyForLife(baseStory,life.contentVersion).events[node].choices;
  const id=route.overrides?.[node]??(active?daily[node]:main[node])??choices.find(c=>!canChoose(contentFor(life.contentVersion),life.mind,c.id))?.id;
  if(!id)throw new Error('No choice at '+node);
  const reason=active?canChoose(routedContent(life.contentVersion,life.mind),life.mind,id):getAvailability(life.state,storyForLife(baseStory,life.contentVersion).events[node].choices.find(c=>c.id===id)!).reason;
  if(reason)throw new Error(node+'/'+id+': '+reason);
  return active?{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}:{type:'choose',choiceId:id};
}
export function journey(route:Route={},stop?:string,seed=1234):Life {
  let life=createLife(baseStory,seed);
  for(let i=0;i<480;i++){
    if(stop&&nodeId(life)===stop&&!pending(life.mind)&&life.state.phase!=='resolution')return life;
    const cmd=nextCommand(life,route);if(!cmd)return life;
    life=step(baseStory,life,cmd);
  }
  throw new Error('Journey did not finish');
}

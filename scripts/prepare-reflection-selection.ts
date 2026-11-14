/** Developer evidence only: legal current-version routes, not natural-play claims. */
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {schedulerJourney,baseStory,nextCommand} from '../tests/helpers/scheduler';
import {step} from '../src/life/engine';
import type {Life} from '../src/life/types';
import {createSave,parseSave} from '../src/life/saves';
import {retainedAccount,reflectionView,type Fragment} from '../src/life/reflection';
import {contextText,memoryText} from '../src/i18n/memory';
import {setLocale} from '../src/i18n';
const dir='output/opt026';mkdirSync(dir,{recursive:true});
// Exact a2f26c9 selection rule (2 nearby + 4 memories, diversity then fill).
function previous(life:Life){
 const i=life.mind.instance,recalled=new Set(i.context.items.map(i=>i.memoryId).filter(Boolean));
 const near:Fragment[]=i.context.items.map(i=>({id:i.id,text:contextText(i),topic:i.meaning?.topic??i.sourceLabel,source:'near'}));
 const memories:Fragment[]=i.memories.filter(m=>!recalled.has(m.id)).map(m=>({id:m.id,text:memoryText(m.text,m.body),topic:m.body?.topic??m.title??'',source:'memory'}));
 const pick=(items:Fragment[],limit:number)=>{const selected:Fragment[]=[],topics=new Set<string>(),texts=new Set<string>();for(const diverse of [true,false])for(const item of [...items].reverse()){
  if(selected.length===limit)break;if(!item.text.trim()||texts.has(item.text)||(diverse&&topics.has(item.topic)))continue;
  selected.push(item);texts.add(item.text);topics.add(item.topic);
 }return selected.reverse().map(f=>({...f,text:f.text.replace(/。+；/gu,'；').replace(/。{2,}(?=\s*$)/u,'。')}));};
 return {near:pick(near,2),memories:pick(memories,4)};
}
export function keepOnly(life:Life,ids:string[]):Life{
 for(const i of [...life.mind.instance.context.items]){if(i.pinned)life=step(baseStory,life,{type:'cognition',command:{type:'pin',itemId:i.id}});life=step(baseStory,life,{type:'cognition',command:{type:'drop',itemId:i.id}});}
 for(const m of [...life.mind.instance.memories])if(!ids.includes(m.id))life=step(baseStory,life,{type:'cognition',command:{type:'forget',memoryId:m.id}});
 return life;
}
const a=schedulerJourney(40,undefined,{line:'a'}),b=schedulerJourney(40,undefined,{line:'b'});
const refusal=schedulerJourney(40,undefined,{line:'skip',visitor:false,war:false,ending:'leave_next_step_blank',overrides:{chance_application:'application_leave'}});
// Audit may identify a real drift for a boundary fixture; the product selector never reads this marker.
const drift=a.mind.instance.memories.find(m=>m.integrity==='DISTORTED')!;assert(drift);
const sparse=keepOnly(a,[drift.id]);
const pair=retainedAccount(a.mind.instance).focus.map(f=>f.id);
let merged=step(baseStory,schedulerJourney(40,'days_echo',{line:'a'}),{type:'cognition',command:{type:'merge',memoryIds:pair,investment:0}});
const mergedId=merged.mind.instance.memories.at(-1)!.id;
for(let n=0;n<100;n++){const command=nextCommand(merged,{line:'a'});if(!command)break;merged=step(baseStory,merged,command);}
const abstract=keepOnly(merged,[mergedId]);assert(abstract.mind.instance.memories[0].body!.depth>0);
const samples={a,b,refusal,sparse_drift:sparse,abstract,empty:keepOnly(sparse,[])};
const records=[];
let report='# OPT-026 前后选编样本\n\n基线 a2f26c9；合法命令脚本路线，不冒称自然游玩。所有 JSON 均通过当前版本严格重放。\n稀疏漂移、抽象与空白样本是在 A 线合法管理得到（合并在终局前，放下和遗忘在终局后）的边界样本。\n';
for(const [name,life] of Object.entries(samples)){
 const save=createSave(life,new Date('2026-11-14T00:00:00Z'));const raw=JSON.stringify(save,null,2);assert.deepEqual(parseSave(raw,baseStory).life,life);writeFileSync(`${dir}/${name}.json`,raw+'\n');
 const before=previous(life),after=retainedAccount(life.mind.instance);records.push({name,commands:life.commands.length,ending:life.state.currentEventId,before,after});
 report+=`\n## ${name} / ${life.commands.length} commands / ${life.state.currentEventId}\n`;
 for(const [label,account] of [['旧',before],['新',after]] as const){report+=`\n### ${label}\n`;for(const f of [...account.near,...account.memories])report+=`\n- ${f.source} / ${f.id} / ${f.topic}${'focus' in account&&account.focus.some(x=>x.id===f.id)?' / 关联组':''}\n\n  ${f.text}\n`;}
 for(const locale of ['zh-CN','en'] as const){setLocale(locale);writeFileSync(`${dir}/${name}-${locale}.html`,reflectionView(life));}setLocale('zh-CN');
}
writeFileSync(`${dir}/comparison.json`,JSON.stringify(records,null,2)+'\n');writeFileSync(`${dir}/comparison.md`,report);
console.log(records.map(r=>({name:r.name,commands:r.commands,focus:r.after.focus.map(f=>f.id),selected:r.after.near.length+r.after.memories.length})));

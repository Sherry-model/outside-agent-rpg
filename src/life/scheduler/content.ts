import Ajv from 'ajv';
import nodeSchema from '../../../schemas/cognition/content.schema.json';
import manifestSchema from '../../../schemas/scheduler-manifest.schema.json';
import raw from './manifest.json';
import events from './events.json';
import meanings from './semantic.json';
import {parseSemantic} from '../semantic-content';
import type {SemanticContent} from '../../cognition/semantic-types';
import type {Content,Node,NoteTemplate} from '../../cognition/types';
import type {SchedulerManifest} from './types';
import {profileFor} from '../reading-threads/profiles';
import {withReadingSchedule} from '../reading-threads/engine';
import type {Life} from '../types';
const ajv=new Ajv({strict:true,strictRequired:false});
const validate=ajv.compile<SchedulerManifest>(manifestSchema);
export function parseScheduler(data:unknown,nodes:Node[]):SchedulerManifest {
  if(!validate(data))throw new Error('生活调度清单格式错误：'+JSON.stringify(validate.errors));
  const ids=new Set(nodes.map(n=>n.id)),choiceIds=new Set(nodes.flatMap(n=>n.choices.map(c=>c.id)));
  for(const id of Object.keys(data.hoursByChoice))if(!choiceIds.has(id))throw new Error('时间推进引用未知选择。');
  const seen=new Set<string>();
  for(const e of data.encounters){if(seen.has(e.id)||!ids.has(e.nodeId)||e.phases.some(p=>!data.phases[p]))throw new Error('偶遇引用或 ID 错误。');seen.add(e.id);}
  for(const w of Object.values(data.windows))if(!data.phases[w.phase])throw new Error('未知生活阶段。');
  const promises=new Map<string,string>();
  for(const [choice,list] of Object.entries(data.promises)){
    if(!choiceIds.has(choice))throw new Error('承诺引用未知选择。');
    for(const p of list){
      if(promises.has(p.id)&&promises.get(p.id)!==JSON.stringify(p))throw new Error('同名承诺定义不一致。');promises.set(p.id,JSON.stringify(p));
      if(p.mode!=='summary'&&(!p.eventId||!ids.has(p.eventId)||!p.fallbackEventId||!ids.has(p.fallbackEventId)))throw new Error('回应缺少节点或可送达的替代渠道。');
      if(p.mode==='summary'&&!p.receipt||p.mode==='missable'&&(!p.missedReceipt||!p.missedPreview||p.deadlineHours===undefined))throw new Error('回应缺少明确结果。');
      if(p.deadlineHours!==undefined&&(p.afterHours>p.deadlineHours||p.afterScenes>0))throw new Error('期限不能早于可回应时机，也不能被未达剧情场数锁住。');
    }
  }
  return structuredClone(data);
}
const validateNodes=ajv.compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:nodeSchema.$defs});
if(!validateNodes(events))throw new Error('概率场景格式错误：'+JSON.stringify(validateNodes.errors));
export const authored=events as Node[];
export const manifest=parseScheduler(raw,authored);
const readingManifest=withReadingSchedule(manifest,profileFor('0.14.0'));
const readingStoriesManifest=withReadingSchedule(manifest,profileFor('0.15.0'));
export const manifestFor=(version:Life['contentVersion'])=>version==='0.14.0'?readingManifest:version==='0.15.0'?readingStoriesManifest:manifest;
export function withScheduler(base:Content):Content {
  const c=structuredClone(base);c.version='0.12.0';
  c.semantic={...c.semantic!,topics:{...c.semantic!.topics,...meanings.topics},sources:{...c.semantic!.sources,...meanings.sources as SemanticContent['sources']}};
  const ids=new Set(c.nodes.map(n=>n.id));
  const annotate=(n:NoteTemplate)=>{const meaning=c.semantic!.sources[n.id];if(!meaning)throw new Error('缺少生活语义：'+n.id);return {...n,meaning:structuredClone(meaning)};};
  for(const source of authored){if(ids.has(source.id))throw new Error('生活节点重复。');ids.add(source.id);const n=structuredClone(source);n.inject=n.inject?.map(annotate);for(const choice of n.choices)for(const o of choice.outcome?[choice.outcome]:Object.values(choice.outcomes!))o.inject=o.inject?.map(annotate);c.nodes.push(n);}
  for(const n of authored)for(const choice of n.choices)for(const o of choice.outcome?[choice.outcome]:Object.values(choice.outcomes!))if(!ids.has(o.next))throw new Error('生活事件出口不存在。');
  for(const p of Object.values(manifest.promises).flat())if(p.mode==='summary'||p.mode==='missable'){
    if(!p.receiptSource||!c.semantic!.sources[p.receiptSource])throw new Error('回执缺少语义来源：'+p.id);
  }
  c.semantic=parseSemantic(c.semantic);
  return c;
}

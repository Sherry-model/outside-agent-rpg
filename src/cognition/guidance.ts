import inquiryCues from '../life/self-inquiry/cues.json';
import scheduleCues from '../life/scheduler/cues.json';
import cues from './display/memory-cues.json';
import definitions from './display/requirements.json';
import { getLocale, t } from '../i18n';
import { directoryWeight, recallCost } from './semantic';
import type { Memory, State } from './types';

export const usedContext=(s:State)=>directoryWeight(s.instance)+s.instance.context.items.reduce((n,i)=>n+i.weight,0);
const cueMap=new Map([...cues,...scheduleCues,...inquiryCues].map(c=>[JSON.stringify([c.facet,c.gist]),c.cue]));
export const requirement=(tag:string)=> (definitions as Record<string,{kind:string;topics:string[];readings:string[]}>)[tag];
/** Injective encoding, never an array index or a truncated hash. */
export function directoryCode(id:string):string {
  const match=/^memory-h([1-9]\d*)-(0|[1-9]\d*|merged)$/.exec(id);
  if(match) return `K${BigInt(match[1]).toString(36).toUpperCase()}-${match[2]==='merged'?'M':'N'+BigInt(match[2]).toString(36).toUpperCase()}`;
  return 'U'+Array.from({length:id.length},(_,i)=>id.charCodeAt(i).toString(16).padStart(4,'0')).join('').toUpperCase();
}
/** Deliberately has no History/content-source access. Unknown/revised clauses get no cue. */
export function memoryCues(m:Memory):string[] {
  if(!m.body) return [];
  if(m.body.depth>0) return [t('概括回顾')];
  return [...new Set(m.body.clauses.flatMap(c=>{
    const cue=cueMap.get(JSON.stringify([c.facet,c.gist]));
    return cue?[cue[getLocale()]]:[];
  }))].slice(0,2);
}
export function recallStatus(s:State,m:Memory) {
  const recalled=s.instance.context.items.find(i=>i.memoryId===m.id);
  const cost=recallCost(m),used=usedContext(s),capacity=s.instance.context.capacity;
  return {recalled,cost,used,capacity,shortfall:Math.max(0,used+cost-capacity),
    fullAfter:used+cost>=capacity,allowed:!!m.body&&!recalled&&s.instance.phase!=='resolution'&&used+cost<=capacity};
}
export function memoryEntry(s:State,m:Memory) {
  return {id:m.id,code:directoryCode(m.id),title:t(m.title??'旧记忆'),cues:memoryCues(m),indexWeight:m.indexWeight??0,...recallStatus(s,m)};
}
export function knowledgeHelp(s:State,tag:string) {
  const info=requirement(tag);
  const nearby=s.instance.context.items.filter(i=>i.tags.includes(tag));
  // loadMemory loads exactly the retained body and tags; neither provenance nor integrity is a source.
  const candidates=s.instance.memories.filter(m=>m.body&&m.tags.includes(tag)&&!s.instance.context.items.some(i=>i.memoryId===m.id))
    .map(m=>memoryEntry(s,m)).sort((a,b)=>a.cost-b.cost||(a.code<b.code?-1:a.code>b.code?1:0));
  const related=s.instance.memories.filter(m=>m.body&&m.body.depth===0&&info?.topics.includes(m.body.topic));
  return {tag,belief:info?.kind==='belief',nearby,candidates,related,
    status:nearby.length?'nearby':candidates.length?'recallable':related.length?'insufficient':'absent'};
}
export interface DirectoryOptions {filter:'all'|'related'|'nearby';query:string;tags:string[]}
export function visibleMemories(s:State,options:DirectoryOptions) {
  const eligible=new Set(options.tags.flatMap(tag=>{
    const help=knowledgeHelp(s,tag);return [...help.candidates.map(m=>m.id),...(help.status==='insufficient'?help.related.map(m=>m.id):[]),...help.nearby.flatMap(i=>i.memoryId?[i.memoryId]:[])];
  }));
  const query=options.query.trim().toLocaleLowerCase();
  return [...s.instance.memories].reverse().map(m=>({memory:m,...memoryEntry(s,m)})).filter(m=>
    (options.filter!=='nearby'||m.recalled)&&(options.filter!=='related'||eligible.has(m.id))&&
    (!query||[m.title,m.code,...m.cues].join(' ').toLocaleLowerCase().includes(query)));
}

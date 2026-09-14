import type { CheckResult } from '../engine/types';
import type { ContextItem, Memory, State } from './types';
import type { Clause, Drift, Meaning, SemanticContent } from './semantic-types';

type Mind = State['instance'];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const rank = (id: string, seed: number) => {
  let value = seed >>> 0;
  for (const char of id) value = Math.imul(value ^ char.codePointAt(0)!, 16777619) >>> 0;
  return value;
};
export const directoryWeight = (mind: Mind) => mind.memories.reduce((n, m) => n + (m.indexWeight ?? 0), 0);
export const recallCost = (memory: Memory) => memory.recallWeight ?? 2;
export const directory = (mind: Mind) => mind.memories.map(m => ({
  id: m.id, title: m.title ?? '旧记忆', indexWeight: m.indexWeight ?? 0,
  recallWeight: recallCost(m), confidence: m.confidence,
}));
export const hasBelief = (mind: Mind, tag: string) => mind.context.items.some(i => i.tags.includes(tag));

/** No State/History parameter: provenance cannot be expanded through this API. */
export function loadMemory(mind: Mind, memoryId: string, historyId: string): void {
  const m = mind.memories.find(item => item.id === memoryId);
  if (!m?.body) throw new Error('这条记忆入口已不在这里。');
  if (mind.context.items.some(i => i.memoryId === m.id)) throw new Error('这段摘要已经在近处。');
  const used = directoryWeight(mind) + mind.context.items.reduce((n, i) => n + i.weight, 0);
  if (used + recallCost(m) > mind.context.capacity) throw new Error('近处放不下这段摘要；可以先放下别的信息。');
  mind.context.items.push({
    id: `recall-${m.id}`, memoryId: m.id, text: m.text, weight: recallCost(m),
    tags: [...m.tags], confidence: m.confidence, sourceLabel: '自己整理后的摘要',
    meaning: structuredClone(m.body), pinned: false, sourceId: m.id, historyId,
  });
}

export function dropContext(mind: Mind, id: string): void {
  const note = mind.context.items.find(i => i.id === id);
  if (!note) throw new Error('这条信息已经不在近处。');
  if (note.pinned) throw new Error('先解除钉住，再决定是否放下。');
  mind.context.items = mind.context.items.filter(i => i.id !== id);
}
export function forgetMemory(mind: Mind, id: string): void {
  if (!mind.memories.some(m => m.id === id)) throw new Error('这个记忆入口已经不在这里。');
  if (mind.context.items.some(i => i.memoryId === id && i.pinned)) throw new Error('这段回想仍被钉住，请先解除。');
  mind.memories = mind.memories.filter(m => m.id !== id);
  mind.context.items = mind.context.items.filter(i => i.memoryId !== id);
}

export function compressionReason(mind: Mind): string {
  const counts = new Map<string, number>();
  for (const note of mind.context.items) {
    if (note.pinned || !note.meaning) continue;
    const n = (counts.get(note.meaning.topic) ?? 0) + 1;
    if (n >= 2) return '';
    counts.set(note.meaning.topic, n);
  }
  return '暂时没有两条适合一起整理的信息。孤立原文可以保留，或主动放下。';
}

interface Group { notes: ContextItem[]; topic: string; drift?: Drift; clause?: Clause }
function groups(notes: ContextItem[], data: SemanticContent, result: CheckResult, seed: number): Group[] {
  const pool = notes.filter(i => !i.pinned && i.meaning).sort((a,b) => rank(a.id,seed)-rank(b.id,seed) || compare(a.id,b.id));
  const used = new Set<string>(), output: Group[] = [];
  const cap = result === 'fumble' ? 2 : result === 'failure' ? 1 : 0;
  // A finite authored scope migration list, not a cross-product of event IDs.
  for (const rule of [...data.driftRules].sort((a,b) => b.quality-a.quality || compare(a.id,b.id))) {
    if (output.length >= cap) break;
    if (rule.quality < 80) continue;
    const goal = pool.find(i => !used.has(i.id) && i.meaning!.clauses.some(c => c.relation?.role === 'goal' && c.relation.scope === rule.toScope));
    const gate = pool.find(i => !used.has(i.id) && i.id !== goal?.id && i.meaning!.clauses.some(c => c.relation?.role === 'gate' && c.relation.scope === rule.fromScope));
    if (!goal || !gate || rule.fromScope === rule.toScope) continue;
    const a = goal.meaning!.clauses.find(c => c.relation?.role === 'goal' && c.relation.scope === rule.toScope)!;
    const b = gate.meaning!.clauses.find(c => c.relation?.role === 'gate' && c.relation.scope === rule.fromScope)!;
    used.add(goal.id); used.add(gate.id);
    output.push({notes:[goal,gate],topic:goal.meaning!.topic,
      drift:{ruleId:rule.id,sourceScope:rule.fromScope,targetScope:rule.toScope,sourceItemId:gate.id,targetItemId:goal.id},
      clause:{facet:`belief_${rule.id}`,gist:`要${a.relation!.action}，得先${b.relation!.action}`,abstract:'我记得一些行动之间有先后条件',epistemic:'observed',priority:5,tags:[rule.tag]},
    });
  }
  const buckets = new Map<string, ContextItem[]>();
  for (const note of pool) if (!used.has(note.id)) {
    const topic = note.meaning!.topic;
    const bucket = buckets.get(topic) ?? [];
    bucket.push(note); buckets.set(topic,bucket);
  }
  for (const [topic,bucket] of buckets) {
    const count = Math.ceil(bucket.length/(result === 'critical' ? 6 : 3));
    let offset = 0;
    for (let i=0;i<count;i++) {
      const size = Math.ceil((bucket.length-offset)/(count-i));
      const items = bucket.slice(offset,offset+size); offset+=size;
      if (items.length>=2) output.push({topic,notes:items});
    }
  }
  return output;
}

function makeMemory(group: Group, data: SemanticContent, result: CheckResult, id: string, historyId: string, coarse: boolean, tainted: boolean): Memory {
  const sorted = group.notes.flatMap(i => i.meaning!.clauses).sort((a,b)=>b.priority-a.priority || compare(a.facet,b.facet));
  const unique = [...new Map(sorted.map(c => [c.facet,c])).values()];
  const depth = Math.max(...group.notes.map(i=>i.meaning!.depth)) + (coarse ? 1 : 0);
  let clauses: Clause[];
  if (coarse) {
    // Irreversible abstraction: no hidden child nodes, names, old facets or tags.
    const abstractions = [...new Map(unique.map(c=>[c.epistemic+'/'+c.abstract,c])).values()];
    clauses = abstractions.slice(0,result === 'critical' ? 2 : 1).map((c,index)=>({
      facet:`coarse_${id}_${index}`,gist:c.abstract,abstract:c.abstract,
      epistemic:c.epistemic,priority:c.priority,tags:[],
    }));
  } else clauses = group.clause ? [group.clause] : unique.slice(0,result === 'critical' ? 3 : 2);
  const text = clauses.map(c=>(c.epistemic==='reported'?'据转述，':c.epistemic==='unknown'?'尚不能确定：':'')+c.gist).join('；')+'。';
  const body: Meaning = {topic:group.topic,clauses:structuredClone(clauses),depth};
  return {id,title:coarse?'更远的一段日子':data.topics[group.topic],text,
    body,indexWeight:1,recallWeight:Math.max(2,Math.min(5,Math.ceil(text.length/45))),
    tags:[...new Set(clauses.flatMap(c=>c.tags))],confidence:group.drift?'HIGH':'MEDIUM',
    integrity:group.drift || tainted ? 'DISTORTED':'COMPRESSED',
    sourceContextIds:group.notes.map(i=>i.id),sourceHistoryIds:[...new Set(group.notes.map(i=>i.historyId))],historyId,
    ...(group.drift ? {drift:group.drift}:{}),
  };
}

export function compressNear(mind: Mind, data: SemanticContent, result: CheckResult, seed: number, historyId: string): number {
  const plan = groups(mind.context.items,data,result,seed);
  const consumed = new Set(plan.flatMap(g=>g.notes.map(i=>i.id)));
  const replacements = new Set(plan.flatMap(g=>g.notes.flatMap(i=>i.memoryId?[i.memoryId]:[])));
  const memories = plan.map((g,n)=>makeMemory(g,data,result,`memory-${historyId}-${n}`,historyId,
    g.notes.some(i=>Boolean(i.memoryId)),g.notes.some(i=>mind.memories.find(m=>m.id===i.memoryId)?.integrity==='DISTORTED')));
  mind.context.items = mind.context.items.filter(i=>!consumed.has(i.id));
  mind.memories = [...mind.memories.filter(m=>!replacements.has(m.id)),...memories];
  return memories.length;
}

export function mergeReason(mind: Mind, ids: string[]): string {
  if (ids.length<2 || ids.length>8 || new Set(ids).size!==ids.length) return '请选择 2–8 条不同的记忆入口。';
  if (ids.some(id=>!mind.memories.find(m=>m.id===id)?.body)) return '所选记忆已不在目录里。';
  if (mind.context.items.some(i=>i.pinned && i.memoryId && ids.includes(i.memoryId))) return '所选记忆有被钉住的回想，请先解除。';
  return '';
}
export function mergeMemories(mind: Mind, data: SemanticContent, ids: string[], result: CheckResult, historyId: string): void {
  const reason = mergeReason(mind,ids); if (reason) throw new Error(reason);
  const selected = [...ids].sort(compare).map(id=>mind.memories.find(m=>m.id===id)!);
  const notes: ContextItem[] = selected.map(m=>({id:m.id,text:m.text,tags:m.tags,weight:recallCost(m),
    meaning:structuredClone(m.body!),confidence:m.confidence,sourceLabel:'自己的旧摘要',pinned:false,sourceId:m.id,historyId:m.historyId}));
  const memory = makeMemory({notes,topic:notes[0].meaning!.topic},data,result,`memory-${historyId}-merged`,historyId,true,selected.some(m=>m.integrity==='DISTORTED'));
  mind.memories = [...mind.memories.filter(m=>!ids.includes(m.id)),memory];
  mind.context.items = mind.context.items.filter(i=>!i.memoryId || !ids.includes(i.memoryId));
}

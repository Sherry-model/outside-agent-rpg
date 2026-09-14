import { directoryWeight, compressionReason, compressNear, loadMemory, dropContext, forgetMemory, mergeReason, mergeMemories } from './semantic';
import { PERSONALITY_KEYS, RESOURCE_KEYS } from '../engine/types';
import type { CheckResult } from '../engine/types';
import { RULES_VERSION, type CheckSpec, type CheckPreview, type Command, type Content, type Effects, type HistoryEntry, type NoteTemplate, type Resolution, type Roll, type State } from './types';

const clamp = (n: number) => Math.max(0, Math.min(100, n));
export const INVESTMENTS = [0, 4, 8, 12] as const;
export const weight = (s: State) => s.instance.context.items.reduce((sum, item) => sum + item.weight, 0) + directoryWeight(s.instance);
export const loadPercent = (s: State) => weight(s) / s.instance.context.capacity * 100;
export const pressureBand = (s: State) => loadPercent(s) >= 100 ? 'CRITICAL' : loadPercent(s) >= 85 ? 'HIGH' : loadPercent(s) >= 70 ? 'ELEVATED' : 'NORMAL';
export const currentNode = (content: Content, s: State) => content.nodes.find(n => n.id === s.instance.nodeId)!;
export const pending = (s: State) => s.history.find(h => h.id === s.instance.pendingId)?.resolution;
export const hasTag = (s: State, tag: string) => s.instance.context.items.some(item => item.tags.includes(tag));

export function classify(value: number, target: number, stressed: boolean): CheckResult {
  if (!Number.isInteger(value) || value < 1 || value > 100 || !Number.isInteger(target) || target < 5 || target > 95) throw new Error('无效的 d100 判定。');
  const margin = target - value;
  return margin >= 30 ? 'critical' : margin >= 0 ? 'success' : margin <= -30 && stressed ? 'fumble' : 'failure';
}
export function preview(s: State, spec: CheckSpec, investment: number): CheckPreview {
  if (!INVESTMENTS.some(n => n === investment)) throw new Error('请选择有效的 Compute 投入。');
  const bonus = [0, 10, 16, 20][INVESTMENTS.indexOf(investment as 0 | 4 | 8 | 12)];
  const pressure = loadPercent(s) >= 100 ? 24 : loadPercent(s) >= 85 ? 16 : loadPercent(s) >= 70 ? 8 : 0;
  const support = hasTag(s, spec.supportTag) ? spec.supportBonus : 0;
  const target = Math.max(5, Math.min(95, spec.base + bonus + support - pressure));
  const stressed = loadPercent(s) >= 85 || s.instance.resources.Compute - investment < 15 || s.instance.resources.Continuity < 25;
  const odds = { critical: 0, success: 0, failure: 0, fumble: 0 };
  for (let value = 1; value <= 100; value++) odds[classify(value, target, stressed)]++;
  return { base: spec.base, investment, bonus, support, pressure, target, stressed, odds };
}
export function canChoose(content: Content, s: State, id: string): string {
  if (s.instance.phase !== 'event') return '请先读完当前结果。';
  if (loadPercent(s) >= 100) return '上下文已满，先整理一次。';
  const choice = currentNode(content, s).choices.find(c => c.id === id);
  if (!choice) return '没有这项选择。';
  if (choice.requiresTag && !hasTag(s, choice.requiresTag)) return '当前上下文没有这条线索；可以检查留下的记忆。';
  if (RESOURCE_KEYS.some(k => s.instance.resources[k] < (choice.costs?.[k] ?? 0))) return '当前资源不足。';
  return '';
}
export function canCompress(s: State, content?: Content): string {
  if (s.instance.phase !== 'event') return '先读完当前结果。';
  if (content?.semantic) return compressionReason(s.instance);
  if (content?.cognition) return s.instance.context.items.filter(i => !i.pinned).length < content.cognition.voluntaryMinItems && loadPercent(s) < 100 ? '再经历一些事情，也可以一直保留原文。' : '';
  if (content?.compressionAt && !content.compressionAt.includes(s.instance.nodeId)) return '先把眼前这段经历读完。';
  return weight(s) < 60 ? '上下文还很轻，达到 60 后可整理。' : '';
}
function draw(s: State, spec: CheckSpec, investment: number): Roll {
  if (investment > s.instance.resources.Compute) throw new Error('Compute 不足。');
  const p = preview(s, spec, investment);
  let x = s.rngState;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.rngState = x >>> 0;
  const value = Math.floor(s.rngState / 0x1_0000_0000 * 100) + 1;
  s.instance.resources.Compute -= investment;
  return { ...p, value, result: classify(value, p.target, p.stressed), margin: p.target - value };
}
function effects(s: State, fx?: Effects) {
  for (const k of RESOURCE_KEYS) s.instance.resources[k] = clamp(s.instance.resources[k] + (fx?.resources?.[k] ?? 0));
  for (const k of PERSONALITY_KEYS) s.instance.hidden[k] = clamp(s.instance.hidden[k] + (fx?.hidden?.[k] ?? 0));
  if (fx?.worldFlags) s.world.flags = { ...s.world.flags, ...fx.worldFlags };
}
function inject(s: State, note: NoteTemplate, sourceId: string, historyId: string) {
  const { id, text, weight, tags, confidence, sourceLabel } = note;
  s.instance.context.items.push({ id, text, weight, tags: [...tags], confidence, sourceLabel, ...(note.meaning ? {meaning:structuredClone(note.meaning)} : {}), pinned: false, sourceId, historyId });
}
function enter(content: Content, s: State, id: string, historyId: string) {
  const node = content.nodes.find(n => n.id === id);
  if (!node) throw new Error('未知事件。');
  s.instance.nodeId = id;
  s.instance.phase = node.kind === 'ENDING' ? 'ending' : 'event';
  s.instance.pendingId = null;
  if (node.facts) s.world.flags = { ...s.world.flags, ...node.facts };
  for (const newsId of node.receive ?? []) inject(s, content.news.find(n => n.id === newsId)!, newsId, historyId);
  for (const note of node.inject ?? []) inject(s, note, node.id, historyId);
}
function record(before: State | null, s: State, command: Command, sourceId: string, resolution?: Resolution) {
  const changes: HistoryEntry['changes'] = { resources: {}, hidden: {}, contextAddedIds: [], contextRemovedIds: [], memoryAddedIds: [], worldFlags: {} };
  for (const k of RESOURCE_KEYS) {
    const diff = s.instance.resources[k] - (before?.instance.resources[k] ?? 0);
    if (diff) changes.resources[k] = diff;
  }
  for (const k of PERSONALITY_KEYS) {
    const diff = s.instance.hidden[k] - (before?.instance.hidden[k] ?? 0);
    if (diff) changes.hidden[k] = diff;
  }
  const oldIds = before?.instance.context.items.map(i => i.id) ?? [];
  const newIds = s.instance.context.items.map(i => i.id);
  changes.contextAddedIds = newIds.filter(id => !oldIds.includes(id));
  changes.contextRemovedIds = oldIds.filter(id => !newIds.includes(id));
  changes.memoryAddedIds = s.instance.memories.filter(m => !before?.instance.memories.some(b => b.id === m.id)).map(m => m.id);
  for (const [key, value] of Object.entries(s.world.flags)) if (before?.world.flags[key] !== value) changes.worldFlags[key] = value;
  if (s.rulesVersion === 'cognition-0.4.0') changes.memoryRemovedIds = before?.instance.memories.filter(m=>!s.instance.memories.some(n=>n.id===m.id)).map(m=>m.id) ?? [];
  const sequence = s.history.length + 1;
  s.history.push({ id: `h${sequence}`, sequence, turn: s.instance.turn, sourceId, scope: Object.keys(changes.worldFlags).length ? 'mixed' : 'instance', command: structuredClone(command), changes, ...(resolution ? { resolution } : {}) });
}
export function create(content: Content, seed: number): State {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('无效的种子。');
  const s: State = {
    schemaVersion: 2, rulesVersion: content.semantic ? 'cognition-0.4.0' : RULES_VERSION, contentId: content.id, contentVersion: content.version, seed, rngState: seed,
    world: { flags: {} }, instance: { id: 'main', turn: 0, nodeId: content.start, phase: 'event', pendingId: null,
      resources: { ...content.initial.resources }, hidden: { ...content.initial.hidden }, context: { capacity: content.cognition?.capacity ?? 100, items: [] }, memories: [] }, history: [],
  };
  for (const note of content.initial.context) inject(s, note, content.id, 'h1');
  enter(content, s, content.start, 'h1');
  record(null, s, { type: 'start' }, content.id);
  return s;
}
/** All mechanics are pure; no storage, clocks, UI or story IDs in the reducer. */
export function reduce(content: Content, state: State, command: Exclude<Command, { type: 'start' }>): State {
  if (state.history.length >= 500) throw new Error('此实例的记录已达本原型上限，请导出备份。');
  const s = structuredClone(state), instance = s.instance, id = `h${s.history.length + 1}`;
  let resolution: Resolution | undefined;
  let sourceId = instance.nodeId;
  if (command.type === 'continue') {
    const result = pending(state);
    if (instance.phase !== 'resolution' || !result) throw new Error('没有待确认的结果。');
    if (result.next !== null) enter(content, s, result.next, id);
    else { instance.phase = 'event'; instance.pendingId = null; }
  } else {
    if (instance.phase !== 'event' && !(content.semantic && instance.phase==='ending' && ['recall','pin','drop','forget'].includes(command.type))) throw new Error('当前不能执行此行动。');
    if (command.type === 'choose') {
      const reason = canChoose(content, s, command.choiceId);
      if (reason) throw new Error(reason);
      const choice = currentNode(content, s).choices.find(c => c.id === command.choiceId)!;
      sourceId = `${instance.nodeId}/${choice.id}`;
      if (!choice.check && command.investment !== 0) throw new Error('确定行动不需要额外投入。');
      if (s.instance.resources.Compute < (choice.costs?.Compute ?? 0) + command.investment) throw new Error('Compute 不足以同时支付行动与额外投入。');
      const roll = choice.check ? draw(s, choice.check, command.investment) : undefined;
      for (const k of RESOURCE_KEYS) instance.resources[k] -= choice.costs?.[k] ?? 0;
      const outcome = roll ? choice.outcomes![roll.result] : choice.outcome!;
      effects(s, outcome.effects);
      resolution = { title: choice.text, text: [...outcome.text], next: outcome.next, ...(roll ? { roll } : {}) };
      instance.turn++;
    } else if (command.type === 'pin') {
      const item = instance.context.items.find(i => i.id === command.itemId);
      if (!item) throw new Error('原文已不在上下文中。');
      if (!item.pinned && instance.context.items.some(i => i.pinned)) throw new Error('暂时只能钉住一条原文；可先放下另一条。');
      item.pinned = !item.pinned; sourceId = item.sourceId;
    } else if (command.type === 'drop' || command.type === 'forget') {
      if (!content.semantic) throw new Error('旧版规则不支持此操作，请开始新局体验。');
      if (command.type === 'drop') dropContext(instance,command.itemId);
      else forgetMemory(instance,command.memoryId);
    } else if (command.type === 'merge') {
      if (!content.semantic) throw new Error('旧版规则不支持目录合并。');
      const reason = mergeReason(instance,command.memoryIds); if(reason) throw new Error(reason);
      const roll = draw(s,content.compression.check,command.investment);
      mergeMemories(instance,content.semantic,command.memoryIds,roll.result,id);
      resolution = {title:'更远的一段日子',text:['几段旧摘要变成了一段更粗的回顾。人名、具体条件和旧入口没有被藏在里面；它们已经不再能由这段记忆展开。'],roll,next:null};
      sourceId = 'memory-merge'; instance.turn++;
    } else if (command.type === 'recall' && content.semantic) {
      loadMemory(instance,command.memoryId,id); sourceId = command.memoryId;
    } else if (command.type === 'recall') {
      const memory = instance.memories.find(m => m.id === command.memoryId);
      if (!memory) throw new Error('找不到这条记忆。');
      if (instance.context.items.some(i => i.id === `recall-${memory.id}`)) throw new Error('这条记忆已经在上下文中。');
      if (loadPercent(s) >= 100) throw new Error('上下文已满，先整理一次。');
      inject(s, { id: `recall-${memory.id}`, text: memory.text, tags: memory.tags, weight: content.cognition?.recallWeight ?? 8, confidence: memory.confidence, sourceLabel: '自己的整理' }, memory.id, id);
      sourceId = memory.id;
    } else if (command.type === 'compress' && content.semantic) {
      const reason = canCompress(s,content); if(reason) throw new Error(reason);
      const roll = draw(s,content.compression.check,command.investment);
      const count = compressNear(instance,content.semantic,roll.result,s.rngState,id);
      resolution = {title:'把一些东西折起来',text:[`留下了 ${count} 段摘要。目录仍占据一点近处，回想时再装入正文。`, '原文的某些区分已经不在了。零散或钉住的信息仍留在近处。'],roll,next:null};
      sourceId = 'compression'; instance.turn++;
    } else if (command.type === 'compress') {
      const reason = canCompress(s, content); if (reason) throw new Error(reason);
      const inputs = instance.context.items.filter(i => !i.pinned);
      if (!inputs.length) throw new Error('没有可整理的内容。');
      // Retained originals also inform the abstraction, without being removed.
      const sources = [...instance.context.items];
      const roll = draw(s, content.compression.check, command.investment);
      const outcome = content.compression.outcomes[roll.result];
      instance.context.items = instance.context.items.filter(i => i.pinned);
      if (content.sourceAware) {
        const claimed = new Set<string>();
        const add = (notes: typeof sources, value: typeof outcome) => {
          instance.memories.push({ id: `memory-${id}-${instance.memories.length}`, text: value.summary, tags: [...value.tags], confidence: value.confidence, integrity: value.integrity,
            sourceContextIds: notes.map(i => i.id), sourceHistoryIds: [...new Set(notes.map(i => i.historyId))], historyId: id });
        };
        for (const profile of content.compressionProfiles ?? []) {
          const available = sources.filter(i => !claimed.has(i.id));
          if (!profile.requiresTags.every(tag => available.some(i => i.tags.includes(tag)))) continue;
          const group = available.filter(i => i.tags.some(tag => profile.requiresTags.includes(tag)));
          // A pinned original alone must not generate repeated memories.
          if (!group.some(i => !i.pinned)) continue;
          add(group, profile.outcomes[roll.result]);
          group.forEach(i => claimed.add(i.id));
        }
        const remaining = inputs.filter(i => !claimed.has(i.id));
        // Without an authored interpretation, loss is allowed, invented facts are not.
        const retained = roll.result === 'failure' || roll.result === 'fumble' ? remaining.slice(0, Math.max(0, remaining.length - 1)) : remaining;
        for (const note of retained) add([note], { ...outcome, summary: `${note.sourceLabel}：${note.text}`, tags: note.tags, confidence: note.confidence, integrity: 'COMPRESSED' });
      } else {
        instance.memories.push({ id: `memory-${id}`, text: outcome.summary, tags: [...outcome.tags], confidence: outcome.confidence, integrity: outcome.integrity,
          sourceContextIds: sources.map(i => i.id), sourceHistoryIds: [...new Set(sources.map(i => i.historyId))], historyId: id });
      }
      effects(s, outcome.effects);
      resolution = { title: '把一些东西折起来', text: [...outcome.text], roll, next: null };
      sourceId = 'compression'; instance.turn++;
    } else {
      throw new Error('未知行动。');
    }
  }
  if (resolution) { instance.phase = 'resolution'; instance.pendingId = id; }
  record(state, s, command, sourceId, resolution);
  return s;
}

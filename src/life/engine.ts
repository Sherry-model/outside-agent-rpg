import { advance, choose, createGame } from '../engine/game';
import { PERSONALITY_KEYS, type Story } from '../engine/types';
import { create, reduce, loadPercent, pending } from '../cognition/engine';
import type { NoteTemplate } from '../cognition/types';
import type { JourneySave } from '../persistence/journey';
import { cognitionContent, config, parseLifeContent } from './content';
import type { Life, LifeCommand } from './types';
import { library } from './reading';

export const totalTurn = (life: Life) => life.state.turn + life.mind.instance.turn + (life.baseline?.chapter?.state.instance.turn ?? 0);
export const readIds = (life: Life) => life.commands.flatMap(c=>c.type==='read'?[c.entryId]:[]);
export const readingAvailable = (life: Life) => life.state.visited.includes(library.unlockAfterVisited);
export const available = (life: Life) => life.chapter === 'unvisited' && life.state.phase === 'event' && !pending(life.mind) && loadPercent(life.mind) < 100 && life.state.currentEventId === config.chapterEntry.eventId && life.state.visited.includes(config.chapterEntry.requiresVisited);
function add(life: Life, note: NoteTemplate, sourceId: string) {
  const id = `${note.id}-${life.commands.length}`;
  life.mind.instance.context.items.push({...structuredClone(note),id,pinned:false,sourceId,historyId:`life-${life.commands.length}`});
}
function observe(life: Life) {
  const note = config.observations[life.state.currentEventId];
  if (note) add(life, note, life.state.currentEventId);
}
function fromMain(life: Life, previousHidden?: Life['state']['personality']) {
  const mind = life.mind;
  mind.instance.resources = {...life.state.resources}; mind.rngState = life.state.rngState;
  if (previousHidden) for (const key of PERSONALITY_KEYS) mind.instance.hidden[key] = Math.max(0,Math.min(100,mind.instance.hidden[key] + (life.state.personality[key] - previousHidden[key])*5));
  mind.instance.phase = life.state.phase; mind.instance.pendingId = null; mind.instance.nodeId = 'mainline';
}
function toMain(life: Life) {
  life.state.resources = {...life.mind.instance.resources}; life.state.rngState = life.mind.rngState;
  for (const key of PERSONALITY_KEYS) life.state.personality[key] = Math.round((life.mind.instance.hidden[key]-50)/5);
}
export function createLife(story: Story, seed: number, baseline: JourneySave | null = null): Life {
  parseLifeContent(config,story);
  if (baseline?.chapter?.status === 'active') throw new Error('这是旧版进行中的午后，请用 versions/OUTSIDE-journey-content-0.2.2.html 继续；本文件未被覆盖。');
  const state = baseline ? structuredClone(baseline.state) : createGame(story,seed);
  const content = structuredClone(cognitionContent);
  content.initial.resources = {...state.resources};
  for (const key of PERSONALITY_KEYS) content.initial.hidden[key] = 50 + 5*state.personality[key];
  const life: Life = {contentVersion:'0.3.0',seed,baseline:structuredClone(baseline),state,mind:create(content,seed),chapter:baseline?.chapter ? 'complete' : 'unvisited',commands:[]};
  fromMain(life);
  if (state.phase !== 'ending') observe(life);
  return life;
}
export function step(story: Story, before: Life, command: LifeCommand): Life {
  if (before.commands.length >= 500) throw new Error('本原型记录已达上限，请导出本局。');
  const life = structuredClone(before);
  life.commands.push(structuredClone(command));
  if (command.type === 'cognition') {
    if (life.chapter !== 'active' && command.command.type === 'choose') throw new Error('请使用当前主线的选项。');
    if (life.chapter !== 'active' && command.command.type === 'continue' && !pending(life.mind)) throw new Error('没有待确认的整理结果。');
    life.mind = reduce(cognitionContent,life.mind,command.command);
    toMain(life);
  } else if (command.type === 'read') {
    const entry = library.entries.find(e=>e.id===command.entryId);
    if (!entry || !readingAvailable(life) || life.chapter==='active' || life.state.phase!=='event' || pending(life.mind)) throw new Error('现在不能打开新的转发。');
    if (before.mind.instance.context.items.some(i=>i.sourceId===entry.id)) throw new Error('这条内容仍在上下文中，可以直接重看。');
    if (loadPercent(life.mind)>=100) throw new Error('上下文已满，请先整理。');
    add(life,{id:`reading-${entry.id}`,text:entry.contextText,weight:entry.weight,tags:[`reading_${entry.id}`],confidence:'LOW',sourceLabel:entry.source},entry.id);
  } else if (command.type === 'enter-afternoon') {
    if (!available(before)) throw new Error('这个午后尚未到来，或已经过去。');
    life.chapter = 'active'; life.mind.instance.nodeId = 'afternoon'; life.mind.instance.phase = 'event';
  } else if (command.type === 'leave-afternoon') {
    if (life.chapter !== 'active' || life.mind.instance.phase !== 'ending') throw new Error('请先读完这个午后。');
    life.chapter = 'complete'; toMain(life); fromMain(life);
  } else {
    if (life.chapter === 'active') throw new Error('请先结束当前的午后。');
    if (pending(life.mind)) throw new Error('请先确认整理结果。');
    if (command.type === 'choose') {
      if (loadPercent(life.mind) >= 100) throw new Error('上下文已满，请先整理。');
      const previous = {...life.state.personality};
      life.state = choose(story,life.state,command.choiceId);
      const result = life.state.pending!;
      add(life,{id:`decision-${life.state.turn}`,text:[result.choiceText,...result.text].join(' '),weight:config.outcomeWeight,tags:[`decision_${result.choiceId}`],confidence:'HIGH',sourceLabel:story.events[result.eventId].title},result.eventId);
      fromMain(life,previous);
    } else {
      life.state = advance(story,life.state); fromMain(life);
      if (life.state.phase !== 'ending') observe(life);
    }
  }
  return life;
}

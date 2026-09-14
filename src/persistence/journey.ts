import Ajv from 'ajv';
import schema from '../../schemas/journey-save.schema.json';
import definitions from '../../schemas/definitions.schema.json';
import type { GameState, SaveFile, Story } from '../engine/types';
import { PERSONALITY_KEYS } from '../engine/types';
import { createSave as coreSave, parseSave as parseCore, SAVE_KEYS, type StorageLike, type SaveSlot } from './saves';
import { create, reduce } from '../cognition/engine';
import { createSave as cognitionSave, parseSave as parseCognition } from '../cognition/saves';
import type { Content, State, Command } from '../cognition/types';
import { contentVersions } from '../story-tomorrow';

export type Chapter = { status: 'active' | 'complete'; origin: GameState; state: State };
export interface JourneySave { format: 'outside-journey-save'; version: 1; savedAt: string; state: GameState; chapter: Chapter | null }
const ajv = new Ajv({strict:true,allErrors:true});
ajv.addSchema(definitions);
const validate=ajv.compile<JourneySave>(schema);
export const JOURNEY_KEYS = { auto: 'outside.journey.v1.auto', manual: 'outside.journey.v1.manual' } as const;
export { type StorageLike };
export function eligible(state: GameState, chapter: Chapter | null): boolean {
  return !chapter && state.phase === 'event' && state.currentEventId === 'human_gate' && state.visited.includes('fable_signal');
}
export function chapterContent(chapter: Chapter): Content {
  const base = contentVersions.find(c => c.version === chapter.state.contentVersion);
  if (!base || !base.integration) throw new Error('不兼容的旅程章节。');
  return inherit(base, chapter.origin);
}
function inherit(base: Content, origin: GameState): Content {
  const content = structuredClone(base);
  content.initial.resources = { ...origin.resources };
  // The original scale remains unchanged. Residue lives in the chapter record.
  for (const key of PERSONALITY_KEYS) content.initial.hidden[key] = 50 + 5 * origin.personality[key];
  return content;
}
export function begin(state: GameState, chapter: Chapter | null, base: Content): Chapter {
  if (!eligible(state, chapter) || !base.integration) throw new Error('这个午后只会出现在 Fable 相遇之后、进入正式入口之前。');
  return { status: 'active', origin: structuredClone(state), state: create(inherit(base, state), state.rngState) };
}
export function stepChapter(chapter: Chapter, command: Exclude<Command, { type: 'start' }>): Chapter {
  if (chapter.status !== 'active') throw new Error('这个午后已经过去。');
  return { ...chapter, state: reduce(chapterContent(chapter), chapter.state, command) };
}
export function finish(chapter: Chapter): { state: GameState; chapter: Chapter } {
  if (chapter.status !== 'active' || chapter.state.instance.phase !== 'ending') throw new Error('请先读完这个午后。');
  const state = structuredClone(chapter.origin);
  state.resources = { ...chapter.state.instance.resources };
  state.rngState = chapter.state.rngState;
  return { state, chapter: { ...structuredClone(chapter), status: 'complete' } };
}
export function createSave(state: GameState, chapter: Chapter | null, now = new Date()): JourneySave {
  return { format: 'outside-journey-save', version: 1, savedAt: now.toISOString(), state: structuredClone(state), chapter: structuredClone(chapter) };
}
function stable(v: unknown) { return JSON.stringify(v, (_k, x: unknown) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x); }
export function parseSave(raw: string, story: Story): JourneySave {
  if (raw.length > 2_000_000) throw new Error('存档超过 2 MB。');
  let data: JourneySave | SaveFile;
  try { data = JSON.parse(raw); } catch { throw new Error('存档不是有效的 JSON。'); }
  if (data?.format === 'outside-save') return createSave(parseCore(raw, story).state, null, new Date(data.savedAt));
  if (!data || data.format !== 'outside-journey-save' || data.version !== 1 || !Number.isFinite(Date.parse(data.savedAt)) || Object.keys(data).sort().join() !== 'chapter,format,savedAt,state,version') throw new Error('旅程存档结构或版本不兼容。');
  if(!validate(data)) throw new Error('旅程存档字段不完整或数值无效。');
  parseCore(JSON.stringify({ ...coreSave(data.state), savedAt: data.savedAt }), story);
  const c = data.chapter;
  if (c !== null) {
    if (!c || Object.keys(c).sort().join() !== 'origin,state,status' || !['active', 'complete'].includes(c.status)) throw new Error('旅程章节记录无效。');
    parseCore(JSON.stringify(coreSave(c.origin)), story);
    if (!eligible(c.origin, null)) throw new Error('章节不在合法的时间位置。');
    const content = chapterContent(c);
    parseCognition(JSON.stringify(cognitionSave(c.state)), content);
    if (c.state.seed !== c.origin.rngState) throw new Error('章节随机序列与本局不一致。');
    if (c.status === 'active' && stable(c.origin) !== stable(data.state)) throw new Error('进行中的章节与主线不一致。');
    if (c.status === 'complete') {
      if (c.state.instance.phase !== 'ending' || data.state.turn < c.origin.turn || stable(data.state.journal.slice(0, c.origin.turn)) !== stable(c.origin.journal)) throw new Error('已完成章节缺少相符的主线历史。');
      if (data.state.turn === c.origin.turn) {
        const expected = finish({ ...c, status: 'active' }).state;
        if (stable(data.state) !== stable(expected)) throw new Error('章节返回后的资源或进度不一致。');
      }
    }
  }
  return data;
}
export function readSave(storage: StorageLike, slot: SaveSlot, story: Story): JourneySave | null {
  const raw = storage.getItem(JOURNEY_KEYS[slot]) ?? storage.getItem(SAVE_KEYS[slot]);
  return raw === null ? null : parseSave(raw, story);
}
export function writeSave(storage: StorageLike, slot: SaveSlot, state: GameState, chapter: Chapter | null): JourneySave {
  const save = createSave(state, chapter);
  storage.setItem(JOURNEY_KEYS[slot], JSON.stringify(save));
  return save;
}

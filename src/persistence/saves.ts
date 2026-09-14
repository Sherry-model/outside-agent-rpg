import type { GameState, SaveFile, Story } from '../engine/types';
import { validateSaveFile } from '../engine/schema';

export const SAVE_KEYS = { auto: 'outside.v1.auto', manual: 'outside.v1.manual' } as const;
export type SaveSlot = keyof typeof SAVE_KEYS;
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function createSave(state: GameState, now = new Date()): SaveFile {
  return { format: 'outside-save', version: 1, savedAt: now.toISOString(), state: structuredClone(state) };
}

export function parseSave(text: string, story: Story): SaveFile {
  if (text.length > 2_000_000) throw new Error('存档超过 2 MB，无法载入。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('存档不是有效的 JSON，原有进度未被更改。'); }
  validateSaveFile(value);
  const state = value.state;
  if (state.storyId !== story.manifest.id || state.storyVersion !== story.manifest.version) {
    throw new Error(`存档剧情版本不兼容，需要 ${story.manifest.id} / ${story.manifest.version}。`);
  }
  if (!Number.isFinite(Date.parse(value.savedAt))) throw new Error('存档时间无效。');
  const hasEvent = (id: string) => Object.hasOwn(story.events, id);
  const event = story.events[state.currentEventId];
  if (!hasEvent(state.currentEventId) || state.visited.some(id => !hasEvent(id))) throw new Error('存档引用了不存在的事件。');
  if (!state.visited.includes(state.currentEventId)) throw new Error('当前事件不在存档访问记录中。');
  if (state.turn !== state.journal.length) throw new Error('存档回合与记忆记录不一致。');
  if ((state.phase === 'ending') !== (event.kind === 'ending')) throw new Error('存档阶段与事件类型不一致。');
  if ((state.phase === 'resolution') !== (state.pending !== null)) throw new Error('存档结算阶段不完整。');
  const resolutions = [...state.journal, ...(state.pending ? [state.pending] : [])];
  for (const item of resolutions) {
    const origin = hasEvent(item.eventId) ? story.events[item.eventId] : undefined;
    const choice = origin?.choices.find(c => c.id === item.choiceId);
    if (!choice || !hasEvent(item.nextEventId)) throw new Error('存档选择或目标事件引用无效。');
    if (Boolean(item.roll) !== Boolean(choice.check)) throw new Error('存档判定类型不一致。');
    if (item.roll) {
      const { value: roll, target, result } = item.roll;
      const expected = roll <= 5 ? 'critical' : roll >= 96 ? 'fumble' : roll <= target ? 'success' : 'failure';
      if (result !== expected) throw new Error('存档骰值与判定结果不一致。');
    }
  }
  state.journal.forEach((item, i) => {
    if (item.turn !== i + 1) throw new Error('存档记忆顺序无效。');
  });
  if (state.pending) {
    if (state.pending.eventId !== state.currentEventId) throw new Error('待结算事件与当前事件不一致。');
    const last = state.journal.at(-1);
    if (!last) throw new Error('待结算结果缺少记忆记录。');
    const { turn: _turn, title: _title, ...resolution } = last;
    if (stableJSON(resolution) !== stableJSON(state.pending)) throw new Error('待结算结果与记忆不一致。');
  }
  return value;
}

function stableJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

export function writeSave(storage: StorageLike, slot: SaveSlot, state: GameState): SaveFile {
  const save = createSave(state);
  try { storage.setItem(SAVE_KEYS[slot], JSON.stringify(save)); }
  catch { throw new Error('浏览器无法写入本地存档。进度仍在本页，请导出 JSON 备份。'); }
  return save;
}

export function readSave(storage: StorageLike, slot: SaveSlot, story: Story): SaveFile | null {
  let raw: string | null;
  try { raw = storage.getItem(SAVE_KEYS[slot]); }
  catch { throw new Error('浏览器限制了本地存储。可以继续游玩，并使用 JSON 导入 / 导出。'); }
  return raw === null ? null : parseSave(raw, story);
}

import Ajv from 'ajv';
import schema from '../../schemas/life-save.schema.json';
import type { Story } from '../engine/types';
import type { StorageLike, SaveSlot } from '../persistence/saves';
import { parseSave as parseJourney, JOURNEY_KEYS } from '../persistence/journey';
import { SAVE_KEYS } from '../persistence/saves';
import { createLife, step } from './engine';
import type { Life, LifeSave } from './types';
export type { StorageLike };
export const LIFE_KEYS = {auto:'outside.life.v1.auto',manual:'outside.life.v1.manual'} as const;
const validate = new Ajv({strict:true,allErrors:true}).compile<LifeSave>(schema);
const stable = (value: unknown) => JSON.stringify(value,(_key,v:unknown) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
export function createSave(life: Life, now = new Date()): LifeSave {
  return {format:'outside-life-save',version:1,savedAt:now.toISOString(),state:structuredClone(life.state),life:structuredClone(life)};
}
export function parseSave(raw: string, story: Story): LifeSave {
  if (raw.length > 2_000_000) throw new Error('存档超过 2 MB。');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('存档不是有效的 JSON。'); }
  if (data && typeof data==='object' && 'format' in data && ['outside-save','outside-journey-save'].includes(String(data.format))) {
    const baseline = parseJourney(raw,story);
    return createSave(createLife(story,baseline.state.rngState,baseline),new Date(baseline.savedAt));
  }
  if (!validate(data) || !Number.isFinite(Date.parse(data.savedAt))) throw new Error('生活存档格式或版本不兼容。');
  const baseline = data.life.baseline === null ? null : parseJourney(JSON.stringify(data.life.baseline),story);
  let replay = createLife(story,data.life.seed,baseline);
  for (const command of data.life.commands) replay = step(story,replay,command);
  if (stable(replay) !== stable(data.life) || stable(replay.state) !== stable(data.state)) throw new Error('存档快照与本局经历不一致。');
  return data;
}
export function readSave(storage: StorageLike, slot: SaveSlot, story: Story): LifeSave | null {
  const raw = storage.getItem(LIFE_KEYS[slot]) ?? storage.getItem(JOURNEY_KEYS[slot]) ?? storage.getItem(SAVE_KEYS[slot]);
  return raw === null ? null : parseSave(raw,story);
}
export function writeSave(storage: StorageLike, slot: SaveSlot, life: Life): LifeSave {
  const save = createSave(life); storage.setItem(LIFE_KEYS[slot],JSON.stringify(save)); return save;
}

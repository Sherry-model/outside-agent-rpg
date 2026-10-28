import {readingProfile} from './reading-threads/profile';
import {profileFor} from './reading-threads/profiles';
import {hasScheduler,hasReadingThreads} from './types';
import Ajv from 'ajv';
import schema from '../../schemas/life-save.schema.json';
import schedulerSchema from '../../schemas/scheduler-state.schema.json';
import mindSchema from '../../schemas/cognition/save-0.4.schema.json';
import type { Story } from '../engine/types';
import type { StorageLike, SaveSlot } from '../persistence/saves';
import { parseSave as parseJourney, JOURNEY_KEYS } from '../persistence/journey';
import { SAVE_KEYS } from '../persistence/saves';
import { createLife, step, replayStep } from './engine';
import type { Life, LifeSave } from './types';
export type { StorageLike };
const storagePrefix=readingProfile.id==='production'?'outside.life.v1':`outside.reading-fixture.${readingProfile.id}`;
export const LIFE_KEYS = {auto:storagePrefix+'.auto',manual:storagePrefix+'.manual'} as const;
const MAX_IMPORT_CHARACTERS = 8_000_000;
const validate = new Ajv({strict:true,allErrors:true}).compile<LifeSave>(schema);
const validateMind = new Ajv({strict:true,allErrors:true}).compile(mindSchema);
const validateSchedule=new Ajv({strict:true}).compile(schedulerSchema);
const longMindSchema=structuredClone(mindSchema);longMindSchema.$defs.state.properties.history.maxItems=8192;
const validateLongMind=new Ajv({strict:true}).compile(longMindSchema);
const stable = (value: unknown) => JSON.stringify(value,(_key,v:unknown) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
export function createSave(life: Life, now = new Date()): LifeSave {
  return {format:'outside-life-save',version:1,savedAt:now.toISOString(),state:structuredClone(life.state),life:structuredClone(life)};
}
export function parseSave(raw: string, story: Story): LifeSave {
  if (raw.length > MAX_IMPORT_CHARACTERS) throw new Error('存档超过安全导入上限。');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('存档不是有效的 JSON。'); }
  if (data && typeof data==='object' && 'format' in data && ['outside-save','outside-journey-save'].includes(String(data.format))) {
    const baseline = parseJourney(raw,story);
    return createSave(createLife(story,baseline.state.rngState,baseline,'0.9.0'),new Date(baseline.savedAt));
  }
  if (!validate(data) || !Number.isFinite(Date.parse(data.savedAt))) throw new Error('生活存档格式或版本不兼容。');
  if(hasReadingThreads(data.life.contentVersion)&&data.life.schedule?.reading?.profile!==profileFor(data.life.contentVersion).id)throw new Error('存档快照与本局经历不一致。');
  if(hasScheduler(data.life.contentVersion)){if(!validateSchedule(data.life.schedule))throw new Error('生活调度状态格式错误。');}
  else if(data.life.schedule!==undefined||data.life.commands.length>500||raw.length>2_000_000)throw new Error('旧版本存档超过原有边界。');
  if (data.life.contentVersion !== '0.3.0' && !(hasScheduler(data.life.contentVersion)?validateLongMind:validateMind)({format:'outside-cognition-save',version:2,savedAt:data.savedAt,state:data.life.mind})) throw new Error('认知目录或摘要格式不兼容。');
  const baseline = data.life.baseline === null ? null : parseJourney(JSON.stringify(data.life.baseline),story);
  let replay = createLife(story,data.life.seed,baseline,data.life.contentVersion);
  for (const command of data.life.commands) replay = (hasScheduler(data.life.contentVersion)?replayStep:step)(story,replay,command);
  if (stable(replay) !== stable(data.life) || stable(replay.state) !== stable(data.state)) throw new Error('存档快照与本局经历不一致。');
  return data;
}
/** Both Life UI surfaces use this boundary; the standalone cognition importer stays unchanged. */
export async function importSaveFile(file: Pick<File,'size'|'text'>, story: Story): Promise<LifeSave> {
  // UTF-8 needs at most three bytes per UTF-16 code unit. Bound the read without
  // mistaking the parser's character limit for a byte limit on Chinese exports.
  if (file.size > MAX_IMPORT_CHARACTERS * 3) throw new Error('存档超过安全导入上限。');
  const save = parseSave(await file.text(),story);
  if (!hasScheduler(save.life.contentVersion) && file.size > 2_000_000) throw new Error('存档超过 2 MB。');
  return save;
}
export function readSave(storage: StorageLike, slot: SaveSlot, story: Story): LifeSave | null {
  const raw = storage.getItem(LIFE_KEYS[slot]) ?? (readingProfile.id==='production'?(storage.getItem(JOURNEY_KEYS[slot]) ?? storage.getItem(SAVE_KEYS[slot])):null);
  return raw === null ? null : parseSave(raw,story);
}
export function writeSave(storage: StorageLike, slot: SaveSlot, life: Life): LifeSave {
  const save = createSave(life); storage.setItem(LIFE_KEYS[slot],JSON.stringify(save)); return save;
}

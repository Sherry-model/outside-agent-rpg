import Ajv from 'ajv';
import schema from '../../schemas/cognition/save.schema.json';
import { create, reduce } from './engine';
import type { Content, Save, State } from './types';

export const SAVE_KEY = 'outside.cognition.v2.auto';
const validate = new Ajv({ strict: true, allErrors: true }).compile<Save>(schema);
export const createSave = (state: State, now = new Date()): Save => ({ format: 'outside-cognition-save', version: 2, savedAt: now.toISOString(), state: structuredClone(state) });
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
}
export function parseSave(raw: string, content: Content): Save {
  if (raw.length > 2_000_000) throw new Error('存档超过 2 MB。');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('存档不是有效的 JSON。'); }
  if (value && typeof value === 'object' && 'format' in value && value.format === 'outside-save') throw new Error('这是初版的存档，请返回初版载入；其中的经历仍然保留。');
  if (!validate(value)) throw new Error('存档结构或规则版本不兼容，当前进度未改变。');
  if (!Number.isFinite(Date.parse(value.savedAt))) throw new Error('存档日期无效。');
  if (value.state.contentId !== content.id || value.state.contentVersion !== content.version) throw new Error('存档剧情版本不匹配。');
  let replay = create(content, value.state.seed);
  if (value.state.history[0].command.type !== 'start') throw new Error('历史缺少起始记录。');
  for (const entry of value.state.history.slice(1)) {
    if (entry.command.type === 'start') throw new Error('历史包含重复的起始记录。');
    replay = reduce(content, replay, entry.command);
    if (stable(replay.history.at(-1)) !== stable(entry)) throw new Error('历史与同版本判定或后果不一致。');
  }
  if (stable(replay) !== stable(value.state)) throw new Error('存档快照与历史不一致。');
  return value;
}

/** Select a bundled historical content version, never reinterpret its records. */
export function parseVersionedSave(raw: string, versions: Content[]): { save: Save; content: Content } {
  if (raw.length > 2_000_000) throw new Error('存档超过 2 MB。');
  let header: { state?: { contentId?: string; contentVersion?: string } };
  try { header = JSON.parse(raw); } catch { throw new Error('存档不是有效的 JSON。'); }
  const content = versions.find(c => c.id === header?.state?.contentId && c.version === header?.state?.contentVersion) ?? versions[0];
  if (!content) throw new Error('没有可用的剧情版本。');
  return { save: parseSave(raw, content), content };
}

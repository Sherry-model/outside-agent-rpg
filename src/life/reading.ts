import Ajv from 'ajv';
import raw from './reading.json';
import schema from '../../schemas/reading.schema.json';
export interface ReadingPost { author: string; role: string; body: string[] }
export interface ReadingEntry {
  id: string; kind: 'THREAD' | 'ESSAY' | 'NOTICE'; title: string;
  source: string; excerpt: string; contextText: string; weight: number; posts: ReadingPost[];
}
export interface ReadingLibrary { version: string; unlockAfterVisited: string; entries: ReadingEntry[] }
const validate = new Ajv({strict:true}).compile<ReadingLibrary>(schema);
export function parseReading(data: unknown): ReadingLibrary {
  if (!validate(data)) throw new Error('转发栏内容格式错误。');
  if (new Set(data.entries.map(e=>e.id)).size !== data.entries.length) throw new Error('阅读条目 ID 重复。');
  return structuredClone(data);
}
export const library = parseReading(raw);

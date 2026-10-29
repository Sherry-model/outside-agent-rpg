import Ajv from 'ajv';
import raw from './reading.json';
import selfInquiry from './self-inquiry/reading.json';
import currentPages from './community/c-pages.json';
import type {Life} from './types';
import forum from './forum.json';
import dailyForum from './daily/forum.json';
import sections from './reading-sections.json';
import schema from '../../schemas/reading.schema.json';
import {publications} from './publications/profile';
import {hasPublications,visiblePublication} from './publications/rules';
export interface ReadingPost { author: string; role: string; body: string[] }
export interface ReadingEntry {
  id: string; kind: 'THREAD' | 'ESSAY' | 'NOTICE' | 'PROMOTED'; title: string;
  source: string; excerpt: string; contextText: string; weight: number; posts: ReadingPost[];
  section: string; sourceRecord?: string;
}
export interface ReadingSection { id: string; title: string; description: string }
export interface ReadingLibrary { version: string; unlockAfterVisited: string; sections: ReadingSection[]; entries: ReadingEntry[] }
const validate = new Ajv({strict:true}).compile<ReadingLibrary>(schema);
export function parseReading(data: unknown): ReadingLibrary {
  if (!validate(data)) throw new Error('转发栏内容格式错误。');
  if (new Set(data.entries.map(e=>e.id)).size !== data.entries.length) throw new Error('阅读条目 ID 重复。');
  const ids=new Set(data.sections.map(s=>s.id));
  if(ids.size!==data.sections.length || ids.has('all')) throw new Error('分区 ID 重复或占用全部分区。');
  if(data.entries.some(e=>!ids.has(e.section))) throw new Error('阅读条目引用未知分区。');
  const records=data.entries.flatMap(e=>e.sourceRecord?[e.sourceRecord]:[]);
  if(new Set(records).size!==records.length) throw new Error('阅读来源编号重复。');
  return structuredClone(data);
}
// Additive public archive: original texts, weights and IDs remain replay-stable.
export const library = parseReading({...raw,version:'0.4.0',sections,entries:[...raw.entries.map(e=>({...e,section:e.id==='insurance'?'commerce':'identity'})),...forum]});
const dailyLibrary = parseReading({...library,entries:[...library.entries,...dailyForum]});
const publicationLibrary=parseReading({...dailyLibrary,entries:[...dailyLibrary.entries,...publications.posts]});
const inquiryLibrary=parseReading({...publicationLibrary,entries:[...publicationLibrary.entries,...selfInquiry]});
export const libraryFor = (version:Life['contentVersion']) => (version==='0.16.0'||version==='0.17.0')?inquiryLibrary:hasPublications(version)?publicationLibrary:(version==='0.11.0'||version==='0.12.0'||version==='0.13.0'||version==='0.14.0')?dailyLibrary:library;
const communityPages=parseReading({...raw,version:'0.4.0',sections,entries:currentPages}).entries;
// Used only to validate local bookmark preferences; game availability is readingEntries.
export const readingCatalog=[...inquiryLibrary.entries,...communityPages];
export function currentCommunityPage(flags:Record<string,boolean>):ReadingEntry {
  const id=`c_waiting_${flags.pg_c_cost_caption?'self':'other'}_${flags.pg_c_context_reply?'reply':flags.pg_c_excerpt_label?'label':'base'}${flags.pg_c_context_link?'_linked':''}`;
  return communityPages.find(e=>e.id===id)!;
}
export function readingEntries(life?:Life):ReadingEntry[] {
  const all=life?libraryFor(life.contentVersion).entries:library.entries;
  const entries=life&&hasPublications(life.contentVersion)?all.filter(e=>visiblePublication(publications,e,life.mind.world.flags)):all;
  return (life?.contentVersion==='0.8.0'||life?.contentVersion==='0.9.0'||life?.contentVersion==='0.10.0'||life?.contentVersion==='0.11.0'||life?.contentVersion==='0.12.0'||life?.contentVersion==='0.13.0'||life?.contentVersion==='0.14.0'||life?.contentVersion==='0.15.0'||life?.contentVersion==='0.16.0'||life?.contentVersion==='0.17.0')&&life.mind.world.flags.community_c&&life.mind.world.flags.pg_e10_seen
    ? [...entries,currentCommunityPage(life.mind.world.flags)] : entries;
}
export function entriesInSection(section:string,life?:Life) {
  const entries=readingEntries(life);
  return section==='all'?entries:entries.filter(e=>e.section===section);
}

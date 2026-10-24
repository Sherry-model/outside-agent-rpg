import { getLocale, tr } from '../i18n';
import { readingText } from '../i18n/reading';
import type { ReadingEntry } from './reading';

/** Public reading metadata only. No Life, read command, or retained-memory access. */
export function readingSize(entry: ReadingEntry) {
  const characters = entry.posts.reduce((total, post) => total + post.body.reduce(
    (count, source) => count + [...readingText(entry.id, source)].filter(c => !/\s/u.test(c)).length, 0), 0);
  const band = characters < 1000 ? '短篇' : characters < 3000 ? '中篇' : '长篇';
  return {characters, band, approximate: Math.ceil(characters / 100) * 100};
}
export function readingSizeLabel(entry: ReadingEntry): string {
  const size = readingSize(entry);
  const count = size.approximate.toLocaleString(getLocale()==='en'?'en-US':'zh-CN');
  return `${tr(size.band)} · ${tr('全文约 {count} 字',{count})}`;
}

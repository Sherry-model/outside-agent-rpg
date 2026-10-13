import {getLocale, t, tr} from './index';

// Two real ambiguities in the reader. Match both the entry and the complete
// source; a revised sentence must fall back, never inherit a stale override.
const overrides: Readonly<Record<string, Readonly<Record<string,string>>>> = {
  shared_memories: {'不会。': 'No.'},
  coffee_refusal: {'踩。': 'Step.'},
};
export function readingText(entryId: string, source: string): string {
  const entry = Object.hasOwn(overrides,entryId) ? overrides[entryId] : undefined;
  return getLocale()==='en' && entry && Object.hasOwn(entry,source) ? entry[source] : t(source);
}
export function readingHtml(entryId: string, source: string): string {
  const entry = Object.hasOwn(overrides,entryId) ? overrides[entryId] : undefined;
  if (getLocale()!=='en' || !entry || !Object.hasOwn(entry,source)) return tr(source);
  return readingText(entryId,source).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

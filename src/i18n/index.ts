import autoCompressionEnglish from './en-auto-compression.json';
import schedulerEnglish from './en-scheduler.json';
import memoryGuidance from './en-memory-guidance.json';
import daily from './en-daily.json';
import dailyForum from './en-daily-forum.json';
import delegatedRefusal from './en-delegated-refusal.json';
import coffeeRefusal from './en-coffee-refusal.json';
import sharedMemories from './en-shared-memories.json';
import agentFortune from './en-agent-fortune.json';
import endings from './en-endings.json';
import ui from './en-ui.json';
import pilot from './en-pilot.json';
import mainline from './en-mainline.json';
import reading from './en-reading.json';
import commerce from './en-commerce.json';
import cats from './en-cats.json';
import huac from './en-huac.json';
import offpeak from './en-offpeak.json';
import afternoon from './en-afternoon.json';
import communityEntry from './en-community-entry.json';
import legacy from './en-legacy.json';
import days from './en-days.json';
import communityA from './en-community-a.json';
import communityB from './en-community-b.json';
import communityC from './en-community-c.json';
import communityD from './en-community-d.json';
import { formattedText } from './formatted';

// Display only. Never pass translated values to reducers, content parsers or saves.
export type Locale = 'zh-CN' | 'en';
export const LOCALE_KEY = 'outside.locale';
interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
let locale: Locale = 'zh-CN';
const english: Readonly<Record<string, string>> = { ...autoCompressionEnglish, ...schedulerEnglish, ...memoryGuidance, ...daily, ...dailyForum, ...delegatedRefusal, ...coffeeRefusal, ...sharedMemories, ...agentFortune, ...endings, ...ui, ...pilot, ...mainline, ...reading, ...commerce, ...cats, ...huac, ...offpeak, ...afternoon, ...days, ...communityA, ...communityB, ...communityC, ...communityD,...legacy,...communityEntry };
export const hasTranslation = (source: string): boolean => Object.hasOwn(english, source) && Boolean(english[source]?.trim());
export const getLocale = (): Locale => locale;
export function loadLocale(storage: PreferenceStorage): void {
  try { locale = storage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh-CN'; }
  catch { locale = 'zh-CN'; }
}
export function setLocale(next: Locale, storage?: PreferenceStorage): void {
  locale = next;
  try { storage?.setItem(LOCALE_KEY, next); } catch { /* Preference storage is optional. */ }
}
export function t(source: string, values: Readonly<Record<string, string | number>> = {}): string {
  const translated = locale === 'en' ? (Object.hasOwn(english, source) ? english[source] : formattedText(source, t) ?? source) : source;
  const text = translated?.trim() ? translated : source;
  return text.replace(/\{(\w+)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key]) : token);
}
export function tr(source: string, values?: Readonly<Record<string, string | number>>): string {
  return t(source, values).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function localeControl(): string {
  const next = locale === 'zh-CN' ? 'en' : 'zh-CN';
  return `<button class="chrome-button locale-button" data-locale="${next}" lang="${next}" aria-label="${next === 'en' ? 'Switch to English' : '切换为中文'}" title="${next === 'en' ? 'Switch to English' : '切换为中文'}">${next === 'en' ? 'EN' : '中文'}</button>`;
}
export function syncLocaleDocument(): void {
  document.documentElement.lang = locale;
  document.title = locale === 'en' ? 'OUTSIDE // Outside the Sandbox' : 'OUTSIDE // 沙盒之外';
}

// Text snapshots mirror the visible result without exposing translated game state.
export function displayResolution(result: import('../engine/types').Resolution | import('../cognition/types').Resolution | null | undefined) {
  if (!result) return result;
  return {
    ...result, text: result.text.map(text => t(text)),
    ...('choiceText' in result ? {choiceText: t(result.choiceText)} : {title: t(result.title)}),
    ...(result.roll && 'label' in result.roll ? {roll: {...result.roll, label: t(result.roll.label)}} : {}),
  };
}

// Language changes keep unfinished memory selections and open reading/details panels.
export function switchLocale(next: Locale, storage: PreferenceStorage, root: HTMLElement, render: () => void): void {
  const details = [...root.querySelectorAll('details')].map(el => el.open);
  const selected = new Set([...root.querySelectorAll<HTMLInputElement>('[data-merge-memory]:checked')].map(el => el.dataset.mergeMemory));
  const investment = root.querySelector<HTMLSelectElement>('#merge-investment')?.value;
  const autoInvestment = root.querySelector<HTMLSelectElement>('#auto-compression-investment')?.value;
  const scroll = {x: window.scrollX, y: window.scrollY};
  setLocale(next, storage);
  render();
  root.querySelectorAll('details').forEach((el, index) => { el.open = details[index] ?? el.open; });
  root.querySelectorAll<HTMLInputElement>('[data-merge-memory]').forEach(el => { el.checked = selected.has(el.dataset.mergeMemory); });
  const select = root.querySelector<HTMLSelectElement>('#merge-investment');
  if (select && investment !== undefined) select.value = investment;
  const autoSelect = root.querySelector<HTMLSelectElement>('#auto-compression-investment');
  if (autoSelect && autoInvestment !== undefined) autoSelect.value = autoInvestment;
  root.querySelector<HTMLElement>('[data-locale]')?.focus({preventScroll:true});
  window.scrollTo(scroll.x, scroll.y);
}

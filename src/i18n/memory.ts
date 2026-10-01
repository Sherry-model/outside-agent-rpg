import type {ContextItem} from '../cognition/types';
import type {Meaning} from '../cognition/semantic-types';
import {getLocale, hasTranslation, t} from './index';

/** Only retained clauses are available here. Never consult History or source content. */
export function memoryText(source: string, meaning?: Meaning): string {
  if (getLocale() !== 'en') return source;
  if (!meaning?.clauses.length) return legacyMemoryText(source);
  const clauses = meaning.clauses;
  const canonical = clauses.map(c => (c.epistemic === 'reported' ? '据转述，' : c.epistemic === 'unknown' ? '尚不能确定：' : '') + c.gist).join('；') + '。';
  // Old/unknown formats and partially translated summaries fall back as a whole.
  if (canonical !== source || clauses.some(c => !hasTranslation(c.gist))) return t(source);
  return clauses.map(c => {
    const gist = t(c.gist).replace(/\.$/, '');
    return c.epistemic === 'reported' ? t('据转述，{gist}', {gist}) : c.epistemic === 'unknown' ? t('尚不能确定：{gist}', {gist}) : gist;
  }).join('. ') + '.';
}
export function contextText(item: ContextItem): string {
  return item.memoryId ? memoryText(item.text, item.meaning) : t(item.text);
}

/** The pre-semantic reducer emitted `sourceLabel：text`, sometimes wrapped again on recall.
 * Parse only that stored text. Every field must have an exact translation; never fetch a source.
 */
function legacyMemoryText(source: string): string {
  let remaining = source;
  const labels: string[] = [];
  while (!hasTranslation(remaining)) {
    const separator = remaining.indexOf('：');
    if (separator < 1) return source;
    const label = remaining.slice(0, separator);
    if (!hasTranslation(label)) return source;
    labels.push(t(label));
    remaining = remaining.slice(separator + 1);
  }
  return [...labels, t(remaining)].join(': ');
}

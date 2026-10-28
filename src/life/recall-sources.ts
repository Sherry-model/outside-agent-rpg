import { contentFor } from './content';
import { readingEntries } from './reading';
import {publications} from './publications/profile';
import {hasPublications} from './publications/rules';
import { readingAvailable, daysReading, newReadingAllowed } from './engine';
import { requirement } from '../cognition/guidance';
import { t } from '../i18n';
import type { Life } from './types';
import type { PublicRecallSource } from '../cognition/help-ui';

/** Only a current, accessible public edition is offered; never an old text from History. */
export function recallSources(life:Life):PublicRecallSource[] {
  if(!readingAvailable(life)&&!daysReading(life))return [];
  const content=contentFor(life.contentVersion);
  return readingEntries(life).flatMap(entry=>{
    const tag=`reading_${entry.id}`;
    if(!requirement(tag)?.readings.includes(entry.id)&&!(hasPublications(life.contentVersion)&&publications.posts.some(p=>p.id===entry.id)))return [];
    const meaning=content.semantic?.sources[`reading:${entry.id}`];
    if(!meaning?.clauses.some(c=>c.tags.includes(tag)))return [];
    const present=life.mind.instance.context.items.some(i=>i.sourceId===entry.id);
    return [{id:entry.id,title:t(entry.title),tag,cost:present?0:entry.weight,allowed:present||newReadingAllowed(life)}];
  });
}

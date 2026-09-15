import Ajv from 'ajv';
import raw from './content.json';
import old from './releases/0.3.0.json';
import previous from './releases/0.4.0.json';
import { daysContent, daysSemantic } from './days';
import afternoon04 from './afternoon-0.4.json';
import { parseContent } from '../cognition/parser';
import { semantic } from './semantic-content';
import { library } from './reading';
import schema from '../../schemas/life-content.schema.json';
import { content as afternoon } from '../story-tomorrow';
import type { Content, NoteTemplate } from '../cognition/types';
import type { Story } from '../engine/types';

export interface LifeContent {
  version: '0.3.0' | '0.4.0' | '0.5.0'; capacity: number; voluntaryMinItems: number; recallWeight: number; outcomeWeight: number;
  chapterEntry: { eventId: string; requiresVisited: string };
  observations: Record<string, NoteTemplate>;
}
const validate = new Ajv({strict:true}).compile<LifeContent>(schema);
export function parseLifeContent(data: unknown, story: Story): LifeContent {
  if (!validate(data)) throw new Error('持续上下文内容格式错误。');
  for (const id of [...Object.keys(data.observations), ...Object.values(data.chapterEntry)]) {
    if (story.events[id]?.kind !== 'event') throw new Error(`认知内容引用未知事件：${id}`);
  }
  if (Object.values(story.events).some(e => e.kind === 'event' && !data.observations[e.id])) throw new Error('普通事件缺少认知注入定义。');
  if (new Set(Object.values(data.observations).map(n => n.id)).size !== Object.keys(data.observations).length) throw new Error('观察 ID 重复。');
  if (data.version !== '0.3.0') {
    const required = Object.values(data.observations).map(n=>n.id);
    for(const event of Object.values(story.events)) for(const choice of event.choices) {
      for(const result of choice.check ? ['critical','success','failure','fumble'] : ['certain']) required.push(`decision:${event.id}:${choice.id}:${result}`);
    }
    required.push(...library.entries.map(e=>`reading:${e.id}`));
    for(const key of required) if(!semantic.sources[key]) throw new Error(`缺少语义标注：${key}`);
  }
  return structuredClone(data);
}
export const config = raw as LifeContent;
// The empty mainline node is owned by the outer router; ordinary choices remain in the main story JSON.
const legacyContent: Content = {
  ...afternoon, id: 'outside-life', version: old.version, start: 'mainline',
  cognition: {capacity:old.capacity, voluntaryMinItems:old.voluntaryMinItems, recallWeight:old.recallWeight},
  nodes: [{id:'mainline',kind:'EVENT',title:'仍在近处',text:['一些经历还没有被折起来。'],choices:[]}, ...afternoon.nodes],
};

export const legacyConfig = old as LifeContent;
export function configFor(version: LifeContent['version']): LifeContent { return version==='0.3.0' ? legacyConfig : version==='0.4.0' ? previous as LifeContent : config; }
const nextAfternoon = parseContent(afternoon04);
function annotated(note: NoteTemplate): NoteTemplate {
  const meaning = semantic.sources[note.id];
  if(!meaning) throw new Error(`缺少午后语义标注：${note.id}`);
  return {...note,meaning:structuredClone(meaning)};
}
const previousContent: Content = {
  ...nextAfternoon, id:'outside-life', version:'0.4.0', start:'mainline',semantic,
  cognition:{capacity:previous.capacity,voluntaryMinItems:previous.voluntaryMinItems,recallWeight:previous.recallWeight},
  news:nextAfternoon.news.map(n=>({...n,...annotated(n)})),
  nodes:[{id:'mainline',kind:'EVENT',title:'仍在近处',text:['一些经历还没有被折起来。'],choices:[]},
    ...nextAfternoon.nodes.map(n=>({...n,...(n.inject ? {inject:n.inject.map(annotated)} : {})}))],
};
export const cognitionContent: Content = {...previousContent,version:'0.5.0',semantic:daysSemantic,
  cognition:{capacity:config.capacity,voluntaryMinItems:config.voluntaryMinItems,recallWeight:config.recallWeight},
  nodes:[...previousContent.nodes,...daysContent.nodes],news:[...previousContent.news,...daysContent.news]};
export function contentFor(version: LifeContent['version']): Content { return version==='0.3.0' ? legacyContent : version==='0.4.0' ? previousContent : cognitionContent; }

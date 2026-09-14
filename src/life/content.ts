import Ajv from 'ajv';
import raw from './content.json';
import schema from '../../schemas/life-content.schema.json';
import { content as afternoon } from '../story-tomorrow';
import type { Content, NoteTemplate } from '../cognition/types';
import type { Story } from '../engine/types';

export interface LifeContent {
  version: '0.3.0'; capacity: number; voluntaryMinItems: number; recallWeight: number; outcomeWeight: number;
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
  return structuredClone(data);
}
export const config = raw as LifeContent;
// The empty mainline node is owned by the outer router; ordinary choices remain in the main story JSON.
export const cognitionContent: Content = {
  ...afternoon, id: 'outside-life', version: config.version, start: 'mainline',
  cognition: {capacity:config.capacity, voluntaryMinItems:config.voluntaryMinItems, recallWeight:config.recallWeight},
  nodes: [{id:'mainline',kind:'EVENT',title:'仍在近处',text:['一些经历还没有被折起来。'],choices:[]}, ...afternoon.nodes],
};

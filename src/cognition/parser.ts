import Ajv from 'ajv';
import schema from '../../schemas/cognition/content.schema.json';
import type { Content } from './types';

const validate = new Ajv({ strict: true, allErrors: true, strictRequired: false }).compile<Content>(schema);
export function parseContent(data: unknown): Content {
  if (!validate(data)) throw new Error(`认知剧情格式错误：${JSON.stringify(validate.errors)}`);
  const content: Content = data;
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) throw new Error(`${label} ID 重复。`);
  };
  unique(data.nodes.map(n => n.id), '事件');
  unique([...data.initial.context, ...data.news, ...data.nodes.flatMap(n=>[...(n.inject ?? []),...n.choices.flatMap(c=>(c.outcomes?Object.values(c.outcomes):[c.outcome!]).flatMap(o=>o.inject ?? []))])].map(n => n.id), '认知来源');
  const ids = new Set(data.nodes.map(n => n.id));
  if(data.compressionAt?.some(id=>!ids.has(id))) throw new Error('压缩时机引用未知事件。');
  if (!ids.has(data.start)) throw new Error('起始事件不存在。');
  const news = new Set(data.news.map(n => n.id));
  for (const node of data.nodes) {
    if ((node.kind === 'ENDING') !== (node.choices.length === 0)) throw new Error(`${node.id} 事件/结局选项不符。`);
    if (node.receive?.some(id => !news.has(id))) throw new Error(`${node.id} 引用了未知 News。`);
    unique(node.choices.map(c => c.id), '选择');
    for (const choice of node.choices) for (const outcome of choice.outcomes ? Object.values(choice.outcomes) : [choice.outcome!]) {
      if (!ids.has(outcome.next)) throw new Error(`${node.id} 引用了未知目的地。`);
    }
  }
  // This pilot's one-shot arrivals must not be hidden behind an authored cycle.
  const visiting = new Set<string>(), visited = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id)) throw new Error('此剧情格式暂不支持事件循环。');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const choice of content.nodes.find(n => n.id === id)!.choices) {
      for (const outcome of choice.outcomes ? Object.values(choice.outcomes) : [choice.outcome!]) walk(outcome.next);
    }
    visiting.delete(id); visited.add(id);
  }
  walk(data.start);
  if (visited.size !== ids.size) throw new Error('剧情含不可达节点。');
  if (data.initial.context.reduce((sum, item) => sum + item.weight, 0) >= (data.cognition?.capacity ?? 100)) throw new Error('开场需要留出接收消息的空间。');
  if (Object.values(data.compression.outcomes).some(o => o.effects?.worldFlags)) throw new Error('压缩不能改写世界事实。');
  unique(data.compressionProfiles?.map(p => p.id) ?? [], '压缩解释');
  for (const profile of data.compressionProfiles ?? []) {
    if (Object.values(profile.outcomes).some(o => o.effects)) throw new Error('来源解释只提供记忆；资源与倾向变化统一写在 compression.outcomes。');
  }
  return structuredClone(data);
}

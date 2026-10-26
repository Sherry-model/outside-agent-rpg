import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import {parseSemantic} from '../semantic-content';
import type {Content} from '../../cognition/types';
import {readingProfile} from './profile';
import type {ReadingProfile} from './types';
import {libraryFor} from '../reading';

/** Validate the entire bounded branch before admitting its first scene. */
export function validateReadingProfile(p:ReadingProfile,base:Content) {
  const posts=new Set(libraryFor('0.14.0').entries.map(e=>e.id));
  const ids=new Set(base.nodes.map(n=>n.id)),choices=new Set(base.nodes.flatMap(n=>n.choices.map(c=>c.id)));
  const threadIds=new Set<string>(),owned=new Set<string>(),promises=new Set<string>();
  for(const n of p.nodes){
    if(ids.has(n.id))throw new Error('阅读事件 ID 重复。');ids.add(n.id);
    for(const c of n.choices){if(choices.has(c.id))throw new Error('阅读选项 ID 重复。');choices.add(c.id);}
  }
  for(const t of p.threads){
    if(threadIds.has(t.id)||!posts.has(t.rootPost)||!Number.isInteger(t.maxScenes)||t.maxScenes<1||t.maxScenes>5||!t.phases.length||t.phases.some(p=>!['arrival','settled','open'].includes(p))||!t.channels.length||t.channels.some(c=>c!=='public'))throw new Error('阅读支线入口定义无效。');
    threadIds.add(t.id);
    if(t.themeNodes.some(id=>!base.nodes.some(n=>n.id===id)))throw new Error('阅读支线主题节点不存在。');
    const visiting=new Set<string>(),depths=new Map<string,number>();
    const depth=(id:string):number=>{
      if(visiting.has(id))throw new Error('阅读支线不能循环。');
      if(depths.has(id))return depths.get(id)!;
      const n=p.nodes.find(n=>n.id===id),actions=t.steps[id];
      if(!n||n.kind!=='EVENT'||!actions||!n.choices.length||Object.keys(actions).length!==n.choices.length)throw new Error('阅读支线节点或选择未完整定义。');
      if(owned.has(id))throw new Error('阅读节点属于多条支线。');owned.add(id);visiting.add(id);
      let longest=1;
      for(const c of n.choices){
        const a=actions[c.id];
        if(!a||!c.outcome||c.outcome.next!=='schedule_return'||c.check)throw new Error('阅读支线必须显式返回，不能暗藏连续场景。');
        if(c.capacityExempt&&(a.promise||c.requiresTag||c.requiresWorldFlag||c.costs||c.minCompute||c.outcome.effects))throw new Error('简单退出不能接受承诺或绕过其他条件。');
        if(a.promise){
          const q=a.promise;
          if(q.role!=='branch'||q.mode!=='choice'||q.afterScenes!==0||q.afterHours<1||q.deadlineHours!==undefined||!q.eventId||q.fallbackEventId!==q.eventId||!q.channels.includes('public')||!q.channels.includes('mail')||promises.has(q.id))throw new Error('阅读后续必须明确可等待、可送达且不重复。');
          promises.add(q.id);const remaining=depth(q.eventId);
          if(a.remaining!==remaining)throw new Error('阅读支线预留不等于最长剩余路线。');
          longest=Math.max(longest,1+remaining);
        } else if(a.remaining!==0)throw new Error('结束支线必须释放预留。');
      }
      if(!n.choices.some(c=>c.capacityExempt==='exit'))throw new Error('阅读支线需要明确的简单退出。');
      visiting.delete(id);depths.set(id,longest);return longest;
    };
    if(depth(t.entry)!==t.maxScenes||Object.keys(t.steps).some(id=>!depths.has(id)))throw new Error('阅读支线最长路线或不可达节点错误。');
  }
  if(owned.size!==p.nodes.length)throw new Error('阅读节点缺少支线归属。');
}
export function withReadingThreads(base:Content):Content {
  validateReadingProfile(readingProfile,base);
  const validate=new Ajv({strict:true,strictRequired:false}).compile({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
  if(!validate(readingProfile.nodes))throw new Error('阅读支线事件格式错误。');
  const c=structuredClone(base);c.version='0.14.0';
  for(const id of Object.keys(readingProfile.semantic.sources))if(c.semantic!.sources[id])throw new Error('阅读支线不能覆盖旧认知来源。');
  for(const id of Object.keys(readingProfile.semantic.topics))if(c.semantic!.topics[id])throw new Error('阅读支线不能覆盖旧认知主题。');
  c.semantic={...c.semantic!,topics:{...c.semantic!.topics,...readingProfile.semantic.topics},sources:{...c.semantic!.sources,...readingProfile.semantic.sources}};
  for(const source of readingProfile.nodes){
    const n=structuredClone(source);
    for(const note of [...(n.inject??[]),...n.choices.flatMap(c=>c.outcome?.inject??[])]){
      const meaning=c.semantic.sources[note.id];if(!meaning)throw new Error('阅读节点缺少认知来源。');note.meaning=structuredClone(meaning);
    }
    c.nodes.push(n);
  }
  c.semantic=parseSemantic(c.semantic);
  return c;
}

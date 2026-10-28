import release13 from './releases/0.13.0.json';
import release14 from './releases/0.14.0.json';
import {profileFor} from './reading-threads/profiles';
import {withPublications} from './publications/content';
import {withReadingThreads} from './reading-threads/content';
import release12 from './releases/0.12.0.json';
import {withContinuation} from './continuation';
import Ajv from 'ajv';
import raw from './content.json';
import release11 from './releases/0.11.0.json';
import {withScheduler,manifest as schedulerManifest} from './scheduler/content';
import release10 from './releases/0.10.0.json';
import {withDaily,dailyRoutes} from './daily';
import release09 from './releases/0.9.0.json';
import {withEndings,endingsRoutes} from './endings';
import old from './releases/0.3.0.json';
import previous from './releases/0.4.0.json';
import release05 from './releases/0.5.0.json';
import release06 from './releases/0.6.0.json';
import release061 from './releases/0.6.1.json';
import release08 from './releases/0.8.0.json';
import {withCommunityD,communityDRoutes} from './community/d';
import release071 from './releases/0.7.1.json';
import {withCommunityC,communityCRoutes} from './community/c';
import release07 from './releases/0.7.0.json';
import {withCommunityB, withRevisedCommunityBText, communityBRoutes} from './community/b';
import { withCommunity, withRevisedCommunityText, communityRoutes } from './community';
import { hasCommunity, hasEndings, hasScheduler, type Life } from './types';
import { daysContent, daysSemantic } from './days';
import afternoon04 from './afternoon-0.4.json';
import { parseContent } from '../cognition/parser';
import { semantic } from './semantic-content';
import { libraryFor } from './reading';
import schema from '../../schemas/life-content.schema.json';
import { content as afternoon } from '../story-tomorrow';
import type { Content, NoteTemplate, State } from '../cognition/types';
import type { Story } from '../engine/types';

export interface LifeContent {
  version: Life['contentVersion']; capacity: number; voluntaryMinItems: number; recallWeight: number; outcomeWeight: number;
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
    required.push(...libraryFor(data.version).entries.map(e=>`reading:${e.id}`));
    for(const key of required) if(!contentFor(data.version).semantic?.sources[key]) throw new Error(`缺少语义标注：${key}`);
  }
  if(hasScheduler(data.version)){
    const eventIds=new Set([...contentFor(data.version).nodes.filter(n=>n.kind==='EVENT').map(n=>n.id),...Object.values(story.events).filter(e=>e.kind==='event').map(e=>e.id)]);
    for(const id of [...Object.keys(schedulerManifest.windows),...schedulerManifest.safeNodes])if(!eventIds.has(id))throw new Error('生活窗口引用未知事件：'+id);
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
export function configFor(version: LifeContent['version']): LifeContent { return version==='0.3.0' ? legacyConfig : version==='0.4.0' ? previous as LifeContent : version==='0.5.0' ? release05 as LifeContent : version==='0.6.0' ? release06 as LifeContent : version==='0.6.1' ? release061 as LifeContent : version==='0.7.0' ? release07 as LifeContent : version==='0.7.1' ? release071 as LifeContent : version==='0.8.0' ? release08 as LifeContent : version==='0.9.0' ? release09 as LifeContent : version==='0.10.0' ? release10 as LifeContent : version==='0.11.0' ? release11 as LifeContent : version==='0.12.0' ? release12 as LifeContent : version==='0.13.0' ? release13 as LifeContent : version==='0.14.0' ? release14 as LifeContent : config; }
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
  cognition:{capacity:release05.capacity,voluntaryMinItems:release05.voluntaryMinItems,recallWeight:release05.recallWeight},
  nodes:[...previousContent.nodes,...daysContent.nodes],news:[...previousContent.news,...daysContent.news]};
const communityContent=withCommunity(cognitionContent);
const revisedCommunityContent=withRevisedCommunityText(communityContent);
const communityBContent=withCommunityB(revisedCommunityContent);
const revisedCommunityBContent=withRevisedCommunityBText(communityBContent);
const communityCContent=withCommunityC(revisedCommunityBContent);
const communityDContent=withCommunityD(communityCContent);
const endingsContent=withEndings(communityDContent);
const dailyContent=withDaily(endingsContent);
const scheduledContent=withScheduler(dailyContent);
const continuationContent=withContinuation(scheduledContent);
const readingThreadsContent=withReadingThreads(continuationContent,profileFor('0.14.0'));
const readingStoriesContent=withPublications(withReadingThreads(continuationContent,profileFor('0.15.0'),'0.15.0'),profileFor('0.15.0'));
export function contentFor(version: LifeContent['version']): Content { return version==='0.3.0' ? legacyContent : version==='0.4.0' ? previousContent : version==='0.5.0' ? cognitionContent : version==='0.6.0' ? communityContent : version==='0.6.1' ? revisedCommunityContent : version==='0.7.0' ? communityBContent : version==='0.7.1' ? revisedCommunityBContent : version==='0.8.0' ? communityCContent : version==='0.9.0' ? communityDContent : version==='0.10.0' ? endingsContent : version==='0.11.0'?dailyContent:version==='0.12.0'?scheduledContent:version==='0.13.0'?continuationContent:version==='0.14.0'?readingThreadsContent:readingStoriesContent; }
export function routedContent(version:LifeContent['version'],state:State):Content {
  const content=contentFor(version);return (version==='0.11.0'||hasScheduler(version))?dailyRoutes(endingsRoutes(communityDRoutes(content,state),state),state):hasEndings(version)?endingsRoutes(communityDRoutes(content,state),state):version==='0.9.0'?communityDRoutes(content,state):version==='0.8.0'?communityCRoutes(content,state):(version==='0.7.0'||version==='0.7.1')?communityBRoutes(content,state):hasCommunity(version)?communityRoutes(content,state):content;
}

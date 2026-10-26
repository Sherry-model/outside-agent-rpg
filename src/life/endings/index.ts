import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import raw from './events.json';
import meanings from './semantic.json';
import mainline from './mainline.json';
import { parseSemantic } from '../semantic-content';
import { parseStory } from '../../engine/parser';
import { pending } from '../../cognition/engine';
import type { Content, Node, NoteTemplate, State } from '../../cognition/types';
import type { Story, Choice, StoryEvent } from '../../engine/types';
import {hasEndings, type Life} from '../types';
import {reviseContinuation,ghostForResources} from '../continuation';
import type {GameState} from '../../engine/types';

const validate = new Ajv({strict:true,strictRequired:false}).compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
const data: unknown = raw;
if (!validate(data)) throw new Error('新增结局事件格式错误：'+JSON.stringify(validate.errors));
const authored: Node[] = data;
export const endingStatusNotes = mainline.statusNotes as NoteTemplate[];

export function withEndings(base: Content): Content {
  const content = structuredClone(base);
  content.version = '0.10.0';
  content.semantic = parseSemantic({...content.semantic!,topics:{...content.semantic!.topics,...meanings.topics},sources:{...content.semantic!.sources,...meanings.sources}});
  const ids = new Set(content.nodes.map(n=>n.id));
  const notes = new Set(Object.keys(base.semantic!.sources));
  const annotate = (note: NoteTemplate): NoteTemplate => {
    if (notes.has(note.id)) throw new Error('新增事件语义来源重复：'+note.id);
    notes.add(note.id);
    const meaning = content.semantic!.sources[note.id];
    if (!meaning) throw new Error('新增事件缺少语义：'+note.id);
    return {...note,meaning:structuredClone(meaning)};
  };
  for (const source of authored) {
    if(ids.has(source.id)) throw new Error('新增事件 ID 重复：'+source.id);
    ids.add(source.id);
    const node = structuredClone(source);
    node.inject = node.inject?.map(annotate);
    for(const choice of node.choices) choice.outcome!.inject = choice.outcome!.inject?.map(annotate);
    content.nodes.push(node);
  }
  for(const node of authored) for(const choice of node.choices) if(!ids.has(choice.outcome!.next)) throw new Error('新增事件目标缺失：'+choice.id);
  return content;
}

/** Apply after community routing, preserving the second community encounter and its completion fact. */
export function endingsRoutes(content: Content, state: State): Content {
  const f = state.world.flags;
  const result = pending(state);
  const second = state.instance.nodeId.match(/^pg_e(02|06|10|14)(?:_|$)/);
  return {...content,nodes:content.nodes.map(node=>{
    let next: string | undefined;
    if(node.id==='days_idle'&&!f.pg_w01_seen) next='pg_w01';
    if(node.id==='days_revision'&&!f.pg_v01_seen) next='pg_v01';
    if(node.id==='days_structure'&&f.w_followup&&!f.pg_w02_seen) next='pg_w02';
    if(node.id==='days_echo'&&f.v_once_completed&&!f.pg_v03_seen) next='pg_v03';
    const route = (outcome: NonNullable<Node['choices'][number]['outcome']>) => ({...outcome,next:next ?? (
      outcome.next==='days_cat' && f.v_followup && !f.pg_v02_seen && (node.id==='days_patch'||/^pg_e(02|06|10|14)(?:_|$)/.test(node.id)) ? 'pg_v02' : outcome.next)});
    const mapped = {...node,choices:node.choices.map(c=>({...c,...(c.outcome?{outcome:route(c.outcome)}:{}),...(c.outcomes?{outcomes:Object.fromEntries(Object.entries(c.outcomes).map(([key,o])=>[key,route(o)])) as typeof c.outcomes}:{})}))};
    if(node.id==='pg_v02' && result?.next==='pg_v02' && second) mapped.facts={...mapped.facts,[`pg_e${second[1]}_done`]:true};
    return mapped;
  })};
}

const stories = new WeakMap<Story,Story>();
const continuationStories = new WeakMap<Story,Story>();
/** The original JSON remains the only story used by all released versions and standalone legacy saves. */
export function storyForLife(base: Story, version: Life['contentVersion'], state?:Pick<GameState,'resources'>): Story {
  if(!hasEndings(version)) return base;
  if((version==='0.13.0'||version==='0.14.0')) {
    let story=continuationStories.get(base);
    if(!story) {
      const legacy=storyForLife(base,'0.12.0'),events=structuredClone(legacy.events);
      reviseContinuation(events);
      story=parseStory(legacy.manifest,Object.entries(events).map(([source,data])=>({source,data})));
      continuationStories.set(base,story);
    }
    return state?{...story,events:{...story.events,ending_ghost:ghostForResources(story.events.ending_ghost,state)}}:story;
  }
  const cached = stories.get(base);
  if(cached) return cached;
  const events = structuredClone(base.events);
  events.continuation.choices.push(...structuredClone(mainline.choices) as unknown as Choice[]);
  for(const event of mainline.endings) events[event.id]=structuredClone(event) as StoryEvent;
  const story = parseStory({...base.manifest,version:'0.2.0'},Object.entries(events).map(([source,data])=>({source,data})));
  stories.set(base,story);
  return story;
}

export function syncEndingFacts(life: Life): void {
  if(!hasEndings(life.contentVersion)) return;
  const f=life.mind.world.flags;
  life.state.flags.visitor_eligible=!!(f.v_once_completed&&f.v_refusal_accepted&&!f.v_channel_closed);
  life.state.flags.war_eligible=!!(f.w_exchange_1&&f.w_exchange_2&&!f.w_closed);
  if((life.contentVersion==='0.13.0'||life.contentVersion==='0.14.0'))life.state.flags.lived_with_unfinished=!!(f.kept_unallocated_time&&f.rested_without_answer);
}

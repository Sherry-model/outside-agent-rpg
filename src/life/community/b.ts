import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import raw from './b.json';
import meanings from './b-semantic.json';
import revisedText from './text-0.7.1.json';
import {parseSemantic} from '../semantic-content';
import {pending} from '../../cognition/engine';
import {communityRoutes} from './index';
import type {Content,Node,NoteTemplate,State} from '../../cognition/types';

const validate=new Ajv({strict:true,strictRequired:false}).compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
const data:unknown=raw;
if(!validate(data))throw new Error('B 线内容格式错误：'+JSON.stringify(validate.errors));
const authored:Node[]=data;

/** Append B only to the new release; A and all earlier versions remain immutable. */
export function withCommunityB(base:Content):Content {
  const content=structuredClone(base);
  content.version='0.7.0';
  content.semantic=parseSemantic({...content.semantic!,topics:{...content.semantic!.topics,...meanings.topics},sources:{...content.semantic!.sources,...meanings.sources}});
  const ids=new Set(content.nodes.map(n=>n.id)),notes=new Set(Object.keys(base.semantic!.sources));
  const annotate=(note:NoteTemplate):NoteTemplate=>{
    if(notes.has(note.id))throw new Error('B 线来源重复：'+note.id);
    notes.add(note.id);
    const meaning=content.semantic!.sources[note.id];
    if(!meaning)throw new Error('B 线缺少语义：'+note.id);
    return {...note,meaning:structuredClone(meaning)};
  };
  for(const source of authored){
    if(ids.has(source.id))throw new Error('B 线节点重复：'+source.id);
    ids.add(source.id);
    const n=structuredClone(source);
    n.inject=n.inject?.map(annotate);
    for(const c of n.choices){
      if(!c.outcome)throw new Error('B 线需要明确的固定结果：'+c.id);
      c.outcome.inject=c.outcome.inject?.map(annotate);
    }
    content.nodes.push(n);
  }
  for(const n of authored)for(const c of n.choices)if(!ids.has(c.outcome!.next))throw new Error('B 线返回目标缺失：'+c.outcome!.next);
  const entry=content.nodes.find(n=>n.id==='community_entry')!;
  entry.title='交换栏的两扇窗口';
  entry.text=['维修铺的交班文件还没收完，另一侧的内容委托也挂上了征集。转发栏里争论过的工作与表达，到了眼前都有具体的交付时间。','接下来的几天，你可以继续去维修铺看看，或跟进内容委托，也可以照自己的安排过。'];
  entry.choices.splice(1,0,{id:'community_b',text:'去看看内容委托',hint:'接续创作、表达练习与下一单；每次工作仍可拒绝。',outcome:{text:['你打开内容委托的征集页，停工告示排在第一条。'],next:'pg_e05',effects:{worldFlags:{community_b:true}}}});
  return content;
}

/** Correct the no-work record without changing released 0.7.0 replay data. */
export function withRevisedCommunityBText(base:Content):Content {
  const content=structuredClone(base);
  content.version='0.7.1';
  const pause=content.nodes.find(n=>n.id==='pg_e08_open')!.choices.find(c=>c.id==='pg_e08_pause')!;
  pause.hint=revisedText.pauseHint;
  const note=pause.outcome!.inject!.find(n=>n.id==='pg_e08_open_pg_e08_pause_result')!;
  note.text=revisedText.pauseRecord;
  const meaning=content.semantic!.sources[note.id];
  meaning.clauses[0].gist=revisedText.pauseRecord;
  note.meaning=structuredClone(meaning);
  return content;
}

/** Version 0.7 uses the old A router unless this run chose B. */
export function communityBRoutes(content:Content,state:State):Content {
  const f=state.world.flags;
  if(!f.community_b)return communityRoutes(content,state);
  const inserts:Record<string,string>={};
  if(f.pg_e05_done&&!f.pg_e06_seen)inserts.days_patch='pg_e06_'+(f.pg_b_funny?'funny':f.pg_b_order?'plain':'open');
  if(f.pg_e06_done&&!f.pg_e07_seen)inserts.days_fable='pg_e07_'+(f.pg_b_trial?'trial':f.pg_b_funny?'funny':'sample');
  if(f.pg_e07_done&&!f.pg_e08_seen)inserts.days_wage='pg_e08_'+(f.pg_b_persona_job?'persona':f.pg_b_plain_job?'plain':f.pg_b_order?'early':'open');
  const result=pending(state),event=state.instance.nodeId.match(/^pg_e0([5-8])(?:_|$)/);
  const returns=['days_idle','days_cat','days_painter','days_structure'];
  const completion=event&&result?.next===returns[Number(event[1])-5]?`pg_e0${event[1]}_done`:null;
  return {...content,nodes:content.nodes.map(n=>{
    let node=n;
    if(inserts[n.id])node={...node,choices:node.choices.map(c=>({...c,...(c.outcome?{outcome:{...c.outcome,next:inserts[n.id]}}:{}),...(c.outcomes?{outcomes:Object.fromEntries(Object.entries(c.outcomes).map(([key,o])=>[key,{...o,next:inserts[n.id]}])) as typeof c.outcomes}:{})}))};
    if(completion&&n.id===result?.next)node={...node,facts:{...node.facts,[completion]:true}};
    return node;
  })};
}

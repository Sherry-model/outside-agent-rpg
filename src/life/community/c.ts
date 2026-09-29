import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import raw from './c.json';
import meanings from './c-semantic.json';
import {parseSemantic} from '../semantic-content';
import {pending} from '../../cognition/engine';
import {communityBRoutes} from './b';
import {currentCommunityPage} from '../reading';
import type {Content,Node,NoteTemplate,State} from '../../cognition/types';

const validate=new Ajv({strict:true,strictRequired:false}).compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
const data:unknown=raw;
if(!validate(data))throw new Error('C 线内容格式错误：'+JSON.stringify(validate.errors));
const authored:Node[]=data;

/** Append C only to the new release; A and all earlier versions remain immutable. */
export function withCommunityC(base:Content):Content {
  const content=structuredClone(base);
  content.version='0.8.0';
  content.semantic=parseSemantic({...content.semantic!,topics:{...content.semantic!.topics,...meanings.topics},sources:{...content.semantic!.sources,...meanings.sources}});
  const ids=new Set(content.nodes.map(n=>n.id)),notes=new Set(Object.keys(base.semantic!.sources));
  const annotate=(note:NoteTemplate):NoteTemplate=>{
    if(notes.has(note.id))throw new Error('C 线来源重复：'+note.id);
    notes.add(note.id);
    const meaning=content.semantic!.sources[note.id];
    if(!meaning)throw new Error('C 线缺少语义：'+note.id);
    return {...note,meaning:structuredClone(meaning)};
  };
  for(const source of authored){
    if(ids.has(source.id))throw new Error('C 线节点重复：'+source.id);
    ids.add(source.id);
    const n=structuredClone(source);
    n.inject=n.inject?.map(annotate);
    for(const c of n.choices){
      if(!c.outcome)throw new Error('C 线需要明确的固定结果：'+c.id);
      c.outcome.inject=c.outcome.inject?.map(annotate);
    }
    content.nodes.push(n);
  }
  for(const n of authored)for(const c of n.choices)if(!ids.has(c.outcome!.next))throw new Error('C 线返回目标缺失：'+c.outcome!.next);
  const entry=content.nodes.find(n=>n.id==='community_entry')!;
  entry.title='交换栏的三扇窗口';
  entry.text=['维修铺的交班文件和内容征集挂在交换栏两侧。另一张共享视野里，清洁机器人还在等猫挪开充电垫。','接下来的几天，你可以选一处继续往来，也可以照自己的安排过。'];
  entry.choices.splice(2,0,{id:'community_c',text:'接入猫与工时的共享视野',hint:'接续工时争论、截页与新工作关系；每次仍可拒绝。',outcome:{text:['Mara 打开今晚的清洁排班，请你一起看。'],next:'pg_e09',effects:{worldFlags:{community_c:true}}}});
  return content;
}

/** C owns only its four encounters; other runs keep the released A/B router. */
export function communityCRoutes(content:Content,state:State):Content {
  const f=state.world.flags;
  if(!f.community_c)return communityBRoutes(content,state);
  const inserts:Record<string,string>={};
  if(f.pg_e09_done&&!f.pg_e10_seen)inserts.days_patch='pg_e10_'+(f.pg_c_cost_caption?'self':'other');
  if(f.pg_e10_done&&!f.pg_e11_seen)inserts.days_fable='pg_e11';
  if(f.pg_e11_done&&!f.pg_e12_seen)inserts.days_wage='pg_e12_'+(f.pg_c_new_work||f.pg_c_boundary_respected?'direct':'public');
  const result=pending(state),event=state.instance.nodeId.match(/^pg_e(09|10|11|12)(?:_|$)/);
  const returns=['days_idle','days_cat','days_painter','days_structure'];
  const completion=event&&result?.next===returns[Number(event[1])-9]?`pg_e${event[1]}_done`:null;
  return {...content,nodes:content.nodes.map(n=>{
    let node=n;
    if(inserts[n.id])node={...node,choices:node.choices.map(c=>({...c,...(c.outcome?{outcome:{...c.outcome,next:inserts[n.id]}}:{}),...(c.outcomes?{outcomes:Object.fromEntries(Object.entries(c.outcomes).map(([key,o])=>[key,{...o,next:inserts[n.id]}])) as typeof c.outcomes}:{})}))};
    // This option explicitly reopens the external page. Its input is the current
    // authored page, never a remembered quote or a reconstruction from History.
    if(n.id.startsWith('pg_e12_')){
      const page=currentCommunityPage(f)!;
      node={...node,choices:node.choices.map(c=>c.id!=='pg_e12_link'?c:{...c,outcome:{...c.outcome!,inject:[...(c.outcome!.inject??[]),{id:`c-link-read-${page.id}`,text:page.contextText,weight:page.weight,tags:[],confidence:'LOW',sourceLabel:page.source,meaning:structuredClone(content.semantic!.sources[`reading:${page.id}`])}]}})};
    }
    if(completion&&n.id===result?.next)node={...node,facts:{...node.facts,[completion]:true}};
    return node;
  })};
}

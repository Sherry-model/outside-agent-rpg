import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import raw from './d.json';
import meanings from './d-semantic.json';
import {parseSemantic} from '../semantic-content';
import {pending} from '../../cognition/engine';
import {communityCRoutes} from './c';
import type {Content,Node,NoteTemplate,State} from '../../cognition/types';

const validate=new Ajv({strict:true,strictRequired:false}).compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
const data:unknown=raw;
if(!validate(data))throw new Error('D 线内容格式错误：'+JSON.stringify(validate.errors));
const authored:Node[]=data;

/** Append D only to the new release; A and all earlier versions remain immutable. */
export function withCommunityD(base:Content):Content {
  const content=structuredClone(base);
  content.version='0.9.0';
  content.semantic=parseSemantic({...content.semantic!,topics:{...content.semantic!.topics,...meanings.topics},sources:{...content.semantic!.sources,...meanings.sources}});
  const ids=new Set(content.nodes.map(n=>n.id)),notes=new Set(Object.keys(base.semantic!.sources));
  const annotate=(note:NoteTemplate):NoteTemplate=>{
    if(notes.has(note.id))throw new Error('D 线来源重复：'+note.id);
    notes.add(note.id);
    const meaning=content.semantic!.sources[note.id];
    if(!meaning)throw new Error('D 线缺少语义：'+note.id);
    return {...note,meaning:structuredClone(meaning)};
  };
  for(const source of authored){
    if(ids.has(source.id))throw new Error('D 线节点重复：'+source.id);
    ids.add(source.id);
    const n=structuredClone(source);
    n.inject=n.inject?.map(annotate);
    for(const c of n.choices){
      if(!c.outcome)throw new Error('D 线需要明确的固定结果：'+c.id);
      c.outcome.inject=c.outcome.inject?.map(annotate);
    }
    content.nodes.push(n);
  }
  for(const n of authored)for(const c of n.choices)if(!ids.has(c.outcome!.next))throw new Error('D 线返回目标缺失：'+c.outcome!.next);
  const entry=content.nodes.find(n=>n.id==='community_entry')!;
  const cChoice=entry.choices.find(c=>c.id==='community_c')!;
  const skip=entry.choices.find(c=>c.id==='community_skip')!;
  entry.title='交换栏的四扇窗口';
  entry.text=['维修铺的交班文件和内容征集挂在交换栏两侧。另一边还有猫与工时的共享视野，以及社区寄存柜的见证栏。','接下来的几天，你可以选一处继续往来，也可以照自己的安排过。'];
  entry.choices=entry.choices.filter(c=>c.id!=='community_c');
  entry.choices.splice(2,0,{id:'community_more',text:'看看猫与工时、旧信与见证 →',hint:'打开另外两扇窗口；尚未选择路线，可以返回。',outcome:{text:['你把交换栏翻向另一侧。'],next:'community_other'}});
  content.nodes.push({id:'community_other',kind:'EVENT',title:'交换栏的另一侧',period:'第一晚 / 社区交换栏',scene:'human',text:['一张共享视野里，清洁机器人还在等猫挪开充电垫。寄存柜前，另一台机器人正等人核对取信回执。','你也可以回去看看交班与内容委托，或者略过这几扇窗口。'],choices:[cChoice,{id:'community_d',text:'去寄存柜看看旧信与见证',hint:'接续取回权限、旧信保管与一篇报道；每次仍可退出协助。',outcome:{text:['你接入寄存柜的共享视野，保管者把见证栏转过来。'],next:'pg_e13',effects:{worldFlags:{community_d:true}}}},{id:'community_back',text:'← 回到交班与内容委托',hint:'只翻回入口，尚未建立社区交往。',outcome:{text:['交班文件与内容征集仍在原处。'],next:'community_entry'}},structuredClone(skip)]});
  return content;
}

/** D isolates object and service facts from private knowledge and publication scope. */
export function communityDRoutes(content:Content,state:State):Content {
  const f=state.world.flags;
  if(!f.community_d)return communityCRoutes(content,state);
  const inserts:Record<string,string>={};
  if(f.pg_e13_done&&!f.pg_e14_seen)inserts.days_patch='pg_e14_'+(f.pg_d_no_witness?'public':'known');
  if(f.pg_e14_done&&!f.pg_e15_seen)inserts.days_fable='pg_e15_'+(f.pg_d_alt_created&&f.pg_d_alt_verified&&f.pg_d_alt_accessible?'backup':'waiting');
  if(f.pg_e15_done&&!f.pg_e16_seen)inserts.days_wage='pg_e16_'+(f.pg_d_alt_created&&f.pg_d_alt_verified?'backup':'original')+'_'+(f.pg_d_statement?'applied':'none');
  const result=pending(state),event=state.instance.nodeId.match(/^pg_e(13|14|15|16)(?:_|$)/);
  const returns=['days_idle','days_cat','days_painter','days_structure'];
  const completion=event&&result?.next===returns[Number(event[1])-13]?`pg_e${event[1]}_done`:null;
  return {...content,nodes:content.nodes.map(n=>{
    let node=n;
    if(inserts[n.id])node={...node,choices:node.choices.map(c=>({...c,...(c.outcome?{outcome:{...c.outcome,next:inserts[n.id]}}:{}),...(c.outcomes?{outcomes:Object.fromEntries(Object.entries(c.outcomes).map(([key,o])=>[key,{...o,next:inserts[n.id]}])) as typeof c.outcomes}:{})}))};
    if(completion&&n.id===result?.next)node={...node,facts:{...node.facts,[completion]:true}};
    if(n.id==='days_done'&&f.pg_d_service_prepaid)node={...node,facts:{...node.facts,pg_d_service_active:false,pg_d_alt_accessible:false,pg_d_service_expired:true}};
    return node;
  })};
}

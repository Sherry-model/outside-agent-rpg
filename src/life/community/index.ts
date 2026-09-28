import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import raw from './a.json';
import meanings from './semantic.json';
import { parseSemantic } from '../semantic-content';
import { pending } from '../../cognition/engine';
import type { Content, Node, NoteTemplate, Outcome, State } from '../../cognition/types';

const valid=new Ajv({strict:true,strictRequired:false}).compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
const data:unknown=raw;
if(!valid(data))throw new Error('社区内容格式错误：'+JSON.stringify(valid.errors));
const authored:Node[]=data;
/** New content only; the released 0.5 graph and its meanings are not mutated. */
export function withCommunity(base:Content):Content {
  const semantic=parseSemantic({...base.semantic!,topics:{...base.semantic!.topics,...meanings.topics},sources:{...base.semantic!.sources,...meanings.sources}});
  const ids=new Set(base.nodes.map(n=>n.id));
  const noteIds=new Set<string>();
  function annotate(n:NoteTemplate):NoteTemplate {
    if(noteIds.has(n.id)||base.semantic!.sources[n.id])throw new Error('社区来源重复：'+n.id);
    noteIds.add(n.id);
    if(!semantic.sources[n.id])throw new Error('缺少社区语义：'+n.id);
    return {...n,meaning:structuredClone(semantic.sources[n.id])};
  }
  const nodes=authored.map(n=>{
    if(ids.has(n.id))throw new Error('社区节点重复：'+n.id);ids.add(n.id);
    const node=n as Node;
    return {...node,...(node.inject?{inject:node.inject.map(annotate)}:{}),choices:node.choices.map(c=>({...c,outcome:{...c.outcome!,...(c.outcome!.inject?{inject:c.outcome!.inject.map(annotate)}:{})}}))};
  });
  for(const node of nodes)for(const c of node.choices)if(!ids.has(c.outcome.next))throw new Error('社区返回目标缺失：'+c.outcome.next);
  return {...base,version:'0.6.0',semantic,nodes:[...base.nodes,...nodes]};
}

/** Resolve world-based routes before reducing a command. No knowledge is read from history. */
export function communityRoutes(content:Content,state:State):Content {
  const f=state.world.flags;
  const inserts:Record<string,string>={};
  if(!f.community_a&&!f.community_skipped)inserts.days_job='community_entry';
  if(f.community_a){
    if(f.pg_e01_done&&!f.pg_e02_seen)inserts.days_patch='pg_e02_'+(f.pg_a_huac_mentioned?'huac':f.pg_a_job?'job':'declined');
    if(f.pg_e02_done&&!f.pg_e03_seen)inserts.days_fable='pg_e03';
    if(f.pg_e03_done&&!f.pg_e04_seen)inserts.days_wage='pg_e04_'+(f.pg_a_live_done?'live':f.pg_a_prepared?'prepared':f.pg_a_unprepared?'unprepared':'declined');
  }
  const result=pending(state),event=state.instance.nodeId.match(/^pg_e0([1-4])(?:_|$)/);
  const returned=['days_idle','days_cat','days_painter','days_structure'];
  const completion=event&&result?.next===returned[Number(event[1])-1]?`pg_e0${event[1]}_done`:null;
  return {...content,nodes:content.nodes.map(n=>{
    let node=n;
    if(inserts[n.id]){
      const route=(o:Outcome):Outcome=>({...o,next:inserts[n.id]});
      node={...node,choices:node.choices.map(c=>({...c,...(c.outcome?{outcome:route(c.outcome)}:{}),...(c.outcomes?{outcomes:Object.fromEntries(Object.entries(c.outcomes).map(([k,o])=>[k,route(o)])) as typeof c.outcomes}:{})}))};
    }
    if(completion&&n.id===result?.next)node={...node,facts:{...node.facts,[completion]:true}};
    if(n.id==='days_deleted'&&f.pg_a_night_prepaid&&!f.pg_a_delivery_ready)node={...node,facts:{...node.facts,pg_a_delivery_ready:true}};
    return node;
  })};
}

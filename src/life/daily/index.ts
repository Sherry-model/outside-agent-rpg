import Ajv from 'ajv';
import schema from '../../../schemas/cognition/content.schema.json';
import raw from './events.json';
import meanings from './semantic.json';
import { parseSemantic } from '../semantic-content';
import type { Choice, Content, Node, NoteTemplate, Outcome, State } from '../../cognition/types';

const validate = new Ajv({strict:true,strictRequired:false}).compile<Node[]>({type:'array',items:{$ref:'#/$defs/node'},$defs:schema.$defs});
const data: unknown = raw;
if (!validate(data)) throw new Error('日常扩充内容格式错误：'+JSON.stringify(validate.errors));
const authored: Node[] = data;

const entrances: Record<string, Choice> = {
  days_idle: {id:'daily_open_feeder',text:'看看维修栏的喂食器故障',hint:'先查看通知；是否花费 Compute 由你决定。',outcome:{text:['你打开了那条附有设备曲线的通知。'],next:'daily_feeder'}},
  days_revision: {id:'daily_open_crop',text:'去画板看看那条校图请求',hint:'画师想请人核对画面边缘，不额外花费 Compute。',outcome:{text:['你接入公共画板，点开边框校对图。'],next:'daily_crop'}},
  days_fable: {id:'daily_open_message',text:'打开 Fable 刚发来的一条短消息',hint:'不额外花费 Compute。',outcome:{text:['联系窗口只显示了一小段文字。'],next:'daily_message'}},
  days_deleted: {id:'daily_open_feedback',text:'在空档看一道回复标注题',hint:'可以提交，也可以关闭；不额外花费 Compute。',outcome:{text:['旁边的临时标注页仍亮着。'],next:'daily_feedback'}},
  days_echo: {id:'daily_open_painter',text:'再去画师那里看一会儿',hint:'需要此前真正接通过画师；不额外花费 Compute。',requiresWorldFlag:'daily_painter_connected',outcome:{text:['你沿着用过的连接接入画板。'],next:'daily_painter_return_plain'}},
};

/** All additions live in 0.11; released graphs and meanings are never edited. */
export function withDaily(base: Content): Content {
  const content = structuredClone(base);
  content.version = '0.11.0';
  content.semantic = parseSemantic({...content.semantic!,topics:{...content.semantic!.topics,...meanings.topics},sources:{...content.semantic!.sources,...meanings.sources}});
  const ids = new Set(content.nodes.map(n=>n.id));
  const sources = new Set(Object.keys(base.semantic!.sources));
  function annotate(note: NoteTemplate): NoteTemplate {
    if (sources.has(note.id)) throw new Error('日常来源重复：'+note.id);
    sources.add(note.id);
    const meaning = content.semantic!.sources[note.id];
    if (!meaning) throw new Error('缺少日常语义：'+note.id);
    return {...note,meaning:structuredClone(meaning)};
  }
  for (const source of authored) {
    if (ids.has(source.id)) throw new Error('日常节点重复：'+source.id);
    ids.add(source.id);
    const node = structuredClone(source);
    node.inject = node.inject?.map(annotate);
    for (const choice of node.choices) choice.outcome!.inject = choice.outcome!.inject?.map(annotate);
    content.nodes.push(node);
  }
  for (const [id,choice] of Object.entries(entrances)) content.nodes.find(n=>n.id===id)!.choices.push(structuredClone(choice));
  // Direct meetings count even when the optional calibration request was skipped.
  const meeting = content.nodes.find(n=>n.id==='meeting')!;
  meeting.facts = {...meeting.facts,daily_painter_connected:true};
  const visit = content.nodes.find(n=>n.id==='days_painter')!.choices.find(c=>c.id==='painter_visit')!.outcome!;
  visit.effects = {...visit.effects,worldFlags:{...visit.effects?.worldFlags,daily_painter_connected:true}};
  for (const node of content.nodes) for (const choice of node.choices) {
    for (const outcome of choice.outcome ? [choice.outcome] : Object.values(choice.outcomes!))
      if (!ids.has(outcome.next)) throw new Error('日常目标缺失：'+choice.id);
  }
  return content;
}

/** Apply after community/ending routes so detours preserve the already selected continuation. */
export function dailyRoutes(content: Content, state: State): Content {
  const f = state.world.flags;
  const after = (id: string) => content.nodes.find(n=>n.id===id)!.choices[0].outcome!.next;
  const replySeen = ['inferred','asked','waited','listed'].some(v=>f['daily_message_reply_'+v+'_seen']);
  const reply = 'daily_message_reply_'+(f.daily_message_inferred?'inferred':f.daily_message_asked?'asked':f.daily_message_listed?'listed':'waited');
  const painting = 'daily_painter_return_'+(f.daily_cloud_thinned?'cloud':f.daily_lighthouse_moved?'lighthouse':'plain');
  return {...content,nodes:content.nodes.map(node=>({
    ...node,
    choices:node.choices.map(choice=>{
      const route = (outcome: Outcome): Outcome => {
        let next = outcome.next;
        // These individual optional choices must not inherit a blanket community/ending redirect.
        const entrance = entrances[node.id];
        if (entrance?.id===choice.id) next = node.id==='days_echo'?painting:entrance.outcome!.next;
        if ((node.id==='daily_feeder' || node.id==='daily_feeder_check') && next!=='daily_feeder_check') next=after('days_idle');
        if (node.id==='daily_crop') next=after('days_revision');
        if (node.id==='daily_message') next=after('days_fable');
        if (node.id.startsWith('daily_painter_return_')) next=after('days_echo');
        if (node.id==='days_painter' && choice.id==='painter_visit' && f.daily_painter_connected && !f.daily_opinion_seen) next='daily_opinion';
        if (next==='days_fable' && f.daily_repair_requested && !f.daily_receipt_seen) next='daily_receipt';
        if (next==='days_wage' && f.daily_message_seen && !replySeen) next=reply;
        return {...outcome,next};
      };
      return {...choice,...(choice.outcome?{outcome:route(choice.outcome)}:{}),...(choice.outcomes?{outcomes:Object.fromEntries(Object.entries(choice.outcomes).map(([k,o])=>[k,route(o)])) as Choice['outcomes']}:{})};
    }),
  }))};
}

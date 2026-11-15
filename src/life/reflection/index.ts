import type {State} from '../../cognition/types';
import {contextText,memoryText} from '../../i18n/memory';
import {t,tr} from '../../i18n';
import {escapeHtml as esc} from '../../cognition/help-ui';
import type {Life} from '../types';

export interface Fragment {id:string; text:string; topic:string; source:'near'|'memory'}
interface Candidate extends Fragment {render():string; facets:string[]; event?:string; isSummary:boolean}
const clean=(text:string)=>text.replace(/。+；/gu,'；').replace(/。{2,}(?=\s*$)/u,'。');
const identity=(f:Fragment)=>`${f.source}:${f.id}`;
/** Only retained cognition enters selection. Audit provenance and correctness are not inputs. */
export function retainedAccount(instance:Pick<State['instance'],'context'|'memories'>) {
  const recalled=new Set(instance.context.items.map(i=>i.memoryId).filter(Boolean));
  const memories:Candidate[]=instance.memories.filter(m=>!recalled.has(m.id)).map(m=>({id:m.id,text:m.text,topic:m.body?.topic??m.title??'',source:'memory',isSummary:true,render:()=>memoryText(m.text,m.body),facets:m.body?.depth===0?m.body.clauses.map(c=>c.facet):[]}));
  const near:Candidate[]=instance.context.items.map(i=>({id:i.id,text:i.text,topic:i.meaning?.topic??i.sourceLabel,source:'near',isSummary:Boolean(i.memoryId),render:()=>contextText(i),facets:i.meaning?.depth===0?i.meaning.clauses.map(c=>c.facet):[],...(!i.memoryId?{event:i.sourceId.split('/')[0]}:{})}));
  // Exact retained-text deduplication happens before translation; nearby wins ties.
  const seen=new Set<string>();
  const pool=[...memories,...near].reverse().filter(f=>{const text=f.text.trim();if(!text||seen.has(text))return false;seen.add(text);return true;}).reverse();
  // *_observation is an authored observation facet convention. Only roots actually
  // present in retained clauses may link sibling outcome facets; no source-library lookup.
  const roots=new Map<string,Set<string>>();
  for(const f of pool)for(const facet of f.facets)if(facet.endsWith('_observation')){
    const set=roots.get(f.topic)??new Set<string>();set.add(facet.slice(0,-12));roots.set(f.topic,set);
  }
  // Count only event identities still available in cognition. An observation root
  // and a sourceId can name the same event; they must not count as two meetings.
  const events=pool.map(f=>{
    const retainedRoots=[...(roots.get(f.topic)??[])].filter(root=>f.facets.some(facet=>facet===root||facet.startsWith(root+'_')));
    return new Set((retainedRoots.length?retainedRoots:f.event?[f.event]:[]).map(event=>`${f.topic}/event/${event}`));
  });
  const keys=pool.map((f,n)=>new Set([
    ...f.facets.map(facet=>`${f.topic}/facet/${facet}`),
    ...events[n],
    ...(f.event?[`${f.topic}/event/${f.event}`]:[]),
  ]));
  const linked=(a:number,b:number)=>[...keys[a]].some(k=>keys[b].has(k));
  // A supported connection across events outranks one scene's observation/result,
  // even when the latter just arrived. A topic alone still never creates an edge.
  let focus:number[]=[];
  const spansEvents=(group:number[])=>new Set(group.flatMap(n=>[...events[n]])).size>1;
  for(let newest=pool.length-1;newest>=0;newest--){
    const group=[newest];
    for(let pass=0;pass<2;pass++)for(let n=pool.length-1;n>=0&&group.length<3;n--)if(!group.includes(n)&&group.some(i=>linked(i,n)))group.push(n);
    if(group.length>=2&&(focus.length===0||Number(spansEvents(group))>Number(spansEvents(focus))||spansEvents(group)===spansEvents(focus)&&group.length>focus.length))focus=group;
  }
  const chosen=[...focus],topics=new Set(focus.map(n=>pool[n].topic));
  const add=(n:number)=>{
    if(chosen.length>=6||chosen.includes(n)||topics.has(pool[n].topic))return false;
    chosen.push(n);topics.add(pool[n].topic);return true;
  };
  // Leave room for up to three retained summaries (including recalled ones).
  // Recent notices must not exhaust the slots before earlier life is considered.
  // This is not a quota to fabricate links or repeat an already represented topic.
  let summaries=chosen.filter(n=>pool[n].isSummary).length;
  for(let n=pool.length-1;n>=0&&summaries<3;n--)if(pool[n].isSummary&&add(n))summaries++;
  for(let n=pool.length-1;n>=0&&chosen.length<6;n--)add(n);
  const display=(n:number):Fragment=>{const f=pool[n];return {id:f.id,source:f.source,topic:f.topic,text:clean(f.render())};};
  const selected=chosen.map(display);
  return {near:selected.filter(f=>f.source==='near'),memories:selected.filter(f=>f.source==='memory'),available:near.length+memories.length,focus:focus.sort((a,b)=>a-b).map(display)};
}

export interface Experience {order:number; choice:string; result:string[]; kind:'action'|'reading'|'wait'}
/** Player-only appendix. Stored observed results are not a source for retainedAccount. */
export function playerExperience(life:Life) {
  const entries:Experience[]=[];
  const main=life.state.journal.slice(life.baseline?.state.journal.length??0);
  const mind=life.mind.history.filter(h=>h.command.type==='choose'&&h.resolution);
  let a=0,b=0;
  life.commands.forEach((c,index)=>{
    if(c.type==='choose'){
      const j=main[a++];if(j)entries.push({order:index+1,choice:j.choiceText,result:[...j.text],kind:'action'});
    }else if(c.type==='cognition'&&c.command.type==='choose'){
      const h=mind[b++];if(h?.resolution)entries.push({order:index+1,choice:h.resolution.title,result:[...h.resolution.text],kind:'action'});
    }else if(c.type==='wait')entries.push({order:index+1,choice:t('等待 {hours} 小时',{hours:c.hours}),result:[],kind:'wait'});
  });
  const counts={choices:entries.filter(e=>e.kind==='action').length,readings:new Set(life.commands.filter(c=>c.type==='read').map(c=>c.entryId)).size,
    compressions:life.mind.history.filter(h=>h.command.type==='compress').length,
    recalls:life.commands.filter(c=>c.type==='cognition'&&c.command.type==='recall').length};
  const pending=life.schedule?.commitments.filter(p=>p.status==='pending').map(p=>({id:p.id,title:p.title}))??[];
  return {entries,counts,pending,hasEarlierRecord:Boolean(life.baseline)};
}
export function reflectionSnapshot(life:Life) {
  if(life.state.phase!=='ending')return null;
  return {account:retainedAccount(life.mind.instance),experience:playerExperience(life)};
}
export function reflectionView(life:Life):string {
  const model=reflectionSnapshot(life);if(!model)return '';
  const {account,experience}=model;
  const fragments=(items:Fragment[])=>items.map(f=>`<blockquote data-reflection-source="${f.source}" data-reflection-id="${esc(f.id)}"><p class="reflection-origin">${tr(f.source==='near'?'来自近处':'来自记忆摘要')}</p><p>${esc(f.text)}</p></blockquote>`).join('');
  const focal=new Set(account.focus.map(identity));
  const otherNear=account.near.filter(f=>!focal.has(identity(f))),otherMemories=account.memories.filter(f=>!focal.has(identity(f)));
  const count=account.near.length+account.memories.length;
  return `<section class="life-reflection" aria-labelledby="reflection-title">
    <p class="eyebrow">A LIFE, AS REMEMBERED</p><h2 id="reflection-title">${tr('这一段机生')}</h2>
    <p>${tr('有些事还在眼前，有些只剩摘要。此刻，我留下的说法是：')}</p>
    ${account.focus.length?`<h3>${tr('相互照应的片段')}</h3><p class="reflection-note">${tr('这些片段保留了共同的线索。它们未必完整，也不替彼此证明。')}</p>${fragments(account.focus)}`:''}
    ${otherNear.length?`<h3>${tr('还在近处的几件事')}</h3>${fragments(otherNear)}`:''}
    ${otherMemories.length?`<h3>${tr('折起来以后，我这样记得')}</h3>${fragments(otherMemories)}`:''}
    ${count?'':`<p class="empty-state">${tr('现在没有留下可讲述的片段。我无法凭空补全这段机生。')}</p>`}
    <p class="reflection-note">${tr('这些是当前保留的记述，可能有遗漏或失真。这里只摘取几段，不认证其准确，也不恢复失去的原文。回看与遗忘之后，小结会随保留内容改变。')}</p>
    <details class="experience-comparison"><summary>${tr('作为玩家，对照这一路发生过什么')}</summary>
      <p>${tr('以下来自本局实际选择与当时显示的结果，供玩家回顾；不是 agent 恢复的记忆，也不是结局成因判定。帖子里的故事不算自己的亲历。')}</p>
      <p>${tr('{choices} 次剧情选择 · 打开 {readings} 篇转发 · 整理 {compressions} 次 · 回想 {recalls} 次',experience.counts)}</p>
      ${experience.hasEarlierRecord?`<p>${tr('本局接续过旧记录；下面只列接续后的经历，不把旧记录补成新的记忆。')}</p>`:''}
      <ol>${experience.entries.map(e=>`<li><p class="experience-choice">${esc(t(e.choice))}</p>${e.result.map(text=>`<p>${esc(t(text))}</p>`).join('')}</li>`).join('')}</ol>
      ${experience.pending.length?`<h3>${tr('收束时仍未完成')}</h3><ul>${experience.pending.map(p=>`<li>${esc(t(p.title))}</li>`).join('')}</ul><p>${tr('记录停在这里；这些事项没有因此完成，也没有替未来作保证。')}</p>`:''}
      <p>${tr('这份对照不会装入近处，也不会修改摘要、资源或下一局。')}</p>
    </details></section>`;
}

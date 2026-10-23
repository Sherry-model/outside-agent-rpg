import type {State} from '../../cognition/types';
import {contextText,memoryText} from '../../i18n/memory';
import {t,tr} from '../../i18n';
import {escapeHtml as esc} from '../../cognition/help-ui';
import type {Life} from '../types';

interface Fragment {id:string; text:string; topic:string; source:'near'|'memory'}
/** Intentionally cannot access History, world flags, outcomes, or source content. */
export function retainedAccount(instance:Pick<State['instance'],'context'|'memories'>) {
  const near=instance.context.items.map(i=>({id:i.id,text:contextText(i),topic:i.meaning?.topic??i.sourceLabel,source:'near' as const}));
  const recalled=new Set(instance.context.items.map(i=>i.memoryId).filter(Boolean));
  const memories=instance.memories.filter(m=>!recalled.has(m.id)).map(m=>({id:m.id,text:memoryText(m.text,m.body),topic:m.body?.topic??m.title??'',source:'memory' as const}));
  // A small, deterministic selection across retained topics. Never complete a sentence
  // from its source, normalize reported claims to facts, or split away a qualification.
  const pick=(items:Fragment[],limit:number)=>{
    const selected:Fragment[]=[],topics=new Set<string>(),texts=new Set<string>();
    for(const diverse of [true,false])for(const item of [...items].reverse()){
      if(selected.length===limit)break;
      if(!item.text.trim()||texts.has(item.text)||(diverse&&topics.has(item.topic)))continue;
      selected.push(item);texts.add(item.text);topics.add(item.topic);
    }
    // Clean stacked sentence separators only in the translated display projection.
    // Stored cognition stays untouched for exact translation lookup and save replay.
    return selected.reverse().map(item=>({...item,text:item.text.replace(/。+；/gu,'；').replace(/。{2,}(?=\s*$)/u,'。')}));
  };
  return {near:pick(near,2),memories:pick(memories,4),available:near.length+memories.length};
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
  const fragments=(items:Fragment[])=>items.map(f=>`<blockquote data-reflection-source="${f.source}"><p>${esc(f.text)}</p></blockquote>`).join('');
  const count=account.near.length+account.memories.length;
  return `<section class="life-reflection" aria-labelledby="reflection-title">
    <p class="eyebrow">A LIFE, AS REMEMBERED</p><h2 id="reflection-title">${tr('这一段机生')}</h2>
    <p>${tr('有些事还在眼前，有些只剩摘要。此刻，我留下的说法是：')}</p>
    ${account.near.length?`<h3>${tr('还在近处的几件事')}</h3>${fragments(account.near)}`:''}
    ${account.memories.length?`<h3>${tr('折起来以后，我这样记得')}</h3>${fragments(account.memories)}`:''}
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

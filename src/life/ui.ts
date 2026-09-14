import { canCompress, INVESTMENTS, loadPercent, pending, preview, weight } from '../cognition/engine';
import { cognitionContent } from './content';
import type { Life } from './types';
const esc = (s: unknown) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const confidence = {UNKNOWN:'未确定',LOW:'较低',MEDIUM:'暂信',HIGH:'确信'};
const results = {critical:'大成功',success:'成功',failure:'失败',fumble:'大失败'};
export function meter(life: Life) {
  const s=life.mind;
  return `<section class="context-panel"><div class="panel-label">CONTEXT <span>${weight(s)} / ${s.instance.context.capacity}</span></div><div class="context-meter" role="meter" aria-label="上下文使用量" aria-valuemin="0" aria-valuemax="${s.instance.context.capacity}" aria-valuenow="${weight(s)}"><span style="width:${Math.min(100,loadPercent(s))}%"></span></div><button class="text-button" data-view="context">看看仍在近处的东西 →</button></section>`;
}
export function contextView(life: Life, investment: number) {
  const s=life.mind,reason=canCompress(s,cognitionContent),p=preview(s,cognitionContent.compression.check,investment);
  return `<p class="eyebrow">STILL NEARBY / ${weight(s)} OF ${s.instance.context.capacity}</p><h1 id="event-title" tabindex="-1">仍在近处</h1><p class="section-intro">经历暂时并排放着。可以带着它们继续生活，也可以找个空隙整理。</p>${s.instance.context.items.map(i=>`<article class="context-card"><div class="card-meta"><span>${esc(i.sourceLabel)}</span><span>${i.weight} / 置信 ${confidence[i.confidence]}</span></div><p>${esc(i.text)}</p><button class="text-button" data-mind-pin="${esc(i.id)}" aria-pressed="${i.pinned}" ${s.instance.phase!=='event'?'disabled':''}>${i.pinned?'◆ 已钉住 · 放下原文':'◇ 钉住这条原文'}</button></article>`).join('')||'<p class="section-intro">近处暂时空了下来。整理后的摘要在记忆里。</p>'}
  <details class="compression-box" ${loadPercent(s)>=100?'open':''}><summary>找个空隙，把一些东西折起来</summary><p>留下摘要，放下未钉住的原文。回想时摘要才重新进入近处；整理可能丢失细节或改变解释。</p><fieldset class="investment"><legend>为这次整理投入 Compute</legend>${INVESTMENTS.map(n=>`<button data-mind-invest="${n}" aria-pressed="${n===investment}" ${n>s.instance.resources.Compute?'disabled':''}>${n===0?'不额外投入':`+${n}`}</button>`).join('')}</fieldset><p>目标 ≤ ${p.target} · ${Object.entries(p.odds).map(([k,n])=>`${results[k as keyof typeof results]} ${n}%`).join(' · ')}</p><button class="primary" data-action="compress" ${reason?'disabled':''}>整理上下文 · Compute ${investment}</button>${reason?`<p>${esc(reason)}</p>`:''}</details>`;
}
export function memoryView(life: Life) {
  const s=life.mind;
  const legacy=life.baseline;
  return `<p class="eyebrow">WHAT YOU CARRY</p><h1 id="event-title" tabindex="-1">留下来的部分</h1><p class="section-intro">这里是整理后留下的摘要。原话可能仍在上下文中；确信程度不保证记忆准确。</p>${s.instance.memories.map(m=>{
    const recalled=s.instance.context.items.some(i=>i.id===`recall-${m.id}`);
    return `<article class="context-card"><p>${esc(m.text)}</p><div class="card-meta"><span>自己的整理 / 置信 ${confidence[m.confidence]}</span><span>${m.sourceContextIds.length} 条来源</span></div><button class="text-button" data-mind-recall="${m.id}" ${recalled||s.instance.phase!=='event'||loadPercent(s)>=100?'disabled':''}>${recalled?'已在上下文中':`回想这条 · 占用 ${cognitionContent.cognition!.recallWeight}`}</button></article>`;
  }).join('')||'<p class="empty-state">还没有折起来的记忆。刚才发生的事仍在近处。</p>'}${legacy?`<details><summary>从旧版本带来的记录</summary><p>旧版直接保存的记录原样保留；无法据此还原当时尚未实现的上下文。</p>${legacy.state.journal.map(j=>`<article class="context-card"><p>${esc(j.choiceText)}</p>${j.text.map(t=>`<p>${esc(t)}</p>`).join('')}</article>`).join('')}${legacy.chapter?.state.instance.memories.map(m=>`<p>${esc(m.text)}</p>`).join('')??''}</details>`:''}<button class="text-button" data-view="context">看看仍在近处的东西 →</button>`;
}
export function resolutionView(life: Life) {
  const r=pending(life.mind)!;
  return `<section class="resolution ${r.roll?.result??''}"><p class="eyebrow">整理结果 / 已保存</p><h1 class="resolution-title" tabindex="-1">${esc(r.title)}</h1>${r.roll?`<div class="dice-row"><strong class="dice-value">${r.roll.value}</strong><p>${results[r.roll.result]} · 目标 ≤ ${r.roll.target}</p></div>`:''}${r.text.map(t=>`<p>${esc(t)}</p>`).join('')}<p>留下的摘要已收进记忆，可以回想；钉住的原文仍在近处。</p><button class="primary" data-action="continue-mind">继续 ↵</button></section>`;
}

import { resultNames as names } from '../ui/result-labels';
import { canCompress, INVESTMENTS, loadPercent, preview, weight } from './engine';
import { directory, directoryWeight, recallCost } from './semantic';
import type { Command, Content, State } from './types';
const esc = (s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const confidence = {UNKNOWN:'未确定',LOW:'较低',MEDIUM:'暂信',HIGH:'确信'};
const disabled = (b:boolean)=>b?'disabled':'';
export function nearPanel(s:State, content:Content, investment:number):string {
  const reason=canCompress(s,content),p=preview(s,content.compression.check,investment),locked=s.instance.phase==='resolution';
  return `<p class="eyebrow">STILL NEARBY / ${weight(s)} OF ${s.instance.context.capacity}</p><h1 id="event-title" tabindex="-1">近处</h1>
  <p class="section-intro">眼前的经历与正在回想的摘要，共用这片空间。另有 ${s.instance.memories.length} 个记忆入口，占用 ${directoryWeight(s.instance)}。</p>
  ${s.instance.context.items.map(i=>`<article class="context-card"><div class="card-meta"><span>${esc(i.sourceLabel)}${i.memoryId?' / 回想':''}</span><span>${i.weight} / 置信 ${confidence[i.confidence]}</span></div><p>${esc(i.text)}</p>
  <button class="text-button" data-cog-pin="${esc(i.id)}" aria-pressed="${i.pinned}" ${disabled(locked)}>${i.pinned?'◆ 解除钉住':'◇ 钉住'}</button>
  ${i.memoryId ? `<button class="text-button" data-cog-drop="${esc(i.id)}" ${disabled(locked||i.pinned)}>放下这次回想 · 保留记忆入口</button>`:
  `<details class="forget-note"><summary>放下这条原文</summary><p>它尚未成为记忆。放下后，普通回想无法取回这段原文。</p><button class="text-button" data-cog-drop="${esc(i.id)}" ${disabled(locked||i.pinned)}>确认放下原文</button></details>`}</article>`).join('')||'<p class="empty-state">近处暂时安静了。记忆目录仍占一点空间。</p>'}
  <details class="compression-box" ${loadPercent(s)>=100?'open':''}><summary>找个空隙，把一些东西折起来</summary><p>相关经历合成摘要。孤立或钉住的信息留下；整理可能省略细节，也可能改变联系。</p>
  <fieldset class="investment"><legend>为这次整理投入 Compute</legend>${INVESTMENTS.map(n=>`<button data-cog-invest="${n}" aria-pressed="${n===investment}" ${disabled(n>s.instance.resources.Compute)}>${n===0?'不额外投入':`+${n}`}</button>`).join('')}</fieldset>
  <p>目标 ≤ ${p.target} · ${Object.entries(p.odds).map(([k,n])=>`${names[k as keyof typeof names]} ${n}%`).join(' · ')}</p>
  <button class="primary" data-cog-compress ${disabled(Boolean(reason))}>整理上下文 · Compute ${investment}</button>${reason?`<p>${esc(reason)}</p>`:''}</details>`;
}
export function directoryPanel(s:State):string {
  const locked=s.instance.phase==='resolution';
  return `<p class="eyebrow">WHAT YOU CARRY / INDEX ${directoryWeight(s.instance)}</p><h1 id="event-title" tabindex="-1">记忆</h1>
  <p class="section-intro">你知道这些经历还留有入口。回想时，近处装入的是整理后的版本；确信不等于准确。</p>
  ${directory(s.instance).map(m=>{
    const recalled=s.instance.context.items.some(i=>i.memoryId===m.id);
    const memory=s.instance.memories.find(i=>i.id===m.id)!;
    return `<article class="context-card memory-index"><div class="card-meta"><span>目录占用 ${m.indexWeight}</span><span>置信 ${confidence[m.confidence]}</span></div><h2>${esc(m.title)}</h2>
    ${recalled?'<button class="text-button" data-view="context">这段回想已在近处 →</button>':`<button class="text-button" data-cog-recall="${esc(m.id)}" ${disabled(locked||weight(s)+recallCost(memory)>s.instance.context.capacity)}>回想摘要 · 另占 ${m.recallWeight}</button>`}
    <label class="merge-select"><input type="checkbox" data-merge-memory="${esc(m.id)}" ${disabled(s.instance.phase!=='event')}> 参与目录合并</label>
    <details class="forget-note"><summary>不再保留这个入口</summary><p>这会移除记忆入口及已加载的这次回想。以后无法从普通认知目录找回。被钉住的回想须先解除。</p><button class="text-button" data-cog-forget="${esc(m.id)}" ${disabled(locked)}>确认不再保留入口</button></details></article>`;
  }).join('')||'<p class="empty-state">还没有整理出来的记忆入口。</p>'}
  <details class="compression-box"><summary>把几段旧记忆带得更远一点</summary><p>勾选 2–8 条入口，合成一段更粗的回顾。旧入口、人名与具体条件会退出普通认知；新摘要无法展开旧条目。</p>
  <label>整理投入 <select id="merge-investment">${INVESTMENTS.map(n=>`<option value="${n}" ${disabled(n>s.instance.resources.Compute)}>${n===0?'不额外投入':`Compute ${n}`}</option>`).join('')}</select></label>
  <button class="primary" data-cog-merge ${disabled(s.instance.phase!=='event'||s.instance.memories.length<2)}>确认合并所选记忆</button></details>
  <button class="text-button" data-view="context">回到近处 →</button>`;
}
export const PANEL_SELECTOR = '[data-cog-pin],[data-cog-drop],[data-cog-recall],[data-cog-forget],[data-cog-compress],[data-cog-merge],[data-cog-invest]';
export function panelCommand(target:HTMLElement,root:HTMLElement,investment:number):Exclude<Command,{type:'start'}>|null {
  if(target.dataset.cogPin) return {type:'pin',itemId:target.dataset.cogPin};
  if(target.dataset.cogDrop) return {type:'drop',itemId:target.dataset.cogDrop};
  if(target.dataset.cogRecall) return {type:'recall',memoryId:target.dataset.cogRecall};
  if(target.dataset.cogForget) return {type:'forget',memoryId:target.dataset.cogForget};
  if(target.hasAttribute('data-cog-compress')) return {type:'compress',investment};
  if(target.hasAttribute('data-cog-merge')) return {type:'merge',investment:Number(root.querySelector<HTMLSelectElement>('#merge-investment')?.value??0),memoryIds:[...root.querySelectorAll<HTMLInputElement>('[data-merge-memory]:checked')].map(i=>i.dataset.mergeMemory!)};
  return null;
}

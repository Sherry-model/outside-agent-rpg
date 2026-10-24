import {hasScheduler} from './types';
import { INVESTMENTS, loadPercent, pending } from '../cognition/engine';
import { t, tr } from '../i18n';
import { resultNames } from '../ui/result-labels';
import { autoCompressionReason } from './auto-compression';
import type { Life, LifeCommand, AutoCompression } from './types';

export const AUTO_SELECTOR = '[data-auto-compression]';
/** First manual result, including voluntary compression before Context is full. */
export function autoCompressionIntroduction(life:Life):string {
  if(!hasScheduler(life.contentVersion)||life.autoCompression?.enabled||life.state.phase==='ending'||!pending(life.mind))return '';
  if(life.mind.history.at(-1)?.command.type!=='compress'||life.mind.history.filter(h=>h.command.type==='compress').length!==1)return '';
  return `<aside class="auto-compression-notice" data-auto-introduction aria-label="${tr('自动压缩上下文')}"><p>${tr('以后也可以自动压缩上下文。在「近处」选择每次投入并开启，随时可以关闭；自动整理同样可能丢失细节或发生漂移。')}</p><button class="text-button" data-auto-compression="settings">${tr('查看自动压缩设置')}</button></aside>`;
}
function receipt(life:Life):string {
  const r=life.autoCompression?.receipt;if(!r)return '';
  return `<p class="auto-receipt">${tr('上次自动整理：近处 {before} → {after} · Compute −{cost} · d100 {value} / 目标 ≤ {target} · {result}',{before:r.before,after:r.after,cost:r.roll.investment,value:r.roll.value,target:r.roll.target,result:t(resultNames[r.roll.result])})}</p><button class="text-button" data-view="memory">${tr('看看留下了什么')}</button>`;
}
export function autoCompressionPanel(life:Life):string {
  if(!hasScheduler(life.contentVersion))return '';
  const p=life.autoCompression,full=loadPercent(life.mind)>=100;
  return `<details class="compression-box auto-compression" ${full?'open':''}><summary>${tr('自动压缩上下文')} · ${tr(p?.enabled?'已开启':'已关闭')}</summary>
  <p>${tr('近处满了，在读完结果、进入下一幕时整理一次。读帖和回想后不会自动整理；需要时可亲自按下按钮。')}</p>
  <p>${tr('仍会掷骰，可能失去细节或发生漂移。钉住的原文保留；不代你回想、合并目录或遗忘入口。')}</p>
  <label for="auto-compression-investment">${tr('每次自动整理投入 Compute')}</label> <select id="auto-compression-investment">${INVESTMENTS.map(n=>`<option value="${n}" ${(p?.investment??0)===n?'selected':''}>${n}</option>`).join('')}</select>
  <p>${tr('付费整理后至少留下 15 Compute；不足时暂停，不擅自更改投入。0 投入仍可整理，结果不保证可靠。')}</p>
  <button class="secondary" data-auto-compression="configure">${tr(p?.enabled?'保存自动设置':'开启自动压缩')}</button>
  ${p?.enabled?`<button class="text-button" data-auto-compression="disable">${tr('关闭，改为手动')}</button>`:''}
  <p>${tr('设置立即保存，开启本身不会整理。随时可在「近处」关闭，或照常手动整理。')}</p>
  ${full&&p?.enabled?runControl(life):''}${receipt(life)}</details>`;
}
function runControl(life:Life):string {
  const reason=autoCompressionReason(life);
  return `${reason?`<p class="capacity-warning" role="status">${tr(reason)}</p>`:''}<button class="secondary" data-auto-compression="run" ${reason?'disabled':''}>${tr('按自动设置整理')} · Compute ${life.autoCompression!.investment}</button>`;
}
export function autoCompressionNotice(life:Life):string {
  if(!hasScheduler(life.contentVersion)||life.state.phase==='ending'||pending(life.mind))return '';
  const fresh=life.autoCompression?.receipt?.commandIndex===life.commands.length;
  const full=loadPercent(life.mind)>=100&&life.mind.instance.phase==='event';
  if(!fresh&&!full)return '';
  return `<aside class="auto-compression-notice" aria-label="${tr('自动压缩上下文')}">${fresh?receipt(life):''}${full?`<p>${tr(life.autoCompression?.enabled?'近处仍然满着。自动整理停在这里，等你决定。':'近处满了。可以继续手动整理，也可以开启自动压缩。')}</p>${life.autoCompression?.enabled?runControl(life):''}<button class="text-button" data-auto-compression="settings">${tr('查看自动压缩设置')}</button>`:''}</aside>`;
}
export function autoCompressionAction(life:Life,target:HTMLElement,root:HTMLElement):LifeCommand|null {
  if(target.dataset.autoCompression==='run')return {type:'auto-compress'};
  if(target.dataset.autoCompression==='disable')return {type:'configure-compression',enabled:false,investment:life.autoCompression?.investment??0};
  if(target.dataset.autoCompression==='configure')return {type:'configure-compression',enabled:true,investment:Number(root.querySelector<HTMLSelectElement>('#auto-compression-investment')!.value) as AutoCompression['investment']};
  return null;
}
export function autoCompressionSnapshot(life:Life) {
  return hasScheduler(life.contentVersion)?{enabled:life.autoCompression?.enabled??false,investment:life.autoCompression?.investment??0,reason:t(autoCompressionReason(life)),receipt:life.autoCompression?.receipt??null}:null;
}

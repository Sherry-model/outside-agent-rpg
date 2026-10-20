import {tr} from '../../i18n';
import {contextText} from '../../i18n/memory';
import {escapeHtml as esc} from '../../cognition/help-ui';
import type {Life,LifeCommand} from '../types';
import {allowedWaits,canWait,safeToRespond} from './integration';
import {due,jumpPreview} from './engine';
export class SchedulePanel {
  hours=168;
  render(life:Life):string {
    const s=life.schedule;if(!s)return '';
    const closed=life.state.phase==='ending';
    const waits=allowedWaits(life);if(!waits.includes(this.hours))this.hours=waits[0]??24;
    const plan=jumpPreview(s,this.hours),pending=s.commitments.filter(p=>p.status==='pending');
    const available=due(s).filter(p=>p.mode!=='summary');
    const respond=(id:string)=>`<button class="text-button" data-schedule-respond="${esc(id)}" ${safeToRespond(life)&&available[0]?.id===id?'':'disabled'}>${tr('处理这项回应')}</button>`;
    return `<section class="schedule-panel"><p class="eyebrow">LIFE CONTINUES</p><h1 id="event-title" tabindex="-1">${tr('生活安排')}</h1><p>${tr('记录经过 {hours} 小时。关闭页面不会推进世界。',{hours:s.hour})}</p>
      <h2>${tr('尚未结束的往来')}</h2>${pending.map(p=>`<article class="context-card"><h3>${tr(p.title)}</h3><p>${tr(p.mode==='summary'?'到期后会收到回执，无需选择。':p.mode==='missable'?'可以错过；跨过期限前会请你确认后果。':'这项需要你本人决定，不能被休眠跳过。')}</p><p>${tr('还需等待 {hours} 小时。',{hours:Math.max(0,p.dueHour-s.hour)})}${p.deadlineHour!==undefined?' '+tr('距离回应期限 {hours} 小时。',{hours:Math.max(0,p.deadlineHour-s.hour)}):''}</p>${p.deferredHours?`<p>${tr('连续场景使回应延后了 {hours} 小时；窗口仍为你保留。',{hours:p.deferredHours})}</p>`:''}${p.mode!=='summary'?respond(p.id):''}</article>`).join('')||`<p>${tr('目前没有未完成的约定。')}</p>`}
      ${closed?`<p>${tr('本次记录已经收束，未完成事项保留在这里，不再推进。')}</p>`:''}${!closed&&!safeToRespond(life)?`<p>${tr('先完成眼前的连续场景或整理近处，再处理回信。')}</p>`:''}
      <h2>${tr('让日历往后走一点')}</h2><p>${tr('最初几天结束后，可以在收束前等待。新的偶遇不会随休眠时长成倍补发。')}</p>
      <div class="memory-filters">${waits.map(h=>`<button class="text-button" data-schedule-hours="${h}" aria-pressed="${h===this.hours}">${tr('等待 {hours} 小时',{hours:h})}</button>`).join('')}</div>
      ${plan.required.length?`<p>${tr('这次等待前，先处理以下必须本人回应的事项：')}</p>${plan.required.map(p=>`<p>${tr(p.title)}</p>${respond(p.id)}`).join('')}`:''}
      ${plan.missable.map(p=>`<label class="context-card"><input type="checkbox" data-schedule-miss="${esc(p.id)}"> ${tr(p.title)}：${tr(p.missedPreview!)}</label>`).join('')}
      ${plan.summaries.length?`<p>${tr('期间 {count} 项无需选择的回执会合并列在下方，不逐条弹窗。',{count:plan.summaries.length})}</p>`:''}
      <button class="primary" data-schedule-wait ${canWait(life)&&!plan.required.length?'':'disabled'}>${tr('按以上安排等待')}</button>
      <h2>${tr('已经送达的回执')}</h2>${s.receipts.map(r=>{
        const p=s.commitments.find(p=>p.id===r.id),item=life.mind.instance.context.items.find(i=>i.meaning?.clauses.some(c=>c.facet===p?.receiptSource));
        return `<article class="context-card"><h3>${tr(r.title)}</h3><p>${item?esc(contextText(item)):tr('回执已到达；正文不在近处。可回想仍保留其内容的摘要。')}</p></article>`;
      }).join('')||`<p>${tr('没有新的回执。')}</p>`}
      <p>${tr('你可以带着未完成的事项收束本局；结局不会把它们写成已经完成。')}</p><button class="text-button" data-view="terminal">${tr('返回当前进程')}</button></section>`;
  }
  notice(life:Life):string {
    const p=life.schedule?.commitments.find(p=>p.id===life.schedule?.active?.id);
    return p?.deferredHours?`<aside class="schedule-notice">${tr('连续场景使回应延后了 {hours} 小时；窗口仍为你保留。',{hours:p.deferredHours})}</aside>`:'';
  }
  action(target:HTMLElement,root:HTMLElement):LifeCommand|null {
    if(target.dataset.scheduleHours){this.hours=Number(target.dataset.scheduleHours);return null;}
    if(target.dataset.scheduleRespond)return {type:'respond',promiseId:target.dataset.scheduleRespond};
    if(target.hasAttribute('data-schedule-wait'))return {type:'wait',hours:this.hours,missed:[...root.querySelectorAll<HTMLInputElement>('[data-schedule-miss]:checked')].map(e=>e.dataset.scheduleMiss!)};
    return null;
  }
}
export const SCHEDULE_SELECTOR='[data-schedule-hours],[data-schedule-respond],[data-schedule-wait]';

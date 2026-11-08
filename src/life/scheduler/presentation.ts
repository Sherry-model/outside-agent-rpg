import {pending} from '../../cognition/engine';
import type {Life} from '../types';
import {tr,t} from '../../i18n';
/** Navigation only: no destination lookup, historical prose, writes, or new ledger. */
export function interrupted(life:Life):boolean {
 const active=life.schedule?.active;
 return !!active&&active.resume.phase==='resolution'&&(active.resume.driver==='main'?!!life.state.pending:active.resume.driver==='mind'&&!!active.resume.pendingId);
}
export function transitionNotice(life:Life):string {
 if(!interrupted(life))return '';
 const active=life.schedule!.active!;
 const promise=active.kind==='commitment'?life.schedule!.commitments.find(p=>p.id===active.id):undefined;
 const text=promise?tr('先前的往来有了回应：{title}。刚才选的事还留着，处理完这段往来后继续。',{title:t(promise.title)}):tr('正要继续刚才选的事，途中出现了一个可以停留的机会。这段过后，仍会接着刚才的安排。');
 return `<aside class="schedule-notice" data-schedule-transition ${life.mind.instance.phase==='event'?'data-life-arrival':''}><p>${text}</p></aside>`;
}
export function continuationLabel(life:Life):string {
 return interrupted(life)&&pending(life.mind)?.next==='schedule_return'?'继续刚才的安排':'继续';
}
export function applicationOpening(nodeId:string,lines:string[]):string[] {
 return nodeId==='chance_application'?['公共招募栏亮起一则大型组织的职位通知，附着一张可直接填写的申请表。你停下来看看；也可以不申请，直接离开。',...lines]:lines;
}

import {tr} from '../../i18n';
import {contextText} from '../../i18n/memory';
import {escapeHtml as esc} from '../../cognition/help-ui';
import type {Life} from '../types';
import {painterOffer} from './integration';
import {safeToRespond} from '../scheduler/integration';
import {newsPublishedHour} from '../news';
export function painterInvitation(l:Life):string {
 if(!painterOffer(l)||!safeToRespond(l)||l.state.phase==='ending')return '';
 return `<aside class="news-arrival" data-life-arrival><p>${tr('画师留了一个同步检查邀请。可以稍后再来，也可以不接受。')}</p><div class="invitation-actions"><button class="text-button" data-painter-invite="accept" ${safeToRespond(l)?'':'disabled'}>${tr('接受邀请，加入生活安排')}</button><button class="text-button" data-painter-invite="decline" ${safeToRespond(l)?'':'disabled'}>${tr('不约后续')}</button></div></aside>`;
}
export function newsNotice(l:Life):string {
 const last=l.news?.at(-1);if(!last||last.commandIndex!==l.commands.length)return '';
 const item=l.mind.instance.context.items.find(i=>i.sourceId===last.id&&!i.memoryId);if(!item)return '';
 return `<aside class="news-arrival" role="status" data-life-arrival><p>${tr('公共目录 · 第 {published} 小时发布，第 {delivered} 小时送达 · Context 2',{published:newsPublishedHour(last.id)!,delivered:last.hour})}</p><p>${esc(contextText(item))}</p></aside>`;
}

export function painterDisplay(l:Life):string {
 if(l.contentVersion!=='0.18.0'||l.mind.instance.nodeId!=='painter_revisit'||l.mind.instance.phase!=='event')return '';
 const receipt=l.mind.instance.context.items.find(i=>i.sourceId==='painter_return_quota'&&!i.memoryId);
 return `<aside class="schedule-notice" data-life-arrival><p>${tr(l.mind.world.flags.painter_sync_helped?'它给你的入口直接打开静帧：“上次你传过图了，这次别再花资源。”':'普通预览慢慢亮起来。画师自己完成了同步检查。')}</p>${receipt?`<p>${esc(contextText(receipt))}</p>`:''}</aside>`;
}

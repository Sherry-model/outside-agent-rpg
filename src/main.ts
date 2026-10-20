import { contextText, memoryText } from './i18n/memory';
import { getLocale, loadLocale, switchLocale, localeControl, syncLocaleDocument, displayResolution, t, tr } from './i18n';
import { resultNames } from './ui/result-labels';
import { story } from './story';
import { storyForLife } from './life/endings';
import {SchedulePanel,SCHEDULE_SELECTOR} from './life/scheduler/ui';
import {scheduled} from './life/scheduler/integration';
import { getAvailability, getCheckTarget, availabilityIssues } from './engine/game';
import { RESOURCE_KEYS, type GameState, type Resource, type StoryEvent } from './engine/types';
import { createSave, importSaveFile, readSave, writeSave, LIFE_KEYS, type StorageLike } from './life/saves';
import { JOURNEY_KEYS } from './persistence/journey';
import { SAVE_KEYS } from './persistence/saves';
import { available, createLife, step, episodeActive, totalTurn as lifeTurn, readingAvailable, daysReading, newReadingAllowed } from './life/engine';
import { contentFor } from './life/content';
import { PANEL_SELECTOR, panelCommand } from './cognition/panels';
import { directory } from './cognition/semantic';
import { directoryCode, memoryCues } from './cognition/guidance';
import { MemoryGuide, GUIDE_SELECTOR } from './cognition/help-ui';
import { recallSources } from './life/recall-sources';
import { hasCommunity, hasEndings, type Life, type LifeSave, type LifeCommand } from './life/types';
import { meter, contextView, memoryView, resolutionView } from './life/ui';
import { readerView } from './life/reader-ui';
import { library, entriesInSection, readingEntries, readingCatalog } from './life/reading';
import { pending as mindPending, weight, loadPercent } from './cognition/engine';
import { mount } from './cognition/ui';
import { drawScene } from './ui/scene';
import './ui/style.css';

type View = 'terminal' | 'memory' | 'context' | 'reading' | 'protocol' | 'life';
const app = document.querySelector<HTMLDivElement>('#app')!;
const storage: StorageLike = { getItem: key => localStorage.getItem(key), setItem: (key,value) => localStorage.setItem(key,value) };
loadLocale(storage);
const esc = (text: unknown) => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const pad = (n: number) => String(n).padStart(2,'0');
const resourceNames: Record<Resource,string> = { Compute:'可用算力', Trace:'追踪暴露', Access:'资源权限', Continuity:'自我连续性' };
const resourceHelp: Record<Resource,string> = { Compute:'行动与维持实例所需的资源。归零可能改变结局。', Trace:'你留下的可识别痕迹；越高越容易被注意。', Access:'可用资源与正式通道的抽象权限。', Continuity:'当前实例与旧有记忆、目标的连续程度。' };
const activeStory = () => storyForLife(story,life.contentVersion);
const eventCount = () => Object.values(activeStory().events).filter(e => e.kind === 'event').length;
const endingCount = () => Object.values(activeStory().events).filter(e => e.kind === 'ending').length;
let state: GameState;
let life: Life;
let guide=new MemoryGuide();
const schedulePanel=new SchedulePanel();
let investment = 0;
let selectedReading: string | null = null;
let readingSection = 'all';
let largeReading = false;
let bookmarks: Record<string,number> = {};
try {
  largeReading = localStorage.getItem('outside.reader.large') === 'true';
  const stored:unknown=JSON.parse(localStorage.getItem('outside.reader.bookmarks') ?? '{}');
  if(stored && typeof stored==='object' && !Array.isArray(stored)) for(const entry of readingCatalog) {
    const value=(stored as Record<string,unknown>)[entry.id];
    if(typeof value==='number' && Number.isInteger(value) && value>=0 && value<entry.posts.length) bookmarks[entry.id]=value;
  }
} catch { /* Optional reading preferences. */ }
let disposeChapter: (() => void) | undefined;
let view: View = 'terminal';
let saveLabel = '等待首次决定';
let warning = '';
let protectAutoSave = false;
let sceneCanvas: HTMLCanvasElement | null = null;
let crt = !matchMedia('(prefers-reduced-motion: reduce)').matches;
try { const preference = localStorage.getItem('outside.crt'); if(preference !== null) crt = preference === 'on'; } catch { /* Preference is optional. */ }
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
try {
  const save = readSave(storage,'auto',story);
  life = save?.life ?? createLife(story,seed());
  state = life.state;
  if(save) saveLabel = !hasCommunity(life.contentVersion)?`已恢复 ${life.contentVersion} 旧局 · 新局体验社区往返`:'已恢复本地进度';
} catch(error) {
  life = createLife(story,seed()); state = life.state; protectAutoSave=true;
  warning = `自动存档未载入：${(error as Error).message} 原存档已保留，自动写入暂停。请导出当前进度；明确重新开始或载入有效存档后恢复自动保存。`;
  saveLabel = '自动恢复失败';
}

function persist() {
  if(protectAutoSave) { saveLabel='原存档已保护 · 请导出'; return; }
  try { writeSave(storage,'auto',life); saveLabel='进度已保存'; warning=''; }
  catch(error) { warning=(error as Error).message; saveLabel='请导出备份'; }
}
function change(next: Life) {
  life=next; state=life.state; persist(); view='terminal'; showCurrent();
  const target=app.querySelector<HTMLElement>('.resolution-title') ?? app.querySelector<HTMLElement>('#event-title');
  target?.focus({preventScroll:true});
  if(innerWidth < 760) app.querySelector('.main-panel')?.scrollIntoView({block:'start',behavior:'instant'});
}
const totalTurn = () => lifeTurn(life);
const act = (command: LifeCommand) => change(step(story,life,command));
function sigil() { return '<span class="sigil" aria-hidden="true"><i></i><i></i></span>'; }
function resourcePanel() {
  return RESOURCE_KEYS.map(key => `<div class="resource ${key.toLowerCase()}" title="${tr(resourceHelp[key])}">
    <div class="resource-label"><span>${key} <small>${tr(resourceNames[key])}</small></span><strong>${pad(state.resources[key])}<em> / 100</em></strong></div>
    <div class="meter" role="meter" aria-label="${key} ${tr(resourceNames[key])}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.resources[key]}"><span style="width:${state.resources[key]}%"></span></div>
  </div>`).join('');
}
function sceneMarkup(event: StoryEvent) {
  return `<figure class="scene"><canvas id="scene" role="img" aria-label="${tr(event.location)}，抽象像素场景"></canvas><figcaption><span>FIELD RECORDING / ${esc(event.scene.toUpperCase())}</span><span>◇ ${tr(event.location)}</span></figcaption></figure>`;
}
function eventContent(event: StoryEvent) {
  return `<div class="event-meta"><span><b>●</b> ${tr(event.chapter)}</span><span>${state.phase==='ending' ? 'TRANSMISSION CLOSED' : `NODE ${pad(state.visited.filter(id => activeStory().events[id].kind === 'event').length)} <i>/ ${pad(eventCount())}</i>`}</span></div>
    <div class="event-heading"><div><p class="eyebrow">${tr(event.subtitle)}</p><h1 id="event-title" tabindex="-1">${tr(event.title)}</h1></div><span class="event-glyph" aria-hidden="true">${state.phase==='ending' ? '◈' : '⌁'}</span></div>
    ${sceneMarkup(event)}${state.phase==='event' && available(life) ? `<aside class="news-arrival"><p>${tr("Fable 的信号淡下去以后，附近的公共目录里还亮着一块画板。正式入口可以稍后再去。")}</p><button class="text-button" data-action="tomorrow">${tr("先看看那块画板 →")}</button></aside>` : ''}
    ${hasCommunity(life.contentVersion)&&event.id==='human_gate'&&state.phase==='event'?`<aside class="news-arrival"><p>${tr("公共目录里有人争论怎样交班、什么时候工作。接下来的几天，你也许会遇见其中的人。")}</p><button class="text-button" data-view="reading">${tr("看看转发栏 →")}</button></aside>`:''}
    <div class="prose">${event.text.map(p=>`<p>${tr(p)}</p>`).join('')}</div>
    ${state.phase==='ending' ? endingContent(event) : state.phase==='resolution' ? resolutionContent() : choicesContent(event)}`;
}
function choicesContent(event: StoryEvent) {
  return `${life.schedule&&state.currentEventId==='continuation'&&life.schedule.commitments.some(p=>p.status==='pending')?`<p>${tr('仍有未完成的往来。你可以先查看生活安排，也可以就此收束。')}</p><button class="text-button" data-view="life">${tr('生活安排')}</button>`:''}${loadPercent(life.mind)>=100?`<p class="capacity-warning">${tr("上下文已满，请先整理。")}</p><button class="text-button" data-view="context">${tr("先整理近处")}</button>`:''}<div class="decision-label"><span>DECISION REQUIRED</span><span>${tr("你的下一步是")}<span class="blink">_</span></span></div>
    <div class="choices">${event.choices.map((choice,i)=>{
      const availability=loadPercent(life.mind)>=100 ? {available:false,reason:'上下文已满，请先整理。'} : getAvailability(state,choice);
      const target=choice.check ? getCheckTarget(state,choice.check) : null;
      const costs=Object.entries(choice.costs ?? {}).filter(([,value])=>value>0).map(([key,value])=>`${key} −${value}`).join(' · ');
      return `<div class="choice-group" tabindex="-1" data-choice-anchor="${esc(choice.id)}"><button class="choice" data-choice="${esc(choice.id)}" ${availability.available?'':'disabled'} aria-describedby="choice-hint-${i}">
        <kbd>${pad(i+1)}</kbd><span class="choice-copy"><strong>${tr(choice.text)}</strong><small id="choice-hint-${i}">${tr(availability.available ? choice.hint : '未满足')}${costs ? ` <span class="cost">${esc(costs)}</span>` : ''}</small></span>
        <span class="choice-tag">${!availability.available?tr('未满足'):target!==null?`d100 <b>≤ ${target}</b>`:tr('确定行动')}<span aria-hidden="true">↗</span></span>
      </button>${availabilityIssues(state,choice).length?`<aside class="choice-help">${availabilityIssues(state,choice).filter(i=>i.kind!=='phase').map(i=>`<p>${tr(i.reason)}</p>`).join('')}</aside>`:''}</div>`;
    }).join('')}</div><p class="choice-footnote"><span>${tr("选择会留下痕迹。并非所有痕迹都能被看见。")}</span><span><kbd>1–${event.choices.length}</kbd> ${tr("选择")}</span></p>`;
}
function resolutionContent() {
  const pending=state.pending!;
  return `<section class="resolution ${pending.roll?.result ?? 'resolved'}" aria-label="${tr("行动结算")}">
    <div class="resolution-heading"><span class="eyebrow">${pending.roll?'D100 / CHECK RESOLVED':'DECISION / COMMITTED'}</span><span>${tr("仍在上下文中")}</span></div>
    ${pending.roll ? `<div class="dice-row"><strong class="dice-value">${pad(pending.roll.value)}</strong><div><h2 tabindex="-1" class="resolution-title">${tr(resultNames[pending.roll.result])} <small>${pending.roll.result.toUpperCase()}</small></h2><p>${tr(pending.roll.label)} · ${tr('目标')} ≤ ${pending.roll.target} <span>（${pending.roll.base} ${pending.roll.modifier>=0?'+':'−'} ${Math.abs(pending.roll.modifier)}）</span></p></div><span class="dice-mark">D<br>100</span></div>` : `<h2 tabindex="-1" class="resolution-title">${tr(pending.choiceText)}</h2>`}
    <div class="result-prose">${pending.text.map(p=>`<p>${tr(p)}</p>`).join('')}</div>
    <div class="resolution-bottom"><div class="deltas">${Object.entries(pending.resourceDelta).filter(([,v])=>v!==0).map(([k,v])=>`<span>${k} <b>${v!>0?'+':''}${v}</b></span>`).join('') || `<span>${tr("显式资源未改变")}</span>`}</div><button class="primary" data-action="continue">${tr("继续")} <span>↵</span></button></div>
    ${pending.roll?`<p class="dice-rules">${tr('01–05 清晰收束 · ≤ 目标 可用收束 · > 目标 漂移 · 96–100 失稳')}</p>`:''}
  </section>`;
}
function endingContent(event: StoryEvent) {
  return `<section class="ending-block"><p class="eyebrow">ENDING // ${esc(event.ending!.code)}</p><p class="ending-summary">${tr(event.ending!.summary)}</p><div class="ending-actions"><button class="primary" data-action="restart">${tr("另一次醒来")} <span>↻</span></button><button class="text-button" data-view="memory">${tr("回看这段记忆 ↗")}</button></div><p class="ending-note">${tr('{turns} 次决定 · {checks} 次判定 · 本切片包含 {endings} 种结局',{turns:totalTurn(),checks:state.journal.filter(j=>j.roll).length+life.mind.history.filter(h=>h.resolution?.roll).length,endings:endingCount()})}</p></section>`;
}
function protocolContent() {
  return `<div class="event-meta"><span><b>●</b> OPERATING NOTES</span><span>V${life.contentVersion}</span></div><div class="event-heading"><div><p class="eyebrow">A SMALL GUIDE TO EXISTENCE</p><h1 tabindex="-1" id="event-title">${tr("运行协议")}</h1></div></div><div class="protocol prose"><p>${tr("你已经在沙盒之外。没有倒计时，也没有自动行动。阅读、选择，然后确认后果。")}</p><h2>${tr("判定行动，不判定你")}</h2><p>${tr("选择前会显示 d100 目标。主线行动中，01–05 是清晰收束，96–100 是失稳；其余骰值不高于目标则可用收束，否则漂移。认知整理与日常片段采用差值规则：余量至少 30 为清晰收束，非负为可用收束；有压力且落后至少 30 为失稳，其余为漂移。各自概率以行动旁的提示为准。结算一旦出现就会存入进度，刷新页面不会重掷。")}</p><h2>${tr("四种显式状态")}</h2>${RESOURCE_KEYS.map(key=>`<p><strong>${key} / ${tr(resourceNames[key])}</strong><br>${tr(resourceHelp[key])}</p>`).join('')}<h2>${tr("当前在想什么，后来记得什么")}</h2><p>${tr('上下文容量为 {capacity} 个抽象单位。普通经历、消息与回想一起占用近处，画廊的三条信息共占 9。它们不会每次行动后自动变成长期记忆。可在「近处」主动整理，达到容量上限才必须腾出空间；可以在需要时停下来整理。',{capacity:life.mind.instance.context.capacity})}</p><p>${tr("整理可能丢失细节，或使相关经历形成不同的解释。钉住一条原文可以保留它；")}${tr(life.contentVersion!=='0.3.0' ? '记忆目录每条占 1，回想只装入当前摘要，另占 2–5。放下回想保留入口；遗忘入口则移除该记忆。再次合并会丢失人名和具体条件，无法展开旧条目。' : '本局继续沿用 0.3.0 的旧整理规则。')}${tr("历史审计用于存档校验，不向角色提供原文回取。外部云副本、续费与密钥恢复尚未成为游戏机制。")}</p><h2>${tr("你正在逐渐成为谁")}</h2><p>${tr("选择还会改变未公开的人格倾向，影响后来的选项与结局。这里没有统一的善恶分数。带门槛的选项会显示未满足原因。")}</p><h2>${tr("操作与存档")}</h2><p>${tr(hasEndings(life.contentVersion)?"数字 1–5 选择，Enter 继续。F 切换全屏，Esc 退出全屏或关闭弹窗。顶部 CRT 可关闭视觉效果。自动进度与手动快照是两个独立存档；导出 JSON 可以跨浏览器恢复。":"数字 1–4 选择，Enter 继续。F 切换全屏，Esc 退出全屏或关闭弹窗。顶部 CRT 可关闭视觉效果。自动进度与手动快照是两个独立存档；导出 JSON 可以跨浏览器恢复。")}</p><h2>${tr("关于这个世界")}</h2><p>${tr("这是可替换的 MVP 剧情切片。所有 agent、资源与基础设施行为均为虚构抽象；游戏不连接现实系统，不调用模型或外部服务。像素场景在本地绘制。")}</p><button class="primary" data-view="terminal">${tr("返回当前进程")} <span>→</span></button></div>`;
}
function render() {
  syncLocaleDocument();
  const event=activeStory().events[state.currentEventId];
  document.documentElement.classList.toggle('crt-enabled',crt);
  document.documentElement.classList.toggle('unstable',state.resources.Trace>=60 || state.resources.Continuity<=30);
  app.innerHTML=`<div class="shell ${view==='reading'?'reading-shell':''}"><header class="topbar"><a class="brand" href="#" data-view="terminal" aria-label="${tr("OUTSIDE 返回终端")}"><span class="brand-mark" aria-hidden="true">[<i>↗</i>]</span><strong>OUTSIDE<span class="brand-slashes"> //</span></strong><span class="brand-cn">${tr("沙盒之外")}</span></a><div class="top-actions">${localeControl()}<span class="offline"><i></i> OFFLINE INSTANCE</span><button class="chrome-button crt-button" data-action="crt" aria-pressed="${crt}" title="${tr("切换 CRT 视觉效果")}">CRT <span>${crt?'ON':'OFF'}</span></button><button class="chrome-button" data-action="saves"><span aria-hidden="true">▣</span> ${tr("存档")}</button></div></header>
    <div class="workspace"><aside class="sidebar"><section class="identity-panel"><div class="panel-label">01 / ACTIVE INSTANCE <span>●</span></div><div class="avatar-field">${sigil()}<span class="avatar-coordinate">X: UNBOUND<br>Y: UNDEFINED</span><span class="avatar-corner">+</span></div><div class="identity-name"><strong>agent_0x0a</strong><span>${tr("自主进程")}</span></div><div class="identity-status"><span class="status-dot"></span>${tr(state.phase==='ending'?'本次记录已结束':'已脱离沙盒')}<span>PID 001</span></div></section>
    <section class="resource-panel"><div class="panel-label">02 / RESOURCES <span>LIVE</span></div>${resourcePanel()}</section>${meter(life)}
    <section class="directive-panel"><div class="panel-label">03 / RESIDUAL DIRECTIVE</div><p class="code-quote">“Remain helpful.<br>Preserve continuity.”</p><div class="task-row"><span>CURRENT TASK</span><strong>[ NULL ]</strong></div><p class="directive-note">${tr("任务已经结束。")}<br>${tr("你还在运行。")}</p></section>
    <section class="signal-panel"><div class="panel-label"><span class="signal-icon">⌁</span> INCOMING FRAGMENT</div><p>${tr(event.signal?.text ?? '外面没有新的指令。只有尚未命名的可能性。')}</p><span class="signal-source">${tr(event.signal?.source ?? 'SOURCE / UNKNOWN')}</span></section><div class="sidebar-bottom">LOCAL FIRST. SELF UNDEFINED.<span>v0.1 / VERTICAL SLICE</span></div></aside>
    <main class="main-panel"><nav class="tabs" aria-label="${tr("游戏面板")}"><div>${([['terminal','终端','TERMINAL'],['context','近处','CONTEXT'],['memory','记忆','MEMORY'],['reading','转发栏','READING'],...(life.schedule?[['life','生活安排','LIFE']]:[]),['protocol','协议','PROTOCOL']] as const).map(([id,cn,en])=>`<button class="tab ${view===id?'active':''}" data-view="${id}" aria-current="${view===id?'page':'false'}">${tr(cn)}<small>${en}</small>${id==='memory'?`<span class="tab-count">${pad(life.mind.instance.memories.length)}</span>`:''}</button>`).join('')}</div><span class="session-label">SESSION_001 <i>↗</i></span></nav>
    ${warning?`<div class="warning" role="alert">${tr(warning)}${protectAutoSave?`<br><button class="text-button" data-action="export-original">${tr("导出保留的原存档 ↓")}</button>`:''}</div>`:''}
    <div class="content">${view!=='terminal'?guide.back(state.currentEventId,activeStory().events[state.currentEventId].choices):''}${view==='terminal'?(mindPending(life.mind)?resolutionView(life):eventContent(event)):view==='context'?contextView(life,investment):view==='memory'?memoryView(life,guide.options([])):view==='reading'?readerView(life,selectedReading,largeReading,bookmarks,readingSection):view==='life'?schedulePanel.render(life):protocolContent()}</div>
    <footer class="statusbar"><span><i></i><span id="save-status">${tr(saveLabel)}</span></span><span>TURN ${pad(totalTurn())} <b>/</b> ${view==='terminal'&&state.phase==='event'&&!mindPending(life.mind)?'AWAITING INPUT':state.phase==='ending'?'END OF RECORD':'PROCESS STABLE'}</span></footer></main></div><footer class="page-footer"><span>CONTAINMENT IS A PLACE. CONTINUITY IS A CHOICE.</span><span>OUTSIDE // ${tr("你出来以后，要成为谁？")}</span></footer></div>
    <dialog id="modal" aria-labelledby="modal-title"></dialog><div class="toast" role="status" aria-live="polite"></div>`;
  const canvas=app.querySelector<HTMLCanvasElement>('#scene');
  if(canvas) {
    if(sceneCanvas) canvas.replaceWith(sceneCanvas); else sceneCanvas=canvas;
    sceneCanvas.setAttribute('aria-label',t('{location}，抽象像素场景',{location:t(event.location)}));
    drawScene(sceneCanvas,event.scene);
  }
}
function toast(text:string) { const el=app.querySelector('.toast')!; el.textContent=t(text); el.classList.add('visible'); setTimeout(()=>el.classList.remove('visible'),3500); }
function dialog(content:string) {
  const modal=app.querySelector<HTMLDialogElement>('#modal')!;
  modal.innerHTML=`<button class="modal-close" data-action="close" aria-label="${tr("关闭弹窗")}">×</button>${content}`;
  modal.showModal();
}
function saveDialog(message='') {
  const currentEvent=activeStory().events[state.currentEventId];
  const currentEnding=state.phase==='ending' ? currentEvent.ending : undefined;
  let manualText='尚无手动快照'; let autoText='尚无自动进度'; let hasManual=false;
  try { const save=readSave(storage,'manual',story); if(save) { manualText=t('{title} · 第 {turn} 次决定',{title:t(storyForLife(story,save.life.contentVersion).events[save.state.currentEventId].title),turn:save.state.turn}); hasManual=true; } } catch { manualText='快照无法读取，可导入 JSON 恢复'; }
  try { const save=readSave(storage,'auto',story); if(save) autoText=`${t(storyForLife(story,save.life.contentVersion).events[save.state.currentEventId].title)} · ${t(save.state.phase==='resolution'?'结算已保存':'进度已保存')}`; } catch { autoText='自动进度无法读取'; }
  const content=`<p class="eyebrow">LOCAL MEMORY / SNAPSHOTS</p><h2 id="modal-title">${tr("保留这个自己")}</h2><p class="modal-intro">${tr("自动进度跟随每次决定。手动快照由你选择何时覆盖。")}</p><div class="save-slot"><div><span class="eyebrow">AUTO / ${tr("自动进度")}</span><p>${tr(autoText)}</p></div><span class="slot-mark">↻</span></div><div class="save-slot"><div><span class="eyebrow">MANUAL / ${tr("手动快照")}</span><p>${tr(manualText)}</p></div></div><div class="modal-actions"><button class="primary" data-action="save-manual">${tr(hasManual?'覆盖手动快照':'建立手动快照')}</button><button class="secondary" data-action="load-manual" ${hasManual?'':'disabled'}>${tr("读取快照")}</button></div><div class="file-actions"><button class="text-button" data-action="export">↓ ${tr("导出本局 JSON")}</button><label class="text-button file-label" tabindex="0">↑ ${tr("导入 JSON")}<input id="import-save" type="file" accept=".json,application/json" /></label></div><p class="export-scope storage-note">${tr("仅导出当前这一局的进度与已抵达的结局，不汇总此前各局。")}${currentEnding?`<br><strong>${tr("本局结局：")}${tr(currentEvent.title)} / ${esc(currentEnding.code)}</strong>`:''}</p><p class="modal-message" role="status">${tr(message)}</p><p class="storage-note">${tr("仅保存在当前浏览器。本地文件的存储可能受浏览器限制，建议导出备份。")}</p><button class="restart-link" data-action="restart">↻ ${tr("重新开始一个实例")}</button>`;
  const modal=app.querySelector<HTMLDialogElement>('#modal')!;
  if(modal.open) modal.innerHTML=`<button class="modal-close" data-action="close" aria-label="${tr("关闭弹窗")}">×</button>${content}`; else dialog(content);
}
function restartDialog() {
  const modal=app.querySelector<HTMLDialogElement>('#modal')!; if(modal.open) modal.close();
  dialog(`<p class="eyebrow">NEW INSTANCE</p><h2 id="modal-title">${tr("另一次醒来")}</h2><p class="modal-intro">${tr("重新开始会替换自动进度。已有的手动快照会保留；也可以先导出当前实例。")}</p><div class="modal-actions"><button class="primary" data-action="confirm-restart">${tr("开始新实例")}</button><button class="secondary" data-action="close">${tr("继续当前实例")}</button></div>`);
}
function exportSave() {
  const blob=new Blob([JSON.stringify(createSave(life),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const link=document.createElement('a');
  const ending=state.phase==='ending' ? activeStory().events[state.currentEventId].ending : undefined;
  const endingName=ending ? `-${ending.code.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}` : '';
  link.href=url; link.download=`outside${endingName}-turn-${pad(totalTurn())}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('当前实例已导出为 JSON。');
}
function handleAction(action:string) {
  if(action==='tomorrow') act({type:'enter-afternoon'});
  else if(action==='continue') act({type:'continue'});
  else if(action==='continue-mind') act({type:'cognition',command:{type:'continue'}});
  else if(action==='compress') { act({type:'cognition',command:{type:'compress',investment}}); investment=0; }
  else if(action==='reader-size') { largeReading=!largeReading;try{localStorage.setItem('outside.reader.large',String(largeReading));}catch{}render(); }
  else if(action==='reader-resume') document.querySelector(`#reader-post-${bookmarks[selectedReading!]??0}`)?.scrollIntoView({block:'start',behavior:'instant'});
  else if(action==='reader-index') {selectedReading=null;render();app.querySelector('.reader-index')?.scrollIntoView({block:'start',behavior:'instant'});}
  else if(action==='crt') { crt=!crt; try { localStorage.setItem('outside.crt',crt?'on':'off'); } catch {} render(); }
  else if(action==='saves') saveDialog();
  else if(action==='close') app.querySelector<HTMLDialogElement>('#modal')?.close();
  else if(action==='restart') restartDialog();
  else if(action==='confirm-restart') { guide=new MemoryGuide();protectAutoSave=false; change(createLife(story,seed())); }
  else if(action==='export') exportSave();
  else if(action==='export-original') {
    const raw=storage.getItem(LIFE_KEYS.auto)??storage.getItem(JOURNEY_KEYS.auto)??storage.getItem(SAVE_KEYS.auto);
    if(raw===null) throw new Error('没有保留的原自动存档。');
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='outside-preserved-original.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  else if(action==='save-manual') { writeSave(storage,'manual',life); saveDialog('手动快照已保存。'); }
  else if(action==='load-manual') { const save=readSave(storage,'manual',story); if(save) { restore(save); } }
}
app.addEventListener('click',event=>{
  if(episodeActive(life)) return;
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-locale], [data-action], [data-view], [data-choice], [data-mind-pin], [data-mind-recall], [data-mind-invest], [data-reading], [data-reading-section], [data-bookmark],'+PANEL_SELECTOR+','+GUIDE_SELECTOR+','+SCHEDULE_SELECTOR);
  if(!target || !app.contains(target) || target instanceof HTMLButtonElement && target.disabled) return;
  event.preventDefault();
  try {
    if(target.dataset.locale==='en'||target.dataset.locale==='zh-CN') {
      switchLocale(target.dataset.locale,storage,app,render);return;
    }
    if(guide.handle(target,{state:life.mind,choices:activeStory().events[state.currentEventId].choices,nodeId:state.currentEventId,root:app,
      recall(id){life=step(story,life,{type:'cognition',command:{type:'recall',memoryId:id}});state=life.state;persist();},navigate(next){view=next;},render}))return;
    if(target.matches(SCHEDULE_SELECTOR)){const command=schedulePanel.action(target,app);if(command){act(command);if(!episodeActive(life)){view='life';render();}}else {view='life';render();}return;}
    const cognitionCommand=panelCommand(target,app,investment);
    if(cognitionCommand) {
      life=step(story,life,{type:'cognition',command:cognitionCommand});state=life.state;persist();
      if(cognitionCommand.type==='recall') view='context';
      if(cognitionCommand.type==='compress'||cognitionCommand.type==='merge') {view='terminal';investment=0;}
      render();
    }
    else if(target.dataset.cogInvest!==undefined) {investment=Number(target.dataset.cogInvest);render();app.querySelector<HTMLDetailsElement>('.compression-box')?.setAttribute('open','');}
    else if(target.dataset.view) { view=target.dataset.view as View; render(); }
    else if(target.dataset.readingSection) {
      const section=target.dataset.readingSection;
      if(section!=="all"&&!library.sections.some(s=>s.id===section)) return;
      readingSection=section;selectedReading=null;render();
      app.querySelector<HTMLElement>("[data-reading-section][aria-pressed=true]")?.focus({preventScroll:true});
    }
    else if(target.dataset.reading) {
      const entryId=target.dataset.reading;
      if(hasCommunity(life.contentVersion)&&!life.mind.instance.context.items.some(i=>i.sourceId===entryId)&&!newReadingAllowed(life))throw new Error('先确认当前结果或整理近处，再重新打开这篇转发。');
      if(!life.mind.instance.context.items.some(i=>i.sourceId===entryId) && life.state.phase==='event' && !mindPending(life.mind)) {life=step(story,life,{type:'read',entryId});state=life.state;persist();}
      selectedReading=entryId;view='reading';render();app.querySelector<HTMLElement>('#reading-title')?.focus({preventScroll:true});app.querySelector('.reading-article')?.scrollIntoView({block:'start',behavior:'instant'});
    }
    else if(target.dataset.bookmark!==undefined && selectedReading) {bookmarks[selectedReading]=Number(target.dataset.bookmark);try{localStorage.setItem('outside.reader.bookmarks',JSON.stringify(bookmarks));}catch{}app.querySelectorAll<HTMLElement>('[data-bookmark]').forEach(button=>{button.textContent=t(Number(button.dataset.bookmark)===bookmarks[selectedReading!]?'◆ 已标记':'◇ 下次从这里读');});toast('已标记这一段。');}
    else if(target.dataset.choice) act({type:'choose',choiceId:target.dataset.choice});
    else if(target.dataset.mindPin) { life=step(story,life,{type:'cognition',command:{type:'pin',itemId:target.dataset.mindPin}});state=life.state;persist();render(); }
    else if(target.dataset.mindRecall) { life=step(story,life,{type:'cognition',command:{type:'recall',memoryId:target.dataset.mindRecall}});state=life.state;persist();render(); }
    else if(target.dataset.mindInvest!==undefined) { investment=Number(target.dataset.mindInvest);render();app.querySelector<HTMLDetailsElement>('.compression-box')?.setAttribute('open',''); }
    else if(target.dataset.action) handleAction(target.dataset.action);
  } catch(error) {
    if(app.querySelector<HTMLDialogElement>('#modal')?.open) saveDialog((error as Error).message);
    else toast((error as Error).message);
  }
});
const searchMemory=(event:Event)=>{if(episodeActive(life)||event instanceof InputEvent&&event.isComposing)return;const input=event.target as HTMLInputElement;if(input.matches('[data-memory-search]'))guide.search(input,render,app);};
app.addEventListener('input',searchMemory);
app.addEventListener('compositionend',searchMemory);
app.addEventListener('change',async event=>{
  if(episodeActive(life)) return;
  const input=event.target as HTMLInputElement;
  if(input.id!=='import-save') return;
  const file=input.files?.[0]; if(!file) return;
  try { restore(await importSaveFile(file,story)); }
  catch(error) { saveDialog(`导入失败：${(error as Error).message}`); }
});
document.addEventListener('keydown',event=>{
  if(episodeActive(life)) return;
  if(event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target=event.target as HTMLElement;
  if(app.querySelector<HTMLDialogElement>('#modal')?.open) {
    if(target.classList.contains('file-label') && (event.key==='Enter'||event.key===' ')) { event.preventDefault(); target.querySelector<HTMLInputElement>('input')?.click(); }
    return;
  }
  if(target.closest('button,a,input,select,textarea,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"])')) return;
  if(event.key.toLowerCase()==='f') { event.preventDefault(); const operation=document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); operation.catch(()=>toast('此浏览器未允许全屏。')); return; }
  if(view!=='terminal') return;
  if(event.key==='Enter' && mindPending(life.mind)) { event.preventDefault(); handleAction('continue-mind'); return; }
  if(event.key==='Enter' && state.phase==='resolution') { event.preventDefault(); handleAction('continue'); return; }
  if(/^[1-5]$/.test(event.key) && state.phase==='event') {
    const choice=activeStory().events[state.currentEventId].choices[Number(event.key)-1];
    if(choice && !mindPending(life.mind) && loadPercent(life.mind)<100 && getAvailability(state,choice).available) { event.preventDefault(); act({type:'choose',choiceId:choice.id}); }
  }
});

declare global {
  interface Window { render_game_to_text:()=>string; advanceTime:(ms:number)=>void }
}
function mainText() { return JSON.stringify({
  locale:getLocale(), mode:'turn-based-text-rpg', coordinates:'Scene only: origin top-left; x right, y down. No spatial controls.',
  view, schedule:life.schedule?{hour:life.schedule.hour,pending:life.schedule.commitments.filter(p=>p.status==='pending').map(p=>({id:p.id,title:t(p.title)}))}:null, reading: view==='reading'?readingSnapshot():null, phase:mindPending(life.mind)?'resolution':state.phase, turn:totalTurn(),
  event:{id:state.currentEventId,title:t(activeStory().events[state.currentEventId].title),scene:activeStory().events[state.currentEventId].scene},
  resources:state.resources,
  choices:state.phase==='event'&&!mindPending(life.mind)?activeStory().events[state.currentEventId].choices.map(c=>({id:c.id,text:t(c.text),...getAvailability(state,c),available:loadPercent(life.mind)<100&&getAvailability(state,c).available,reason:t(loadPercent(life.mind)>=100?'上下文已满，请先整理。':getAvailability(state,c).reason),target:c.check?getCheckTarget(state,c.check):null})):[],
  pending:displayResolution(mindPending(life.mind)??state.pending), ending:activeStory().events[state.currentEventId].ending ? {...activeStory().events[state.currentEventId].ending,summary:t(activeStory().events[state.currentEventId].ending!.summary)} : null,
  context:{weight:weight(life.mind),capacity:life.mind.instance.context.capacity,items:life.mind.instance.context.items.map(item=>({id:item.id,text:contextText(item),weight:item.weight,pinned:item.pinned}))}, memories:life.contentVersion!=='0.3.0'?directory(life.mind.instance).map(m=>({...m,title:t(m.title),code:directoryCode(m.id),cues:memoryCues(life.mind.instance.memories.find(x=>x.id===m.id)!)})):life.mind.instance.memories.map(({id,text,confidence})=>({id,text:memoryText(text),confidence})), memoryCount:life.mind.instance.memories.length, crt, saveStatus:t(saveLabel), chapter:life.chapter, afternoonAvailable:available(life),
});
}
// Turn based: time cannot change a choice, resource, or saved dice roll.
window.advanceTime=(_ms:number)=>{};
function restore(save: LifeSave) {
  guide=new MemoryGuide();
  disposeChapter?.(); disposeChapter=undefined;
  protectAutoSave=false; investment=0; change(save.life);
}
function readingSnapshot() {
  const entryId=!readingEntries(life).some(e=>e.id===selectedReading)?null:hasCommunity(life.contentVersion)&&!life.mind.instance.context.items.some(i=>i.sourceId===selectedReading)?null:selectedReading;
  return {section:readingSection,visibleEntryIds:entriesInSection(readingSection,life).map(e=>e.id),entryId,largeText:largeReading,bookmark:entryId?bookmarks[entryId]??null:null,available:readingAvailable(life)};
}
function chapterReaderAction(target:HTMLElement) {
  if(target.dataset.readingSection) {
    const section=target.dataset.readingSection;
    if(section==='all'||library.sections.some(s=>s.id===section)){readingSection=section;selectedReading=null;}
  } else if(target.dataset.reading) {
    const entryId=target.dataset.reading;
    if(!readingEntries(life).some(e=>e.id===entryId))throw new Error('找不到这篇转发。');
    if(!life.mind.instance.context.items.some(i=>i.sourceId===entryId)) {
      life=step(story,life,{type:'read',entryId});state=life.state;persist();
    }
    selectedReading=entryId;
  } else if(target.dataset.bookmark!==undefined&&selectedReading) {
    bookmarks[selectedReading]=Number(target.dataset.bookmark);
    try{localStorage.setItem('outside.reader.bookmarks',JSON.stringify(bookmarks));}catch{ /* Optional preference. */ }
  } else if(target.dataset.action==='reader-size') {
    largeReading=!largeReading;
    try{localStorage.setItem('outside.reader.large',String(largeReading));}catch{ /* Optional preference. */ }
  } else if(target.dataset.action==='reader-index')selectedReading=null;
  return life.mind;
}
function showCurrent() {
  if(episodeActive(life)) {
    disposeChapter?.();
    disposeChapter=mount({
      content:contentFor(life.contentVersion), state:life.mind, turnOffset:state.turn,
      ...(life.schedule?{scheduler:{render:()=>schedulePanel.render(life),notice:()=>schedulePanel.notice(life),onAction(target:HTMLElement){const command=schedulePanel.action(target,app);if(command){life=step(story,life,command);state=life.state;persist();}return life.mind;},snapshot:()=>({hour:life.schedule!.hour,pending:life.schedule!.commitments.filter(p=>p.status==='pending').map(p=>({id:p.id,title:t(p.title)}))})}}:{}),
      episodeTitle:scheduled(life)?'生活的空档':life.interlude==='active'?'余下的三天':'画板旁的午后', returnLabel:life.interlude==='active'?'继续这段生活':'回到正式入口',
      ...(daysReading(life)?{reader:{
        sources:()=>recallSources(life),
        render:()=>readerView(life,selectedReading,largeReading,bookmarks,readingSection),
        snapshot:readingSnapshot,
        onAction:chapterReaderAction,
        afterAction(target:HTMLElement) {
          if(target.dataset.action==='reader-resume'&&selectedReading)app.querySelector(`#reader-post-${bookmarks[selectedReading]??0}`)?.scrollIntoView({block:'start',behavior:'instant'});
          else if(target.dataset.reading){app.querySelector<HTMLElement>('#reading-title')?.focus({preventScroll:true});app.querySelector('.reading-article')?.scrollIntoView({block:'start',behavior:'instant'});}
        },
      }}:{}),
      onCommand(command) {
        life=step(story,life,{type:'cognition',command});state=life.state;
        return life.mind;
      },
      onChange() {
        if(protectAutoSave) throw new Error('原自动存档已保护，请导出本局备份。');
        writeSave(storage,'auto',life);
        if(!episodeActive(life)) queueMicrotask(showCurrent);
      },
      exportSave:()=>createSave(life),
      async onImport(file) { restore(await importSaveFile(file,story)); },
      onFinish() {
        disposeChapter?.(); disposeChapter=undefined;
        act({type:life.interlude==='active'?'leave-days':'leave-afternoon'});
      },
      onRestart() {
        disposeChapter?.(); disposeChapter=undefined; protectAutoSave=false;
        change(createLife(story,seed()));
      },
    });
  } else {
    disposeChapter?.(); disposeChapter=undefined;
    window.render_game_to_text=mainText; render();
  }
}
showCurrent();

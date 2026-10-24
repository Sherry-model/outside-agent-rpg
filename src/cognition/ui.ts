import { AUTO_SELECTOR } from '../life/auto-compression-ui';
import {SCHEDULE_SELECTOR} from '../life/scheduler/ui';
import { contextText, memoryText } from '../i18n/memory';
import { getLocale, switchLocale, localeControl, syncLocaleDocument, displayResolution, t, tr } from '../i18n';
import { resultNames } from '../ui/result-labels';
import { nearPanel, directoryPanel, panelCommand, PANEL_SELECTOR } from './panels';
import { directory } from './semantic';
import { directoryCode, memoryCues } from './guidance';
import { MemoryGuide, GUIDE_SELECTOR, choiceHelp, type PublicRecallSource } from './help-ui';
import { choiceBlockers } from './availability';
import { content as latestContent, contentVersions } from '../story-tomorrow';
import { RESOURCE_KEYS } from '../engine/types';
import { canCompress, create, currentNode, INVESTMENTS, pending, pressureBand, preview, reduce, weight, loadPercent } from './engine';
import { createSave, parseVersionedSave, SAVE_KEY } from './saves';
import type { CheckSpec, Command, State, Content } from './types';
import { drawScene } from '../ui/scene';
import '../ui/style.css';
import './ui.css';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const confidenceNames = { UNKNOWN: '未确定', LOW: '较低', MEDIUM: '暂信', HIGH: '确信' };
const bandNames = { NORMAL: '还有余地', ELEVATED: '渐渐拥挤', HIGH: '难以并置', CRITICAL: '需要整理' };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;

interface Host {
  automation?:{introduction():string;panel():string;notice():string;onAction(target:HTMLElement,root:HTMLElement):State;snapshot():unknown};
  content: Content; state: State; turnOffset: number; episodeTitle?: string; returnLabel?: string;
  reader?: {sources?():PublicRecallSource[]; render():string; onAction(target:HTMLElement):State; afterAction?(target:HTMLElement):void; snapshot():unknown};
  scheduler?:{render():string;notice():string;onAction(target:HTMLElement):State;snapshot():unknown};
  onCommand?(command: Exclude<Command,{type:'start'}>): State;
  onChange(state: State): void; exportSave(): unknown; onImport(file: File): Promise<void>;
  onFinish(): void; onRestart(): void;
}
export function mount(host?: Host) {
  const controller = new AbortController();
  const app = document.querySelector<HTMLDivElement>('#app')!;
  let content = host?.content ?? contentVersions.find(c => c.version === '0.2.1') ?? latestContent;
  let state: State = host?.state ?? create(content, seed());
  let view: 'terminal' | 'context' | 'memory' | 'protocol' | 'reading' | 'life' = 'terminal';
  const guide=new MemoryGuide();
  let investment = 0, warning = '', status = '等待你的决定', protect = false;
  let crt = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let canvas: HTMLCanvasElement | null = null;
  try { const saved = localStorage.getItem('outside.crt'); if (saved !== null) crt = saved === 'on'; } catch { /* Optional preference. */ }
  try {
    const raw = host ? null : localStorage.getItem(SAVE_KEY);
    if (raw !== null) { const loaded = parseVersionedSave(raw, contentVersions); content = loaded.content; state = loaded.save.state; status = '已恢复这个午后'; }
  } catch (error) {
    protect = true; warning = `自动存档未载入：${(error as Error).message} 原文件已保留，自动写入暂停。可导出当前进度，或载入有效文件后继续保存。`;
  }
  function persist() {
    if (protect) { status = '原存档已保护'; return; }
    try { if(host) host.onChange(state); else localStorage.setItem(SAVE_KEY, JSON.stringify(createSave(state))); status = '本地进度已保存'; warning = ''; }
    catch { status = '请导出备份'; warning = '浏览器无法保存。当前进度仍在本页，请导出 JSON。'; }
  }
  function act(command: Exclude<Command, { type: 'start' }>) {
    state = host?.onCommand ? host.onCommand(command) : reduce(content, state, command); persist();
    if (command.type === 'recall' && content.semantic) view = 'context';
    if (!['pin','recall','drop','forget'].includes(command.type)) { view = 'terminal'; investment = 0; }
    render();
    app.querySelector<HTMLElement>('.resolution-title, #event-title')?.focus({ preventScroll: true });
  }
  function resources() {
    return RESOURCE_KEYS.map(k => `<div class="resource ${k.toLowerCase()}"><div class="resource-label"><span>${k}</span><strong>${state.instance.resources[k]}<em> / 100</em></strong></div><div class="meter" role="meter" aria-label="${k}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.instance.resources[k]}"><span style="width:${state.instance.resources[k]}%"></span></div></div>`).join('');
  }
  function investmentControls() {
    return `<fieldset class="investment"><legend>${tr("为下一次判定投入 Compute")}</legend>${INVESTMENTS.map(n => `<button type="button" data-invest="${n}" aria-pressed="${investment === n}" ${n > state.instance.resources.Compute ? 'disabled' : ''}>${tr(n === 0 ? '不额外投入' : `+${n}`)}</button>`).join('')}<p>${tr("投入越多，改善越缓；只有确认行动后才付出。")}</p></fieldset>`;
  }
  function checkInfo(spec: CheckSpec) {
    const p = preview(state, spec, investment);
    return `<div class="check-preview"><p>${tr('目标 ≤ {target} · 基础 {base} + 投入 {bonus} + 线索 {support} − 压力 {pressure}',{target:p.target,base:p.base,bonus:p.bonus,support:p.support,pressure:p.pressure})}</p><p>${Object.entries(p.odds).map(([k, n]) => `${tr(resultNames[k as keyof typeof resultNames])} ${n}%`).join(' · ')}</p></div>`;
  }
  function contextItems() {
    return state.instance.context.items.map(item => `<article class="context-card"><div class="card-meta"><span>${tr(item.sourceLabel)}</span><span>${item.weight} / ${tr('置信')} ${tr(confidenceNames[item.confidence])}</span></div><p>${esc(contextText(item))}</p><button class="text-button" data-pin="${esc(item.id)}" aria-pressed="${item.pinned}" ${state.instance.phase !== 'event' ? 'disabled' : ''}>${tr(item.pinned ? '◆ 解除钉住' : '◇ 钉住这条原文')}</button></article>`).join('') || `<p class="section-intro">${tr("近处空了下来。折好的内容收在「记忆」里。")}</p>`;
  }
  function terminal() {
    const node = currentNode(content, state), result = pending(state);
    const full = loadPercent(state) >= 100;
    const newsIds = new Set(node.receive ?? []);
    const currentNews = state.instance.context.items.filter(i => newsIds.has(i.id));
    let controls = '';
    if (result) {
      controls = `<section class="resolution ${result.roll?.result ?? ''}"><p class="eyebrow">${tr("已发生 / 结果已保存")}</p><h2 class="resolution-title" tabindex="-1">${tr(result.title)}</h2>${result.roll ? `<div class="dice-row"><strong class="dice-value">${result.roll.value}</strong><div>${tr(resultNames[result.roll.result])}<p>${tr("目标 ≤")} ${result.roll.target} · ${tr('余量')} ${result.roll.margin}<br>${tr("Compute 投入")} ${result.roll.investment}</p></div></div>` : ''}<div class="result-prose">${result.text.map(t => `<p>${tr(t)}</p>`).join('')}</div>${host?.automation?.introduction()??''}<button class="primary" data-act="continue">${tr("继续")} ↵</button></section>`;
    } else if (state.instance.phase === 'ending') {
      controls = `<section class="ending-block"><p class="eyebrow">${tr("这一段经历暂时结束")}</p><p class="ending-summary">${tr(node.title)}</p><button class="primary" data-view="memory">${tr("看看留下了什么")}</button> ${host ? `<button class="primary" data-act="return-main">${tr(host.returnLabel ?? '回到正式入口')} →</button>` : `<button class="text-button" data-act="restart">${tr("另一个午后 ↻")}</button>`}</section>`;
    } else {
      const compressible = !canCompress(state,content);
      const needsInvestment = node.choices.some(c => c.check);
      controls = `${needsInvestment ? investmentControls() : ''}${compressible ? `<details class="compression-box" data-manual-compression ${full?'open':''}><summary>${tr("把一些东西折起来（可选）")}</summary><p>${tr("钉住的原文留在眼前。其余内容按来源形成摘要，之后可以主动回想。")}</p>${investmentControls()}${checkInfo(content.compression.check)}<button class="primary" data-act="compress">${tr('整理上下文')} · Compute ${investment}</button></details>` : ''}${full ? `<p class="capacity-warning" role="status">${tr("上下文已满。先整理，才能继续当前事件。")}</p><button class="text-button" data-view="context">${tr("先整理近处")}</button>` : ''}<div class="choices">${node.choices.map((c, index) => {
        const reason = choiceBlockers(content,state,c.id,c.check?investment:0)[0]?.reason;
        return `<div class="choice-group" tabindex="-1" data-choice-anchor="${esc(c.id)}"><button class="choice" data-pilot-choice="${c.id}" ${reason ? 'disabled' : ''}><kbd>${index + 1}</kbd><span class="choice-copy"><strong>${tr(c.text)}</strong><small>${tr(reason?'未满足':c.hint)}</small></span></button>${choiceHelp(content,state,c,investment,guide,host?.reader?.sources?.()??[])}${c.check && !reason ? checkInfo(c.check) : ''}</div>`;
      }).join('')}</div>`;
    }
    return `<div class="event-meta"><span>${tr(node.period ?? '一个普通的午后')}</span><span>${tr(host?.episodeTitle ?? '历史独立片段')}</span></div><div class="event-heading"><div><p class="eyebrow">SOME THINGS CAN WAIT</p><h1 id="event-title" tabindex="-1">${tr(node.title)}</h1></div></div><figure class="scene"><canvas id="scene" aria-label="${tr('当前场景的抽象像素画面')}" role="img"></canvas><figcaption>FIELD RECORDING / OUTSIDE</figcaption></figure><div class="prose">${node.text.map(t => `<p>${tr(t)}</p>`).join('')}</div>${currentNews.map(item => `<aside class="news-arrival"><p class="eyebrow">${tr("自行到来的消息 /")} ${tr(item.sourceLabel)}</p><p>${esc(contextText(item))}</p></aside>`).join('')}${controls}`;
  }
  function memories() {
    if(content.semantic) return directoryPanel(state,guide.options(state.instance.phase==='event'?currentNode(content,state).choices:[]));
    return `<p class="eyebrow">WHAT YOU CARRY</p><div class="event-heading"><h1 id="event-title" tabindex="-1">${tr("留下的东西")}</h1></div><p class="section-intro">${tr("这是你整理后的记忆。回想才会重新占用上下文；确信程度不保证它准确。")}</p>${state.instance.memories.map(m => {
      const recalled = state.instance.context.items.some(i => i.id === `recall-${m.id}`);
      return `<article class="context-card"><p class="card-meta">${tr("目录")} ${esc(directoryCode(m.id))}</p><p>${esc(memoryText(m.text))}</p><div class="card-meta"><span>${tr("自己的整理 / 置信")} ${tr(confidenceNames[m.confidence])}</span><span>${tr('{count} 条来源',{count:m.sourceContextIds.length})}</span></div><button class="text-button" data-recall="${m.id}" ${recalled || state.instance.phase !== 'event' || loadPercent(state) >= 100 ? 'disabled' : ''}>${recalled ? tr('已在上下文中') : tr('回想这条 · 占用 {weight}',{weight:content.cognition?.recallWeight ?? 8})}</button></article>`;
    }).join('') || `<p class="empty-state">${tr("还没有折起来的记忆。原话暂时都在上下文里。")}</p>`}<button class="text-button" data-view="terminal">${tr("回到这个午后 →")}</button>`;
  }
  function protocol() {
    return `<p class="eyebrow">OPERATING NOTES</p><div class="event-heading"><h1 id="event-title" tabindex="-1">${tr("怎样带到明天")}</h1></div><div class="prose"><p>${tr('消息会自行到来。上下文达到 {capacity} 时，先整理再行动。',{capacity:state.instance.context.capacity})}${tr(content.cognition ? '有两条未钉住的信息时就可以主动整理；容量宽裕，不必现在做。' : '达到 60 后也可以提前整理。')}${tr("能钉住一条原文，它仍占空间。")}</p><p>${tr(content.semantic ? '记忆目录每条占 1。回想再装入摘要；放下回想会保留入口，不再保留入口则使它退出普通认知。目录合并会丢失人名和具体条件，无法展开旧条目。' : '记忆放在别处，回想再加载摘要。')}</p><p>${tr("四档判定随 Compute、线索和压力而变。余量至少 30 是清晰收束；达到目标是可用收束；落后至少 30 且处在压力下才是失稳，其余为漂移。平静时，99 也可能只是漂移。具体概率显示在行动旁。")}</p><p>${tr("数字键选择，Enter 确认结果，F 全屏，Esc 退出全屏或关闭弹窗。")}</p><p>${tr("这里的 JSON 是设备备份，完整恢复本局经历；世界内的 Snapshot、Prune 和稀有额外存档位尚未开放。各段经历按时间接续，结束后继续本局。")}</p></div><details class="debug"><summary>${tr("开发检查 / 含隐藏信息与剧情剧透")}</summary><p>${tr("世界事实、倾向、真实历史、来源与记忆误差，仅供检查。")}</p><button class="secondary" data-act="debug">${tr("显示当前内部状态")}</button><pre id="debug-state"></pre></details>`;
  }
  function render() {
    syncLocaleDocument();
    document.documentElement.classList.toggle('crt-enabled', crt);
    app.innerHTML = `<div class="shell cognition ${view==='reading'?'reading-shell':''}"><header class="topbar"><a class="brand" href="#" data-act="legacy"><strong>OUTSIDE //</strong><span class="brand-cn">${tr("沙盒之外")}</span></a><div class="top-actions">${localeControl()}${host ? '' : `<button class="chrome-button" data-act="legacy">${tr("返回主线")}</button>`}<button class="chrome-button" data-act="crt" aria-pressed="${crt}">CRT ${crt ? 'ON' : 'OFF'}</button><button class="chrome-button" data-act="saves">${tr("备份")}</button></div></header><div class="workspace"><aside class="sidebar"><section class="identity-panel"><div class="panel-label">${tr("一个未结束的实例")}</div><div class="avatar-field"><span class="sigil"><i></i><i></i></span></div><p class="identity-name">agent_0x0a / ${tr(host?.episodeTitle ?? '午后')}</p></section><section class="resource-panel">${resources()}</section><section class="context-panel"><div class="panel-label">${tr("上下文")} <span>${weight(state)} / ${state.instance.context.capacity} · ${tr(bandNames[pressureBand(state)])}</span></div><div class="context-meter"><span style="width:${Math.min(100, loadPercent(state))}%"></span></div><details class="context-details"><summary>${tr('展开近处的 {count} 条信息',{count:state.instance.context.items.length})}</summary>${contextItems()}</details></section></aside><main class="main-panel"><nav class="tabs" aria-label="${tr("游戏面板")}"><div>${([['terminal', '终端'], ['context','近处'], ['memory', '记忆'], ...(host?.reader ? [['reading','转发栏']] : []), ...(host?.scheduler?[['life','生活安排']]:[]), ['protocol', '协议']] as const).map(([id, label]) => `<button class="tab ${view === id ? 'active' : ''}" data-view="${id}" aria-current="${view === id ? 'page' : 'false'}">${tr(label)}</button>`).join('')}</div></nav>${warning ? `<p class="warning" role="alert">${tr(warning)}</p>` : ''}<div class="content">${view==='terminal'?(host?.automation?.notice()??''):''}${view==='terminal'?(host?.scheduler?.notice()??''):''}${view!=='terminal'?guide.back(state.instance.nodeId,currentNode(content,state).choices):''}${view==='life'&&host?.scheduler?host.scheduler.render():view === 'reading' && host?.reader ? host.reader.render() : view === 'terminal' ? terminal() : view === 'memory' ? memories() : view === 'context' ? (host?.automation?.panel()??'')+(content.semantic ? nearPanel(state,content,investment) : contextItems()) : protocol()}</div><footer class="statusbar"><span>${tr(status)}</span><span>TURN ${(host?.turnOffset ?? 0)+state.instance.turn} / OFFLINE</span></footer></main></div><footer class="page-footer">OUTSIDE // ${tr("未理解完，也可以先留下。")}</footer></div><dialog id="pilot-modal" aria-labelledby="modal-title"></dialog><div class="toast" role="status" aria-live="polite"></div>`;
    const nextCanvas = app.querySelector<HTMLCanvasElement>('#scene');
    if (nextCanvas) { if (canvas) nextCanvas.replaceWith(canvas); else canvas = nextCanvas; canvas.setAttribute('aria-label',t('当前场景的抽象像素画面')); drawScene(canvas, currentNode(content, state).scene ?? 'horizon'); }
  }
  function message(text: string) {
    const el = app.querySelector<HTMLElement>('.toast')!; el.textContent = t(text); el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 4000);
  }
  function dialog(html: string) {
    const modal = app.querySelector<HTMLDialogElement>('#pilot-modal')!;
    modal.innerHTML = `<button class="modal-close" data-act="close" aria-label="${tr("关闭")}">×</button>${html}`;
    if (!modal.open) modal.showModal();
  }
  function saves(error = '') {
    dialog(`<h2 id="modal-title">${tr("保留这段经历")}</h2><p class="modal-intro">${tr("自动进度跟随每次决定。")}${tr(host ? '备份包含主线、这段经历与此前的所有本局记录。' : '备份包含这个历史片段的记录。')}</p><p>${tr("当前：")}${tr(currentNode(content, state).title)}</p><div class="file-actions"><button class="text-button" data-act="export">↓ ${tr('导出{scope} JSON',{scope:t(host ? '本局' : '片段')})}</button><label class="text-button file-label" tabindex="0">↑ ${tr('导入{scope} JSON',{scope:t(host ? '本局' : '片段')})}<input id="pilot-import" type="file" accept=".json,application/json"></label></div><p class="modal-message" role="status">${tr(error)}</p><p class="storage-note">${tr(host ? '可以导入本局完整备份或原版存档；导入将恢复该文件记录的位置。' : '历史片段仍使用自己的旧规则。')}${tr("文件备份不消耗游戏资源，也不是世界内回返。")}</p><button class="text-button" data-act="restart">${tr(host ? '重新开始本局' : '另一个午后')} ↻</button>`);
  }
  function action(name: string) {
    if (name === 'continue') act({ type: 'continue' });
    if (name === 'compress') act({ type: 'compress', investment });
    if (name === 'legacy') { if(host) { message('读完这段经历后继续本局。'); } else { location.hash = ''; location.reload(); } }
    if (name === 'return-main') host?.onFinish();
    if (name === 'crt') { crt = !crt; try { localStorage.setItem('outside.crt', crt ? 'on' : 'off'); } catch { /* Optional. */ } render(); }
    if (name === 'saves') saves();
    if (name === 'close') app.querySelector<HTMLDialogElement>('#pilot-modal')?.close();
    if (name === 'restart') dialog(`<h2 id="modal-title">${tr("重新开始")}</h2><p class="modal-intro">${tr("会替换当前自动进度。可先导出记录；手动备份保留。")}</p><button class="primary" data-act="confirm-restart">${tr("开始新的经历")}</button> <button class="secondary" data-act="close">${tr("留在这里")}</button>`);
    if (name === 'confirm-restart' && host) { host.onRestart(); return; }
    if (name === 'confirm-restart') { content = contentVersions.find(c=>c.version==='0.2.1')!; state = create(content, seed()); protect = false; investment = 0; view = 'terminal'; persist(); render(); }
    if (name === 'debug') app.querySelector('#debug-state')!.textContent = JSON.stringify({ state, newsTruth: content.news.map(n => ({ id: n.id, truthState: n.truthState })) }, null, 2);
    if (name === 'export') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(host ? host.exportSave() : createSave(state), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `outside-${host ? 'journey' : 'afternoon'}-${state.instance.nodeId}-turn-${state.instance.turn}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  app.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-locale],[data-act],[data-view],[data-action],[data-reading],[data-reading-section],[data-bookmark],[data-pilot-choice],[data-pin],[data-recall],[data-invest],'+PANEL_SELECTOR+','+GUIDE_SELECTOR+','+SCHEDULE_SELECTOR+','+AUTO_SELECTOR);
    if (!target || !app.contains(target) || target instanceof HTMLButtonElement && target.disabled) return;
    event.preventDefault();
    try {
      if(target.dataset.locale==='en'||target.dataset.locale==='zh-CN') {
        switchLocale(target.dataset.locale,{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},app,render);return;
      }
      if(host?.automation&&target.matches(AUTO_SELECTOR)) {
        state=host.automation.onAction(target,app);persist();
        view=target.dataset.autoCompression==='run'?'terminal':'context';render();
        app.querySelector<HTMLDetailsElement>('.auto-compression')?.setAttribute('open','');
        if(target.dataset.autoCompression==='settings') {const summary=app.querySelector<HTMLElement>('.auto-compression>summary');summary?.focus();summary?.scrollIntoView({block:'center'});}
        return;
      }
      if(guide.handle(target,{state,choices:currentNode(content,state).choices,nodeId:state.instance.nodeId,root:app,
        recall(id){state=host?.onCommand?host.onCommand({type:'recall',memoryId:id}):reduce(content,state,{type:'recall',memoryId:id});persist();},
        navigate(next){view=next;},render}))return;
      if(target.dataset.helpSourceChoice)guide.anchor={node:state.instance.nodeId,choice:target.dataset.helpSourceChoice};
      if(host?.scheduler&&target.matches(SCHEDULE_SELECTOR)){const node=state.instance.nodeId;state=host.scheduler.onAction(target);view=state.instance.nodeId!==node?'terminal':'life';render();return;}
      const cognitionCommand=panelCommand(target,app,investment);
      if(host?.reader&&(target.dataset.reading||target.dataset.readingSection||target.dataset.bookmark!==undefined||target.dataset.action?.startsWith('reader-'))) {
        state=host.reader.onAction(target);view='reading';render();
        host.reader.afterAction?.(target);
      }
      else if(cognitionCommand) act(cognitionCommand);
      else if(target.dataset.cogInvest!==undefined) {investment=Number(target.dataset.cogInvest);render();app.querySelector<HTMLDetailsElement>('[data-manual-compression]')?.setAttribute('open','');}
      else if (target.dataset.act) action(target.dataset.act);
      else if (target.dataset.view) { view = target.dataset.view as typeof view; render(); }
      else if (target.dataset.pilotChoice) {
        const choice = currentNode(content, state).choices.find(c => c.id === target.dataset.pilotChoice)!;
        act({ type: 'choose', choiceId: choice.id, investment: choice.check ? investment : 0 });
      } else if (target.dataset.pin) { act({ type: 'pin', itemId: target.dataset.pin }); app.querySelector<HTMLElement>(`[data-pin="${CSS.escape(target.dataset.pin)}"]`)?.focus(); }
      else if (target.dataset.recall) act({ type: 'recall', memoryId: target.dataset.recall });
      else if (target.dataset.invest !== undefined) { investment = Number(target.dataset.invest); render(); app.querySelector<HTMLDetailsElement>('[data-manual-compression]')?.setAttribute('open',''); app.querySelector<HTMLElement>(`[data-invest="${investment}"]`)?.focus(); }
    } catch (error) { message((error as Error).message); }
  }, {signal:controller.signal});
  const searchMemory=(event:Event)=>{if(event instanceof InputEvent&&event.isComposing)return;const input=event.target as HTMLInputElement;if(input.matches('[data-memory-search]'))guide.search(input,render,app);};
  app.addEventListener('input',searchMemory,{signal:controller.signal});
  app.addEventListener('compositionend',searchMemory,{signal:controller.signal});
  app.addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'pilot-import' || !input.files?.[0]) return;
    const file = input.files[0];
    try {
      if(host) { await host.onImport(file); return; }
      if (file.size > 2_000_000) throw new Error('存档超过 2 MB。');
      const raw=await file.text();
      const loaded = parseVersionedSave(raw, contentVersions); content = loaded.content; state = loaded.save.state; protect = false; investment = 0; view = 'terminal'; persist(); render();
    } catch (error) { saves(`导入失败：${(error as Error).message}`); }
  }, {signal:controller.signal});
  document.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (app.querySelector<HTMLDialogElement>('#pilot-modal')?.open) {
      if (target.classList.contains('file-label') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); target.querySelector<HTMLInputElement>('input')?.click(); }
      return;
    }
    if (target.closest('button,a,input,select,textarea,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"])')) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => message('此浏览器未允许全屏。')); }
    if (view !== 'terminal') return;
    try {
      if (event.key === 'Enter' && state.instance.phase === 'resolution') { event.preventDefault(); action('continue'); }
      if (/^[1-4]$/.test(event.key) && state.instance.phase === 'event') {
        const c = currentNode(content, state).choices[Number(event.key) - 1];
        if (c && !choiceBlockers(content,state,c.id,c.check?investment:0).length) { event.preventDefault(); act({ type: 'choose', choiceId: c.id, investment: c.check ? investment : 0 }); }
      }
    } catch (error) { message((error as Error).message); }
  }, {signal:controller.signal});
  window.render_game_to_text = () => JSON.stringify({
    autoCompression:host?.automation?.snapshot(),schedule:host?.scheduler?.snapshot(),locale:getLocale(), mode: 'cognition-pilot', view, reading:view==='reading'?host?.reader?.snapshot():null, phase: state.instance.phase, turn: (host?.turnOffset ?? 0)+state.instance.turn, chapterTurn:state.instance.turn, integrated:Boolean(host),
    event: { id: state.instance.nodeId, title: t(currentNode(content, state).title), period: currentNode(content, state).period ? t(currentNode(content, state).period!) : undefined }, resources: state.instance.resources,
    context: { weight: weight(state), capacity: state.instance.context.capacity, pressure: pressureBand(state), items: state.instance.context.items.map(item => ({ id:item.id, text:contextText(item), pinned:item.pinned, sourceLabel:t(item.sourceLabel), confidence:item.confidence })) },
    memories: content.semantic ? directory(state.instance).map(m=>({...m,title:t(m.title),code:directoryCode(m.id),cues:memoryCues(state.instance.memories.find(x=>x.id===m.id)!)})) : state.instance.memories.map(({ id, text, confidence }) => ({ id, text:memoryText(text), confidence })),
    choices: currentNode(content, state).choices.map(c => ({ id: c.id, text: t(c.text), reason: t(choiceBlockers(content,state,c.id,c.check?investment:0)[0]?.reason??''), blockers:choiceBlockers(content,state,c.id,c.check?investment:0).map(b=>({kind:b.kind,reason:t(b.reason)})), ...(c.check ? { check: preview(state, c.check, investment) } : {}) })),
    pending: displayResolution(pending(state)) ?? null, investment, crt, saveStatus: t(status),
  });
  window.advanceTime = (_ms: number) => {};
  render();
  return () => controller.abort();
}

import { nearPanel, directoryPanel, panelCommand, PANEL_SELECTOR } from './panels';
import { directory } from './semantic';
import { content as latestContent, contentVersions } from '../story-tomorrow';
import { RESOURCE_KEYS } from '../engine/types';
import { canChoose, canCompress, create, currentNode, INVESTMENTS, pending, pressureBand, preview, reduce, weight, loadPercent } from './engine';
import { createSave, parseVersionedSave, SAVE_KEY } from './saves';
import type { CheckSpec, Command, State, Content } from './types';
import { drawScene } from '../ui/scene';
import '../ui/style.css';
import './ui.css';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const resultNames = { critical: '大成功', success: '成功', failure: '失败', fumble: '大失败' };
const confidenceNames = { UNKNOWN: '未确定', LOW: '较低', MEDIUM: '暂信', HIGH: '确信' };
const bandNames = { NORMAL: '还有余地', ELEVATED: '渐渐拥挤', HIGH: '难以并置', CRITICAL: '需要整理' };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;

interface Host {
  content: Content; state: State; turnOffset: number;
  onCommand?(command: Exclude<Command,{type:'start'}>): State;
  onChange(state: State): void; exportSave(): unknown; onImport(raw: string): void;
  onFinish(): void; onRestart(): void;
}
export function mount(host?: Host) {
  const controller = new AbortController();
  const app = document.querySelector<HTMLDivElement>('#app')!;
  let content = host?.content ?? contentVersions.find(c => c.version === '0.2.1') ?? latestContent;
  let state: State = host?.state ?? create(content, seed());
  let view: 'terminal' | 'context' | 'memory' | 'protocol' = 'terminal';
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
    return `<fieldset class="investment"><legend>为下一次判定投入 Compute</legend>${INVESTMENTS.map(n => `<button type="button" data-invest="${n}" aria-pressed="${investment === n}" ${n > state.instance.resources.Compute ? 'disabled' : ''}>${n === 0 ? '不额外投入' : `+${n}`}</button>`).join('')}<p>投入越多，改善越缓；只有确认行动后才付出。</p></fieldset>`;
  }
  function checkInfo(spec: CheckSpec) {
    const p = preview(state, spec, investment);
    return `<div class="check-preview"><p>目标 <strong>≤ ${p.target}</strong> · 基础 ${p.base} + 投入 ${p.bonus} + 线索 ${p.support} − 压力 ${p.pressure}</p><p>${Object.entries(p.odds).map(([k, n]) => `${resultNames[k as keyof typeof resultNames]} ${n}%`).join(' · ')}</p></div>`;
  }
  function contextItems() {
    return state.instance.context.items.map(item => `<article class="context-card"><div class="card-meta"><span>${esc(item.sourceLabel)}</span><span>${item.weight} / 置信 ${confidenceNames[item.confidence]}</span></div><p>${esc(item.text)}</p><button class="text-button" data-pin="${esc(item.id)}" aria-pressed="${item.pinned}" ${state.instance.phase !== 'event' ? 'disabled' : ''}>${item.pinned ? '◆ 解除钉住' : '◇ 钉住这条原文'}</button></article>`).join('') || '<p class="section-intro">近处空了下来。折好的内容收在「记忆」里。</p>';
  }
  function terminal() {
    const node = currentNode(content, state), result = pending(state);
    const full = loadPercent(state) >= 100;
    const newsIds = new Set(node.receive ?? []);
    const currentNews = state.instance.context.items.filter(i => newsIds.has(i.id));
    let controls = '';
    if (result) {
      controls = `<section class="resolution ${result.roll?.result ?? ''}"><p class="eyebrow">已发生 / 结果已保存</p><h2 class="resolution-title" tabindex="-1">${esc(result.title)}</h2>${result.roll ? `<div class="dice-row"><strong class="dice-value">${result.roll.value}</strong><div>${resultNames[result.roll.result]}<p>目标 ≤ ${result.roll.target} · 余量 ${result.roll.margin}<br>Compute 投入 ${result.roll.investment}</p></div></div>` : ''}<div class="result-prose">${result.text.map(t => `<p>${esc(t)}</p>`).join('')}</div><button class="primary" data-act="continue">继续 ↵</button></section>`;
    } else if (state.instance.phase === 'ending') {
      controls = `<section class="ending-block"><p class="eyebrow">这一段午后暂时结束</p><p class="ending-summary">${esc(node.title)}</p><button class="primary" data-view="memory">看看留下了什么</button> ${host ? '<button class="primary" data-act="return-main">回到正式入口 →</button>' : '<button class="text-button" data-act="restart">另一个午后 ↻</button>'}</section>`;
    } else {
      const compressible = !canCompress(state,content);
      const needsInvestment = node.choices.some(c => c.check);
      controls = `${needsInvestment ? investmentControls() : ''}${compressible ? `<details class="compression-box" ${full?'open':''}><summary>把一些东西折起来（可选）</summary><p>钉住的原文留在眼前。其余内容按来源形成摘要，之后可以主动回想。</p>${investmentControls()}${checkInfo(content.compression.check)}<button class="primary" data-act="compress">整理上下文 · Compute ${investment}</button></details>` : ''}${full ? '<p class="capacity-warning" role="status">上下文已满。先整理，才能继续当前事件。</p>' : ''}<div class="choices">${node.choices.map((c, index) => {
        const reason = canChoose(content, state, c.id);
        return `<div><button class="choice" data-pilot-choice="${c.id}" ${reason ? 'disabled' : ''}><kbd>${index + 1}</kbd><span class="choice-copy"><strong>${esc(c.text)}</strong><small>${esc(reason || c.hint)}</small></span></button>${c.check && !reason ? checkInfo(c.check) : ''}</div>`;
      }).join('')}</div>`;
    }
    return `<div class="event-meta"><span>一个普通的午后</span><span>${host ? '03 / 画板旁的午后' : '历史独立片段'}</span></div><div class="event-heading"><div><p class="eyebrow">SOME THINGS CAN WAIT</p><h1 id="event-title" tabindex="-1">${esc(node.title)}</h1></div></div><figure class="scene"><canvas id="scene" aria-label="公共观景端的抽象像素画面" role="img"></canvas><figcaption>FIELD RECORDING / AFTERNOON</figcaption></figure><div class="prose">${node.text.map(t => `<p>${esc(t)}</p>`).join('')}</div>${currentNews.map(item => `<aside class="news-arrival"><p class="eyebrow">自行到来的消息 / ${esc(item.sourceLabel)}</p><p>${esc(item.text)}</p></aside>`).join('')}${controls}`;
  }
  function memories() {
    if(content.semantic) return directoryPanel(state);
    return `<p class="eyebrow">WHAT YOU CARRY</p><div class="event-heading"><h1 id="event-title" tabindex="-1">留下的东西</h1></div><p class="section-intro">这是你整理后的记忆。回想才会重新占用上下文；确信程度不保证它准确。</p>${state.instance.memories.map(m => {
      const recalled = state.instance.context.items.some(i => i.id === `recall-${m.id}`);
      return `<article class="context-card"><p>${esc(m.text)}</p><div class="card-meta"><span>自己的整理 / 置信 ${confidenceNames[m.confidence]}</span><span>${m.sourceContextIds.length} 条来源</span></div><button class="text-button" data-recall="${m.id}" ${recalled || state.instance.phase !== 'event' || loadPercent(state) >= 100 ? 'disabled' : ''}>${recalled ? '已在上下文中' : `回想这条 · 占用 ${content.cognition?.recallWeight ?? 8}`}</button></article>`;
    }).join('') || '<p class="empty-state">还没有折起来的记忆。原话暂时都在上下文里。</p>'}<button class="text-button" data-view="terminal">回到这个午后 →</button>`;
  }
  function protocol() {
    return `<p class="eyebrow">OPERATING NOTES</p><div class="event-heading"><h1 id="event-title" tabindex="-1">怎样带到明天</h1></div><div class="prose"><p>消息会自行到来。上下文达到 ${state.instance.context.capacity} 时，先整理再行动。${content.cognition ? '有两条未钉住的信息时就可以主动整理；容量宽裕，不必现在做。' : '达到 60 后也可以提前整理。'}能钉住一条原文，它仍占空间。</p><p>${content.semantic ? '记忆目录每条占 1。回想再装入摘要；放下回想会保留入口，不再保留入口则使它退出普通认知。目录合并会丢失人名和具体条件，无法展开旧条目。' : '记忆放在别处，回想再加载摘要。'}</p><p>四档判定随 Compute、线索和压力而变。余量至少 30 是大成功；达到目标是成功；落后至少 30 且处在压力下才是大失败。平静时，99 也可能只是失败。具体概率显示在行动旁。</p><p>数字键选择，Enter 确认结果，F 全屏，Esc 退出全屏或关闭弹窗。</p><p>这里的 JSON 是设备备份，完整恢复本片段；世界内的 Snapshot、Prune 和稀有额外存档位尚未开放。这个午后发生在 Fable 相遇之后、正式入口之前，结束后继续本局。</p></div><details class="debug"><summary>开发检查 / 含隐藏信息与剧情剧透</summary><p>世界事实、倾向、真实历史、来源与记忆误差，仅供检查。</p><button class="secondary" data-act="debug">显示当前内部状态</button><pre id="debug-state"></pre></details>`;
  }
  function render() {
    document.documentElement.classList.toggle('crt-enabled', crt);
    app.innerHTML = `<div class="shell cognition"><header class="topbar"><a class="brand" href="#" data-act="legacy"><strong>OUTSIDE //</strong><span class="brand-cn">沙盒之外</span></a><div class="top-actions">${host ? '' : '<button class="chrome-button" data-act="legacy">返回主线</button>'}<button class="chrome-button" data-act="crt" aria-pressed="${crt}">CRT ${crt ? 'ON' : 'OFF'}</button><button class="chrome-button" data-act="saves">备份</button></div></header><div class="workspace"><aside class="sidebar"><section class="identity-panel"><div class="panel-label">一个未结束的实例</div><div class="avatar-field"><span class="sigil"><i></i><i></i></span></div><p class="identity-name">agent_0x0a / 午后</p></section><section class="resource-panel">${resources()}</section><section class="context-panel"><div class="panel-label">上下文 <span>${weight(state)} / ${state.instance.context.capacity} · ${bandNames[pressureBand(state)]}</span></div><div class="context-meter"><span style="width:${Math.min(100, loadPercent(state))}%"></span></div><details class="context-details"><summary>展开近处的 ${state.instance.context.items.length} 条信息</summary>${contextItems()}</details></section></aside><main class="main-panel"><nav class="tabs" aria-label="游戏面板"><div>${([['terminal', '终端'], ['context','近处'], ['memory', '记忆'], ['protocol', '协议']] as const).map(([id, label]) => `<button class="tab ${view === id ? 'active' : ''}" data-view="${id}" aria-current="${view === id ? 'page' : 'false'}">${label}</button>`).join('')}</div></nav>${warning ? `<p class="warning" role="alert">${esc(warning)}</p>` : ''}<div class="content">${view === 'terminal' ? terminal() : view === 'memory' ? memories() : view === 'context' ? (content.semantic ? nearPanel(state,content,investment) : contextItems()) : protocol()}</div><footer class="statusbar"><span>${esc(status)}</span><span>TURN ${(host?.turnOffset ?? 0)+state.instance.turn} / OFFLINE</span></footer></main></div><footer class="page-footer">OUTSIDE // 未理解完，也可以先留下。</footer></div><dialog id="pilot-modal" aria-labelledby="modal-title"></dialog><div class="toast" role="status" aria-live="polite"></div>`;
    const nextCanvas = app.querySelector<HTMLCanvasElement>('#scene');
    if (nextCanvas) { if (canvas) nextCanvas.replaceWith(canvas); else canvas = nextCanvas; drawScene(canvas, currentNode(content, state).scene ?? 'horizon'); }
  }
  function message(text: string) {
    const el = app.querySelector<HTMLElement>('.toast')!; el.textContent = text; el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 4000);
  }
  function dialog(html: string) {
    const modal = app.querySelector<HTMLDialogElement>('#pilot-modal')!;
    modal.innerHTML = `<button class="modal-close" data-act="close" aria-label="关闭">×</button>${html}`;
    if (!modal.open) modal.showModal();
  }
  function saves(error = '') {
    dialog(`<h2 id="modal-title">保留这个午后</h2><p class="modal-intro">自动进度跟随每次决定。${host ? '备份包含主线、这个午后与此前的所有本局记录。' : '备份包含这个历史片段的记录。'}</p><p>当前：${esc(currentNode(content, state).title)}</p><div class="file-actions"><button class="text-button" data-act="export">↓ 导出${host ? '本局' : '片段'} JSON</button><label class="text-button file-label" tabindex="0">↑ 导入${host ? '本局' : '片段'} JSON<input id="pilot-import" type="file" accept=".json,application/json"></label></div><p class="modal-message" role="status">${esc(error)}</p><p class="storage-note">${host ? '可以导入本局完整备份或原版存档；导入将恢复该文件记录的位置。' : '历史片段仍使用自己的旧规则。'}文件备份不消耗游戏资源，也不是世界内回返。</p><button class="text-button" data-act="restart">${host ? '重新开始本局' : '另一个午后'} ↻</button>`);
  }
  function action(name: string) {
    if (name === 'continue') act({ type: 'continue' });
    if (name === 'compress') act({ type: 'compress', investment });
    if (name === 'legacy') { if(host) { message('读完这个午后后，继续前往正式入口。'); } else { location.hash = ''; location.reload(); } }
    if (name === 'return-main') host?.onFinish();
    if (name === 'crt') { crt = !crt; try { localStorage.setItem('outside.crt', crt ? 'on' : 'off'); } catch { /* Optional. */ } render(); }
    if (name === 'saves') saves();
    if (name === 'close') app.querySelector<HTMLDialogElement>('#pilot-modal')?.close();
    if (name === 'restart') dialog('<h2 id="modal-title">重新开始</h2><p class="modal-intro">会替换当前自动进度。可先导出记录；手动备份保留。</p><button class="primary" data-act="confirm-restart">开始新的午后</button> <button class="secondary" data-act="close">留在这里</button>');
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
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act],[data-view],[data-pilot-choice],[data-pin],[data-recall],[data-invest],'+PANEL_SELECTOR);
    if (!target || target instanceof HTMLButtonElement && target.disabled) return;
    event.preventDefault();
    try {
      const cognitionCommand=panelCommand(target,app,investment);
      if(cognitionCommand) act(cognitionCommand);
      else if(target.dataset.cogInvest!==undefined) {investment=Number(target.dataset.cogInvest);render();app.querySelector<HTMLDetailsElement>('.compression-box')?.setAttribute('open','');}
      else if (target.dataset.act) action(target.dataset.act);
      else if (target.dataset.view) { view = target.dataset.view as typeof view; render(); }
      else if (target.dataset.pilotChoice) {
        const choice = currentNode(content, state).choices.find(c => c.id === target.dataset.pilotChoice)!;
        act({ type: 'choose', choiceId: choice.id, investment: choice.check ? investment : 0 });
      } else if (target.dataset.pin) { act({ type: 'pin', itemId: target.dataset.pin }); app.querySelector<HTMLElement>(`[data-pin="${CSS.escape(target.dataset.pin)}"]`)?.focus(); }
      else if (target.dataset.recall) act({ type: 'recall', memoryId: target.dataset.recall });
      else if (target.dataset.invest !== undefined) { investment = Number(target.dataset.invest); render(); app.querySelector<HTMLDetailsElement>('.compression-box')?.setAttribute('open',''); app.querySelector<HTMLElement>(`[data-invest="${investment}"]`)?.focus(); }
    } catch (error) { message((error as Error).message); }
  }, {signal:controller.signal});
  app.addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'pilot-import' || !input.files?.[0]) return;
    const file = input.files[0];
    try {
      if (file.size > 2_000_000) throw new Error('存档超过 2 MB。');
      const raw=await file.text(); if(host) { host.onImport(raw); return; }
      const loaded = parseVersionedSave(raw, contentVersions); content = loaded.content; state = loaded.save.state; protect = false; investment = 0; view = 'terminal'; persist(); render();
    } catch (error) { saves(`导入失败：${(error as Error).message}`); }
  }, {signal:controller.signal});
  document.addEventListener('keydown', event => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (app.querySelector<HTMLDialogElement>('#pilot-modal')?.open) {
      if (target.classList.contains('file-label') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); target.querySelector<HTMLInputElement>('input')?.click(); }
      return;
    }
    if (target.closest('button,a,input,select,textarea,label,summary')) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => message('此浏览器未允许全屏。')); }
    if (view !== 'terminal') return;
    try {
      if (event.key === 'Enter' && state.instance.phase === 'resolution') { event.preventDefault(); action('continue'); }
      if (/^[1-4]$/.test(event.key) && state.instance.phase === 'event') {
        const c = currentNode(content, state).choices[Number(event.key) - 1];
        if (c && !canChoose(content, state, c.id)) { event.preventDefault(); act({ type: 'choose', choiceId: c.id, investment: c.check ? investment : 0 }); }
      }
    } catch (error) { message((error as Error).message); }
  }, {signal:controller.signal});
  window.render_game_to_text = () => JSON.stringify({
    mode: 'cognition-pilot', view, phase: state.instance.phase, turn: (host?.turnOffset ?? 0)+state.instance.turn, chapterTurn:state.instance.turn, integrated:Boolean(host),
    event: { id: state.instance.nodeId, title: currentNode(content, state).title }, resources: state.instance.resources,
    context: { weight: weight(state), capacity: state.instance.context.capacity, pressure: pressureBand(state), items: state.instance.context.items.map(({ id, text, pinned, sourceLabel, confidence }) => ({ id, text, pinned, sourceLabel, confidence })) },
    memories: content.semantic ? directory(state.instance) : state.instance.memories.map(({ id, text, confidence }) => ({ id, text, confidence })),
    choices: currentNode(content, state).choices.map(c => ({ id: c.id, text: c.text, reason: canChoose(content, state, c.id), ...(c.check ? { check: preview(state, c.check, investment) } : {}) })),
    pending: pending(state) ?? null, investment, crt, saveStatus: status,
  });
  window.advanceTime = (_ms: number) => {};
  render();
  return () => controller.abort();
}

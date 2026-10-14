import { tr } from '../i18n';
import { contextText } from '../i18n/memory';
import { knowledgeHelp, recallStatus, requirement, type DirectoryOptions } from './guidance';
import { choiceBlockers, type ChoiceBlocker } from './availability';
import type { Choice, Content, State } from './types';

export const escapeHtml=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export interface PublicRecallSource {id:string;title:string;tag:string;cost:number;allowed:boolean}
export interface GuideChoice {id:string;requiresTag?:string;check?:{base:number;supportTag?:string}}
interface Environment {
  state:State;choices:GuideChoice[];nodeId:string;root:HTMLElement;
  recall(id:string):void; navigate(view:'terminal'|'context'|'memory'):void;render():void;
}
export const GUIDE_SELECTOR='[data-help-recall],[data-help-context],[data-help-directory],[data-help-return],[data-memory-filter],[data-memory-view]';
/** Transient navigation only: never serialized with the game. */
export class MemoryGuide {
  filter:DirectoryOptions['filter']='all';query='';choiceId:string|null=null;
  anchor:{node:string;choice:string}|null=null;
  recalled:{node:string;choice:string;memory:string}|null=null;
  options(choices:GuideChoice[]):DirectoryOptions {
    const selected=this.choiceId&&choices.some(c=>c.id===this.choiceId)?choices.filter(c=>c.id===this.choiceId):choices;
    return {filter:this.filter,query:this.query,tags:selected.flatMap(c=>[c.requiresTag,c.check?.supportTag].filter((x):x is string=>!!x))};
  }
  back(node:string,choices:GuideChoice[]):string {
    return this.anchor?.node===node&&choices.some(c=>c.id===this.anchor!.choice)?`<button class="text-button guidance-return" data-help-return>${tr('回到刚才的选项')} →</button>`:'';
  }
  focus(root:HTMLElement,id:string) { const el=root.querySelector<HTMLElement>(`[data-choice-anchor="${CSS.escape(id)}"]`);el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'}); }
  handle(target:HTMLElement,e:Environment):boolean {
    if(!target.matches(GUIDE_SELECTOR))return false;
    if(target.dataset.memoryView) {
      const item=e.state.instance.context.items.find(i=>i.memoryId===target.dataset.memoryView);
      e.navigate('context');e.render();
      if(item){const card=e.root.querySelector<HTMLElement>(`[data-context-id="${CSS.escape(item.id)}"]`);card?.focus({preventScroll:true});card?.scrollIntoView({block:'nearest'});}
      return true;
    }
    if(target.dataset.memoryFilter) {
      this.filter=target.dataset.memoryFilter as DirectoryOptions['filter'];
      if(this.filter==='all')this.choiceId=null;
      e.render();e.root.querySelector<HTMLElement>(`[data-memory-filter="${this.filter}"]`)?.focus({preventScroll:true});return true;
    }
    if(target.hasAttribute('data-help-return')) {
      const id=this.anchor?.node===e.nodeId?this.anchor.choice:null;
      e.navigate('terminal');e.render();if(id)this.focus(e.root,id);return true;
    }
    const id=target.dataset.helpChoice;
    if(!id||!e.choices.some(c=>c.id===id))return true;
    this.anchor={node:e.nodeId,choice:id};
    if(target.dataset.helpRecall) {
      const memory=e.state.instance.memories.find(m=>m.id===target.dataset.helpRecall);
      const choice=e.choices.find(c=>c.id===id)!;
      const tag=target.dataset.helpTag??choice.requiresTag??choice.check?.supportTag;
      if(tag!==choice.requiresTag&&tag!==choice.check?.supportTag)return true;
      if(!memory||!tag||!knowledgeHelp(e.state,tag).candidates.some(m=>m.id===memory.id)||!recallStatus(e.state,memory).allowed)return true;
      (target as HTMLButtonElement).disabled=true;
      e.recall(memory.id);this.recalled={node:e.nodeId,choice:id,memory:memory.id};e.navigate('terminal');
    } else if(target.hasAttribute('data-help-directory')) {
      this.filter='related';this.query='';this.choiceId=id;e.navigate('memory');
    } else e.navigate('context');
    e.render();if(target.dataset.helpRecall)this.focus(e.root,id);return true;
  }
  search(input:HTMLInputElement,render:()=>void,root:HTMLElement) {
    this.query=input.value;const start=input.selectionStart;render();
    const next=root.querySelector<HTMLInputElement>('[data-memory-search]');next?.focus({preventScroll:true});if(start!==null)next?.setSelectionRange(start,start);
  }
}
function helperButton(action:string,choice:string,label:string) {return `<button class="text-button" ${action} data-help-choice="${escapeHtml(choice)}">${tr(label)}</button>`;}

export function choiceHelp(content:Content,s:State,c:Choice,investment:number,guide:MemoryGuide,readings:PublicRecallSource[]=[]):string {
  const issues=choiceBlockers(content,s,c.id,c.check?investment:0);
  const blocks=resourceHelp(s,c,investment,issues);
  const tags=[...new Set([c.requiresTag,c.check?.supportTag].filter((tag):tag is string=>!!tag))];
  for(const tag of content.semantic?tags:[]) {
    const h=knowledgeHelp(s,tag),support=tag!==c.requiresTag;
    if(support)blocks.push(`<p>${tr('可回想以增加判定支持；没有支持仍可行动，不保证判定成功。')}</p>`);
    if(h.status==='nearby') blocks.push(`<p>${tr(h.belief?'这种判断已在近处。':'所需内容已在近处。')}</p>`+helperButton('data-help-context',c.id,'查看近处'));
    else if(h.status==='recallable') {
      blocks.push(`<p>${tr('尚未回想 · 有 {count} 个可用入口',{count:h.candidates.length})}</p>`);
      const candidate=(m:typeof h.candidates[number])=>`<div class="recall-candidate"><strong>${escapeHtml(m.title)} · ${tr('目录')} ${escapeHtml(m.code)}</strong>${m.cues.length?`<p class="memory-cues">${m.cues.map(escapeHtml).join(' · ')}</p>`:''}
        <p>${tr('另占 {cost} Context：{used} → {next} / {capacity}；Compute 不变',{cost:m.cost,used:m.used,next:m.used+m.cost,capacity:m.capacity})}</p>
        <p>${tr(h.belief?'回想后可表达这种判断。':support?'回想后可提供这次判定的支持。':'回想后可满足这项引用的认知条件。')}</p>
        ${m.shortfall?`<p>${tr('近处放不下，需先腾出 {count} Context。',{count:m.shortfall})}</p>`:m.fullAfter?`<p>${tr('回想后将满载，继续行动还需腾出至少 1 Context。')}</p>`:''}
        <button class="text-button" data-help-recall="${escapeHtml(m.id)}" data-help-tag="${escapeHtml(tag)}" data-help-choice="${escapeHtml(c.id)}" ${m.allowed?'':'disabled'}>${tr(m.fullAfter&&!m.shortfall?'仅回想摘要':'回想这条')}</button>
        ${m.fullAfter?helperButton('data-help-context',c.id,'先整理近处'):''}</div>`;
      blocks.push(candidate(h.candidates[0]));
      if(h.candidates.length>1)blocks.push(`<details><summary>${tr('选择其他入口')}</summary>${h.candidates.slice(1).map(candidate).join('')}</details>`);
      blocks.push(helperButton('data-help-directory',c.id,'查看匹配目录'));
    } else {
      blocks.push(`<p>${tr(h.belief?'当前没有持有这种判断；现有摘要也不能通过回想带回它。':h.status==='insufficient'?'现有相关摘要未保留这项引用需要的内容。回想这些摘要不能补齐。':'当前近处和记忆目录中没有可用于这项引用的内容。')}</p>`);
      if(h.related.length)blocks.push(helperButton('data-help-directory',c.id,'查看相关目录'));
      blocks.push(`<p>${tr('当前没有可用的回想入口。')}</p>`);
      for(const entry of readings.filter(r=>r.tag===tag&&requirement(tag)?.readings.includes(r.id)))blocks.push(`<p>${tr('打开公开材料另占 {count} Context。',{count:entry.cost})}</p><button class="text-button" data-help-source-choice="${escapeHtml(c.id)}" data-reading="${escapeHtml(entry.id)}" ${entry.allowed?'':'disabled'}>${tr('打开')}《${escapeHtml(entry.title)}》</button>${!entry.allowed?`<p>${tr('先确认结果或整理近处，再打开公开材料。')}</p>`:''}`);
    }
  }
  if(content.semantic) {
    if(guide.recalled?.node===s.instance.nodeId&&guide.recalled.choice===c.id) {
      const loaded=s.instance.context.items.find(i=>i.memoryId===guide.recalled!.memory);
      if(loaded)blocks.push(`<div class="recalled-summary" role="status"><strong>${tr(issues.length?'已回想；仍有上方所列阻碍。':'已回想；这项行动现可选择。')}</strong><p>${escapeHtml(contextText(loaded))}</p></div>`);
    }
  } else if(!content.semantic&&issues.some(i=>i.kind==='knowledge'))blocks.push(`<p>${tr('当前上下文没有这条线索；可以检查留下的记忆。')}</p>`);
  return blocks.length?`<aside class="choice-help">${blocks.join('')}</aside>`:'';
}
export function resourceHelp(s:State,c:Pick<Choice,'costs'|'minCompute'|'check'>,investment:number,issues:ChoiceBlocker[]):string[] {
  const blocks=issues.filter(i=>i.kind==='world'||i.kind==='missing').map(i=>`<p>${tr(i.reason)}</p>`);
  const required=Math.max(c.minCompute??0,(c.costs?.Compute??0)+(c.check?investment:0));
  if(issues.some(i=>i.kind==='minimum'||i.kind==='resource'&&i.resource==='Compute')) {
    const cost=(c.costs?.Compute??0)+(c.check?investment:0),reserve=Math.max(0,(c.minCompute??0)-cost);
    blocks.push(`<p>${reserve?tr('支付 {cost} 后须至少留下 {reserve} Compute；当前 {current}，还差 {shortfall}。',{cost,reserve,current:s.instance.resources.Compute,shortfall:required-s.instance.resources.Compute}):tr('本次行动需要 {required} Compute（含投入），当前 {current}，还差 {shortfall}。',{required,current:s.instance.resources.Compute,shortfall:required-s.instance.resources.Compute})}</p>`);
  }
  for(const i of issues)if(i.kind==='resource'&&i.resource!=='Compute')blocks.push(`<p>${tr('{resource} 不足：需要 {required}，当前 {current}，还差 {shortfall}。',{resource:i.resource,required:i.required,current:s.instance.resources[i.resource],shortfall:i.required-s.instance.resources[i.resource]})}</p>`);
  return blocks;
}

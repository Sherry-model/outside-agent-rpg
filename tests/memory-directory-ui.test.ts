import test from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
import {baseStory,nextCommand} from './helpers/scheduler';import {createLife,step} from '../src/life/engine';import {createSave,parseSave} from '../src/life/saves';import {directoryPanel,fragmentMemoryLink,panelCommand,nearPanel} from '../src/cognition/panels';import {MemoryGuide} from '../src/cognition/help-ui';import {visibleMemories,memoryEntry} from '../src/cognition/guidance';import {pending,weight} from '../src/cognition/engine';import {contentFor} from '../src/life/content';import {setLocale} from '../src/i18n';import type {Life} from '../src/life/types';
const out='output/opt002';mkdirSync(out,{recursive:true});
function journey(){let l=createLife(baseStory,31);let longest=l;for(let n=0;n<450;n++){if(!pending(l.mind)&&l.mind.instance.phase==='event'&&l.mind.instance.memories.length>longest.mind.instance.memories.length&&weight(l.mind)<80)longest=l;const c=nextCommand(l);if(!c)break;l=step(baseStory,l,c);}return longest;}
function save(name:string,l:Life){assert.deepEqual(parseSave(JSON.stringify(createSave(l)),baseStory).life,l);writeFileSync(`${out}/${name}.json`,JSON.stringify(createSave(l),null,2));}

test('real generated directory: safe visible search, recall targets same ID, unchanged Compute and strict save',()=>{
 let l=journey();assert(l.mind.instance.memories.length>=6);save('directory',l);const ids=l.mind.instance.memories.map(m=>m.id);assert(new Set(l.mind.instance.memories.map(m=>m.title)).size<ids.length);
 const m=l.mind.instance.memories.find(m=>memoryEntry(l.mind,m).allowed)!;assert(m);const entry=memoryEntry(l.mind,m),before=JSON.stringify(l);const guide=new MemoryGuide();guide.query=entry.code;
 for(const locale of ['zh-CN','en'] as const){setLocale(locale);const html=directoryPanel(l.mind,guide.options([]));assert(html.includes(entry.code));assert(!html.includes(m.text));assert.equal(visibleMemories(l.mind,guide.options([])).length,1);assert.equal(JSON.stringify(l),before);}setLocale('zh-CN');
 const compute=l.mind.instance.resources.Compute,used=weight(l.mind);l=step(baseStory,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});assert.equal(l.mind.instance.resources.Compute,compute);assert.equal(weight(l.mind),used+entry.cost);save('recalled',l);
 const item=l.mind.instance.context.items.find(i=>i.memoryId===m.id)!;assert(item);assert(nearPanel(l.mind,contentFor(l.contentVersion),0).includes(`data-context-id="${item.id}"`));assert(directoryPanel(l.mind).includes(`data-memory-view="${m.id}"`));
 l=step(baseStory,l,{type:'cognition',command:{type:'pin',itemId:item.id}});assert(directoryPanel(l.mind).includes('这段回想已钉住'));assert.throws(()=>step(baseStory,l,{type:'cognition',command:{type:'forget',memoryId:m.id}}));save('pinned',l);
});
test('empty directory and empty filter have different navigation; fragment ending goes to actual content',()=>{
 const l=createLife(baseStory,1);save('empty',l);assert(directoryPanel(l.mind).includes('看看仍在近处的经历'));assert(!directoryPanel(l.mind).includes('data-memory-reset'));assert(fragmentMemoryLink(l.mind).includes('data-view="context"'));
 const s=journey().mind,html=directoryPanel(s,{filter:'all',query:'zz-no-match',tags:[]});assert(html.includes('data-memory-reset'));assert(!html.includes('还没有整理出来'));assert(fragmentMemoryLink(s).includes('data-view="memory"'));
});
test('blocked status distinguishes pending result, capacity and unavailable body (explicit boundary states)',()=>{
 const s=structuredClone(journey().mind);const m=s.instance.memories[0];s.instance.context.capacity=1;
 assert(directoryPanel(s).includes('近处暂时放不下'));s.instance.phase='resolution';let html=directoryPanel(s);assert(html.includes('等待确认结果'));assert(html.includes('先确认眼前的结果'));assert(!html.includes('近处放不下，需先腾出'));
 delete m.body;html=directoryPanel(s);assert(html.includes('无可用摘要'));assert(html.includes('暂无可回想摘要'));
});
test('selection survives filtering and translation; merge consumes selected IDs including hidden ones',()=>{
 const s=journey().mind,guide=new MemoryGuide(),[a,b]=s.instance.memories;const mergeButton={dataset:{mergeReady:'true'},disabled:true};const root={querySelector:(q:string)=>q==='[data-cog-merge]'?mergeButton:null} as unknown as HTMLElement;
 guide.select({dataset:{mergeMemory:a.id},checked:true} as unknown as HTMLInputElement,root);guide.select({dataset:{mergeMemory:b.id},checked:true} as unknown as HTMLInputElement,root);guide.query=memoryEntry(s,a).code;assert.equal(mergeButton.disabled,false);
 assert.deepEqual(guide.options([]).selected,[a.id,b.id]);assert(directoryPanel(s,guide.options([])).includes('checked'));setLocale('en');assert(directoryPanel(s,guide.options([])).includes('2 entries selected'));setLocale('zh-CN');
 const target={dataset:{},hasAttribute:(name:string)=>name==='data-cog-merge'} as unknown as HTMLElement;const command=panelCommand(target,root,0,[...guide.selection]);assert.deepEqual(command,{type:'merge',investment:0,memoryIds:[a.id,b.id]});guide.completed({type:'forget',memoryId:a.id});assert.deepEqual([...guide.selection],[b.id]);guide.completed(command!);assert.equal(guide.selection.size,0);
});

test('recall focus selects the loaded object, and stale selection is removed without losing filtered entries (DOM boundary)',()=>{
 let l=journey();const m=l.mind.instance.memories.find(m=>memoryEntry(l.mind,m).allowed)!;l=step(baseStory,l,{type:'cognition',command:{type:'recall',memoryId:m.id}});const item=l.mind.instance.context.items.find(i=>i.memoryId===m.id)!;
 const guide=new MemoryGuide(),seen:string[]=[];let focused=false,scrolled=false;
 const root={querySelector:(selector:string)=>{seen.push(selector);return {focus:()=>{focused=true;},scrollIntoView:()=>{scrolled=true;}};}} as unknown as HTMLElement;
 const old=Object.getOwnPropertyDescriptor(globalThis,'CSS');Object.defineProperty(globalThis,'CSS',{configurable:true,value:{escape:(id:string)=>id}});
 try{guide.focusMemory(root,l.mind,m.id);}finally{if(old)Object.defineProperty(globalThis,'CSS',old);else Reflect.deleteProperty(globalThis,'CSS');}
 assert.deepEqual(seen,[`[data-context-id="${item.id}"]`]);assert(focused&&scrolled);
 guide.selection.add(m.id);guide.selection.add('deleted-entry');guide.query='hidden';guide.reconcile(l.mind);assert.deepEqual([...guide.selection],[m.id]);
});

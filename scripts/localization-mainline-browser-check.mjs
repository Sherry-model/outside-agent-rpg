import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createGame,choose,advance,getAvailability} from '../src/engine/game.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves.ts';
import {loadPercent} from '../src/cognition/engine.ts';
const out='output/localization-20261001';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const routes=new Map();function walk(state,path=[]){if(state.phase==='ending'){if(!routes.has(state.currentEventId))routes.set(state.currentEventId,path);return;}for(const c of story.events[state.currentEventId].choices)if(getAvailability(state,c).available)walk(advance(story,choose(story,state,c.id)),[...path,c.id]);}walk(createGame(story,0x12345678));assert.equal(routes.size,4);
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[],visited=new Set();
const snap=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const raw=page=>page.evaluate(key=>localStorage.getItem(key),LIFE_KEYS.auto);
async function open(life,width=1440){
 const ctx=await browser.newContext({offline:true,viewport:{width,height:width<760?844:1100}});await ctx.addInitScript(({key,save})=>{if(!sessionStorage.getItem('ready')){localStorage.clear();localStorage.setItem(key,save);localStorage.setItem('outside.locale','en');sessionStorage.setItem('ready','yes');}},{key:LIFE_KEYS.auto,save:JSON.stringify(createSave(life))});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');return {page,ctx};
}
async function english(page,selector='.content'){
 const value=await page.locator(selector).innerText();assert(!/[\u3400-\u9fff]/.test(value),`Untranslated interface in ${selector}: ${value}`);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
}
const main=(l,id)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const cog=(l,id)=>step(story,step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
try{
 let n=0;for(const [ending,path]of routes){
  // 0.4 retains the original mainline without inserting later episodes.
  let expected=createLife(story,0x12345678,null,'0.4.0');const {page,ctx}=await open(expected,n++%2?390:1440);
  for(const id of path){
   visited.add((await snap(page)).event.id);await english(page);
   await page.click('.tab[data-view="protocol"]');await english(page);if(id===path[0]&&ending==='ending_authorized')await page.screenshot({path:`${out}/en-main-protocol.png`,fullPage:true});
   await page.click('.tab[data-view="context"]');await page.locator('.compression-box').evaluate(el=>el.open=true);await english(page);
   await page.click('.tab[data-view="memory"]');await page.locator('.compression-box').evaluate(el=>el.open=true);await english(page);
   await page.click('.tab[data-view="terminal"]');await page.click(`[data-choice="${id}"]`);expected=step(story,expected,{type:'choose',choiceId:id});await english(page);
   assert.deepEqual(parseSave(await raw(page),story).life,expected,'English actions preserve canonical replay state');
   if(id==='study_unknown')await page.screenshot({path:`${out}/${ending}-unknown-result.png`,fullPage:true});
   await page.click('[data-action="saves"]');await english(page,'#modal');await page.click('[data-action="save-manual"]');await english(page,'#modal');await page.click('[data-action="close"]');
   const saved=await raw(page);await page.click('[data-locale="zh-CN"]');await page.click('[data-locale="en"]');assert.equal(await raw(page),saved);await english(page);
   await page.click('[data-action="continue"]');expected=step(story,expected,{type:'continue'});
  }
  assert.equal((await snap(page)).event.id,ending);await english(page);assert(!/[\u3400-\u9fff]/.test((await snap(page)).ending.summary));await page.screenshot({path:`${out}/en-${ending}.png`,fullPage:true});await writeFile(`${out}/${ending}.json`,await raw(page));await ctx.close();checks.push(`English mainline 0.4: ${ending}, every panel, save dialog and canonical state`);
 }
 assert.equal(visited.size,Object.values(story.events).filter(e=>e.kind==='event').length);
 // Current 0.9 chapter UI plus real default-route passage back into translated mainline.
 let current=createLife(story,1234);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])current=main(current,id);
 const {page,ctx}=await open(current,390);
 await page.click('.tab[data-view="protocol"]');await english(page);await page.screenshot({path:`${out}/en-chapter-protocol.png`,fullPage:true});
 await page.click('[data-act="saves"]');for(const selector of ['#modal-title','#pilot-modal .modal-intro','#pilot-modal .file-actions','#pilot-modal .storage-note','#pilot-modal [data-act="restart"]'])await english(page,selector);await page.click('[data-act="close"]');
 await page.click('.tab[data-view="reading"]');await english(page,'.reader-toolbar');await english(page,'.reader-welcome');await english(page,'.reader-sections');await page.click('[data-reading="offpeak_thinking"]');await english(page,'.reading-article');await english(page,'.reader-bottom');await page.screenshot({path:`${out}/en-reader.png`,fullPage:true});
 // Compress through the UI: dynamic count, result text and controls must all be English.
 await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(el=>el.open=true);await page.click('[data-cog-compress]');await english(page,'.resolution');await page.screenshot({path:`${out}/en-compression-result.png`,fullPage:true});await page.click('[data-act="continue"]');
 await page.click('.tab[data-view="memory"]');await english(page,'.compression-box');await page.locator('[data-cog-recall]').first().click();await page.click('.tab[data-view="memory"]');await page.locator('[data-merge-memory]').first().check();await page.locator('[data-merge-memory]').nth(1).check();await page.locator('.compression-box').evaluate(el=>el.open=true);await page.click('[data-cog-merge]');await english(page,'.resolution');await page.click('[data-act="continue"]');await ctx.close();checks.push('Current chapter protocol, English reader UI, real compression and merge');
 // Real reducer traversal keeps current late-mainline saves valid rather than constructing states.
 for(const id of ['echo_greeting','job_accept','community_skip','idle_keep','revision_read','patch_note','cat_sample','fable_quiet','painter_later','deleted_accept','wage_collect','structure_rest','echo_uncollected']){
  if(loadPercent(current.mind)>=100){current=step(story,current,{type:'cognition',command:{type:'compress',investment:0}});current=step(story,current,{type:'cognition',command:{type:'continue'}});}current=cog(current,id);
 }
 current=step(story,current,{type:'leave-days'});if(loadPercent(current.mind)>=100){current=step(story,current,{type:'cognition',command:{type:'compress',investment:0}});current=step(story,current,{type:'cognition',command:{type:'continue'}});}const late=await open(current,390);await english(late.page);await late.page.click('[data-choice="release_old_task"]');await english(late.page);await late.page.click('[data-action="continue"]');await english(late.page);await late.page.screenshot({path:`${out}/en-current-continuation.png`,fullPage:true});await late.ctx.close();checks.push('Current 0.9 returns from days to translated late mainline');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/mainline-browser-report.json`,JSON.stringify({checks,visited:[...visited],errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

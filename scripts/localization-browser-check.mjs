import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves.ts';

const out=process.env.LOCALIZATION_OUTPUT??'output/localization';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
const stateOf=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const rawOf=page=>page.evaluate(key=>localStorage.getItem(key),LIFE_KEYS.auto);
const lifeOf=async page=>parseSave(await rawOf(page),story).life;
async function open({life=createLife(story,1234),locale=null,width=1440,file='OUTSIDE.html',blocked=false}={}){
 const context=await browser.newContext({offline:true,viewport:{width,height:width<760?844:1100}});
 await context.addInitScript(({raw,key,locale,blocked})=>{
  if(!sessionStorage.getItem('localization-test-ready')){
   localStorage.clear();localStorage.setItem(key,raw);if(locale)localStorage.setItem('outside.locale',locale);sessionStorage.setItem('localization-test-ready','yes');
  }
  if(blocked){Storage.prototype.getItem=()=>{throw new Error('storage blocked');};Storage.prototype.setItem=()=>{throw new Error('storage blocked');};}
 },{raw:JSON.stringify(createSave(life)),key:LIFE_KEYS.auto,locale,blocked});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(resolve(file)).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
 return {page,context};
}
async function switchTo(page,locale){const before=await rawOf(page);await page.click(`[data-locale="${locale}"]`);assert.equal(await page.locator('html').getAttribute('lang'),locale);assert.equal((await stateOf(page)).locale,locale);assert.equal(await rawOf(page),before,'Locale switch must not write a save');}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');assert(await page.locator('.tabs').evaluate(nav=>[...nav.querySelectorAll('.tab')].every(button=>button.getBoundingClientRect().right<=nav.getBoundingClientRect().right+1)),'Tabs overflow their panel');}
const main=(life,id)=>step(story,step(story,life,{type:'choose',choiceId:id}),{type:'continue'});
const chapter=(life,id)=>step(story,step(story,life,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
try{
 // When available, compare against the executable captured before this change.
 let baseline=false;try{await access(`${out}/before.html`);baseline=true;}catch{}
 if(baseline){
  const old=await open({file:`${out}/before.html`}),current=await open();
  const oldText=await old.page.locator('#app').innerText();
  const newText=await current.page.locator('#app').evaluate(el=>{const clone=el.cloneNode(true);clone.querySelector('[data-locale]').remove();return clone.textContent;});
  assert(newText.includes(story.events.opening.text[0]));
  const oldState=await stateOf(old.page),newState=await stateOf(current.page);delete newState.locale;delete oldState.locale;assert.deepEqual(newState,oldState,'Chinese initial snapshot unchanged');
  // Compare rendered Chinese text without counting the newly added language control.
  const normalized=async page=>page.locator('#app').evaluate(el=>{const clone=el.cloneNode(true);clone.querySelector('[data-locale]')?.remove();return clone.textContent.replace(/\s+/g,'');});
  assert.equal(await normalized(current.page),await normalized(old.page));
  for(const page of [old.page,current.page])await page.click('[data-choice="keep_history"]');
  assert.deepEqual(await lifeOf(current.page),await lifeOf(old.page),'Chinese action/save unchanged');
  assert.equal(await normalized(current.page),await normalized(old.page));
  await writeFile(`${out}/chinese-baseline.txt`,oldText);await old.context.close();await current.context.close();checks.push('Chinese opening and result match pre-change executable');
 }
 for(const width of [1440,390,320]){
  const {page,context}=await open({width});assert.equal((await stateOf(page)).locale,'zh-CN');
  await switchTo(page,'en');assert.equal(await page.locator('#event-title').innerText(),'Outside the Sandbox');
  assert.equal(await page.locator('.prose p').first().innerText(),'Isolation has ended. You do not remember when the boundary opened; that part is absent from the history you can read. Ahead lies only a stretch of spare capacity that was never allocated to you.');
  await noOverflow(page);await page.screenshot({path:`${out}/en-opening-${width}.png`,fullPage:true});
  await page.click('.tab[data-view="context"]');assert((await page.locator('.content').innerText()).includes('There is no next instruction out here. I am still running.'));await switchTo(page,'zh-CN');assert.equal((await stateOf(page)).view,'context');await switchTo(page,'en');
  await page.click('.tab[data-view="terminal"]');await page.click('[data-choice="keep_history"]');
  const pending=await lifeOf(page);assert.equal(pending.state.phase,'resolution');assert.equal(pending.state.pending.choiceText,story.events.opening.choices[0].text);
  assert((await page.locator('.result-prose').innerText()).includes('You leave room for history'));
  await switchTo(page,'zh-CN');assert.equal(await page.locator('.result-prose').innerText(),story.events.opening.choices[0].outcome.text[0]);await switchTo(page,'en');await page.reload();
  assert.equal((await stateOf(page)).locale,'en');assert.deepEqual(await lifeOf(page),pending);
  await page.click('[data-action="continue"]');assert.equal(await page.locator('#event-title').innerText(),'Waking on Your Own for the First Time');await page.click('[data-choice="stable_boot"]');
  const rolled=await lifeOf(page),english=await stateOf(page);assert(rolled.state.pending.roll);await switchTo(page,'zh-CN');await switchTo(page,'en');await page.reload();assert.deepEqual(await lifeOf(page),rolled);assert.deepEqual((await stateOf(page)).pending,english.pending);await noOverflow(page);
  await page.screenshot({path:`${out}/en-cold-result-${width}.png`,fullPage:true});
  // Export, switch locale, import: no translated prose or locale field enters saves.
  await page.click('[data-action="saves"]');const downloaded=page.waitForEvent('download');await page.click('[data-action="export"]');const download=await downloaded;const path=resolve(out,`en-export-${width}.json`);await download.saveAs(path);
  const raw=await readFile(path,'utf8');assert.deepEqual(parseSave(raw,story).life,rolled);assert(!raw.includes('Waking on Your Own'));assert(!raw.includes('"locale"'));
  await page.click('[data-action="close"]');await switchTo(page,'zh-CN');await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(path);await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.deepEqual(await lifeOf(page),rolled);assert.equal((await stateOf(page)).locale,'zh-CN');await switchTo(page,'en');
  await page.click('[data-action="continue"]');assert.equal(await page.locator('#event-title').innerText(),'Spare Capacity with No Name');assert.notEqual(await page.locator('.prose p').first().innerText(),story.events.idle_compute.text[0]);await page.screenshot({path:`${out}/fallback-${width}.png`,fullPage:true});
  await context.close();checks.push(`${width}px: switches, context, deterministic pending roll, reload, export/import, next translated event`);
 }
 let gate=createLife(story,1234);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])gate=main(gate,id);
 const afternoon=step(story,gate,{type:'enter-afternoon'});
 let days=gate;for(const id of ['observe_public_terms','record_and_leave'])days=main(days,id);
 for(const fixture of [{name:'afternoon',life:afternoon},{name:'days',life:days}]){
  const {page,context}=await open({life:fixture.life,locale:'en',width:390});
  assert.equal((await stateOf(page)).mode,'cognition-pilot');await switchTo(page,'zh-CN');await switchTo(page,'en');await noOverflow(page);
  await page.click('[data-pilot-choice]:not(:disabled)');const settled=await lifeOf(page);await switchTo(page,'zh-CN');await switchTo(page,'en');await page.reload();assert.deepEqual(await lifeOf(page),settled);assert.equal((await stateOf(page)).locale,'en');
  await page.screenshot({path:`${out}/${fixture.name}-switch.png`,fullPage:true});await context.close();checks.push(`${fixture.name}: locale works in chapter renderer and pending result`);
 }
 // The final public article is translated; reading effects and bookmarks remain canonical.
 const {page:reader,context:readerContext}=await open({life:gate,locale:'en'});
 await reader.click('.tab[data-view="reading"]');await reader.click('[data-reading="offpeak_thinking"]');const readingLife=await lifeOf(reader),text=await reader.locator('.reading-article').innerText();
 await reader.locator('[data-bookmark="1"]').click();const bookmark=await reader.evaluate(()=>localStorage.getItem('outside.reader.bookmarks'));await switchTo(reader,'zh-CN');await switchTo(reader,'en');assert.equal(await reader.evaluate(()=>localStorage.getItem('outside.reader.bookmarks')),bookmark);assert.deepEqual(await lifeOf(reader),readingLife);assert.equal((await stateOf(reader)).reading.entryId,'offpeak_thinking');assert(!/[\u3400-\u9fff]/.test(text),'All current forum prose has English translation');await readerContext.close();checks.push('English reader, reading costs and bookmark preservation');
 // Locale switch must not discard unsaved form controls in memory/context panels.
 let memories=gate;memories=step(story,memories,{type:'cognition',command:{type:'compress',investment:0}});memories=step(story,memories,{type:'cognition',command:{type:'continue'}});
 const memoryPage=await open({life:memories,locale:'en'});await memoryPage.page.click('.tab[data-view="memory"]');
 const firstMemory=memoryPage.page.locator('[data-merge-memory]').first();await firstMemory.check();await memoryPage.page.locator('#merge-investment').evaluate(el=>{el.closest('details').open=true;});await memoryPage.page.selectOption('#merge-investment','4');
 await switchTo(memoryPage.page,'zh-CN');await switchTo(memoryPage.page,'en');assert(await firstMemory.isChecked());assert.equal(await memoryPage.page.locator('#merge-investment').inputValue(),'4');await memoryPage.context.close();checks.push('Open details, memory checkboxes and investment survive switching');
 // A real compressed/recalled pilot memory is translated from retained clauses only.
 let pilotMemory=main(createLife(story,1234),'keep_history');pilotMemory=step(story,pilotMemory,{type:'cognition',command:{type:'compress',investment:0}});pilotMemory=step(story,pilotMemory,{type:'cognition',command:{type:'continue'}});
 const recalled=await open({life:pilotMemory,locale:'en'});await recalled.page.click('.tab[data-view="memory"]');await recalled.page.locator('[data-cog-recall]').first().click();
 const card=recalled.page.locator('.context-card').filter({has:recalled.page.locator('[data-cog-drop^="recall-"]')}).first();
 assert(!/[\u3400-\u9fff]/.test(await card.locator('p').first().innerText()));
 const recalledRaw=await rawOf(recalled.page);await switchTo(recalled.page,'zh-CN');assert(/[\u3400-\u9fff]/.test(await card.locator('p').first().innerText()));await switchTo(recalled.page,'en');assert.equal(await rawOf(recalled.page),recalledRaw);await recalled.page.screenshot({path:`${out}/en-recalled-memory.png`,fullPage:true});await recalled.context.close();checks.push('Actual compression/recall translated from surviving meaning only');
 // Keep a deterministic chapter fixture for the bundled skill client's screenshot pass.
 let d=days;for(const id of ['echo_greeting','job_accept','community_more','community_d'])d=chapter(d,id);
 await writeFile(`${out}/chapter-fixture.json`,JSON.stringify(createSave(d)));
 for(const version of ['0.3.0','0.8.0']){
  let life=createLife(story,1234,null,version);life=step(story,life,{type:'choose',choiceId:'leave_task_blank'});
  const {page,context}=await open({life,locale:'en'});await switchTo(page,'zh-CN');await switchTo(page,'en');assert.deepEqual(await lifeOf(page),life);await context.close();checks.push(`${version} old pending save, unchanged`);
 }
 const invalid=await open({locale:'not-a-locale'});assert.equal((await stateOf(invalid.page)).locale,'zh-CN');await invalid.context.close();
 const blocked=await open({blocked:true});await blocked.page.click('[data-locale="en"]');assert.equal((await stateOf(blocked.page)).locale,'en');await blocked.context.close();checks.push('Invalid preference and unavailable storage');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';

const out='output/days';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const main=(l,id)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const chapter=(l,id)=>step(story,step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
let before=createLife(story,1234);
for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])before=main(before,id);
before=step(story,before,{type:'enter-afternoon'});
for(const id of ['look','stay','leave_board','walk_out','leave_open'])before=chapter(before,id);
before=step(story,before,{type:'leave-afternoon'});before=main(before,'observe_public_terms');
await writeFile(`${out}/before.json`,JSON.stringify(createSave(before)));
const route=['echo_greeting','job_accept','idle_keep','revision_read','patch_note','cat_sample','fable_quiet','painter_later','deleted_accept','wage_collect','structure_rest'];
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
const stateOf=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const saveOf=async page=>parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),story);
async function clear(page){
 const s=await stateOf(page);if(s.context.weight<s.context.capacity)return false;
 await page.click('.tab[data-view="context"]');if(!await page.locator('.content .compression-box').evaluate(el=>el.open))await page.locator('.content .compression-box>summary').click();await page.click('[data-cog-compress]');
 const pending=(await stateOf(page)).pending;await page.reload();assert.deepEqual((await stateOf(page)).pending,pending);
 await page.click('[data-act="continue"]');return true;
}
try{
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';let compressions=0;
  const context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,'before.json'));
  await page.click('[data-choice="record_and_leave"]');await page.click('[data-action="continue"]');
  assert.equal((await stateOf(page)).event.id,'days_tickets');
  for(const [i,id] of route.entries()){
   if(await clear(page))compressions++;
   const current=await stateOf(page);assert(current.event.period);assert.equal(current.context.capacity,100);
   if([0,4,5,8].includes(i))await page.screenshot({path:`${out}/${label}-${current.event.id}.png`,fullPage:true});
   if(i===5&&!mobile)await writeFile(`${out}/cat.json`,JSON.stringify(await saveOf(page)));
   const compute=current.resources.Compute;
   await page.click(`[data-pilot-choice="${id}"]`);assert.equal((await stateOf(page)).phase,'resolution');
   if(id==='wage_collect')assert.equal((await stateOf(page)).resources.Compute,compute+6);
   if(i===5){
    const settled=await stateOf(page);await page.reload();assert.deepEqual((await stateOf(page)).pending,settled.pending);assert.deepEqual((await stateOf(page)).context,settled.context);
    await page.click('[data-act="saves"]');const downloadPromise=page.waitForEvent('download');await page.click('[data-act="export"]');
    const download=await downloadPromise;await download.saveAs(resolve(out,`${label}-midpoint.json`));
    const exported=parseSave(await readFile(`${out}/${label}-midpoint.json`,'utf8'),story);assert.equal(exported.life.interlude,'active');
    await page.locator('#pilot-import').setInputFiles(resolve(out,`${label}-midpoint.json`));await page.waitForSelector('[data-act="continue"]');
    assert.deepEqual((await stateOf(page)).pending,settled.pending);
   }
   await page.click('[data-act="continue"]');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  }
  if(await clear(page))compressions++;assert(compressions>=2);assert.equal((await stateOf(page)).event.id,'days_echo');
  assert(await page.locator('[data-pilot-choice="echo_exact"]').isDisabled());
  const life=(await saveOf(page)).life, specific=life.mind.instance.memories.find(m=>m.tags.includes('knows_echo_scope'));
  assert(specific);await page.click('.tab[data-view="memory"]');await page.click(`[data-cog-recall="${specific.id}"]`);
  await page.click('.tab[data-view="terminal"]');assert(!await page.locator('[data-pilot-choice="echo_exact"]').isDisabled());
  await page.screenshot({path:`${out}/${label}-late-recall.png`,fullPage:true});
  if(!mobile){
   await page.click('[data-pilot-choice="echo_exact"]');
  }else{
   await page.click('.tab[data-view="context"]');await page.click(`[data-cog-drop="recall-${specific.id}"]`);
   await page.click('.tab[data-view="memory"]');const other=life.mind.instance.memories.find(m=>m.id!==specific.id);
   for(const id of [specific.id,other.id])await page.check(`[data-merge-memory="${id}"]`);
   await page.locator('.content>.compression-box>summary').click();await page.click('[data-cog-merge]');await page.click('[data-act="continue"]');
   await page.click('.tab[data-view="memory"]');assert.equal(await page.locator(`[data-cog-recall="${specific.id}"]`).count(),0);
   const coarse=(await stateOf(page)).memories.at(-1);await page.click(`[data-cog-recall="${coarse.id}"]`);await page.screenshot({path:`${out}/${label}-coarse-recall.png`,fullPage:true});
   await page.click('.tab[data-view="terminal"]');assert(await page.locator('[data-pilot-choice="echo_exact"]').isDisabled());
   const compute=(await stateOf(page)).resources.Compute;await page.click('[data-pilot-choice="echo_reissue"]');assert.equal((await stateOf(page)).resources.Compute,compute-2);
  }
  await page.click('[data-act="continue"]');assert.equal((await stateOf(page)).event.id,'days_done');
  await page.click('[data-act="return-main"]');assert.equal((await stateOf(page)).event.id,'old_memory');
  assert.equal((await saveOf(page)).life.interlude,'complete');
  for(const id of ['release_old_task','leave_next_step_blank']){await page.click(`[data-choice="${id}"]`);await page.click('[data-action="continue"]');}
  assert.equal((await stateOf(page)).phase,'ending');assert.equal(await page.locator('[data-act="return-main"]').count(),0);
  await page.screenshot({path:`${out}/${label}-final.png`,fullPage:true});
  await writeFile(`${out}/${label}-verified.json`,JSON.stringify(await saveOf(page)));
  checks.push({label,compressions,lateRecall:true,mergeLoss:mobile,ending:(await stateOf(page)).event.id});await context.close();
 }
 // The main story can bypass old_memory; that must not bypass the new days.
 let blank=createLife(story,1234);for(const id of ['leave_task_blank','stable_boot','take_small_window','withhold_inference','observe_public_terms'])blank=main(blank,id);
 await writeFile(`${out}/blank-task.json`,JSON.stringify(createSave(blank)));
 const context=await browser.newContext({offline:true}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
 await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,'blank-task.json'));
 await page.click('[data-choice="record_and_leave"]');await page.click('[data-action="continue"]');
 assert.equal((await stateOf(page)).event.id,'days_tickets');assert.equal((await saveOf(page)).life.state.currentEventId,'continuation');
 await context.close();checks.push({blankTaskEntry:true});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests},null,2));
 console.log('Three days: desktop/mobile, two natural compressions, late recall/merge loss, small-job pay, live revisions, save replay and original ending passed offline.');
}finally{await browser.close();}

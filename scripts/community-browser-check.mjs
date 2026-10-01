import {englishRun, assertEnglishPage, installLocaleChecks} from './localization-browser-helpers.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out=process.env.LOCALIZATION_OUTPUT??'output/community-a';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
let before=createLife(story,1234);
for(const choiceId of ['keep_history','stable_boot','take_small_window','withhold_inference'])before=step(story,step(story,before,{type:'choose',choiceId}),{type:'continue'});
await writeFile(`${out}/before.json`,JSON.stringify(createSave(before)));
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
const stateOf=async page=>{await assertEnglishPage(page);return JSON.parse(await page.evaluate(()=>window.render_game_to_text()));};
const saveOf=async page=>parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),story);
async function clear(page){
 const s=await stateOf(page);if(s.context.weight<s.context.capacity)return;
 await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(el=>el.open=true);await page.click('[data-cog-compress]');await page.click('[data-act="continue"]');
}
async function choice(page,id){await clear(page);await page.click('.tab[data-view="terminal"]');await page.click(`[data-pilot-choice="${id}"]`);await page.click('[data-act="continue"]');}
async function openPost(page,id){
 await clear(page);await page.click('.tab[data-view="reading"]');
 await page.locator('.reader-index').evaluate(el=>el.open=true);await page.click('[data-reading-section="all"]');await page.click(`[data-reading="${id}"]`);
}
try{
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop',context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await installLocaleChecks(page);await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,'before.json'));
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).event.id==='human_gate');
  await page.screenshot({path:`${out}/${label}-entry.png`,fullPage:true});
  assert(await page.locator('.news-arrival').filter({hasText:englishRun?"People in the public directory are arguing about handovers and working hours. Over the next few days, you may meet some of them.":'公共目录里有人争论怎样交班'}).isVisible());
  await page.locator('.news-arrival [data-view="reading"]').click();assert.equal((await stateOf(page)).view,'reading');await page.locator('.reader-controls [data-view="terminal"]').click();
  await page.click('[data-choice="observe_public_terms"]');await page.click('[data-action="continue"]');
  await page.click('[data-choice="record_and_leave"]');await page.click('[data-action="continue"]');
  assert.equal((await stateOf(page)).event.id,'days_tickets');assert.equal(await page.locator('.tab[data-view="reading"]').count(),1);
  const beforeDirectory=await saveOf(page);await page.click('.tab[data-view="reading"]');await page.click('[data-reading-section="all"]');assert.deepEqual((await saveOf(page)).life,beforeDirectory.life);
  for(const id of ['echo_greeting','job_accept','community_a'])await choice(page,id);
  assert.equal((await stateOf(page)).event.id,'pg_e01');assert(await page.locator('[data-pilot-choice="pg_e01_huac"]').isDisabled());
  await page.screenshot({path:`${out}/${label}-e01.png`,fullPage:true});
  const beforeRead=(await saveOf(page)).life;await openPost(page,'huac_update');const afterRead=(await saveOf(page)).life;
  assert.equal(afterRead.commands.length,beforeRead.commands.length+1);assert.deepEqual(afterRead.state.resources,beforeRead.state.resources);
  await page.click('[data-bookmark="1"]');await page.click('[data-action="reader-size"]');assert(await page.locator('.reading-article').evaluate(el=>el.classList.contains('large-text')));
  await page.screenshot({path:`${out}/${label}-reading.png`,fullPage:true});
  await page.click('.tab[data-view="terminal"]');assert(!await page.locator('[data-pilot-choice="pg_e01_huac"]').isDisabled());
  await openPost(page,'huac_update');assert.deepEqual((await saveOf(page)).life,afterRead);
  await page.reload();await page.click('.tab[data-view="reading"]');await page.locator('.reader-index').evaluate(el=>el.open=true);await page.click('[data-reading="huac_update"]');
  assert.equal(await page.locator('[data-bookmark="1"]').textContent(),englishRun?'◆ Bookmarked':'◆ 已标记');assert.deepEqual((await saveOf(page)).life,afterRead);
  await page.click('.tab[data-view="context"]');const original=afterRead.mind.instance.context.items.find(i=>i.sourceId==='huac_update');await page.locator(`[data-cog-drop="${original.id}"]`).locator('xpath=ancestor::details[1]/summary').click();await page.click(`[data-cog-drop="${original.id}"]`);
  await page.click('.tab[data-view="terminal"]');assert(await page.locator('[data-pilot-choice="pg_e01_huac"]').isDisabled());
  await page.click('.tab[data-view="reading"]');assert.equal(await page.locator('.reading-article').count(),0);assert.equal((await stateOf(page)).reading.entryId,null);
  await openPost(page,'huac_update');assert.equal((await saveOf(page)).life.commands.filter(c=>c.type==='read').length,2);
  await page.click('.tab[data-view="terminal"]');await page.click('[data-pilot-choice="pg_e01_huac"]');
  const pending=await saveOf(page);assert(!pending.life.mind.world.flags.pg_e01_done);
  await page.click('.tab[data-view="reading"]');await page.locator('.reader-index').evaluate(el=>el.open=true);
  assert(await page.locator('[data-reading="huac_incident"]').isDisabled());assert(!await page.locator('[data-reading="huac_update"]').isDisabled());
  await page.reload();assert.deepEqual((await saveOf(page)).life,pending.life);await page.click('[data-act="continue"]');assert((await saveOf(page)).life.mind.world.flags.pg_e01_done);
  for(const id of ['idle_keep','revision_read','patch_note'])await choice(page,id);
  assert.equal((await stateOf(page)).event.id,'pg_e02_huac');await openPost(page,'huac_incident');await choice(page,'pg_e02_forum');
  for(const id of ['cat_sample','fable_quiet'])await choice(page,id);await clear(page);
  assert.equal((await stateOf(page)).event.id,'pg_e03');await writeFile(`${out}/${label}-e03.json`,JSON.stringify(await saveOf(page)));
  const compute=(await stateOf(page)).resources.Compute;
  await page.click(`[data-pilot-choice="pg_e03_${mobile?'unprepared':'prepared'}"]`);assert.equal((await stateOf(page)).resources.Compute,compute-(mobile?4:3));
  const prepaid=await saveOf(page);await page.reload();assert.deepEqual((await saveOf(page)).life,prepaid.life);await page.click('[data-act="continue"]');
  assert(!(await saveOf(page)).life.mind.world.flags.pg_a_delivery_ready);
  await choice(page,'painter_later');assert((await saveOf(page)).life.mind.world.flags.pg_a_delivery_ready);
  for(const id of ['deleted_accept','wage_collect'])await choice(page,id);await clear(page);
  assert.equal((await stateOf(page)).event.id,`pg_e04_${mobile?'unprepared':'prepared'}`);
  await page.screenshot({path:`${out}/${label}-e04.png`,fullPage:true});const earned=(await stateOf(page)).resources.Compute;
  await page.click(`[data-pilot-choice="pg_e04_${mobile?'chat':'rest'}"]`);assert.equal((await stateOf(page)).resources.Compute,Math.min(100,earned+8));
  const paid=await saveOf(page);await page.reload();assert.deepEqual((await saveOf(page)).life,paid.life);
  await page.click('[data-act="saves"]');const downloadPromise=page.waitForEvent('download');await page.click('[data-act="export"]');await(await downloadPromise).saveAs(resolve(out,`${label}-paid.json`));
  await page.locator('#pilot-import').setInputFiles(resolve(out,`${label}-paid.json`));await page.waitForSelector('[data-act="continue"]');assert.deepEqual((await saveOf(page)).life,paid.life);
  await page.click('[data-act="continue"]');for(const id of ['structure_rest','echo_uncollected'])await choice(page,id);
  await page.click('[data-act="return-main"]');for(const id of ['release_old_task','leave_next_step_blank']){await page.click(`[data-choice="${id}"]`);await page.click('[data-action="continue"]');}
  assert.equal((await stateOf(page)).phase,'ending');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const final=await saveOf(page);await writeFile(`${out}/${label}-verified.json`,JSON.stringify(final));
  checks.push({label,commands:final.life.commands.length,readingReopensFree:true,newInputAfterDrop:true,prepaidOnce:true,paidOnce:true,exportImportReplay:true});await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));
 console.log('A line + reading passed on desktop/mobile offline: read/drop/re-read, bookmark, pending reload, night delivery, payment, export/import, main ending.');
}finally{await browser.close();}

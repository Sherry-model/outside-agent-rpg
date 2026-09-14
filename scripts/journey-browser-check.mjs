import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSave } from '../src/life/saves.ts';
import { parseStory } from '../src/engine/parser.ts';
import { readdir } from 'node:fs/promises';
import { createLife } from '../src/life/engine.ts';
import { createSave } from '../src/life/saves.ts';
const out='output/journey';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const initial=resolve(out,'initial.json');await writeFile(initial,JSON.stringify(createSave(createLife(story,0x12345678))));
const browser=await chromium.launch({headless:true});const errors=[],requests=[];
const stateOf=async p=>JSON.parse(await p.evaluate(()=>window.render_game_to_text()));
const saveOf=async p=>p.evaluate(()=>JSON.parse(localStorage.getItem('outside.life.v1.auto')));
async function open(viewport={width:1440,height:1100}) {
 const context=await browser.newContext({offline:true,viewport});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href+'#tomorrow');await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
 assert.equal((await stateOf(page)).mode,'turn-based-text-rpg');assert.equal(await page.locator('[data-action="tomorrow"]').count(),0);
 await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(initial);
 await page.waitForFunction(()=>!document.querySelector('#modal').open);
 return {context,page};
}
async function mainChoice(page,id) {await page.click(`[data-choice="${id}"]`);await page.click('[data-action="continue"]');}
async function chapterChoice(page,id) {await page.click(`[data-pilot-choice="${id}"]`);await page.click('[data-act="continue"]');}
try {
 for(const useCompression of [false,true]) {
  const {context,page}=await open(useCompression?{width:390,height:844}:undefined);
  for(const id of ['keep_history','stable_boot','take_small_window']){await mainChoice(page,id);assert.equal(await page.locator('[data-action="tomorrow"]').count(),0);}
  await mainChoice(page,'withhold_inference');const origin=await stateOf(page);
  assert.equal(origin.event.id,'human_gate');assert(origin.afternoonAvailable);
  if(!useCompression)await page.screenshot({path:`${out}/mainline-invitation.png`,fullPage:true});
  await page.click('[data-action="tomorrow"]');let current=await stateOf(page);
  assert(current.integrated);assert.deepEqual(current.resources,origin.resources);assert.equal(current.turn,origin.turn);assert.equal(current.context.weight,origin.context.weight);
  assert.equal(await page.locator('[data-act="legacy"]').count(),1); // inert brand, no chapter jump button
  await chapterChoice(page,'look');assert.equal((await stateOf(page)).context.weight,origin.context.weight+3);
  await chapterChoice(page,'stay');assert.equal((await stateOf(page)).context.weight,origin.context.weight+5);
  await chapterChoice(page,'leave_board');assert.equal((await stateOf(page)).context.weight,origin.context.weight+9);
  assert(!await page.locator('[data-pilot-choice="walk_out"]').isDisabled());
  await page.screenshot({path:`${out}/${useCompression?'mobile':'desktop'}-context.png`,fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(useCompression) {
   await page.locator('.compression-box > summary').click();await page.locator('.compression-box [data-invest="8"]').click();await page.click('[data-act="compress"]');
   const settled=await stateOf(page);const stored=await saveOf(page);parseSave(JSON.stringify(stored),story);
   const backup=resolve(out,'active.json');await writeFile(backup,JSON.stringify(stored));
   await page.reload();assert.deepEqual((await stateOf(page)).pending,settled.pending);
   assert.deepEqual((await stateOf(page)).resources,settled.resources);
   await page.click('[data-act="saves"]');const bad=structuredClone(stored);bad.life.mind.instance.resources.Compute++;
   const invalid=resolve(out,'invalid.json');await writeFile(invalid,JSON.stringify(bad));
   await page.locator('#pilot-import').setInputFiles(invalid);await page.waitForFunction(()=>document.querySelector('.modal-message').textContent.includes('导入失败'));
   assert.deepEqual((await stateOf(page)).pending,settled.pending);
   await page.locator('#pilot-import').setInputFiles(backup);await page.waitForFunction(()=>!document.querySelector('#pilot-modal').open);
   await page.click('[data-act="continue"]');await page.click('[data-view="memory"]');
   assert(!/坡|昨日|避风/.test(await page.locator('.content').innerText()));
   await page.locator('[data-cog-recall]').first().click();await page.click('[data-view="terminal"]');
  }
  await chapterChoice(page,'walk_out');await chapterChoice(page,useCompression?'visit':'leave_open');
  const beforeReturn=await stateOf(page);assert.equal(beforeReturn.phase,'ending');
  await page.click('[data-act="saves"]');const downloadP=page.waitForEvent('download');await page.click('[data-act="export"]');
  const download=await downloadP;const exportPath=resolve(out,`full-journey-${useCompression}.json`);await download.saveAs(exportPath);
  const exported=parseSave(await readFile(exportPath,'utf8'),story);assert.equal(exported.state.currentEventId,'human_gate');assert.equal(exported.life.mind.instance.phase,'ending');
  await page.click('[data-act="close"]');await page.click('[data-act="return-main"]');
  const after=await stateOf(page);assert.equal(after.event.id,'human_gate');assert.equal(after.chapter,'complete');assert.equal(after.turn,beforeReturn.turn);assert.deepEqual(after.resources,beforeReturn.resources);
  assert.equal(await page.locator('[data-action="tomorrow"]').count(),0);
  await page.reload();assert.deepEqual((await stateOf(page)).resources,after.resources);assert.equal((await stateOf(page)).chapter,'complete');
  await page.click('[data-view="memory"]');assert.equal((await stateOf(page)).context.capacity,100);
  if(useCompression)assert((await stateOf(page)).memoryCount>0);else assert.equal((await stateOf(page)).memoryCount,0);
  await page.screenshot({path:`${out}/returned-memory-${useCompression}.png`,fullPage:true});await page.click('[data-view="terminal"]');
  await mainChoice(page,'observe_public_terms');assert.equal((await stateOf(page)).event.id,'unknown_defense');
  parseSave(JSON.stringify(await saveOf(page)),story);
  // Loading a completed chapter backup is one complete restore, not attaching it to a different run.
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(exportPath);
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).integrated===true);
  await page.click('[data-act="return-main"]');assert.deepEqual((await stateOf(page)).resources,beforeReturn.resources);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 await writeFile(`${out}/report.json`,JSON.stringify({errors,requests,checks:['no global entry','timeline gate','resource and RNG inheritance','inherited context plus 3-2-4 of 100','optional compression','pending reload','whole journey import/export','one return application','mainline continues','old saves import','mobile','no body-language residue']},null,2));
 console.log('Journey integration passed: timeline, gradual context, full saves, resource return and offline UI.');
} finally {await browser.close();}

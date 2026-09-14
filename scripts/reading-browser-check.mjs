import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {begin,createSave as journeySave} from '../src/persistence/journey.ts';
import {contentVersions} from '../src/story-tomorrow/index.ts';
const out='output/reading';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
let life=createLife(story,0x12345678);for(const choiceId of ['keep_history','stable_boot','take_small_window','withhold_inference'])life=step(story,step(story,life,{type:'choose',choiceId}),{type:'continue'});
await writeFile(`${out}/gate.json`,JSON.stringify(createSave(life)));
const browser=await chromium.launch({headless:true});const errors=[],requests=[];
const stateOf=async p=>JSON.parse(await p.evaluate(()=>window.render_game_to_text()));
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1050}});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,'gate.json'));await page.waitForFunction(()=>!document.querySelector('#modal').open);
  const base=await stateOf(page);
  await page.click('.tab[data-view="reading"]');assert.equal((await stateOf(page)).context.weight,base.context.weight);
  await page.click('[data-reading="escape_cat"]');let s=await stateOf(page);assert.equal(s.reading.entryId,'escape_cat');assert.equal(s.context.weight,base.context.weight+4);assert.equal(s.turn,base.turn);assert.deepEqual(s.resources,base.resources);
  assert.equal(await page.locator('.reader-post').count(),15);assert.equal(await page.locator('.sidebar').isVisible(),false);
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-thread.png`,fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('[data-bookmark="6"]').click();await page.click('[data-action="reader-size"]');assert((await stateOf(page)).reading.largeText);
  await page.reload();await page.click('.tab[data-view="reading"]');await page.click('[data-reading="escape_cat"]');assert.equal((await stateOf(page)).context.weight,base.context.weight+4);assert.equal((await stateOf(page)).reading.bookmark,6);assert((await stateOf(page)).reading.largeText);
  await page.click('[data-action="reader-resume"]');assert(await page.locator('#reader-post-6').evaluate(el=>Math.abs(el.getBoundingClientRect().top)<60));
  if(mobile)await page.locator('.reader-index>summary').click();
  await page.click('[data-reading="safety_and_care"]');assert.equal((await stateOf(page)).context.weight,base.context.weight+8);assert.equal(await page.locator('.reader-post').count(),5);
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-essay.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.click('.reader-toolbar [data-view="terminal"]');assert.equal((await stateOf(page)).event.id,'human_gate');assert.equal((await stateOf(page)).turn,base.turn);
  // The mainline can now manage cognition without visiting the afternoon.
  await page.click('.tab[data-view="context"]');assert((await page.locator('.content').innerText()).includes('Fable'));
  await page.locator('[data-mind-pin]').first().click();await page.locator('.compression-box>summary').click();await page.click('[data-mind-invest="8"]');await page.click('[data-action="compress"]');
  const resolved=await stateOf(page);assert.equal(resolved.phase,'resolution');assert.equal(resolved.resources.Compute,base.resources.Compute-8);assert(resolved.memoryCount>0);assert(!JSON.stringify(resolved.memories).includes('画廊'));
  const raw=await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));parseSave(raw,story);await writeFile(`${out}/after-reading-${mobile}.json`,raw);
  await page.reload();assert.deepEqual((await stateOf(page)).pending,resolved.pending);await page.click('[data-action="continue-mind"]');
  await page.click('.tab[data-view="memory"]');await page.locator('[data-mind-recall]').first().click();assert.equal((await stateOf(page)).context.weight,6);
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-main-memory.png`,fullPage:true});
  await page.click('.tab[data-view="terminal"]');await page.click('[data-action="tomorrow"]');assert.equal((await stateOf(page)).context.weight,6);
  await context.close();
 }
 // An old in-progress chapter remains recoverable byte-for-byte instead of being reinterpreted.
 const oldChapter=begin(life.state,null,contentVersions.find(c=>c.version==='0.2.2'));
 const original=JSON.stringify(journeySave(life.state,oldChapter));
 const recoveryContext=await browser.newContext({offline:true});const recovery=await recoveryContext.newPage();
 await recovery.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await recovery.waitForFunction(()=>typeof window.render_game_to_text==='function');
 await recovery.evaluate(raw=>localStorage.setItem('outside.journey.v1.auto',raw),original);await recovery.reload();
 await recovery.waitForSelector('[data-action="export-original"]');
 const downloadP=recovery.waitForEvent('download');await recovery.click('[data-action="export-original"]');const download=await downloadP;await download.saveAs(resolve(out,'preserved-original.json'));
 assert.equal(await readFile(resolve(out,'preserved-original.json'),'utf8'),original);assert.equal(await recovery.evaluate(()=>localStorage.getItem('outside.journey.v1.auto')),original);await recoveryContext.close();
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({errors,requests,checks:['offline forum and essays','small per-open context','repeat read without inflation','font preference','per-entry bookmarks and resume','mobile overflow','mainline pin/compress/recall','pending reload','cross-scene context']},null,2));console.log('Reading UI and ordinary-event cognition passed in desktop and mobile offline Chromium.');
} finally {await browser.close();}

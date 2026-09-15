import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { parseStory } from '../src/engine/parser.ts';
import { createGame, choose, advance, getAvailability } from '../src/engine/game.ts';
import { createLife } from '../src/life/engine.ts';
import { createSave } from '../src/life/saves.ts';

const manifest=JSON.parse(await readFile('src/story/manifest.json','utf8'));
const sources=await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))})));
const story=parseStory(manifest,sources);
const initial=createGame(story,0x12345678);
const out='output/browser';
await mkdir(out,{recursive:true});
const initialFile=resolve(out,'initial.json');
await writeFile(initialFile,JSON.stringify(createSave(createLife(story,0x12345678,null,'0.4.0'))));
const badFile=resolve(out,'invalid.json');
await writeFile(badFile,'{"format":"outside-save","version":999}');

// Find representative routes with one real seeded RNG sequence, then play those
// exact choices in the production UI. No state injection or forced dice rolls.
const routes=new Map();
const walk=(state,path=[])=>{
  if(state.phase==='ending') { if(!routes.has(state.currentEventId)) routes.set(state.currentEventId,path); return; }
  assert(path.length<12,'Content loop');
  for(const choice of story.events[state.currentEventId].choices) if(getAvailability(state,choice).available) {
    walk(advance(story,choose(story,state,choice.id)),[...path,choice.id]);
  }
};
walk(initial);
assert.equal(routes.size,4);
const browser=await chromium.launch({headless:true});
const issues=[];
const requests=[];
const stateOf=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
async function openPage(viewport={width:1440,height:1100}) {
  const context=await browser.newContext({viewport,offline:true});
  const page=await context.newPage();
  page.on('pageerror',e=>issues.push(String(e)));
  page.on('console',m=>{if(m.type()==='error') issues.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url())) requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);
  try { await page.waitForFunction(()=>typeof window.render_game_to_text==='function',{},{timeout:5000}); }
  catch(error) { await page.screenshot({path:`${out}/boot-error.png`}); console.error('Boot errors:',issues); throw error; }
  return {context,page};
}
async function importInitial(page) {
  await page.click('[data-action="saves"]');
  await page.locator('#import-save').setInputFiles(initialFile);
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
}
async function noOverflow(page) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
}
try {
  for(const [ending,path] of routes) {
    const {page,context}=await openPage();
    await importInitial(page);
    if(ending==='ending_authorized') await page.screenshot({path:`${out}/desktop-opening.png`,fullPage:true});
    for(const [i,id] of path.entries()) {
      const before=await stateOf(page);
      assert.equal(before.phase,'event');
      if(['fable_signal','unknown_defense'].includes(before.event.id) && ending==='ending_authorized') await page.screenshot({path:`${out}/${before.event.id}.png`,fullPage:true});
      await page.click(`[data-choice="${id}"]`);
      const after=await stateOf(page);
      assert.equal(after.phase,'resolution');
      assert.equal(after.turn,before.turn+1);
      for(const [key,value] of Object.entries(after.resources)) assert.equal(await page.locator(`[role="meter"][aria-label^="${key} "]`).getAttribute('aria-valuenow'),String(value));
      if(after.pending.roll && ending==='ending_authorized') await page.screenshot({path:`${out}/dice-result.png`,fullPage:true});
      if(i===1) {
        await page.reload();
        assert.deepEqual((await stateOf(page)).pending,after.pending,'Reload must not reroll');
        // Enter on a focused control must activate that control, not advance.
        await page.locator('[data-action="saves"]').focus();
        await page.keyboard.press('Enter');
        assert(await page.locator('#modal').evaluate(el=>el.open));
        assert.equal((await stateOf(page)).phase,'resolution');
        await page.click('[data-action="save-manual"]');
        await page.click('[data-action="close"]');
        await page.click('[data-action="continue"]');
        await page.click('[data-action="saves"]');
        await page.click('[data-action="load-manual"]');
        assert.deepEqual((await stateOf(page)).pending,after.pending,'Manual snapshot must restore pending roll');
        await page.click('[data-action="saves"]');
        const downloadPromise=page.waitForEvent('download');
        await page.click('[data-action="export"]');
        const download=await downloadPromise;
        const exportPath=resolve(out,`export-${ending}.json`);
        await download.saveAs(exportPath);
        assert.deepEqual(JSON.parse(await readFile(exportPath,'utf8')).state.pending,after.pending);
        await page.locator('#import-save').setInputFiles(badFile);
        await page.waitForFunction(()=>document.querySelector('.modal-message')?.textContent.includes('导入失败'));
        assert.match(await page.locator('.modal-message').textContent(),/导入失败/);
        assert.deepEqual((await stateOf(page)).pending,after.pending,'Invalid import must leave current game intact');
        await page.click('[data-action="close"]');
      }
      await page.click('[data-action="continue"]');
    }
    assert.equal((await stateOf(page)).event.id,ending);
    assert.equal(await page.locator('[data-action=tomorrow]').count(),0);
    await page.screenshot({path:`${out}/${ending}.png`,fullPage:true});
    await page.click('[data-action="saves"]');
    assert.match(await page.locator('.export-scope').textContent(),/不汇总此前各局/);
    assert((await page.locator('.export-scope').textContent()).includes(story.events[ending].ending.code));
    const endingDownloadPromise=page.waitForEvent('download');
    await page.click('[data-action="export"]');
    const endingDownload=await endingDownloadPromise;
    assert.equal(endingDownload.suggestedFilename(),`outside-${story.events[ending].ending.code.toLowerCase().replaceAll(' ','-')}-turn-08.json`);
    const endingExportPath=resolve(out,endingDownload.suggestedFilename());
    await endingDownload.saveAs(endingExportPath);
    const endingExport=JSON.parse(await readFile(endingExportPath,'utf8'));
    assert.equal(endingExport.state.phase,'ending');
    assert.equal(endingExport.state.currentEventId,ending);
    await page.locator('#import-save').setInputFiles(endingExportPath);
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    assert.equal((await stateOf(page)).ending.code,story.events[ending].ending.code);
    await page.click('[data-action="saves"]');
    if(ending==='ending_authorized') await page.screenshot({path:`${out}/ending-export-dialog.png`,fullPage:true});
    await page.click('[data-action="close"]');
    await page.click('[data-view="memory"]');
    assert.equal((await stateOf(page)).memoryCount,0);
    assert((await stateOf(page)).context.weight>0);
    assert.match(await page.locator('.content').innerText(),/还没有整理出来的记忆入口/);
    await page.click('[data-view="protocol"]');
    assert(await page.getByText('判定行动，不判定你').isVisible());
    await page.click('[data-view="terminal"]');
    await page.click('[data-action="restart"]');
    await page.click('[data-action="close"]');
    assert.equal((await stateOf(page)).event.id,ending);
    await page.click('[data-action="restart"]');
    await page.click('[data-action="confirm-restart"]');
    assert.equal((await stateOf(page)).event.id,'opening');
    assert.equal((await stateOf(page)).turn,0);
    await noOverflow(page);
    await context.close();
    console.log(`✓ UI route ${ending} (${path.length} decisions), save/reload/export/import, memory/restart`);
  }
  const {page,context}=await openPage({width:390,height:844});
  await importInitial(page);
  await page.screenshot({path:`${out}/mobile-opening.png`,fullPage:true});
  await page.keyboard.press('1');
  assert.equal((await stateOf(page)).phase,'resolution');
  await page.keyboard.press('Enter');
  assert.equal((await stateOf(page)).event.id,'cold_start');
  assert(await page.locator('.choice-tag').first().isVisible(),'Mobile must show d100 target');
  await page.screenshot({path:`${out}/mobile-check.png`,fullPage:true});
  await noOverflow(page);
  await page.click('[data-action="crt"]');
  assert.equal((await stateOf(page)).crt,false);
  await page.reload();
  assert.equal((await stateOf(page)).crt,false);
  await page.click('[data-choice="stable_boot"]');
  await page.screenshot({path:`${out}/mobile-result.png`,fullPage:true});
  // Broken existing auto data must remain protected until an explicit recovery.
  await page.evaluate(()=>localStorage.setItem('outside.life.v1.auto','BROKEN ORIGINAL'));
  await page.reload();
  assert(await page.locator('.warning').isVisible());
  await page.click('[data-choice="keep_history"]');
  assert.equal(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),'BROKEN ORIGINAL');
  await context.close();
  assert.deepEqual(issues,[],'Browser console/page errors');
  assert.deepEqual(requests,[],'Offline HTML must make zero HTTP requests');
  await writeFile(`${out}/report.json`,JSON.stringify({endings:[...routes.keys()],routes:Object.fromEntries(routes),browserErrors:issues,httpRequests:requests,mobile:'390 × 844',offline:true},null,2));
  console.log('✓ Mobile targets/keyboard/CRT, protected corrupt save, zero HTTP requests and zero browser errors');
} finally { await browser.close(); }

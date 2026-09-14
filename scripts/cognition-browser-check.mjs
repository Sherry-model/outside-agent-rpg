import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { contentVersions } from '../src/story-tomorrow/index.ts';
import { create, reduce, pending } from '../src/cognition/engine.ts';
import { createSave, parseSave, SAVE_KEY } from '../src/cognition/saves.ts';

const content=contentVersions.find(c=>c.version==='0.2.1');
const out = 'output/cognition';
await mkdir(out, { recursive: true });
const seeds = new Map();
for (let i=1; i<=150; i++) {
  const seed=(i*2654435761)>>>0;
  let s=create(content,seed);
  s=reduce(content,s,{type:'choose',choiceId:'listen',investment:0});
  s=reduce(content,s,{type:'continue'});
  s=reduce(content,s,{type:'compress',investment:0});
  if(!seeds.has(pending(s).roll.result)) seeds.set(pending(s).roll.result,seed);
}
assert.equal(seeds.size,4);
const browser=await chromium.launch({headless:true});
const errors=[], requests=[];
const url=pathToFileURL(resolve('versions/OUTSIDE-2026-09-14-cognition-0.2.1.html')).href;
const stateOf=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
async function pageAt(viewport={width:1440,height:1100},init) {
  const context=await browser.newContext({offline:true,viewport});
  if(init) await context.addInitScript(init);
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(url+'#tomorrow');
  await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  return {page,context};
}
async function importFile(page,path) {
  await page.click('[data-act="saves"]');
  await page.locator('#pilot-import').setInputFiles(path);
  await page.waitForFunction(()=>!document.querySelector('#pilot-modal').open);
}
async function initialFile(seed) {
  const file=resolve(out,`initial-${seed}.json`);
  await writeFile(file,JSON.stringify(createSave(create(content,seed)))); return file;
}
async function checkScreen(page) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  assert(!/RiskInversion|DISTORTED|painter_on_hill|truthState|canonical/.test(await page.locator('body').innerText()),'Normal UI leaks hidden state');
}
try {
  for(const [result,seed] of seeds) {
    const {page,context}=await pageAt();
    await importFile(page,await initialFile(seed));
    await page.click('[data-pilot-choice="listen"]');
    await page.click('[data-act="continue"]');
    assert.equal((await stateOf(page)).context.weight,104);
    assert(await page.locator('[data-pilot-choice="walk_out"]').isDisabled());
    await checkScreen(page);
    const target0=await page.locator('.compression-box .check-preview').innerText();
    await page.click('[data-invest="12"]');
    assert.notEqual(await page.locator('.compression-box .check-preview').innerText(),target0);
    await page.click('[data-invest="0"]');
    if(result==='critical') {
      await page.click('[data-pin="invitation"]');
      assert.equal((await stateOf(page)).context.weight,104);
      await page.screenshot({path:`${out}/desktop-news.png`,fullPage:true});
    }
    await page.click('[data-act="compress"]');
    const settled=await stateOf(page);
    assert.equal(settled.pending.roll.result,result);
    await page.screenshot({path:`${out}/compression-${result}.png`,fullPage:true});
    await page.reload();
    assert.deepEqual((await stateOf(page)).pending,settled.pending);
    assert.equal((await stateOf(page)).resources.Compute,settled.resources.Compute);
    // Focused backup button must not accidentally trigger continue.
    await page.locator('[data-act="saves"]').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#pilot-modal').evaluate(el=>el.open));
    assert.equal((await stateOf(page)).phase,'resolution');
    await page.keyboard.press('Escape');
    await page.click('[data-act="continue"]');
    assert.equal((await stateOf(page)).context.weight,result==='critical'?27:0);
    await page.click('[data-pilot-choice="walk_out"]'); await page.click('[data-act="continue"]');
    await page.click('[data-view="memory"]');
    await page.click('[data-recall]');
    await page.click('[data-view="terminal"]');
    const choice=result==='fumble'?'assume_absent':result==='failure'?'leave_open':result==='critical'?'visit':'ask';
    if(choice==='ask') await page.click('[data-invest="12"]');
    const before=await stateOf(page);
    await page.click(`[data-pilot-choice="${choice}"]`);
    const decided=await stateOf(page);
    if(choice==='ask') assert.equal(decided.resources.Compute,before.resources.Compute-12);
    await page.click('[data-act="continue"]');
    const ending=await stateOf(page); assert.equal(ending.phase,'ending');
    if(choice==='assume_absent')assert.equal(ending.event.id,'missed');
    if(choice==='visit')assert.equal(ending.event.id,'meeting');
    if(choice==='leave_open')assert.equal(ending.event.id,'tomorrow');
    await checkScreen(page);
    await page.screenshot({path:`${out}/ending-${result}.png`,fullPage:true});
    await page.click('[data-act="saves"]');
    const downloadPromise=page.waitForEvent('download'); await page.click('[data-act="export"]');
    const download=await downloadPromise;
    assert(download.suggestedFilename().includes(ending.event.id));
    const exportPath=resolve(out,`export-${result}.json`); await download.saveAs(exportPath);
    const exported=parseSave(await readFile(exportPath,'utf8'),content);
    assert.equal(exported.state.instance.phase,'ending');
    assert.equal(exported.state.instance.nodeId,ending.event.id);
    const bad=structuredClone(exported);bad.state.world.flags.painter_on_hill=false;
    const badPath=resolve(out,'corrupt.json');await writeFile(badPath,JSON.stringify(bad));
    await page.locator('#pilot-import').setInputFiles(badPath);
    await page.waitForFunction(()=>document.querySelector('.modal-message').textContent.includes('导入失败'));
    assert.equal((await stateOf(page)).event.id,ending.event.id);
    await page.locator('#pilot-import').setInputFiles(exportPath);
    await page.waitForFunction(()=>!document.querySelector('#pilot-modal').open);
    assert.equal((await stateOf(page)).event.id,ending.event.id);
    await page.click('[data-view="protocol"]');await page.locator('.debug summary').click();await page.click('[data-act="debug"]');
    assert.match(await page.locator('#debug-state').innerText(),/painter_on_hill/);
    await context.close();
  }
  {
    const {page,context}=await pageAt({width:390,height:844});
    await importFile(page,await initialFile(seeds.get('success')));
    await page.click('[data-pilot-choice="listen"]');await page.click('[data-act="continue"]');
    await checkScreen(page);await page.screenshot({path:`${out}/mobile-news.png`,fullPage:true});
    await page.click('[data-act="compress"]');await page.click('[data-act="continue"]');
    await page.click('[data-view="memory"]');await page.click('[data-recall]');
    await checkScreen(page);await page.screenshot({path:`${out}/mobile-memory.png`,fullPage:true});
    await page.click('[data-act="crt"]');assert.equal((await stateOf(page)).crt,false);
    await page.click('[data-act="legacy"]');
    await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='turn-based-text-rpg');
    await page.click('[data-action="tomorrow"]');
    await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).mode==='cognition-pilot');
    assert.equal((await stateOf(page)).context.weight,8,'Switching chapters must preserve pilot');
    await context.close();
  }
  {
    const {page,context}=await pageAt(undefined,()=>{localStorage.setItem('outside.cognition.v2.auto','broken');localStorage.setItem('outside.v1.auto','legacy sentinel');});
    await page.click('[data-pilot-choice="listen"]');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),'broken');
    assert.equal(await page.evaluate(()=>localStorage.getItem('outside.v1.auto')),'legacy sentinel');
    await page.click('[data-act="saves"]');await page.click('[data-act="restart"]');await page.click('[data-act="close"]');
    assert.equal((await stateOf(page)).phase,'resolution');
    await importFile(page,await initialFile(seeds.get('success')));
    assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),'broken');
    await context.close();
  }
  {
    const previous=contentVersions.find(c=>c.version==='0.2.0');
    let state=create(previous,seeds.get('failure'));
    state=reduce(previous,state,{type:'choose',choiceId:'listen',investment:0});
    state=reduce(previous,state,{type:'continue'});
    state=reduce(previous,state,{type:'compress',investment:8});
    const file=resolve(out,'previous-content.json');await writeFile(file,JSON.stringify(createSave(state)));
    const {page,context}=await pageAt();
    await importFile(page,file);
    assert.deepEqual((await stateOf(page)).pending,pending(state));
    await page.reload();assert.deepEqual((await stateOf(page)).pending,pending(state));
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.contentVersion,SAVE_KEY),'0.2.0');
    await page.click('[data-act="saves"]');await page.click('[data-act="restart"]');await page.click('[data-act="confirm-restart"]');
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.contentVersion,SAVE_KEY),'0.2.1');
    await context.close();
  }
  {
    const {page,context}=await pageAt(undefined,()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='outside.cognition.v2.auto')throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);};});
    await page.click('[data-pilot-choice="listen"]');assert.equal((await stateOf(page)).phase,'resolution');
    assert.match(await page.locator('.warning').innerText(),/无法保存/);
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({compressionResults:[...seeds.keys()],requests,errors,checks:['four outcomes','pressure gate','pin','investment','recall and conditional choices','three endings','pending reload','backup replay','invalid import','hidden state','mobile','chapter isolation','corrupt auto protection','storage failure']},null,2));
  console.log('Cognition browser checks passed: four compression results, three endings, offline and persistence boundaries.');
} finally {await browser.close();}

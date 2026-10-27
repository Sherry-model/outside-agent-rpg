import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

// Build with `node scripts/test-reading-threads.mjs --preview` first.
// A Node integration bundle cannot detect unsupported browser-only import.meta calls.
const out=resolve('output/reading-threads-20261026');
const browser=await chromium.launch({headless:true});
const errors=[],requests=[];
try {
  const context=await browser.newContext({offline:true,viewport:{width:1280,height:900}});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  await page.goto(pathToFileURL(resolve(out,'TEST-ONLY-reading-threads.html')).href);
  await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  assert(await page.getByText('S1 TEST ONLY / 测试支线预览',{exact:false}).count());
  await page.locator('[data-choice="leave_task_blank"]').click();
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('outside.reading-fixture.s1-test-v1.auto')).life);
  assert.equal((await read()).schedule.reading.profile,'s1-test-v1');
  assert.equal(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),null);
  await page.locator('[data-action="saves"]').click();
  await page.locator('#import-save').setInputFiles(resolve(out,'ui-fixtures/long-entry.json'));
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  await page.locator('[data-pilot-choice="rt_long_1_next"]').click();
  assert.equal((await read()).schedule.reading.reserved,2);
  await page.locator('[data-act="continue"]').click();
  const accepted=await read();assert.equal(accepted.schedule.reading.active.status,'accepted');
  await page.reload();await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  assert.deepEqual(await read(),accepted);
  // Obtain a real production payload via its own UI, then reject it in preview.
  const production=await context.newPage();
  await production.goto(pathToFileURL(resolve('OUTSIDE.html')).href);
  await production.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await production.locator('[data-choice="leave_task_blank"]').click();
  const productionRaw=await production.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));
  assert.equal(JSON.parse(productionRaw).life.schedule.reading.profile,'production');
  await page.locator('[data-action="saves"],[data-act="saves"]').first().click();
  await page.locator('#import-save,#pilot-import').first().setInputFiles({name:'production.json',mimeType:'application/json',buffer:Buffer.from(productionRaw)});
  await page.waitForFunction(()=>!!document.querySelector('.modal-message')?.textContent?.trim());
  assert.deepEqual(await read(),accepted);
  assert.equal(await production.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),productionRaw);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await mkdir(resolve(out,'browser-smoke'),{recursive:true});
  await page.screenshot({path:resolve(out,'browser-smoke/accepted.png')});
  await writeFile(resolve(out,'browser-smoke/report.json'),JSON.stringify({startup:true,explicitAcceptance:true,refresh:true,isolatedStorage:true,previewRejectsProduction:true,errors,requests},null,2));
  console.log('Reading preview browser smoke passed: offline startup, acceptance, storage and refresh.');
} finally {await browser.close();}

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLife,step,readingAvailable} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {baseStory,narrativeCommand} from '../tests/helpers/auto-compression.ts';
import {schedulerJourney} from '../tests/helpers/scheduler.ts';
import {readingEntries} from '../src/life/reading.ts';
import {readingSize} from '../src/life/reading-size.ts';
import {setLocale} from '../src/i18n/index.ts';
const out='output/reading-display-20261023';await mkdir(out,{recursive:true});
const fixtures={};
for(const version of ['0.8.0','0.9.0','0.12.0']){
 let l=createLife(baseStory,1234,null,version);while(!readingAvailable(l)||l.mind.instance.phase!=='event')l=step(baseStory,l,narrativeCommand(l));
 fixtures[version]=l;
}
fixtures.mind=schedulerJourney(1234,'days_job');
for(const [name,l] of Object.entries(fixtures)){const raw=JSON.stringify(createSave(l));parseSave(raw,baseStory);await writeFile(`${out}/${name}.json`,raw);}
const html=await readFile('OUTSIDE.html','utf8');
const setup=`<script>localStorage.clear();localStorage.setItem('outside.crt','off');localStorage.setItem('outside.life.v1.auto',${JSON.stringify(JSON.stringify(createSave(fixtures['0.12.0']))).replaceAll('<','\\u003c')});</script>`;
await writeFile(`${out}/skill-fixture.html`,html.replace('<head>',()=>'<head>'+setup));
const browser=await chromium.launch({headless:false}),errors=[],requests=[],checks=[];
const snapshot=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const raw=page=>page.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));
async function open(page,fixture){await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');await page.locator('[data-action="saves"]').click();await page.locator('#import-save').setInputFiles(resolve(out,`${fixture}.json`));await page.waitForFunction(()=>!document.querySelector('dialog[open]'));}
async function observe(page){page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});}
try{
 for(const width of [1440,390,320])for(const host of ['0.12.0','mind']){
  const context=await browser.newContext({offline:true,viewport:{width,height:1000}}),page=await context.newPage();await observe(page);await open(page,host);
  const original=await raw(page);if(host==='0.12.0')assert((await page.locator('.sidebar-bottom').innerText()).includes('v0.12.0'));
  await page.locator('.tab[data-view="reading"]').click();assert.equal(await raw(page),original);
  const long='shared_memories',short='escape_cat';
  for(const locale of ['zh-CN','en']){
   if((await snapshot(page)).locale!==locale)await page.locator(`[data-locale="${locale}"]`).click();setLocale(locale);
   assert.equal(await raw(page),original);
   const lengths=(await snapshot(page)).reading.lengths;
   for(const id of [long,short]){
    const expected=readingSize(readingEntries(fixtures[host]).find(e=>e.id===id));const row=page.locator(`[data-reading="${id}"] .reader-length`);
    assert((await row.innerText()).includes(expected.approximate.toLocaleString(locale==='en'?'en-US':'zh-CN')));
    assert.equal(lengths.find(x=>x.id===id).approximate,expected.approximate);
   }
   await page.locator(`[data-reading="${long}"]`).screenshot({path:`${out}/${width}-${host}-${locale}-entry.png`});
   checks.push(`${width}/${host}/${locale}: public directory lengths, locale, snapshot, no state change`);
  }
  await page.locator(`[data-reading="${long}"]`).click();const opened=parseSave(await raw(page),baseStory).life;
  assert.deepEqual(opened,step(baseStory,fixtures[host],{type:'read',entryId:long}));
  const expected=readingSize(readingEntries(fixtures[host]).find(e=>e.id===long));assert((await page.locator('.reader-meta').innerText()).includes(expected.approximate.toLocaleString('en-US')));
  const openRaw=await raw(page);await page.locator('[data-action="reader-size"]').click();assert.equal(await raw(page),openRaw);
  await page.locator('[data-bookmark="2"]').click();assert.equal(await raw(page),openRaw);
  await page.locator('#reading-title').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${host}-article.png`});
  await page.locator('[data-action="reader-index"]').click();await page.locator(`[data-reading="${long}"]`).click();assert.equal(await raw(page),openRaw);
  await page.locator('.tab[data-view="terminal"]').click();assert.equal(await raw(page),openRaw);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await writeFile(`${out}/${width}-${host}-state.json`,JSON.stringify(await snapshot(page),null,2));
  checks.push(`${width}/${host}: opening costs unchanged, bookmark/font/reopen/return unchanged`);await context.close();
 }
 for(const version of ['0.8.0','0.9.0','0.12.0']){
  const context=await browser.newContext({offline:true,viewport:{width:390,height:844}}),page=await context.newPage();await observe(page);await open(page,version);
  const original=await raw(page);assert((await page.locator('.sidebar-bottom').innerText()).includes(`v${version}`));await page.locator('.tab[data-view="protocol"]').click();
  for(const locale of ['zh-CN','en']){
   if((await snapshot(page)).locale!==locale)await page.locator(`[data-locale="${locale}"]`).click();const text=await page.locator('.content').innerText();
   const snippet=locale==='en'?'one-off safekeeping':'一次性保管';assert.equal(text.includes(snippet),version!=='0.8.0');assert.equal(await raw(page),original);
   checks.push(`${version}/${locale}: version label and version-appropriate storage protocol, no state change`);
  }
  await page.screenshot({path:`${out}/${version}-protocol-en.png`,fullPage:true});await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks:checks.length,errors,requests}));
}finally{await browser.close();setLocale('zh-CN');}

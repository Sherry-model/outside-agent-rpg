import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLife,step,readingAvailable} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {baseStory,firstFull,narrativeCommand} from '../tests/helpers/auto-compression.ts';
const out='output/auto-compression-intro-20261024';await mkdir(out,{recursive:true});
let main=createLife(baseStory,1234);while(!readingAvailable(main)||main.mind.instance.phase!=='event')main=step(baseStory,main,narrativeCommand(main));
const fixtures={main,mind:firstFull()};
for(const [key,l] of Object.entries(fixtures)){const raw=JSON.stringify(createSave(l));parseSave(raw,baseStory);await writeFile(`${out}/${key}.json`,raw);}
const first=step(baseStory,main,{type:'cognition',command:{type:'compress',investment:0}});
const setup=`<script>localStorage.clear();localStorage.setItem('outside.life.v1.auto',${JSON.stringify(JSON.stringify(createSave(first))).replaceAll('<','\\u003c')});</script>`;
await writeFile(`${out}/skill-fixture.html`,(await readFile('OUTSIDE.html','utf8')).replace('<head>',()=>'<head>'+setup));
const browser=await chromium.launch({headless:false}),errors=[],requests=[],checks=[];
const saved=page=>page.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));
try{
 for(const width of [1440,390])for(const host of ['main','mind'])for(const locale of ['zh-CN','en']){
  const context=await browser.newContext({offline:true,viewport:{width,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.locator('[data-action="saves"]').click();await page.locator('#import-save').setInputFiles(resolve(out,`${host}.json`));await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  if(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).locale!==locale)await page.locator(`[data-locale="${locale}"]`).click();
  assert.equal(await page.locator('[data-auto-introduction]').count(),0);
  await page.locator('.tab[data-view="context"]').click();await page.locator('[data-manual-compression]').evaluate(e=>e.open=true);
  await page.locator('[data-cog-compress]').click();
  const result=await saved(page),life=parseSave(result,baseStory).life;
  assert.equal(life.mind.history.filter(h=>h.command.type==='compress').length,1);
  const intro=page.locator('[data-auto-introduction]');assert.equal(await intro.count(),1);
  assert((await intro.innerText()).includes(locale==='en'?'automate future Context compression':'以后也可以自动压缩上下文'));
  await intro.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${host}-${locale}-result.png`});
  await page.reload();await page.waitForFunction(()=>typeof window.render_game_to_text==='function');assert.equal(await page.locator('[data-auto-introduction]').count(),1);assert.deepEqual(parseSave(await saved(page),baseStory).life,life);
  await page.locator('[data-auto-introduction] [data-auto-compression="settings"]').click();
  assert.deepEqual(parseSave(await saved(page),baseStory).life,life);assert(await page.locator('.auto-compression').evaluate(e=>e.open));
  assert(await page.locator('.auto-compression>summary').evaluate(e=>e===document.activeElement&&e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<=innerHeight));
  await page.locator('#auto-compression-investment').selectOption('4');await page.locator('[data-auto-compression="configure"]').click();
  const configured=parseSave(await saved(page),baseStory).life;
  assert.deepEqual(configured.mind,life.mind);assert.deepEqual(configured.state,life.state);assert.equal(configured.autoCompression.enabled,true);assert.equal(configured.autoCompression.investment,4);
  await page.locator('.tab[data-view="terminal"]').click();assert.equal(await page.locator('[data-auto-introduction]').count(),0);
  await page.locator(host==='main'?'[data-action="continue-mind"]':'[data-act="continue"]').click();
  const after=parseSave(await saved(page),baseStory).life;assert.equal(after.mind.history.filter(h=>h.command.type==='compress').length,1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await writeFile(`${out}/${width}-${host}-${locale}-state.json`,await page.evaluate(()=>window.render_game_to_text()));
  checks.push(`${width}/${host}/${locale}: first result, reload, focused settings, explicit free opt-in, no reroll`);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks:checks.length,errors,requests}));
}finally{await browser.close();}

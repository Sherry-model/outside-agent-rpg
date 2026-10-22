import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLife,step,readingAvailable} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {canCompress,weight} from '../src/cognition/engine.ts';
import {contentFor} from '../src/life/content.ts';
import {baseStory,firstFull,narrativeCommand} from '../tests/helpers/auto-compression.ts';
const out='output/manual-compression-f1-20261023';await mkdir(out,{recursive:true});
let main=createLife(baseStory,1234);while(!readingAvailable(main)||main.mind.instance.phase!=='event')main=step(baseStory,main,narrativeCommand(main));
let mind=firstFull();while(weight(mind.mind)>=90)mind=step(baseStory,mind,{type:'cognition',command:{type:'drop',itemId:mind.mind.instance.context.items.find(i=>!i.pinned).id}});
const fixtures={};
for(const [host,life] of Object.entries({main,mind}))for(const enabled of [false,true]){
 const l=step(baseStory,life,{type:'configure-compression',enabled,investment:8});assert(weight(l.mind)<100);assert.equal(canCompress(l.mind,contentFor(l.contentVersion)),'');
 const raw=JSON.stringify(createSave(l));parseSave(raw,baseStory);fixtures[`${host}-${enabled}`]=l;await writeFile(`${out}/${host}-${enabled}.json`,raw);
}
const browser=await chromium.launch({headless:false}),errors=[],requests=[],checks=[];
try{
 for(const width of [1440,390])for(const host of ['main','mind'])for(const enabled of [false,true])for(const locale of ['zh-CN','en']){
  const name=`${width}-${host}-${enabled}-${locale}`;
  const context=await browser.newContext({offline:true,viewport:{width,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.locator('[data-action="saves"]').click();await page.locator('#import-save').setInputFiles(resolve(out,`${host}-${enabled}.json`));await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  const snapshot=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  if((await snapshot()).locale!==locale)await page.locator(`[data-locale="${locale}"]`).click();
  await page.locator('.tab[data-view="context"]').click();assert.equal(await page.locator('.auto-compression').evaluate(e=>e.open),false);
  await page.locator('[data-manual-compression]>summary').click();
  const raw=await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));
  for(const investment of [4,8,12]){
   await page.locator(`[data-manual-compression] [data-cog-invest="${investment}"]`).click();
   assert.equal(await page.locator('[data-manual-compression]').evaluate(e=>e.open),true,name);
   assert.equal(await page.locator('.auto-compression').evaluate(e=>e.open),false,name);
   assert.equal(await page.locator(`[data-cog-invest="${investment}"]`).getAttribute('aria-pressed'),'true');
   assert((await page.locator('[data-cog-compress]').innerText()).endsWith(`Compute ${investment}`));
   assert.equal(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),raw,`${name}: selecting budget must not save/mutate Life`);
   assert.equal((await snapshot()).autoCompression.investment,8);assert.equal((await snapshot()).autoCompression.enabled,enabled);
   checks.push(`${name} manual ${investment}: stays open, automatic panel stays closed, no state/cost/policy change`);
  }
  await page.locator('[data-manual-compression]').screenshot({path:`${out}/${name}-manual-panel.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const before=parseSave(raw,baseStory).life;await page.locator('[data-cog-compress]').click();const after=await snapshot();
  assert.equal(after.pending.roll.investment,12);assert.equal(after.resources.Compute,before.mind.instance.resources.Compute-12);
  const saved=parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;assert.deepEqual(saved.autoCompression,before.autoCompression);
  await page.screenshot({path:`${out}/${name}-result.png`,fullPage:true});await writeFile(`${out}/${name}-state.json`,JSON.stringify(after,null,2));
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({scenarios:16,investmentSelections:checks.length,checks,errors,requests},null,2));console.log(JSON.stringify({scenarios:16,selections:checks.length,errors,requests}));
}finally{await browser.close();}

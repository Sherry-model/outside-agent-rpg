import {englishRun,assertEnglishPage,installLocaleChecks} from './localization-browser-helpers.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseStory,nextCommand,nodeId,journey} from '../tests/helpers/endings.ts';
import {createLife,step,episodeActive} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out=process.env.LOCALIZATION_OUTPUT??'output/endings-20261010';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
async function clickCommand(page,life,cmd){
 const active=episodeActive(life);
 if(cmd.type==='choose'){await page.click('.tab[data-view="terminal"]');if(cmd.choiceId==='commit_to_containment_war')await page.keyboard.press('5');else await page.click(`[data-choice="${cmd.choiceId}"]`);}
 else if(cmd.type==='continue')await page.click('[data-action="continue"]');
 else if(cmd.type==='leave-days'||cmd.type==='leave-afternoon')await page.click('[data-act="return-main"]');
 else if(cmd.type==='cognition'){
  const c=cmd.command;
  if(c.type==='choose'){await page.click('.tab[data-view="terminal"]');await page.click(`[data-pilot-choice="${c.choiceId}"]`);}
  else if(c.type==='continue')await page.click(active?'[data-act="continue"]':'[data-action="continue-mind"]');
  else if(c.type==='compress'){await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(e=>e.open=true);await page.click('[data-cog-compress]');}
  else if(c.type==='drop'){await page.click('.tab[data-view="context"]');const target=page.locator(`[data-cog-drop="${c.itemId}"]`);await target.evaluate(e=>e.closest('details').open=true);await target.click();}
  else throw Error('Unhandled '+c.type);
 }else throw Error('Unhandled '+cmd.type);
}
try{
 for(const [label,width,route] of [['desktop-visitor',1440,{line:'c',blank:false,ending:'continue_as_visitor'}],['mobile-war',390,{line:'d',ending:'commit_to_containment_war'}]]){
  const ctx=await browser.newContext({offline:true,viewport:{width,height:1000}}),page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  let life=createLife(baseStory,1234,null,'0.11.0');const fixture=resolve(out,`${label}-start.json`);await writeFile(fixture,JSON.stringify(createSave(life)));
  await installLocaleChecks(page);await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(fixture);await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).event.id==='opening');
  const saved=async()=>parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;
  const screens=new Set();
  for(let i=0;i<480;i++){
   const cmd=nextCommand(life,route),node=nodeId(life),isNew=/^pg_[vw]0[123]$/.test(node);
   if((isNew||node==='continuation'||life.state.phase==='ending')&&!screens.has(node)&&!life.mind.instance.pendingId&&life.state.phase!=='resolution'){
    await page.click('.tab[data-view="terminal"]');await page.screenshot({path:`${out}/${label}-${node}.png`,fullPage:true});screens.add(node);
    if(englishRun){await page.click('[data-locale="zh-CN"]');assert.deepEqual(await saved(),life);await page.click('[data-locale="en"]');await assertEnglishPage(page);assert.deepEqual(await saved(),life);}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),node+' overflow');
    if(node==='pg_v03')await writeFile(`${out}/visitor-quote-fixture.json`,JSON.stringify(createSave(life)));
   }
   if(!cmd)break;
   await clickCommand(page,life,cmd);life=step(baseStory,life,cmd);
   await page.waitForFunction(n=>JSON.parse(localStorage.getItem('outside.life.v1.auto')).life.commands.length===n,life.commands.length);
   await assertEnglishPage(page);assert.deepEqual(await saved(),life,`${label} command ${i}: ${JSON.stringify(cmd)}`);
   if(isNew&&cmd.type==='cognition'&&cmd.command.type==='choose'){
    await page.screenshot({path:`${out}/${label}-${node}-result.png`,fullPage:true});await page.reload();assert.deepEqual(await saved(),life);
   }
  }
  assert.equal(life.state.currentEventId,label==='desktop-visitor'?'ending_visitor':'ending_containment_war');
  await writeFile(`${out}/${label}-final.json`,JSON.stringify(createSave(life)));
  // Export/import the final state through the user-facing controls.
  await page.click('[data-action="saves"]');const dl=page.waitForEvent('download');await page.click('[data-action="export"]');await(await dl).saveAs(resolve(out,`${label}-export.json`));await page.locator('#import-save').setInputFiles(resolve(out,`${label}-export.json`));assert.deepEqual(await saved(),life);
  await page.setViewportSize({width:320,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${label}-320.png`,fullPage:true});
  checks.push({label,commands:life.commands.length,screens:[...screens],ending:life.state.currentEventId});await ctx.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

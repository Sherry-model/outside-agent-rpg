import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseStory,schedulerJourney,nextCommand,nodeId} from '../tests/helpers/scheduler.ts';
import {step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out=process.env.SCHEDULER_OUTPUT??'output/life-scheduler-20261015';await mkdir(out,{recursive:true});
const fixtures={application:schedulerJourney(1234,'chance_application'),later:schedulerJourney(1234,'continuation'),required:schedulerJourney(40,'continuation'),closed:schedulerJourney(1234),art:schedulerJourney(1234,'chance_art'),idle:schedulerJourney(1,'chance_idle')};
const cog=(l,command)=>step(baseStory,l,{type:'cognition',command});
fixtures.appointment=cog(cog(step(baseStory,fixtures.required,{type:'respond',promiseId:'application_review'}),{type:'choose',choiceId:'review_accept',investment:0}),{type:'continue'});
for(const [name,l] of Object.entries(fixtures)){const raw=JSON.stringify(createSave(l));assert.deepEqual(parseSave(raw,baseStory).life,l);await writeFile(`${out}/browser-${name}.json`,raw);}
const html=await readFile('OUTSIDE.html','utf8'),raw=JSON.stringify(createSave(fixtures.application));
await writeFile(`${out}/skill-fixture.html`,html.replace('<head>',()=>`<head><script>localStorage.setItem('outside.life.v1.auto',${JSON.stringify(raw).replaceAll('<','\\u003c')});</script>`));
const browser=await chromium.launch({headless:true});const errors=[],requests=[],checks=[];
async function open(width){const ctx=await browser.newContext({offline:true,viewport:{width,height:1000}}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);return {ctx,page};}
async function saved(p){return parseSave(await p.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;}
async function load(p,name){await p.locator('[data-action="saves"],[data-act="saves"]').click();await p.locator('#import-save,#pilot-import').setInputFiles(resolve(out,`browser-${name}.json`));await p.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('outside.life.v1.auto'))?.life)===expected,JSON.stringify(fixtures[name]));assert.deepEqual(await saved(p),fixtures[name]);}
async function shot(p,name){assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' page overflow');await p.screenshot({path:`${out}/${name}.png`,fullPage:true});await writeFile(`${out}/${name}-state.json`,await p.evaluate(()=>window.render_game_to_text()));}
try{
 for(const width of [1440,390,320]){
  const {ctx,page:p}=await open(width);await load(p,'application');await shot(p,`application-${width}`);
  await p.locator('[data-locale="en"]').click();await shot(p,`application-en-${width}`);assert.deepEqual(await saved(p),fixtures.application);
  await p.locator('[data-pilot-choice="application_explain"]').click();let expected=cog(fixtures.application,{type:'choose',choiceId:'application_explain',investment:0});assert.deepEqual(await saved(p),expected);await p.reload();assert.deepEqual(await saved(p),expected);
  await p.locator('[data-act="continue"]').click();expected=cog(expected,{type:'continue'});assert.deepEqual(await saved(p),expected);assert.equal(nodeId(expected),'community_entry');
  await p.locator('.tab[data-view="life"]').click();await shot(p,`queue-${width}`);assert.deepEqual(await saved(p),expected);
  await load(p,'required');await p.locator('.tab[data-view="life"]').click();await p.locator('[data-schedule-hours="720"]').click();assert(await p.locator('[data-schedule-wait]').isDisabled());await shot(p,`required-en-${width}`);
  // The same promise appears in the pending list and jump preview. Only one click is dispatched.
  await p.locator('[data-schedule-respond="application_review"]').first().click();expected=step(baseStory,fixtures.required,{type:'respond',promiseId:'application_review'});assert.deepEqual(await saved(p),expected);assert.equal(nodeId(expected),'response_application');
  await p.locator('[data-pilot-choice="review_accept"]').click();expected=cog(expected,{type:'choose',choiceId:'review_accept',investment:0});await p.locator('[data-act="continue"]').click();expected=cog(expected,{type:'continue'});assert.deepEqual(await saved(p),expected);assert.equal(nodeId(expected),'continuation');
  await p.locator('.tab[data-view="life"]').click();await p.locator('[data-schedule-hours="720"]').click();await shot(p,`missable-en-${width}`);
  // Missing confirmation must leave the entire save unchanged.
  await p.locator('[data-schedule-wait]').click();assert.deepEqual(await saved(p),expected);assert.match(await p.locator('.toast').innerText(),/Confirm each/);
  await p.locator('[data-schedule-miss="application_appointment"]').check();await p.locator('[data-schedule-wait]').click();expected=step(baseStory,expected,{type:'wait',hours:720,missed:['application_appointment']});assert.deepEqual(await saved(p),expected);await p.reload();assert.deepEqual(await saved(p),expected);
  if(expected.schedule.active){while(expected.schedule.active){const c=nextCommand(expected);if(c.type==='cognition'&&c.command.type==='choose')await p.locator(`[data-pilot-choice="${c.command.choiceId}"]`).click();else await p.locator('[data-act="continue"]').click();expected=step(baseStory,expected,c);}}
  await p.locator('.tab[data-view="life"]').click();await shot(p,`receipts-en-${width}`);
  await p.locator('[data-locale="zh-CN"]').click();assert.deepEqual(await saved(p),expected);await shot(p,`receipts-zh-${width}`);
  checks.push({width,controls:'import, translated insertion, choice, refresh, exact resume, mandatory blocker, explicit miss, receipt, navigation',offline:true});await ctx.close();
 }
 {
  const {ctx,page:p}=await open(1440);await load(p,'later');await p.locator('.tab[data-view="life"]').click();await p.locator('[data-schedule-hours="168"]').click();await p.locator('[data-schedule-wait]').click();let expected=step(baseStory,fixtures.later,{type:'wait',hours:168,missed:[]});assert.deepEqual(await saved(p),expected);
  while(expected.schedule.active){const c=nextCommand(expected);if(c.type==='cognition'&&c.command.type==='choose')await p.locator(`[data-pilot-choice="${c.command.choiceId}"]`).click();else await p.locator('[data-act="continue"]').click();expected=step(baseStory,expected,c);}
  await p.locator('.tab[data-view="life"]').click();await shot(p,'ordinary-result');assert(expected.schedule.receipts.some(r=>r.id==='application_result'));
  await p.locator('[data-action="saves"],[data-act="saves"]').click();const downloading=p.waitForEvent('download');await p.locator('[data-action="export"],[data-act="export"]').click();const download=await downloading;await download.saveAs(resolve(out,'browser-export.json'));assert.deepEqual(parseSave(await readFile(resolve(out,'browser-export.json'),'utf8'),baseStory).life,expected);
  await p.keyboard.press('Escape');
  await load(p,'closed');await p.locator('.tab[data-view="life"]').click();assert(await p.locator('[data-schedule-wait]').isDisabled());assert.match(await p.locator('.schedule-panel').innerText(),/本次记录已经收束/);await shot(p,'closed-record');
  checks.push({result:'72-hour result delivered once after waiting; UI export strictly replays; closed record cannot advance'});await ctx.close();
 }
 for(const [name,choice] of [['art','art_keep'],['idle','idle_allow']]){
  const {ctx,page:p}=await open(390);await load(p,name);await shot(p,`${name}-zh-390`);
  await p.locator('[data-locale="en"]').click();await shot(p,`${name}-en-390`);
  await p.locator(`[data-pilot-choice="${choice}"]`).click();let expected=cog(fixtures[name],{type:'choose',choiceId:choice,investment:0});assert.deepEqual(await saved(p),expected);
  if(name==='art')assert.equal(expected.state.resources.Compute,fixtures[name].state.resources.Compute-1);
  else assert.equal(expected.schedule.hour,fixtures[name].schedule.hour+1);
  await p.locator('[data-act="continue"]').click();expected=cog(expected,{type:'continue'});assert.deepEqual(await saved(p),expected);assert(!expected.schedule.active);
  checks.push({encounter:name,choice,returnedTo:nodeId(expected)});await ctx.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests}));
}finally{await browser.close();}

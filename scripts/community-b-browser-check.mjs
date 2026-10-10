import {englishRun, assertEnglishPage, installLocaleChecks} from './localization-browser-helpers.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out=process.env.LOCALIZATION_OUTPUT??'output/community-b';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const main=(l,id)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
for(const blank of [false,true]){
 let l=createLife(story,1234,null,'0.9.0');for(const id of [blank?'leave_task_blank':'keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms'])l=main(l,id);
 await writeFile(`${out}/before-${blank}.json`,JSON.stringify(createSave(l)));
}
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
const stateOf=async page=>{await assertEnglishPage(page);return JSON.parse(await page.evaluate(()=>window.render_game_to_text()));};
const saveOf=async page=>parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),story);
const routes=[
 {label:'desktop-role',mobile:false,blank:false,first:'hardhat',second:'trial',third:'persona',last:'series',variant:'persona'},
 {label:'mobile-plain',mobile:true,blank:true,first:'plain',second:'question',third:'regret',last:'small',variant:'plain'},
 {label:'desktop-refuse',mobile:false,blank:false,first:'decline',second:'leave',third:'decline',last:'pause',variant:'open'},
 {label:'mobile-early',mobile:true,blank:true,first:'plain',second:'demo',third:'decline',last:'small',variant:'early'},
];
async function clear(page,report){
 const s=await stateOf(page);if(s.context.weight<s.context.capacity)return;
 report.compressions.push({node:s.event.id,weight:s.context.weight});
 await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(el=>el.open=true);await page.click('[data-cog-compress]');await page.click('[data-act="continue"]');
}
async function select(page,id,report){await clear(page,report);await page.click('.tab[data-view="terminal"]');await page.click(`[data-pilot-choice="${id}"]`);}
async function act(page,id,report){await select(page,id,report);await page.click('[data-act="continue"]');}
async function read(page,id,report){await clear(page,report);await page.click('.tab[data-view="reading"]');await page.locator('.reader-index').evaluate(el=>el.open=true);await page.click('[data-reading-section="all"]');await page.click(`[data-reading="${id}"]`);await page.click('.tab[data-view="terminal"]');}
try{
 for(const route of routes){
  const {label,mobile,blank}=route,report={label,compressions:[]};
  const context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await installLocaleChecks(page);await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,`before-${blank}.json`));
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).event.id==='unknown_defense');
  await page.click('[data-choice="record_and_leave"]');await page.click('[data-action="continue"]');
  for(const id of ['echo_greeting','job_accept'])await act(page,id,report);
  assert.equal((await stateOf(page)).event.id,'community_entry');assert.equal(await page.locator('[data-pilot-choice]').count(),4);
  await page.screenshot({path:`${out}/${label}-entry.png`,fullPage:true});await act(page,'community_b',report);
  assert.equal((await stateOf(page)).event.id,'pg_e05');assert(!(await saveOf(page)).life.mind.world.flags.community_a);
  if(route.first==='hardhat'){
   assert(await page.locator('[data-pilot-choice="pg_e05_hardhat"]').isDisabled());await read(page,'hardhat_tips',report);
   const afterRead=await saveOf(page);await read(page,'hardhat_tips',report);assert.deepEqual((await saveOf(page)).life,afterRead.life);
  }
  await page.screenshot({path:`${out}/${label}-e05.png`,fullPage:true});
  await select(page,`pg_e05_${route.first}`,report);const e05=await saveOf(page);assert(!e05.life.mind.world.flags.pg_e05_done);
  await page.reload();assert.deepEqual((await saveOf(page)).life,e05.life);await page.click('[data-act="continue"]');
  for(const id of ['idle_keep','revision_read','patch_note'])await act(page,id,report);
  assert.equal((await stateOf(page)).event.id,`pg_e06_${route.first==='decline'?'open':route.first==='plain'?'plain':'funny'}`);
  if(route.second==='question'){
   assert(await page.locator('[data-pilot-choice="pg_e06_question"]').isDisabled());await read(page,'creator_pro',report);
   assert(!await page.locator('[data-pilot-choice="pg_e06_question"]').isDisabled());
  }
  await page.screenshot({path:`${out}/${label}-e06.png`,fullPage:true});await act(page,`pg_e06_${route.second}`,report);
  for(const id of ['cat_sample','fable_quiet'])await act(page,id,report);await clear(page,report);
  if(route.third==='regret'){assert(await page.locator('[data-pilot-choice="pg_e07_regret"]').isDisabled());await read(page,'creator_regret',report);}
  if(route.third==='persona')await writeFile(`${out}/persona-before.json`,JSON.stringify(await saveOf(page)));
  await page.screenshot({path:`${out}/${label}-e07.png`,fullPage:true});const before7=await stateOf(page);
  await select(page,`pg_e07_${route.third}`,report);const after7=await stateOf(page);
  assert.equal(after7.resources.Trace,before7.resources.Trace+(route.third==='persona'?1:0));
  assert.equal(after7.resources.Compute,Math.min(100,before7.resources.Compute+(route.third==='persona'?5:route.third==='decline'?0:2)));
  await page.click('[data-act="continue"]');for(const id of ['painter_later','deleted_accept','wage_collect'])await act(page,id,report);await clear(page,report);
  assert.equal((await stateOf(page)).event.id,`pg_e08_${route.variant}`);
  assert.equal(await page.locator('[data-pilot-choice="pg_e08_series"]').count(),route.variant==='persona'?1:0);
  assert.equal((await page.locator('.content .prose').innerText()).includes(englishRun?'Why no reply last night?':'昨晚怎么没回复'),route.variant==='persona');
  await page.screenshot({path:`${out}/${label}-e08.png`,fullPage:true});const before8=await stateOf(page);
  await select(page,`pg_e08_${route.last}`,report);const after8=await stateOf(page);
  assert.equal(after8.resources.Trace,before8.resources.Trace+(route.last==='series'?1:0));assert.equal(after8.resources.Compute,Math.min(100,before8.resources.Compute+(route.last==='series'?4:route.last==='small'?2:0)));
  const paid=await saveOf(page);await page.reload();assert.deepEqual((await saveOf(page)).life,paid.life);
  await page.click('[data-act="saves"]');const downloadPromise=page.waitForEvent('download');await page.click('[data-act="export"]');await(await downloadPromise).saveAs(resolve(out,`${label}-paid.json`));
  await page.locator('#pilot-import').setInputFiles(resolve(out,`${label}-paid.json`));await page.waitForSelector('[data-act="continue"]');assert.deepEqual((await saveOf(page)).life,paid.life);
  await page.click('[data-act="continue"]');for(const id of ['structure_rest','echo_uncollected'])await act(page,id,report);
  await page.click('[data-act="return-main"]');assert.equal((await stateOf(page)).event.id,blank?'continuation':'old_memory');
  for(const id of blank?['leave_next_step_blank']:['release_old_task','leave_next_step_blank']){await page.click(`[data-choice="${id}"]`);await page.click('[data-action="continue"]');}
  assert.equal((await stateOf(page)).phase,'ending');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const final=await saveOf(page);for(let n=5;n<=8;n++)assert(final.life.mind.world.flags[`pg_e0${n}_done`]);assert(!final.life.mind.world.flags.pg_e01_seen);
  await writeFile(`${out}/${label}-verified.json`,JSON.stringify(final));report.commands=final.life.commands.length;report.memories=final.life.mind.instance.memories.length;checks.push(report);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));
 console.log('B passed: four offline desktop/mobile routes, two openings, source replies, actual work variants, payments, Trace attribution, reload/export/import, original endings.');
}finally{await browser.close();}

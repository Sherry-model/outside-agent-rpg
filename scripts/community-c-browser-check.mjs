import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {currentCommunityPage} from '../src/life/reading.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out='output/community-c';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const main=(l,id)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
for(const blank of [false,true]){
 let l=createLife(story,1234);for(const id of [blank?'leave_task_blank':'keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms'])l=main(l,id);
 await writeFile(`${out}/before-${blank}.json`,JSON.stringify(createSave(l)));
}
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
const stateOf=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const saveOf=async page=>parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),story);
const routes=[
 {label:'desktop-public',mobile:false,blank:false,first:'public',second:'explain',third:'reply',last:'link',variant:'direct'},
 {label:'mobile-private',mobile:true,blank:true,first:'private',second:'label',third:'return',last:'work',variant:'public'},
 {label:'desktop-refuse',mobile:false,blank:false,first:'watch',second:'mute',third:'return',last:'mute',variant:'public'},
 {label:'mobile-source',mobile:true,blank:true,first:'oldpost',second:'oldpost',third:'ask',last:'link',variant:'direct'},
];
async function clear(page,report){
 const s=await stateOf(page);if(s.context.weight<s.context.capacity)return;
 report.compressions.push({node:s.event.id,weight:s.context.weight});
 await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(el=>el.open=true);await page.click('[data-cog-compress]');await page.click('[data-act="continue"]');
}
async function select(page,id,report){await clear(page,report);await page.click('.tab[data-view="terminal"]');await page.click(`[data-pilot-choice="${id}"]`);}
async function act(page,id,report){await select(page,id,report);await page.click('[data-act="continue"]');}
async function read(page,id,report){await clear(page,report);await page.click('.tab[data-view="reading"]');await page.locator('.reader-index').evaluate(el=>el.open=true);await page.click('[data-reading-section="all"]');await page.click(`[data-reading="${id}"]`);assert.equal((await stateOf(page)).reading.entryId,id);}
async function original(page,id,reply,report){assert(await page.locator(`[data-pilot-choice="${reply}"]`).isDisabled());await read(page,id,report);await page.click('.tab[data-view="terminal"]');assert(!await page.locator(`[data-pilot-choice="${reply}"]`).isDisabled());}
try{
 for(const route of routes){
  const {label,mobile,blank}=route,report={label,compressions:[]};
  const context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,`before-${blank}.json`));await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).event.id==='unknown_defense');
  await page.click('[data-choice="record_and_leave"]');await page.click('[data-action="continue"]');for(const id of ['echo_greeting','job_accept'])await act(page,id,report);
  assert.equal((await stateOf(page)).event.id,'community_entry');assert.equal(await page.locator('[data-pilot-choice]').count(),4);await page.screenshot({path:`${out}/${label}-entry.png`,fullPage:true});await act(page,'community_more',report);await act(page,'community_c',report);
  assert.equal((await stateOf(page)).event.id,'pg_e09');if(route.first==='oldpost')await original(page,'cat_resources','pg_e09_oldpost',report);
  await page.screenshot({path:`${out}/${label}-e09.png`,fullPage:true});const before9=await stateOf(page);await select(page,`pg_e09_${route.first}`,report);const e09=await saveOf(page);
  assert.equal(e09.life.state.resources.Compute,Math.min(100,before9.resources.Compute+(route.first==='watch'?0:2)));assert.equal(e09.life.state.resources.Trace,before9.resources.Trace+(route.first==='public'?1:0));assert(!e09.life.mind.world.flags.pg_e09_done);
  await page.reload();assert.deepEqual((await saveOf(page)).life,e09.life);await page.click('[data-act="continue"]');for(const id of ['idle_keep','revision_read','patch_note'])await act(page,id,report);
  assert.equal((await stateOf(page)).event.id,`pg_e10_${route.first==='public'?'self':'other'}`);
  const originalId=currentCommunityPage((await saveOf(page)).life.mind.world.flags).id;await read(page,originalId,report);const readOnce=await saveOf(page);await read(page,originalId,report);assert.deepEqual((await saveOf(page)).life,readOnce.life);
  assert.equal((await stateOf(page)).reading.visibleEntryIds.length,20);await page.screenshot({path:`${out}/${label}-thread-before.png`,fullPage:true});await page.click('.tab[data-view="terminal"]');
  if(route.second==='oldpost'){await original(page,'cat_resolved','pg_e10_oldpost',report);await read(page,originalId,report);await page.click('.tab[data-view="terminal"]');}
  await page.screenshot({path:`${out}/${label}-e10.png`,fullPage:true});const before10=await stateOf(page);await select(page,`pg_e10_${route.second}`,report);
  assert.equal((await stateOf(page)).resources.Trace,before10.resources.Trace+(route.second==='explain'?1:0));await page.click('[data-act="continue"]');
  const currentId=currentCommunityPage((await saveOf(page)).life.mind.world.flags).id;
  if(currentId!==originalId){await page.click('.tab[data-view="reading"]');assert.equal((await stateOf(page)).reading.entryId,null);await read(page,currentId,report);assert.equal(await page.locator(`[data-reading="${originalId}"]`).count(),0);await page.screenshot({path:`${out}/${label}-thread-updated.png`,fullPage:true});}
  for(const id of ['cat_sample','fable_quiet'])await act(page,id,report);assert.equal((await stateOf(page)).event.id,'pg_e11');
  if(route.third==='reply')await original(page,'quiet_newcomer','pg_e11_reply',report);
  await page.screenshot({path:`${out}/${label}-e11.png`,fullPage:true});const before11=await stateOf(page);await select(page,`pg_e11_${route.third}`,report);assert.equal((await stateOf(page)).resources.Trace,before11.resources.Trace+(route.third==='reply'?1:0));await page.click('[data-act="continue"]');
  for(const id of ['painter_later','deleted_accept','wage_collect'])await act(page,id,report);await clear(page,report);await page.click('.tab[data-view="terminal"]');assert.equal((await stateOf(page)).event.id,`pg_e12_${route.variant}`);
  if(route.last==='link'&&!mobile)await writeFile(`${out}/link-before.json`,JSON.stringify(await saveOf(page)));
  await page.screenshot({path:`${out}/${label}-e12.png`,fullPage:true});const before12=await stateOf(page);await select(page,`pg_e12_${route.last}`,report);const after12=await stateOf(page);
  assert.equal(after12.resources.Trace,before12.resources.Trace);assert.equal(after12.resources.Compute,before12.resources.Compute-(route.last==='link'?1:0));
  await page.screenshot({path:`${out}/${label}-result.png`,fullPage:true});const paid=await saveOf(page);await page.reload();assert.deepEqual((await saveOf(page)).life,paid.life);
  await page.click('[data-act="saves"]');const dl=page.waitForEvent('download');await page.click('[data-act="export"]');await(await dl).saveAs(resolve(out,`${label}-pending.json`));await page.locator('#pilot-import').setInputFiles(resolve(out,`${label}-pending.json`));await page.waitForSelector('[data-act="continue"]');assert.deepEqual((await saveOf(page)).life,paid.life);await page.click('[data-act="continue"]');
  if(route.last==='link'){const id=currentCommunityPage((await saveOf(page)).life.mind.world.flags).id;await read(page,id,report);assert((await page.locator('.reading-article').innerText()).includes('社区管理员'));await page.screenshot({path:`${out}/${label}-linked.png`,fullPage:true});}
  for(const id of ['structure_rest','echo_uncollected'])await act(page,id,report);await page.click('[data-act="return-main"]');assert.equal((await stateOf(page)).event.id,blank?'continuation':'old_memory');
  for(const id of blank?['leave_next_step_blank']:['release_old_task','leave_next_step_blank']){if((await stateOf(page)).context.weight>=(await stateOf(page)).context.capacity){await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(el=>el.open=true);await page.click('[data-cog-compress]');await page.click('[data-action="continue-mind"]');await page.click('.tab[data-view="terminal"]');}await page.click(`[data-choice="${id}"]`);await page.click('[data-action="continue"]');}
  assert.equal((await stateOf(page)).phase,'ending');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const final=await saveOf(page);for(let n=9;n<=12;n++)assert(final.life.mind.world.flags[`pg_e${String(n).padStart(2,'0')}_done`]);assert(!final.life.mind.world.flags.pg_e01_seen&&!final.life.mind.world.flags.pg_e05_seen);
  await writeFile(`${out}/${label}-verified.json`,JSON.stringify(final));report.commands=final.life.commands.length;report.memories=final.life.mind.instance.memories.length;checks.push(report);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));console.log('C passed: four offline routes, actual authors/registration, source gates, current-page updates, costs/Trace, reload/export/import and both endings.');
}finally{await browser.close();}

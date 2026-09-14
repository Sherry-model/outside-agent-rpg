import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out='output/semantic';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const main=(l,id)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const chapter=(l,id)=>step(story,step(story,l,{type:'cognition',command:{type:'choose',choiceId:id,investment:0}}),{type:'cognition',command:{type:'continue'}});
let before,after;
for(let seed=1;seed<2000;seed++){
 let l=createLife(story,seed);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])l=main(l,id);
 l=step(story,l,{type:'enter-afternoon'});for(const id of ['look','stay','leave_board'])l=chapter(l,id);
 const result=step(story,l,{type:'cognition',command:{type:'compress',investment:0}});
 if(result.mind.instance.memories.some(m=>m.tags.includes('belief_gate_painter'))){before=l;after=result;break;}
}
assert(before&&after);await writeFile(`${out}/before.json`,JSON.stringify(createSave(before)));
const browser=await chromium.launch({headless:true}),errors=[],requests=[];
const stateOf=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
try {
 for(const mobile of [false,true]){
  const context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(resolve(out,'before.json'));await page.waitForSelector('[data-pilot-choice="walk_out"]');
  await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box>summary').click();await page.click('[data-cog-compress]');
  const settled=await stateOf(page);assert.equal(settled.pending.roll.result,'failure');
  await page.reload();assert.deepEqual((await stateOf(page)).pending,settled.pending);await page.click('[data-act="continue"]');
  await page.click('.tab[data-view="memory"]');const directories=await stateOf(page);assert.equal(directories.context.capacity,100);
  const wrong=after.mind.instance.memories.find(m=>m.tags.includes('belief_gate_painter'));
  assert(!(await page.locator('.content').innerText()).includes(wrong.text));assert(!JSON.stringify(directories.memories).includes(wrong.text));
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-directory.png`,fullPage:true});
  await page.click(`[data-cog-recall="${wrong.id}"]`);assert.equal((await stateOf(page)).view,'context');assert.equal((await stateOf(page)).context.weight,directories.context.weight+wrong.recallWeight);
  assert((await page.locator('.content').innerText()).includes(wrong.text));
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-recall.png`,fullPage:true});
  await page.click(`[data-cog-drop="recall-${wrong.id}"]`);await page.click('.tab[data-view="memory"]');assert(await page.locator(`[data-cog-recall="${wrong.id}"]`).count());
  await page.click(`[data-cog-recall="${wrong.id}"]`);await page.click('.tab[data-view="terminal"]');await page.click('[data-pilot-choice="walk_out"]');await page.click('[data-act="continue"]');
  assert(!await page.locator('[data-pilot-choice="defer_for_condition"]').isDisabled());assert(!await page.locator('[data-pilot-choice="visit"]').isDisabled());
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-belief-choice.png`,fullPage:true});
  // Merge consumes both original handles and any loaded recall; no child expansion.
  await page.click('.tab[data-view="memory"]');const ids=(await stateOf(page)).memories.slice(0,2).map(m=>m.id);
  for(const id of ids)await page.check(`[data-merge-memory="${id}"]`);
  await page.locator('.content>.compression-box>summary').click();await page.click('[data-cog-merge]');await page.click('[data-act="continue"]');
  await page.click('.tab[data-view="memory"]');for(const id of ids)assert.equal(await page.locator(`[data-merge-memory="${id}"]`).count(),0);
  const merged=(await stateOf(page)).memories.at(-1);await page.locator(`[data-cog-forget="${merged.id}"]`).locator('..').locator('summary').click();await page.click(`[data-cog-forget="${merged.id}"]`);assert(!(await stateOf(page)).memories.some(m=>m.id===merged.id));
  const raw=await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));parseSave(raw,story);await writeFile(`${out}/${mobile?'mobile':'desktop'}-verified.json`,raw);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({errors,requests,checks:['hidden bodies in directory and text hook','index and recall costs','put down vs forget','scope-migration belief optional choice','irreversible merge','same navigation in chapter','pending reload','full replay','390px layout']},null,2));
 console.log('Semantic cognition passed in desktop and mobile offline Chromium.');
} finally {await browser.close();}

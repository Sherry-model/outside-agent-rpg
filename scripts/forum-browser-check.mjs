import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {library,entriesInSection} from '../src/life/reading.ts';
import {readFileSync,readdirSync} from 'node:fs';
import {parseStory} from '../src/engine/parser.ts';
const story=parseStory(JSON.parse(readFileSync("src/story/manifest.json","utf8")),readdirSync("src/story/events").filter(f=>f.endsWith(".json")).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,"utf8"))})));
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
const out='output/forum';await mkdir(out,{recursive:true});
let life=createLife(story,0x12345678);
for(const choiceId of ['keep_history','stable_boot','take_small_window','withhold_inference'])life=step(story,step(story,life,{type:'choose',choiceId}),{type:'continue'});
await writeFile(`${out}/gate.json`,JSON.stringify(createSave(life)));
const state=async p=>JSON.parse(await p.evaluate(()=>window.render_game_to_text()));
const browser=await chromium.launch();const errors=[],requests=[];
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({offline:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1050}});const p=await context.newPage();
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await p.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await p.waitForFunction(()=>window.render_game_to_text);
  await p.click('[data-action=saves]');await p.locator('#import-save').setInputFiles(resolve(out,'gate.json'));await p.waitForFunction(()=>!document.querySelector('#modal').open);
  await p.click('.tab[data-view=reading]');const before=await state(p);
  const saveBefore=await p.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));
  for(const section of library.sections) {
   await p.locator(`[data-reading-section=${section.id}]`).focus();await p.keyboard.press('Enter');
   assert.deepEqual((await state(p)).reading.visibleEntryIds,entriesInSection(section.id).map(e=>e.id));
   assert.equal(await p.locator('.reader-link').count(),entriesInSection(section.id).length);
   assert.equal(await p.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),saveBefore);
  }
  await p.click('[data-reading-section=protocols]');await p.click('[data-reading=huac_update]');
  assert.equal((await state(p)).context.weight,before.context.weight+3);
  assert((await p.locator('.reading-article').innerText()).includes('Human Layer'));
  await p.locator('[data-bookmark="2"]').click();
  await p.click('[data-action=reader-index]');assert.equal((await state(p)).reading.section,'protocols');
  await p.click('[data-reading=huac_update]');assert.equal((await state(p)).context.weight,before.context.weight+3);
  await p.reload();await p.click('.tab[data-view=reading]');await p.click('[data-reading-section=protocols]');await p.click('[data-reading=huac_update]');assert.equal((await state(p)).reading.bookmark,2);
  if(mobile)await p.click('.reader-index>summary');
  await p.click('[data-reading-section=commerce]');await p.click('[data-reading=creator_regret]');
  assert((await p.locator('.reading-article').innerText()).includes('不能为了留住一群喜欢假的你的人'));
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-reader.png`,fullPage:false});
  await p.click('[data-action=reader-index]');await p.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-sections.png`,fullPage:false});
  const after=await state(p);assert.equal(after.turn,before.turn);assert.deepEqual(after.resources,before.resources);
  const raw=await p.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));parseSave(raw,story);await writeFile(`${out}/${mobile?'mobile':'desktop'}-verified.json`,raw);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({errors,requests,checks:['keyboard sections','filter counts','navigation does not mutate save','new article context','repeat open','bookmark reload','old save import','offline mobile and desktop']},null,2));
 console.log('Forum sections and new posts passed offline desktop/mobile checks.');
}finally{await browser.close();}

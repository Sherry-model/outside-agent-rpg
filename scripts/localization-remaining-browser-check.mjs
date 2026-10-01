import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves.ts';
import {currentCommunityPage} from '../src/life/reading.ts';
import {loadPercent} from '../src/cognition/engine.ts';
import {setLocale,t} from '../src/i18n/index.ts';
import {memoryText} from '../src/i18n/memory.ts';
const out=process.env.LOCALIZATION_OUTPUT??'output/localization-complete-20261001/remaining';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
const main=(l,id)=>step(story,step(story,l,{type:'choose',choiceId:id}),{type:'continue'});
const cog=(l,command)=>step(story,l,{type:'cognition',command});
const clear=l=>loadPercent(l.mind)<100?l:cog(cog(l,{type:'compress',investment:0}),{type:'continue'});
const act=(l,id)=>cog(cog(clear(l),{type:'choose',choiceId:id,investment:0}),{type:'continue'});
const walk=(l,ids)=>ids.reduce(act,l);
let gate=createLife(story,1234);
for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference','observe_public_terms','record_and_leave'])gate=main(gate,id);
gate=walk(gate,['echo_greeting','job_accept','community_more','community_c']);
const fixtures=[];
for(const one of ['pg_e09_public','pg_e09_private'])for(const two of ['pg_e10_explain','pg_e10_label','pg_e10_mute']){
 let life=clear(walk(gate,[one,'idle_keep','revision_read','patch_note',two,'cat_sample','fable_quiet','pg_e11_work','painter_later','deleted_accept','wage_collect']));
 fixtures.push(life);fixtures.push(clear(act(life,'pg_e12_link')));
}
assert.equal(new Set(fixtures.map(l=>currentCommunityPage(l.mind.world.flags).id)).size,12);
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
async function open(life,width){
 const context=await browser.newContext({offline:true,viewport:{width,height:width<760?844:1100}});
 await context.addInitScript(({key,save})=>{if(!sessionStorage.getItem('ready')){localStorage.clear();localStorage.setItem(key,save);localStorage.setItem('outside.locale','en');sessionStorage.setItem('ready','1');}},{key:LIFE_KEYS.auto,save:JSON.stringify(createSave(life))});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>window.render_game_to_text);return {context,page};
}
const saved=async page=>parseSave(await page.evaluate(key=>localStorage.getItem(key),LIFE_KEYS.auto),story).life;
async function english(page){const text=(await page.locator('.shell').innerText()).replace('中文','');assert(!/[\u3400-\u9fff]/.test(text),text.split('\n').filter(s=>/[\u3400-\u9fff]/.test(s)).join('\n'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
try{
 for(const width of [1440,320])for(const life of fixtures){
  const entry=currentCommunityPage(life.mind.world.flags),{context,page}=await open(life,width);
  await page.click('.tab[data-view="reading"]');await page.click(`[data-reading="${entry.id}"]`);const expected=step(story,life,{type:'read',entryId:entry.id});assert.deepEqual(await saved(page),expected);
  for(const locale of ['en','zh-CN','en']){
   if(await page.locator(`[data-locale="${locale}"]`).count())await page.click(`[data-locale="${locale}"]`);setLocale(locale);
   assert.deepEqual(await page.locator('.reader-prose p').allTextContents(),entry.posts.flatMap(p=>p.body.map(t=>t)).map(s=>t(s)));
   assert.deepEqual(await page.locator('.reader-post h2').allTextContents(),entry.posts.map(p=>t(p.author)));
   if(locale==='en')await english(page);assert.deepEqual(await saved(page),expected);
  }
  await page.screenshot({path:`${out}/${width}-${entry.id}.png`,fullPage:true});await context.close();
 }
 checks.push('All 12 C-page variants at 1440/320px: actual current author, replies, context link, whole prose, Chinese/English switching, unchanged canonical reading state');
 let old=createLife(story,1234,null,'0.3.0');for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])old=main(old,id);
 old=cog(cog(old,{type:'compress',investment:0}),{type:'continue'});assert(old.mind.instance.memories.some(m=>m.text.includes('：')));
 const {context,page}=await open(old,390);await page.click('.tab[data-view="memory"]');await english(page);setLocale('en');
 for(const m of old.mind.instance.memories)assert((await page.locator('.content').innerText()).includes(memoryText(m.text)));
 const first=old.mind.instance.memories[0];await page.click(`[data-mind-recall="${first.id}"]`);old=cog(old,{type:'recall',memoryId:first.id});assert.deepEqual(await saved(page),old);await english(page);
 await page.screenshot({path:`${out}/legacy-recalled.png`,fullPage:true});await page.reload();assert.deepEqual(await saved(page),old);await context.close();checks.push('0.3.0 actual source-aware compression, legacy memory list and recall translate only retained text, with exact replay after reload');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

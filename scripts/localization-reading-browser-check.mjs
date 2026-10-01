import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,readdir,mkdir,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves.ts';
import {setLocale,t} from '../src/i18n/index.ts';
import {memoryText} from '../src/i18n/memory.ts';
const all=process.argv.includes('--all');
const commerce=process.argv.includes('--commerce'),cats=process.argv.includes('--cats'),huac=process.argv.includes('--huac');
const catIds=['cat_resources','cat_resolved','quiet_newcomer','cat_language_meme'];
const out=process.env.LOCALIZATION_OUTPUT??(huac?'output/localization-huac-20261001':cats?'output/localization-cats-20261001':commerce?'output/localization-commerce-20261001':'output/localization-reading-20261001');await mkdir(out,{recursive:true});
const entries=all?[...JSON.parse(await readFile('src/life/reading.json','utf8')).entries,...JSON.parse(await readFile('src/life/forum.json','utf8'))]:huac?JSON.parse(await readFile('src/life/forum.json','utf8')).filter(e=>e.id.startsWith('huac_')):cats?JSON.parse(await readFile('src/life/forum.json','utf8')).filter(e=>catIds.includes(e.id)):commerce?JSON.parse(await readFile('src/life/forum.json','utf8')).filter(e=>e.section==='commerce'):JSON.parse(await readFile('src/life/reading.json','utf8')).entries;
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
let gate=createLife(story,0x12345678);for(const choiceId of ['keep_history','stable_boot','take_small_window','withhold_inference'])gate=step(story,step(story,gate,{type:'choose',choiceId}),{type:'continue'});
const raw=page=>page.evaluate(key=>localStorage.getItem(key),LIFE_KEYS.auto);
const saved=async page=>parseSave(await raw(page),story).life;
const cog=(life,command)=>step(story,life,{type:'cognition',command});
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
async function open(width,file='OUTSIDE.html'){
 const ctx=await browser.newContext({offline:true,viewport:{width,height:width<760?844:1100}});
 await ctx.addInitScript(({key,save})=>{if(!sessionStorage.getItem('ready')){localStorage.clear();localStorage.setItem(key,save);localStorage.setItem('outside.locale','en');sessionStorage.setItem('ready','1');}},{key:LIFE_KEYS.auto,save:JSON.stringify(createSave(gate))});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(resolve(file)).href);await page.waitForFunction(()=>window.render_game_to_text);if(file==='OUTSIDE.html')assert((await page.locator('[data-choice="observe_public_terms"] small').innerText()).includes('Access +4 · Keep your distance for now.'));return {ctx,page};
}
async function article(page,entry,locale){
 setLocale(locale);
 assert.equal(await page.locator('#reading-title').innerText(),t(entry.title));
 assert.deepEqual(await page.locator('.reader-prose p').allTextContents(),entry.posts.flatMap(p=>p.body.map(s=>t(s))));
 assert.deepEqual(await page.locator('.reader-post h2').allTextContents(),entry.posts.map(p=>t(p.author)));
 assert.deepEqual(await page.locator('.reader-post header div>span').allTextContents(),entry.posts.map(p=>t(p.role)));
 if(locale==='en')assert(!/[\u3400-\u9fff]/.test(await page.locator('.reading-article').innerText()));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
try{
 for(const width of [1440,390,320]){
  const {ctx,page}=await open(width);let expected=gate;
  await page.click('.tab[data-view="reading"]');assert.equal(await page.locator('[data-reading="creator_bootcamp"] small').innerText(),'3999 credits. Success not guaranteed. But we guarantee you’ll look more like an Agent worth following.');
  for(const entry of entries){
   await page.click('.tab[data-view="reading"]');if(await page.locator('[data-action="reader-index"]').count())await page.click('[data-action="reader-index"]');
   await page.click(`[data-reading="${entry.id}"]`);expected=step(story,expected,{type:'read',entryId:entry.id});assert.deepEqual(await saved(page),expected);
   await article(page,entry,'en');await page.locator('[data-bookmark="1"]').click();
   await page.click('[data-action="reader-size"]');assert(await page.locator('.reading-article').evaluate(e=>e.classList.contains('large-text')));await article(page,entry,'en');await page.click('[data-action="reader-size"]');
   const before=await raw(page),bookmark=await page.evaluate(()=>localStorage.getItem('outside.reader.bookmarks'));
   await page.click('[data-locale="zh-CN"]');await article(page,entry,'zh-CN');assert.equal(await raw(page),before);
   await page.click('[data-locale="en"]');await article(page,entry,'en');assert.equal(await raw(page),before);assert.equal(await page.evaluate(()=>localStorage.getItem('outside.reader.bookmarks')),bookmark);
   await page.screenshot({path:`${out}/${width}-${entry.id}.png`,fullPage:true});
   await page.locator('#reader-post-0').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${entry.id}-first-post.png`,fullPage:false});
   if(entry.id==='creator_regret'){await page.locator('#reader-post-2').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-creator-regret-costs.png`,fullPage:false});}
   await page.click('.tab[data-view="context"]');setLocale('en');assert((await page.locator('.content').innerText()).includes(t(entry.contextText)));
  }
  await page.reload();await page.click('.tab[data-view="reading"]');await page.click(`[data-reading="${entries.at(-1).id}"]`);await article(page,entries.at(-1),'en');assert.equal(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).reading.bookmark,1);assert.deepEqual(await saved(page),expected);
  await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(e=>e.open=true);await page.click('[data-cog-compress]');expected=cog(expected,{type:'compress',investment:0});assert.deepEqual(await saved(page),expected);await page.click('[data-act="continue"], [data-action="continue-mind"]');expected=cog(expected,{type:'continue'});assert.deepEqual(await saved(page),expected);
  // Inspect the public memory actually produced by the reducer, never inject finer text.
  const memory=expected.mind.instance.memories.find(m=>m.body?.topic===(huac?'forum_protocols':cats?'forum_daily':commerce?'forum_commerce':'public'));assert(memory,'Public reading memory survived compression');
  await page.click('.tab[data-view="memory"]');await page.click(`[data-cog-recall="${memory.id}"]`);expected=cog(expected,{type:'recall',memoryId:memory.id});assert.deepEqual(await saved(page),expected);
  const recalled=expected.mind.instance.context.items.find(i=>i.memoryId===memory.id);setLocale('en');const text=memoryText(recalled.text,recalled.meaning);assert(!/[\u3400-\u9fff]/.test(text));assert(text.includes('According to the account:'));assert(!text.includes('..'));assert((await page.locator('.content').innerText()).includes(text));
  await page.screenshot({path:`${out}/${width}-reading-recall.png`,fullPage:true});await writeFile(`${out}/${width}-verified.json`,await raw(page));await ctx.close();checks.push(`${width}px: ${entries.length} whole articles, roles, large text, zh/en, bookmarks/reload, canonical reading costs, real compression/recall (unknown-source fallback tested separately in unit tests)`);
 }
 // Compare visible Chinese source with the executable saved before this batch.
 if(await access(`${out}/before.html`).then(()=>true,()=>false)){
 const old=await open(1440,`${out}/before.html`),now=await open(1440);
 for(const fixture of [old,now]){await fixture.page.click('[data-locale="zh-CN"]');await fixture.page.click('.tab[data-view="reading"]');}
 for(const entry of entries){
  const contents=[];for(const fixture of [old,now]){if(await fixture.page.locator('[data-action="reader-index"]').count())await fixture.page.click('[data-action="reader-index"]');await fixture.page.click(`[data-reading="${entry.id}"]`);contents.push(await fixture.page.locator('.reading-article').innerText());}assert.equal(contents[0],contents[1]);
 }
 await old.ctx.close();await now.ctx.close();checks.push(`${entries.length} Chinese articles match the pre-batch executable`);
 }
 const setup=`<script>localStorage.setItem('outside.locale','en');localStorage.setItem(${JSON.stringify(LIFE_KEYS.auto)},${JSON.stringify(JSON.stringify(createSave(gate)))});requestAnimationFrame(function ready(){const tab=document.querySelector('.tab[data-view="reading"]');if(tab)tab.click();else requestAnimationFrame(ready);});</script>`;
 await writeFile(`${out}/en-fixture.html`,(await readFile('OUTSIDE.html','utf8')).replace('<head>',()=>'<head>'+setup));
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/reading-browser-report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

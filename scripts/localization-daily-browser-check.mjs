import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseStory,dailyJourney,nodeId} from '../tests/helpers/daily.ts';
import {step} from '../src/life/engine.ts';
import {contentFor} from '../src/life/content.ts';
import {canChoose,loadPercent} from '../src/cognition/engine.ts';
import {createSave,parseSave,LIFE_KEYS} from '../src/life/saves.ts';
import {setLocale,t} from '../src/i18n/index.ts';
const out=process.env.LOCALIZATION_OUTPUT??'output/localization-daily-20261013/branches';await mkdir(out,{recursive:true});
const content=contentFor('0.11.0'),cog=(l,command)=>step(baseStory,l,{type:'cognition',command});
const variants={daily_feeder_check:{daily_feeder:'feeder_check'},daily_painter_return_lighthouse:{daily_opinion:'opinion_lighthouse'},daily_painter_return_plain:{daily_opinion:'opinion_unsure'},daily_message_reply_inferred:{daily_message:'message_infer'},daily_message_reply_asked:{daily_message:'message_ask'},daily_message_reply_listed:{daily_message:'message_options'}};
const fixtures=content.nodes.filter(n=>n.id.startsWith('daily_')).map(node=>{
 let life=dailyJourney(variants[node.id]??{},node.id);
 if(node.id.startsWith('daily_painter_return_'))life=step(baseStory,life,{type:'read',entryId:'sandbox_meme'});
 return life;
});
const baseline='output/localization-daily-20261013/before.html';
const compareChinese=await access(baseline).then(()=>true,()=>false);
const browser=await chromium.launch({headless:true}),errors=[],requests=[],checks=[];
async function open(life,width,file='OUTSIDE.html'){
 const ctx=await browser.newContext({offline:true,viewport:{width,height:1000}});
 await ctx.addInitScript(({key,save})=>{localStorage.clear();localStorage.setItem(key,save);localStorage.setItem('outside.locale','en');},{key:LIFE_KEYS.auto,save:JSON.stringify(createSave(life))});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(resolve(file)).href);await page.waitForFunction(()=>window.render_game_to_text);return {ctx,page};
}
const saved=async page=>parseSave(await page.evaluate(key=>localStorage.getItem(key),LIFE_KEYS.auto),baseStory).life;
async function english(page){const text=(await page.locator('.shell').innerText()).replace('中文','');assert(!/[\u3400-\u9fff]/.test(text),text);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
try{
 for(const source of fixtures){
  let life=source;
  if(loadPercent(life.mind)>=90)life=cog(cog(life,{type:'compress',investment:0}),{type:'continue'});
  const node=content.nodes.find(n=>n.id===nodeId(life));
  for(const choice of node.choices){
   assert.equal(canChoose(content,life.mind,choice.id),'',choice.id);
   const {ctx,page}=await open(life,320);setLocale('en');await english(page);
   assert.equal(await page.locator('#event-title').innerText(),t(node.title));
   assert.deepEqual(await page.locator('.content>.prose p').allTextContents(),node.text.map(s=>t(s)));
   await page.click(`[data-pilot-choice="${choice.id}"]`);const expected=cog(life,{type:'choose',choiceId:choice.id,investment:0});assert.deepEqual(await saved(page),expected);
   await english(page);assert.deepEqual(await page.locator('.result-prose p').allTextContents(),choice.outcome.text.map(s=>t(s)));
   await page.screenshot({path:`${out}/${choice.id}.png`,fullPage:true});
   await page.click('[data-locale="zh-CN"]');assert.deepEqual(await page.locator('.result-prose p').allTextContents(),choice.outcome.text);assert.deepEqual(await saved(page),expected);
   await page.click('[data-locale="en"]');await english(page);assert.deepEqual(await saved(page),expected);
   await page.click('[data-act="continue"]');assert.deepEqual(await saved(page),cog(expected,{type:'continue'}));await english(page);
   checks.push(choice.id);await ctx.close();
  }
  // Chinese rendering matches the executable accepted before the translation batch.
  if(compareChinese){
  const before=await open(life,1440,baseline),after=await open(life,1440);
  for(const x of [before,after])await x.page.click('[data-locale="zh-CN"]');
  assert.equal(await before.page.locator('.content').innerText(),await after.page.locator('.content').innerText());
  await before.ctx.close();await after.ctx.close();
  }
 }
 // Standalone fixture for the original skill client, reached through actual game commands.
 const setup=`<script>localStorage.setItem('outside.locale','en');localStorage.setItem(${JSON.stringify(LIFE_KEYS.auto)},${JSON.stringify(JSON.stringify(createSave(fixtures[0])))});</script>`;
 await writeFile(`${out}/en-fixture.html`,(await readFile('OUTSIDE.html','utf8')).replace('<head>',()=>'<head>'+setup));
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,chineseBaselineNodes:compareChinese?fixtures.length:0,errors,requests},null,2));console.log(JSON.stringify({branches:checks.length,errors,requests}));
}finally{await browser.close();}

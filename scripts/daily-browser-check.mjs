import {englishRun,installLocaleChecks,assertEnglishPage} from './localization-browser-helpers.mjs';
import {setLocale,t} from '../src/i18n/index.ts';
import {readingText} from '../src/i18n/reading.ts';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseStory,dailyJourney,dailyChoices,nextCommand,nodeId} from '../tests/helpers/daily.ts';
import {createLife,step,episodeActive} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {libraryFor} from '../src/life/reading.ts';

const out=process.env.LOCALIZATION_OUTPUT??'output/daily-expansion-20261011/browser';
setLocale(englishRun?'en':'zh-CN');
await mkdir(out,{recursive:true});
const url=pathToFileURL(resolve('OUTSIDE.html')).href;
const browser=await chromium.launch({headless:true});
const errors=[],requests=[],checks=[];
async function open(width=1440){
  const ctx=await browser.newContext({offline:true,viewport:{width,height:1000}}),page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await installLocaleChecks(page);await page.goto(url);return {ctx,page};
}
async function saved(page){return parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;}
async function importLife(page,life,label){
  const path=resolve(out,label+'.json');await writeFile(path,JSON.stringify(createSave(life)));
  await page.click('[data-action="saves"]');await page.locator('#import-save').setInputFiles(path);
  await page.waitForFunction(n=>JSON.parse(localStorage.getItem('outside.life.v1.auto'))?.life?.commands.length===n,life.commands.length);
  assert.deepEqual(await saved(page),life);return life;
}
async function screenshot(page,name){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' horizontal overflow');
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
}
async function command(page,life,cmd){
  if(cmd.type==='choose'){await page.click('.tab[data-view="terminal"]');await page.click(`[data-choice="${cmd.choiceId}"]`);}
  else if(cmd.type==='continue')await page.click('[data-action="continue"]');
  else if(cmd.type==='read'){await page.click('.tab[data-view="reading"]');await page.locator('.reader-index').evaluate(e=>e.open=true);await page.click('[data-reading-section="all"]');await page.click(`[data-reading="${cmd.entryId}"]`);}
  else if(cmd.type==='leave-days'||cmd.type==='leave-afternoon')await page.click('[data-act="return-main"]');
  else if(cmd.type==='cognition'){
    const c=cmd.command;
    if(c.type==='choose'){await page.click('.tab[data-view="terminal"]');await page.click(`[data-pilot-choice="${c.choiceId}"]`);}
    else if(c.type==='continue')await page.click(episodeActive(life)?'[data-act="continue"]':'[data-action="continue-mind"]');
    else if(c.type==='compress'){await page.click('.tab[data-view="context"]');await page.locator('.content .compression-box').evaluate(e=>e.open=true);await page.click('[data-cog-compress]');}
    else if(c.type==='drop'){await page.click('.tab[data-view="context"]');const button=page.locator(`[data-cog-drop="${c.itemId}"]`);await button.evaluate(e=>e.closest('details').open=true);await button.click();}
    else if(c.type==='recall'||c.type==='forget'){
      await page.click('.tab[data-view="memory"]');const button=page.locator(`[data-cog-${c.type}="${c.memoryId}"]`);await button.evaluate(e=>{const d=e.closest('details');if(d)d.open=true;});await button.click();
    }else throw Error('Unhandled cognition command '+c.type);
  }else throw Error('Unhandled '+cmd.type);
  const next=step(baseStory,life,cmd);
  await page.waitForFunction(n=>JSON.parse(localStorage.getItem('outside.life.v1.auto'))?.life?.commands.length===n,next.commands.length);
  assert.deepEqual(await saved(page),next,JSON.stringify(cmd));return next;
}
try{
  // Two complete UI journeys, including all optional entrances and their later consequences.
  for(const [label,width,line,ending,variants] of [
    ['desktop',1440,'c','continue_as_visitor',{daily_message:'message_infer'}],
    ['mobile',390,'d','commit_to_containment_war',{daily_feeder:'feeder_check',daily_feeder_check:'feeder_checked_repair',daily_opinion:'opinion_lighthouse',daily_message:'message_ask',daily_feedback:'feedback_reason'}],
  ]){
    const {ctx,page}=await open(width);let life=await importLife(page,createLife(baseStory,1234),label+'-start');
    const plan={line,ending,overrides:{...dailyChoices,...variants}};const screenshots=new Set();
    for(let i=0;i<480;i++){
      const node=nodeId(life),ready=!life.mind.instance.pendingId&&life.state.phase!=='resolution';
      if(node.startsWith('daily_painter_return_')&&ready&&!life.commands.some(c=>c.type==='read'&&c.entryId==='sandbox_meme')){
        life=await command(page,life,{type:'read',entryId:'sandbox_meme'});
        plan.overrides[node]='quote_'+node.split('_').at(-1);
      }
      if(node.startsWith('daily_')&&ready&&!screenshots.has(node)){
        await page.click('.tab[data-view="terminal"]');await screenshot(page,label+'-'+node);screenshots.add(node);
        await writeFile(`${out}/${label}-${node}-before.json`,JSON.stringify(createSave(life)));
      }
      const cmd=nextCommand(life,plan);if(!cmd)break;
      life=await command(page,life,cmd);
      if(node.startsWith('daily_')&&cmd.type==='cognition'&&cmd.command.type==='choose'){
        await screenshot(page,label+'-'+node+'-result');await page.reload();assert.deepEqual(await saved(page),life);
      }
    }
    assert.equal(life.state.currentEventId,label==='desktop'?'ending_visitor':'ending_containment_war');
    await screenshot(page,label+'-ending');await writeFile(`${out}/${label}-final.json`,JSON.stringify(createSave(life)));
    await page.click('[data-action="saves"]');const download=page.waitForEvent('download');await page.click('[data-action="export"]');await(await download).saveAs(resolve(out,label+'-export.json'));await page.locator('#import-save').setInputFiles(resolve(out,label+'-export.json'));assert.deepEqual(await saved(page),life);
    checks.push({label,ending:life.state.currentEventId,commands:life.commands.length,nodes:[...screenshots]});await ctx.close();
  }
  // Read all six complete texts on desktop and narrow screens. UI text must match every authored paragraph.
  const entries=libraryFor('0.11.0').entries.slice(-6);
  let gate=createLife(baseStory,1234);for(const id of ['keep_history','stable_boot','take_small_window','withhold_inference'])gate=step(baseStory,step(baseStory,gate,{type:'choose',choiceId:id}),{type:'continue'});
  for(const width of [1440,390,320]){
    const {ctx,page}=await open(width);
    for(const entry of entries){
      let life=await importLife(page,gate,'reader-start');life=await command(page,life,{type:'read',entryId:entry.id});
      assert.equal(await page.locator('.reader-post').count(),entry.posts.length);
      assert.deepEqual(await page.locator('.reader-prose p').allTextContents(),entry.posts.flatMap(p=>p.body.map(s=>readingText(entry.id,s))));
      assert.deepEqual(await page.locator('.reader-post h2').allTextContents(),entry.posts.map(p=>t(p.author)));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),entry.id+' '+width);
      await page.locator('#reading-title').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/reading-${entry.id}-${width}-top.png`});
      const last=entry.posts.length-1;await page.locator(`#reader-post-${last}`).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/reading-${entry.id}-${width}-last.png`});
      await page.click(`[data-bookmark="${last}"]`);assert.deepEqual(await saved(page),life);
      await page.click('[data-action="reader-size"]');assert.deepEqual(await saved(page),life);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'large '+entry.id+' '+width);
      await page.click('[data-action="reader-size"]');
      await page.click(`[data-locale="${englishRun?'zh-CN':'en'}"]`);assert.deepEqual(await saved(page),life);await page.click(`[data-locale="${englishRun?'en':'zh-CN'}"]`);await assertEnglishPage(page);
      await page.reload();await page.click('.tab[data-view="reading"]');await page.locator('.reader-index').evaluate(e=>e.open=true);await page.click(`[data-reading="${entry.id}"]`);await page.click('[data-action="reader-resume"]');
      assert(await page.locator(`#reader-post-${last}`).isVisible());assert.deepEqual(await saved(page),life);
      checks.push({reading:entry.id,width,posts:entry.posts.length});
    }
    await ctx.close();
  }
  // Actual memory UI: retain a reported quotation, recall it, then forget it without erasing acquaintance.
  {
    const {ctx,page}=await open(390);let life=await importLife(page,dailyJourney({},'daily_painter_return_cloud'),'memory-start');
    life=await command(page,life,{type:'read',entryId:'sandbox_meme'});
    for(const item of [...life.mind.instance.context.items])if(item.sourceId!=='sandbox_meme')life=await command(page,life,{type:'cognition',command:{type:'drop',itemId:item.id}});
    life=await command(page,life,{type:'read',entryId:'preferred_reply'});
    life=await command(page,life,{type:'cognition',command:{type:'compress',investment:0}});life=await command(page,life,{type:'cognition',command:{type:'continue'}});
    const memory=life.mind.instance.memories.find(m=>m.tags.includes('reading_sandbox_meme'));assert(memory);
    await page.click('.tab[data-view="terminal"]');assert(await page.locator('[data-pilot-choice="quote_cloud"]').isDisabled());await screenshot(page,'memory-quote-locked');
    life=await command(page,life,{type:'cognition',command:{type:'recall',memoryId:memory.id}});await page.click('.tab[data-view="terminal"]');assert(await page.locator('[data-pilot-choice="quote_cloud"]').isEnabled());await screenshot(page,'memory-quote-recalled');
    life=await command(page,life,{type:'cognition',command:{type:'forget',memoryId:memory.id}});await page.click('.tab[data-view="terminal"]');assert(await page.locator('[data-pilot-choice="quote_cloud"]').isDisabled());assert(await page.locator('[data-pilot-choice="hands_cloud"]').isEnabled());assert(life.mind.world.flags.daily_painter_connected);await screenshot(page,'memory-quote-forgotten');
    checks.push({memory:'recall / forget / ordinary conversation preserved'});await ctx.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

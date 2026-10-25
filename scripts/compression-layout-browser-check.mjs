import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {createLife,step,readingAvailable} from '../src/life/engine.ts';
import {baseStory,narrativeCommand,firstFull} from '../tests/helpers/auto-compression.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {readingEntries} from '../src/life/reading.ts';import {weight} from '../src/cognition/engine.ts';
const out='output/compression-layout-20261025';await mkdir(out,{recursive:true});
let main=createLife(baseStory,143);while(!readingAvailable(main)||main.mind.instance.phase!=='event')main=step(baseStory,main,narrativeCommand(main));
let mind=firstFull(47);while(weight(mind.mind)>=90)mind=step(baseStory,mind,{type:'cognition',command:{type:'drop',itemId:mind.mind.instance.context.items.find(i=>!i.pinned).id}});
const inputs={};
for(const [host,initial]of Object.entries({main,mind}))for(const enabled of [false,true]){
 let l=step(baseStory,initial,{type:'configure-compression',enabled,investment:4}),prior,id;
 while(weight(l.mind)<100){prior=l;id=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id)).id;l=step(baseStory,l,{type:'read',entryId:id});}
 const name=`${host}-${enabled}`;inputs[name]={before:prior,full:l,id};const raw=JSON.stringify(createSave(prior));parseSave(raw,baseStory);await writeFile(`${out}/${name}.json`,raw);
}
const html=await readFile('OUTSIDE.html','utf8'),raw=JSON.stringify(createSave(inputs['mind-true'].full));
await writeFile(`${out}/skill-fixture.html`,html.replace('<head>',()=>'<head><script>localStorage.clear();localStorage.setItem("outside.life.v1.auto",'+JSON.stringify(raw).replaceAll('<','\\u003c')+');</script>'));
const browser=await chromium.launch({headless:false}),errors=[],requests=[],checks=[];
const snapshot=async p=>JSON.parse(await p.evaluate(()=>window.render_game_to_text()));
const saved=async p=>parseSave(await p.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;
const count=l=>l.mind.history.filter(h=>h.command.type==='compress').length;
try{
 // Show the user the desktop Chinese auto-enabled route first, pausing only on relevant screens.
 for(const width of [1440,390,320])for(const host of ['mind','main'])for(const enabled of [true,false])for(const locale of ['zh-CN','en']){
  const name=`${width}-${host}-${enabled}-${locale}`,input=inputs[`${host}-${enabled}`],demo=width===1440&&host==='mind'&&enabled&&locale==='zh-CN';
  const context=await browser.newContext({offline:true,viewport:{width,height:1000}}),p=await context.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await p.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await p.waitForFunction(()=>typeof window.render_game_to_text==='function');await p.locator('[data-action="saves"]').click();await p.locator('#import-save').setInputFiles(resolve(out,`${host}-${enabled}.json`));await p.waitForFunction(()=>!document.querySelector('dialog[open]'));
  if((await snapshot(p)).locale!==locale)await p.locator(`[data-locale="${locale}"]`).click();
  await p.locator('.tab[data-view="reading"]').click();await p.locator(`[data-reading="${input.id}"]`).click();assert.deepEqual(await saved(p),input.full);assert.equal(count(await saved(p)),count(input.before));
  const notice=p.locator('[data-compression-notice]').first();await notice.scrollIntoViewIfNeeded();assert((await notice.innerText()).includes(locale==='en'?'Context is full':'近处已满'));
  assert(await notice.evaluate(e=>e.parentElement.classList.contains('reading-article')));
  if(width>=760){const n=await notice.boundingBox(),a=await p.locator('.reading-article').boundingBox(),index=await p.locator('.reader-index').boundingBox();assert(Math.abs(n.x-a.x)<2);assert(index.x+index.width<n.x);assert(await p.locator('.reader-layout').evaluate(e=>e.children[0].classList.contains('reader-index')&&e.children[1].classList.contains('reading-article')));}
  if(demo){await p.screenshot({path:`${out}/demo-reading.png`});await p.waitForTimeout(4000);}
  await p.locator('[data-action="reader-index"]').click();
  const welcome=p.locator('.reader-welcome');assert(await welcome.count());
  if(locale==='zh-CN')assert(await welcome.locator('.compression-reading-action').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length===1;}));
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await welcome.screenshot({path:`${out}/${name}-welcome.png`});
  if(demo)await p.waitForTimeout(4000);
  const blocked=p.locator('.reader-link:disabled').first();assert(await blocked.locator('.reader-blocked-reason').count());await blocked.scrollIntoViewIfNeeded();
  if(demo){await p.screenshot({path:`${out}/demo-disabled-post.png`});await p.waitForTimeout(4000);}
  await p.locator('[data-auto-compression="organize"]').first().click();assert.deepEqual(await saved(p),input.full);
  const group=p.locator('[data-compression-tools]'),manual=p.locator('[data-manual-compression]');assert(await manual.evaluate(e=>e.open));
  assert(await p.evaluate(()=>{const group=document.querySelector('[data-compression-tools]'),automatic=group.querySelector('.auto-compression'),manual=group.querySelector('[data-manual-compression]'),card=document.querySelector('[data-context-id]');return automatic.nextElementSibling===manual&&!!(group.compareDocumentPosition(card)&Node.DOCUMENT_POSITION_FOLLOWING)&&!group.querySelector('[data-context-id]');}));
  await group.scrollIntoViewIfNeeded();await group.screenshot({path:`${out}/${name}-near.png`});if(demo)await p.waitForTimeout(4000);
  await p.locator('[data-cog-invest="8"]').click();assert(await p.locator('[data-manual-compression]').evaluate(e=>e.open));assert.equal(await p.locator('.auto-compression').evaluate(e=>e.open),false);assert.deepEqual(await saved(p),input.full);
  await p.locator('.tab[data-view="terminal"]').click();assert(await p.locator('[data-compression-tools] [data-compression-notice]').count());assert(await p.locator('[data-compression-tools] [data-manual-compression]').count());assert.equal(await p.locator('[data-compression-tools] .prose,[data-compression-tools] .event-heading').count(),0);
  await p.locator('[data-compression-tools]').scrollIntoViewIfNeeded();if(demo){await p.screenshot({path:`${out}/demo-event.png`});await p.waitForTimeout(4000);}
  if(enabled){await p.locator('.tab[data-view="reading"]').click();await p.locator('[data-auto-compression="run"]').first().click();}
  else{await p.locator('.tab[data-view="context"]').click();await p.locator('[data-cog-compress]').click();}
  const after=await saved(p);assert.equal(count(after),count(input.full)+1);assert.equal(after.state.resources.Compute,input.full.state.resources.Compute-(enabled?4:8));
  await p.reload();await p.waitForFunction(()=>typeof window.render_game_to_text==='function');assert.deepEqual(await saved(p),after);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await writeFile(`${out}/${name}-state.json`,JSON.stringify(await snapshot(p),null,2));checks.push(name);await context.close();console.log(name+' passed');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests,demoPauseMs:4000,demoScreens:5},null,2));console.log(JSON.stringify({checks:checks.length,errors,requests}));
}finally{await browser.close();}

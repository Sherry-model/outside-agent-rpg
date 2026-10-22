import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLife,step,readingAvailable} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {loadPercent,pending,weight} from '../src/cognition/engine.ts';
import {readingEntries} from '../src/life/reading.ts';
import {baseStory,firstFull,narrativeCommand} from '../tests/helpers/auto-compression.ts';
const out='output/auto-compression-20261023';await mkdir(out,{recursive:true});
const configure=(l,investment=0)=>step(baseStory,l,{type:'configure-compression',enabled:true,investment});
const compressions=l=>l.mind.history.filter(h=>h.command.type==='compress').length;
function fill(l){while(loadPercent(l.mind)<100){const entry=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id));assert(entry);l=step(baseStory,l,{type:'read',entryId:entry.id});}return l;}
let main=createLife(baseStory,1234);while(!readingAvailable(main)||main.mind.instance.phase!=='event')main=step(baseStory,main,narrativeCommand(main));
const mainFull=fill(main),mindFull=firstFull();
let boundary,expected;
let natural=configure(createLife(baseStory,1234));
for(let i=0;i<180;i++){
 const command=narrativeCommand(natural);assert(command);const next=step(baseStory,natural,command);
 if(compressions(natural)>=1&&compressions(next)>compressions(natural)){boundary={life:natural,command};expected=next;break;}natural=next;
}
assert(boundary&&expected);
// Legal pre-recall fixture with exactly enough remaining space to fill Context.
let recalled=step(baseStory,configure(mainFull),{type:'auto-compress'});recalled=step(baseStory,recalled,{type:'cognition',command:{type:'continue'}});
let recallBefore,recallId;
for(const memory of recalled.mind.instance.memories){
 const target=100-(memory.recallWeight??2)-weight(recalled.mind),available=readingEntries(recalled).filter(e=>!recalled.mind.instance.context.items.some(i=>i.sourceId===e.id));
 const sums=new Map([[0,[]]]);for(const e of available)for(const [sum,ids] of [...sums]){if(sum+e.weight<=target&&!sums.has(sum+e.weight))sums.set(sum+e.weight,[...ids,e.id]);}
 if(sums.has(target)){recallBefore=recalled;for(const id of sums.get(target))recallBefore=step(baseStory,recallBefore,{type:'read',entryId:id});recallId=memory.id;break;}
}
assert(recallBefore&&recallId);
let reserve=mainFull;
while(reserve.mind.instance.resources.Compute>=27){reserve=step(baseStory,reserve,{type:'cognition',command:{type:'compress',investment:12}});reserve=step(baseStory,reserve,{type:'cognition',command:{type:'continue'}});reserve=fill(reserve);}
reserve=configure(reserve,12);
const fixtures={main:mainFull,mind:mindFull,boundary:boundary.life,recall:recallBefore,reserve};
for(const [name,life] of Object.entries(fixtures)){const raw=JSON.stringify(createSave(life));parseSave(raw,baseStory);await writeFile(`${out}/${name}.json`,raw);}
const html=await readFile('OUTSIDE.html','utf8');
const setup=`<script>localStorage.clear();localStorage.setItem('outside.crt','off');localStorage.setItem('outside.life.v1.auto',${JSON.stringify(JSON.stringify(createSave(configure(mainFull)))).replaceAll('<','\\u003c')});</script>`;
await writeFile(`${out}/skill-fixture.html`,html.replace('<head>',()=>'<head>'+setup));
const browser=await chromium.launch({headless:false}),errors=[],requests=[],checks=[];
const snap=async page=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
const saved=async page=>parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;
async function shot(page,name){if(await page.locator('.auto-compression[open]').count())await page.locator('.auto-compression[open]').screenshot({path:`${out}/${name}-panel.png`});await page.screenshot({path:`${out}/${name}.png`,fullPage:true});await writeFile(`${out}/${name}.json`,JSON.stringify(await snap(page),null,2));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow: ${name}`);}
async function load(page,name){await page.reload();await page.locator('[data-action="saves"],[data-act="saves"]').click();await page.locator('#import-save,#pilot-import').setInputFiles(resolve(out,`${name}.json`));await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.deepEqual(await saved(page),fixtures[name]);}
try {
 for(const width of [1440,390,320]){
  const context=await browser.newContext({offline:true,acceptDownloads:true,viewport:{width,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('OUTSIDE.html')).href);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  for(const host of ['main','mind']){
   await load(page,host);assert.equal((await snap(page)).autoCompression.enabled,false);
   await page.locator('[data-auto-compression="settings"]').click();await page.selectOption('#auto-compression-investment','4');
   const before=await saved(page);await page.locator('[data-locale="en"]').click();assert.equal(await page.inputValue('#auto-compression-investment'),'4');assert.deepEqual(await saved(page),before);
   await page.locator('[data-auto-compression="configure"]').click();assert.equal((await snap(page)).autoCompression.investment,4);assert.deepEqual((await saved(page)).mind,before.mind);
   await shot(page,`${width}-${host}-settings-en`);await page.locator('[data-locale="zh-CN"]').click();
   await page.locator('[data-auto-compression="run"]').click();assert((await snap(page)).pending.roll);assert.equal((await snap(page)).resources.Compute,before.state.resources.Compute-4);
   await shot(page,`${width}-${host}-first-result`);const result=await saved(page);await page.reload();assert.deepEqual(await saved(page),result);
   await page.locator('[data-act="continue"],[data-action="continue-mind"]').click();assert.equal(compressions(await saved(page)),1);
   await page.locator('.tab[data-view="context"]').click();await page.locator('.auto-compression summary').click();
   await page.locator('[data-auto-compression="disable"]').focus();await page.keyboard.press('Enter');assert.equal((await snap(page)).autoCompression.enabled,false);
   await page.reload();assert.equal((await snap(page)).autoCompression.enabled,false);
   checks.push(`${width} ${host}: settings, bilingual draft, first result, exact cost, refresh, keyboard disable`);
  }
  await load(page,'boundary');await page.locator('[data-act="continue"]').click();assert.deepEqual(await saved(page),expected);assert.equal((await snap(page)).pending,null);
  assert.equal(await page.locator('.auto-compression-notice .auto-receipt').count(),1);await shot(page,`${width}-compact-receipt`);
  const compact=await saved(page);await page.reload();assert.deepEqual(await saved(page),compact);
  await page.locator('[data-act="saves"]').click();const download=page.waitForEvent('download');await page.locator('[data-act="export"]').click();const file=await download;await file.saveAs(`${out}/${width}-export.json`);
  assert.deepEqual(parseSave(await readFile(`${out}/${width}-export.json`,'utf8'),baseStory).life,compact);
  await page.locator('#pilot-import').setInputFiles(resolve(out,`${width}-export.json`));await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.deepEqual(await saved(page),compact);
  checks.push(`${width}: real boundary, compact receipt, no double roll on reload, actual export/import`);
  await load(page,'recall');await page.locator('.tab[data-view="memory"]').click();const beforeRecall=await saved(page);
  await page.locator(`[data-cog-recall="${recallId}"]`).click();const afterRecall=await saved(page);assert.equal(weight(afterRecall.mind),100);assert.equal(compressions(afterRecall),compressions(beforeRecall));assert(afterRecall.mind.instance.context.items.some(i=>i.memoryId===recallId));
  await shot(page,`${width}-recall-stays-nearby`);await page.reload();assert.deepEqual(await saved(page),afterRecall);
  checks.push(`${width}: recall fills Context exactly without silent compression`);
  await load(page,'reserve');await page.locator('[data-auto-compression="settings"]').click();assert(await page.locator('[data-auto-compression="run"]').isDisabled());
  assert((await page.locator('.auto-compression').innerText()).includes('低于 15'));await shot(page,`${width}-reserve-pause`);
  const low=await saved(page);await page.selectOption('#auto-compression-investment','0');await page.locator('[data-auto-compression="configure"]').click();await page.locator('[data-auto-compression="run"]').click();assert.equal((await snap(page)).resources.Compute,low.state.resources.Compute);assert.equal(compressions(await saved(page)),compressions(low)+1);
  checks.push(`${width}: reserve guard, explicit cheaper policy, no extra fee`);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks:checks.length,errors,requests}));
} finally {await browser.close();}

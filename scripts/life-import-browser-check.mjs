import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseStory,schedulerJourney} from '../tests/helpers/scheduler.ts';
import {createLife,replayStep,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';

const out=process.env.IMPORT_OUTPUT??'output/astra-scheduler-release-20261020/import';
await mkdir(out,{recursive:true});
const fixtures={main:createLife(baseStory,1),pilot:schedulerJourney(1234,'chance_application')};
const pin=life=>({type:'cognition',command:{type:'pin',itemId:life.mind.instance.context.items[0].id}});
async function file(name,raw){const path=resolve(out,name+'.json');await writeFile(path,raw);return path;}
const short={},long={};
for(const surface of ['main','pilot']){
  short[surface]=await file(surface+'-short',JSON.stringify(createSave(fixtures[surface])));
  let life=fixtures[surface];
  while(life.commands.length<3050)life=replayStep(baseStory,life,pin(life));
  const raw=JSON.stringify(createSave(life),null,2);
  assert(Buffer.byteLength(raw)>2_000_000);
  assert.deepEqual(parseSave(raw,baseStory).life,life);
  long[surface]={life,path:await file(surface+'-long',raw),bytes:Buffer.byteLength(raw)};
}
let capped=long.main.life;
while(capped.commands.length<4096)capped=replayStep(baseStory,capped,pin(capped));
const capPath=await file('cap',JSON.stringify(createSave(capped),null,2));
const invalidPath=await file('invalid','{broken');
const tampered=createSave(long.main.life);tampered.life.schedule.hour++;
const tamperedPath=await file('tampered',JSON.stringify(tampered));
const old=JSON.stringify(createSave(createLife(baseStory,1,null,'0.11.0'))).padEnd(2_000_000,' ');
assert(Buffer.byteLength(old)>2_000_000);
const oldPath=await file('old-byte-oversize',old);
const browser=await chromium.launch({headless:true});
const errors=[],requests=[],checks=[];
const rawSave=p=>p.evaluate(()=>localStorage.getItem('outside.life.v1.auto'));
async function state(p){return parseSave(await rawSave(p),baseStory).life;}
async function saveDialog(p){await p.locator('[data-action="saves"],[data-act="saves"]').click();}
async function importFile(p,path,expected,surface){
  await saveDialog(p);
  if(surface)assert.equal(await p.locator(surface==='main'?'#import-save':'#pilot-import').count(),1);
  await p.locator('#import-save,#pilot-import').setInputFiles(path);
  await p.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('outside.life.v1.auto'))?.life)===expected,JSON.stringify(expected));
  assert.deepEqual(await state(p),expected);
}
async function shot(p,name){
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:resolve(out,name+'.png'),fullPage:true});
  await writeFile(resolve(out,name+'-state.json'),await p.evaluate(()=>window.render_game_to_text()));
}
try{
  for(const surface of ['main','pilot']){
    const ctx=await browser.newContext({offline:true,viewport:{width:surface==='main'?1440:390,height:950},acceptDownloads:true});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errors.push(String(e)));
    p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    await p.goto(pathToFileURL(resolve('OUTSIDE.html')).href);
    await importFile(p,short[surface],fixtures[surface]);
    await importFile(p,long[surface].path,long[surface].life,surface);
    await p.locator('.tab[data-view="context"]').click();
    await p.locator('[data-cog-pin]').first().click();
    const expected=step(baseStory,long[surface].life,pin(long[surface].life));
    assert.equal(expected.commands.length,3051);
    assert.deepEqual(await state(p),expected);
    await shot(p,surface+'-continued');
    await saveDialog(p);
    const downloading=p.waitForEvent('download');
    await p.locator('[data-action="export"],[data-act="export"]').click();
    const download=await downloading;
    const exported=resolve(out,surface+'-ui-export.json');await download.saveAs(exported);
    const raw=await readFile(exported,'utf8');
    assert(Buffer.byteLength(raw)>2_000_000);
    assert.deepEqual(parseSave(raw,baseStory).life,expected);
    await p.keyboard.press('Escape');
    // Change once, then restore the actual browser download through the same UI.
    await p.locator('[data-cog-pin]').first().click();
    await importFile(p,exported,expected,surface);
    await p.reload();assert.deepEqual(await state(p),expected);
    for(const [path,pattern] of [[invalidPath,/有效的 JSON/],[tamperedPath,/快照与本局经历不一致/],[oldPath,/2 MB/]]){
      const before=await rawSave(p);
      await saveDialog(p);await p.locator('#import-save,#pilot-import').setInputFiles(path);
      await p.locator('.modal-message').filter({hasText:pattern}).waitFor();
      assert.equal(await rawSave(p),before);
      await shot(p,surface+'-rejected-'+(path===invalidPath?'invalid':path===tamperedPath?'tampered':'old'));
      await p.keyboard.press('Escape');
    }
    await importFile(p,capPath,capped,surface);
    await p.locator('.tab[data-view="context"]').click();
    const before=await rawSave(p);await p.locator('[data-cog-pin]').first().click();
    assert.match(await p.locator('.toast').innerText(),/4096|上限/);
    assert.equal(await rawSave(p),before);
    checks.push({surface,importedBytes:long[surface].bytes,continuedCommands:3051,actualDownloadRoundTrip:true,cap4096Protected:true,invalidTamperedAndOldOversizePreserveState:true});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile(resolve(out,'report.json'),JSON.stringify({checks,errors,requests},null,2));
  console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

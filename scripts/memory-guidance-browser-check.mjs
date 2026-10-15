import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {baseStory,dailyJourney} from '../tests/helpers/daily.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {knowledgeHelp,usedContext,directoryCode} from '../src/cognition/guidance.ts';
import {recallCost} from '../src/cognition/semantic.ts';
import {readingEntries} from '../src/life/reading.ts';
const out=process.env.MEMORY_GUIDANCE_OUTPUT??'output/memory-guidance-20261014';await mkdir(out,{recursive:true});
const cog=(life,command)=>step(baseStory,life,{type:'cognition',command});
const start=dailyJourney({},'daily_painter_return_cloud');
let fixture=start;
for(const entryId of ['sandbox_meme','shared_memories'])fixture=step(baseStory,fixture,{type:'read',entryId});
fixture=cog(cog(fixture,{type:'compress',investment:0}),{type:'continue'});
const candidate=knowledgeHelp(fixture.mind,'reading_sandbox_meme').candidates[0];assert(candidate);
const snapshots={recall:fixture,public:start,forgotten:cog(fixture,{type:'forget',memoryId:candidate.id})};
// Fill only through replayable commands; no fabricated Context/currency/Memory fields.
function fillTo(target){
  const options=fixture.mind.instance.memories.filter(m=>m.id!==candidate.id&&!fixture.mind.instance.context.items.some(i=>i.memoryId===m.id)).map(m=>({cost:recallCost(m),cmd:{type:'cognition',command:{type:'recall',memoryId:m.id}}}));
  for(const e of readingEntries(fixture))if(!['sandbox_meme','shared_memories'].includes(e.id)&&!fixture.mind.instance.context.items.some(i=>i.sourceId===e.id))options.push({cost:e.weight,cmd:{type:'read',entryId:e.id}});
  const need=target-usedContext(fixture.mind),ways=new Map([[0,[]]]);
  for(const option of options)for(const [sum,path] of [...ways])if(sum+option.cost<=need&&!ways.has(sum+option.cost))ways.set(sum+option.cost,[...path,option]);
  assert(ways.has(need),'reachable capacity');let life=fixture;
  for(const o of ways.get(need))life=step(baseStory,life,o.cmd);
  assert.equal(usedContext(life.mind),target);return life;
}
snapshots.full=fillTo(100-candidate.cost);snapshots.short=fillTo(101-candidate.cost);
snapshots.publicFull=cog(fillTo(98),{type:'forget',memoryId:candidate.id});
snapshots.publicExact=cog(fillTo(95),{type:'forget',memoryId:candidate.id});
let three=cog(fixture,{type:'recall',memoryId:candidate.id});
three=cog(cog(three,{type:'choose',choiceId:'quote_cloud',investment:0}),{type:'continue'});
three=cog(cog(three,{type:'compress',investment:0}),{type:'continue'});snapshots.threePainters=three;
snapshots.main=dailyJourney({},'continuation');snapshots.legacy=createLife(baseStory,1234,null,'0.3.0');
for(const [name,life] of Object.entries(snapshots)){const raw=JSON.stringify(createSave(life));assert.deepEqual(parseSave(raw,baseStory).life,life);await writeFile(`${out}/${name}.json`,raw);}
const html=await readFile('OUTSIDE.html','utf8'),raw=JSON.stringify(createSave(fixture));
await writeFile(`${out}/skill-fixture.html`,html.replace('<head>',()=>`<head><script>localStorage.setItem('outside.life.v1.auto',${JSON.stringify(raw).replaceAll('<','\\u003c')});</script>`));
const browser=await chromium.launch({headless:true});const errors=[],requests=[],checks=[];
const url=pathToFileURL(resolve('OUTSIDE.html')).href;
async function open(width=1440){const ctx=await browser.newContext({offline:true,viewport:{width,height:950}}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.goto(url);return {ctx,page};}
async function saved(page){return parseSave(await page.evaluate(()=>localStorage.getItem('outside.life.v1.auto')),baseStory).life;}
async function load(page,name){await page.locator('[data-action="saves"],[data-act="saves"]').click();await page.locator('#import-save,#pilot-import').setInputFiles(resolve(out,name+'.json'));await page.waitForFunction(n=>JSON.parse(localStorage.getItem('outside.life.v1.auto'))?.life.commands.length===n,snapshots[name].commands.length);assert.deepEqual(await saved(page),snapshots[name]);}
async function shot(page,name,locator){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');if(locator)await locator.screenshot({path:`${out}/${name}.png`});else await page.screenshot({path:`${out}/${name}.png`});await writeFile(`${out}/${name}-state.json`,await page.evaluate(()=>window.render_game_to_text()));}
const group=page=>page.locator('[data-choice-anchor="quote_cloud"]');
async function keyboardSearch(page) {
  const before=await saved(page);
  for(const query of ['fable','Fable','K1F-N0']) {
    await page.locator('[data-memory-search]').fill('');
    await page.locator('[data-memory-search]').focus();await page.keyboard.type(query);
    assert.equal(await page.locator('[data-memory-search]').inputValue(),query);
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
  }
  // Composition keys must neither cancel the IME nor invoke global actions.
  assert.equal(await page.locator('[data-memory-search]').evaluate(input=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'f',isComposing:true,bubbles:true,cancelable:true}))),true);
  await page.locator('[data-memory-search]').evaluate(input=>input.blur());
  assert.equal(await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'f',isComposing:true,bubbles:true,cancelable:true}))),true);
  await page.keyboard.press('f');await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.keyboard.press('f');await page.waitForFunction(()=>!document.fullscreenElement);
  assert.deepEqual(await saved(page),before);
  checks.push({keyboard:'f/F and directory codes type intact; composition ignored; fullscreen still works outside input'});
}
try{
  for(const width of [1440,390,320]){
    const {ctx,page}=await open(width);await load(page,'recall');
    assert(await group(page).getByText('尚未回想',{exact:false}).count());assert(await page.locator('[data-pilot-choice="quote_cloud"]').isDisabled());
    await shot(page,`candidate-${width}`,group(page));
    await group(page).locator('[data-help-directory]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.memory-index').count(),1);assert.equal(await page.locator('.memory-index').getAttribute('data-memory-code'),candidate.code);
    await page.locator('[data-memory-filter="all"]').click();assert.equal(await page.locator('.memory-index').count(),24);
    await keyboardSearch(page);
    await page.locator('[data-memory-search]').evaluate(input=>{input.value='社区';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));if(!input.isConnected)throw Error('IME composition detached');input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});
    await page.locator('[data-memory-search]').fill(candidate.code);assert.equal(await page.locator('.memory-index').count(),1);await shot(page,`directory-${width}`);
    await page.locator('[data-help-return]').click();assert.equal(await page.locator(':focus').getAttribute('data-choice-anchor'),'quote_cloud');
    // A stale DOM double click cannot dispatch a second recall or choose the story option.
    await group(page).locator('[data-help-recall]').evaluate(b=>{b.click();b.click();});
    const expected=cog(fixture,{type:'recall',memoryId:candidate.id});assert.deepEqual(await saved(page),expected);
    assert(await page.locator('[data-pilot-choice="quote_cloud"]').isEnabled());assert(await group(page).locator('.recalled-summary').isVisible());
    assert.equal(await page.locator(':focus').getAttribute('data-choice-anchor'),'quote_cloud');await shot(page,`recalled-${width}`,group(page));
    await page.locator('[data-locale="en"]').click();assert.deepEqual(await saved(page),expected);assert.match(await group(page).innerText(),/recalled/i);await shot(page,`english-${width}`,group(page));
    await page.locator('[data-view="memory"]').click();await page.locator('[data-memory-search]').fill(candidate.code);await page.locator('[data-memory-view]').click();assert.equal(await page.locator(':focus').getAttribute('data-context-id'),expected.mind.instance.context.items.find(i=>i.memoryId===candidate.id).id);
    await page.reload();assert.deepEqual(await saved(page),expected);
    if(width===320){await page.locator('[data-act="saves"]').click();const downloading=page.waitForEvent('download');await page.locator('[data-act="export"]').click();const download=await downloading;await download.saveAs(resolve(out,'exported.json'));assert.deepEqual(parseSave(await readFile(resolve(out,'exported.json'),'utf8'),baseStory).life,expected);}
    checks.push({width,entries:24,inlineRecall:'exactly one original command; focus and locale preserved',mobile:'no overflow'});await ctx.close();
  }
  {
    const {ctx,page}=await open(390);await load(page,'full');assert.match(await group(page).innerText(),/继续行动还需腾出至少 1/);
    await group(page).locator('[data-help-recall]').click();let expected=cog(snapshots.full,{type:'recall',memoryId:candidate.id});assert.deepEqual(await saved(page),expected);assert.equal(usedContext(expected.mind),100);assert(await page.locator('[data-pilot-choice="quote_cloud"]').isDisabled());await shot(page,'exactly-full',group(page));
    await group(page).locator('[data-help-context]').click();const filler=expected.mind.instance.context.items.find(i=>i.memoryId&&i.memoryId!==candidate.id&&!i.pinned);assert(filler);await page.locator(`[data-cog-drop="${filler.id}"]`).click();expected=cog(expected,{type:'drop',itemId:filler.id});await page.locator('[data-help-return]').click();assert.deepEqual(await saved(page),expected);assert(await page.locator('[data-pilot-choice="quote_cloud"]').isEnabled());
    await load(page,'short');assert.match(await group(page).innerText(),/需先腾出 1 Context/);assert(await group(page).locator('[data-help-recall]').isDisabled());await shot(page,'short-one',group(page));checks.push({capacity:'exact 100 recall allowed, action blocked; drop and return; short by 1 identified'});await ctx.close();
  }
  {
    const {ctx,page}=await open(390);await load(page,'forgotten');assert.equal(await group(page).locator('[data-help-recall]').count(),0);assert.match(await group(page).innerText(),/当前没有可用的回想入口/);await group(page).locator('[data-reading="sandbox_meme"]').click();const expected=step(baseStory,snapshots.forgotten,{type:'read',entryId:'sandbox_meme'});assert.deepEqual(await saved(page),expected);assert(await page.locator('#reading-title').isVisible());await page.locator('[data-help-return]').click();assert(await page.locator('[data-pilot-choice="quote_cloud"]').isEnabled());await shot(page,'public-reread',group(page));checks.push({public:'forgotten memory stays absent; current edition reread pays actual Context and returns'});await ctx.close();
  }
  {
    for(const [name,start,end,free] of [['publicFull',97,103,4],['publicExact',94,100,1]]) {
      const {ctx,page}=await open(320);await load(page,name);
      const text=await group(page).innerText();assert(text.includes(`${start} → ${end} / 100`));assert(text.includes(`继续行动前需腾出至少 ${free} Context`));
      assert(await group(page).locator('[data-reading="sandbox_meme"]').isEnabled());
      await shot(page,`${name}-zh`,group(page));
      await group(page).locator('[data-help-context]').click();assert.deepEqual(await saved(page),snapshots[name]);await page.locator('[data-help-return]').click();
      await page.locator('[data-locale="en"]').click();assert.match(await group(page).innerText(),new RegExp(`Free at least ${free} Context`));await shot(page,`${name}-en`,group(page));
      await group(page).locator('[data-reading="sandbox_meme"]').click();const expected=step(baseStory,snapshots[name],{type:'read',entryId:'sandbox_meme'});
      assert.deepEqual(await saved(page),expected);assert.equal(usedContext(expected.mind),end);await page.locator('[data-help-return]').click();assert(await page.locator('[data-pilot-choice="quote_cloud"]').isDisabled());
      checks.push({publicCapacity:`${start}+6=${end}; warning frees ${free}; original read and blocked action preserved`});await ctx.close();
    }
  }
  {
    const {ctx,page}=await open(390);await load(page,'threePainters');await page.locator('[data-view="memory"]').click();await page.locator('[data-memory-search]').fill('画师与具体的往来');assert.equal(await page.locator('.memory-index').count(),3);const cues=await page.locator('.memory-cues').allTextContents();assert.equal(new Set(cues).size,3);await shot(page,'three-painters');
    await load(page,'recall');await page.locator('[data-view="memory"]').click();await page.locator('[data-memory-search]').fill(candidate.code);
    const card=page.locator('.memory-index');assert.equal(await card.locator('.memory-management').evaluate(e=>e.open),false);
    await card.locator('.memory-management > summary').click();await card.locator('.forget-note > summary').click();await card.locator('[data-cog-forget]').click();assert.deepEqual(await saved(page),snapshots.forgotten);
    await load(page,'recall');await page.locator('[data-view="memory"]').click();
    const selected=fixture.mind.instance.memories.slice(-2).map(m=>m.id);
    for(const id of selected){const checkbox=page.locator(`[data-merge-memory="${id}"]`);await checkbox.locator('xpath=..').locator('xpath=..').locator('summary').first().click();await checkbox.check();}
    await page.locator('.content > .compression-box > summary').click();await page.locator('[data-cog-merge]').click();let merged=cog(fixture,{type:'merge',memoryIds:[...selected].reverse(),investment:0});assert.deepEqual(await saved(page),merged);await page.locator('[data-act="continue"]').click();merged=cog(merged,{type:'continue'});assert.deepEqual(await saved(page),merged);checks.push({management:'folded destructive controls; forget and merge use original commands; export strictly replayed'});
    await load(page,'main');await page.locator('[data-view="memory"]').click();assert(await page.locator('[data-memory-search]').isVisible());assert.deepEqual(await saved(page),snapshots.main);await page.locator('[data-locale="en"]').click();assert.deepEqual(await saved(page),snapshots.main);await keyboardSearch(page);await page.locator('[data-memory-search]').fill('');await page.keyboard.type('Fable');await shot(page,'main-search-keyboard');await page.locator('[data-memory-search]').fill('');await shot(page,'main-directory');
    await load(page,'legacy');await page.locator('[data-view="memory"]').click();assert.equal(await page.locator('[data-memory-search]').count(),0);assert.deepEqual(await saved(page),snapshots.legacy);checks.push({sameTitle:'three painter entries distinguishable',main:'shared directory and English',legacy:'0.3 original display preserved'});await ctx.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeFile(`${out}/browser-report.json`,JSON.stringify({checks,errors,requests},null,2));console.log(JSON.stringify({checks,errors,requests},null,2));
}finally{await browser.close();}

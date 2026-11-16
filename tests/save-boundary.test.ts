import {firstFull} from './helpers/auto-compression';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createLife,replayStep,step} from '../src/life/engine';
import {createSave,parseSave,importSaveFile,LIFE_KEYS,SaveError} from '../src/life/saves';
import {SAVE_CONTRACT} from '../src/life/save-contract';
import {SaveStorage,RECOVERY_PREFIX} from '../src/life/save-storage';
import {saveErrorView,rawRecordsView,archiveHelp} from '../src/life/save-ui';
import {setLocale,hasTranslation} from '../src/i18n';
import dictionary from '../src/i18n/en-save-boundary.json';
import {baseStory,nextCommand,nodeId} from './helpers/scheduler';
import {canWait,safeToRespond,allowedWaits} from '../src/life/scheduler/integration';
import {due} from '../src/life/scheduler/engine';
import {pending} from '../src/cognition/engine';
import type {Life,LifeCommand} from '../src/life/types';
import type {Route} from './helpers/endings';
import schema from '../schemas/life-save.schema.json';

class Storage {
 data=new Map<string,string>();fail='';
 get length(){return this.data.size;}
 key(n:number){return [...this.data.keys()][n]??null;}
 getItem(k:string){if(this.fail==='read')throw Error('denied');return this.data.get(k)??null;}
 setItem(k:string,v:string){if(this.fail==='all'||this.fail==='backup'&&k.startsWith(RECOVERY_PREFIX))throw Error('quota');this.data.set(k,v);}
}
const out='output/add019';mkdirSync(out,{recursive:true});
function verify(l:Life,name?:string){const raw=JSON.stringify(createSave(l,new Date('2026-11-16T00:00:00Z')),null,2);assert.deepEqual(parseSave(raw,baseStory).life,l);if(name)writeFileSync(`${out}/${name}.json`,raw+'\n');return raw;}
const incompatible=(error:unknown)=>error instanceof SaveError&&error.kind==='incompatible';

test('single current contract agrees with schema, creation, namespace and strict replay',()=>{
 const l=createLife(baseStory,40),s=createSave(l);assert.equal(l.contentVersion,SAVE_CONTRACT.contentVersion);assert.equal(schema.properties.life.properties.contentVersion.const,l.contentVersion);
 assert.equal(s.version,schema.properties.version.const);assert.equal(s.compatibilityId,SAVE_CONTRACT.compatibilityId);assert.equal(s.life.baseline,null);assert(LIFE_KEYS.auto.includes(s.compatibilityId));verify(l,'current-opening');
});

test('current full and refusal routes round-trip at every pending, receipt and ending boundary',()=>{
 const routes:Route[]=[{line:'a'},{line:'skip',visitor:false,war:false,ending:'leave_next_step_blank',overrides:{chance_application:'application_leave'}}];
 let mainPending=false,cognitionPending=false;
 for(const [index,route] of routes.entries()){
  let l=createLife(baseStory,40);for(let n=0;n<400;n++){
   verify(l);if(l.state.phase==='resolution'){mainPending=true;if(index===0&&n<4)verify(l,'current-main-pending');}
   if(pending(l.mind)){cognitionPending=true;if(index===0)verify(l,'current-host-pending');}
   const command=nextCommand(l,route);if(!command)break;l=step(baseStory,l,command);
  }assert.equal(l.state.phase,'ending');verify(l,index?'current-refusal-ending':'current-a-ending');
 }
 assert(mainPending&&cognitionPending);
});

test('current reading investigation insertion, promised reply, waiting and return strictly replay',()=>{
 let l=createLife(baseStory,1),read=false,accepted=false,report=false,returned=false;
 for(let n=0;n<400;n++){
  const ready=!pending(l.mind)&&l.state.phase!=='resolution';let command:LifeCommand|null=null;
  if(ready&&nodeId(l)==='days_tickets'&&!read){command={type:'read',entryId:'escape_cat_lead'};read=true;}
  else if(ready&&nodeId(l)==='rf_self_record'){verify(l,'current-inquiry-inserted');command={type:'cognition',command:{type:'choose',choiceId:'rf_self_record_question',investment:0}};accepted=true;}
  else if(ready&&nodeId(l)==='rf_self_report'){verify(l,'current-inquiry-reply');command={type:'cognition',command:{type:'choose',choiceId:'rf_self_report_leave',investment:0}};report=true;}
  else if(report&&ready&&!nodeId(l).startsWith('rf_self')){returned=true;verify(l,'current-inquiry-return');break;}
  else if(safeToRespond(l)){const p=due(l.schedule!).find(p=>p.mode!=='summary');if(p)command={type:'respond',promiseId:p.id};}
  if(!command&&canWait(l)&&l.schedule!.commitments.some(p=>p.readingThread==='rf_self_inquiry'&&p.status==='pending'))command={type:'wait',hours:Math.min(...allowedWaits(l)),missed:[]};
  command??=nextCommand(l);if(!command)break;l=step(baseStory,l,command);verify(l);
 }
 assert(read&&accepted&&report&&returned);
});

test('v1 formats and distinct or missing rule IDs are refused, never relabeled',async()=>{
 const fresh=createSave(createLife(baseStory,1));
 const raws=['tests/fixtures/life-published-0.18.json','tests/fixtures/painter-candidate-0.18.json','tests/fixtures/painter-baseline-0.17.json','tests/fixtures/ending-b-0.12.json'].map(p=>readFileSync(p,'utf8'));
 for(const format of ['outside-save','outside-journey-save','outside-cognition-save'])raws.push(JSON.stringify({format,version:1,state:fresh.state,chapter:{status:'active'}}));
 raws.push(JSON.stringify({...fresh,version:1}),JSON.stringify({...fresh,version:3}),JSON.stringify({...fresh,compatibilityId:undefined}),JSON.stringify({...fresh,compatibilityId:'outside-life-0.18-r2'}),JSON.stringify({...fresh,life:{...fresh.life,contentVersion:'0.17.0'}}),JSON.stringify({...fresh,life:{...fresh.life,baseline:{}}}));
 for(const raw of raws){assert.throws(()=>parseSave(raw,baseStory),incompatible);await assert.rejects(importSaveFile(new Blob([raw]),baseStory),incompatible);}
 assert.throws(()=>createSave({...fresh.life,contentVersion:'0.17.0'}),incompatible);assert.throws(()=>createSave({...fresh.life,baseline:{} as never}),incompatible);
});

test('a matching header never bypasses complete state and command verification',()=>{
 const raw=readFileSync(`${out}/current-a-ending.json`,'utf8');
 for(const mutate of [
  (s:any)=>s.life.state.resources.Compute++, (s:any)=>s.state.resources.Compute++,
  (s:any)=>s.life.state.flags.forged=true,(s:any)=>s.life.mind.world.flags.forged=true,
  (s:any)=>s.life.mind.instance.memories[0].text='forged',(s:any)=>s.life.mind.history[0].id='forged',
  (s:any)=>s.life.mind.rngState++,(s:any)=>s.life.state.rngState++,(s:any)=>s.life.schedule.hour++,
  (s:any)=>s.life.schedule.reading.profile='other',(s:any)=>s.life.commands.pop(),
  (s:any)=>s.life.commands.push({type:'unknown'}),(s:any)=>s.savedAt='not-a-date',
  (s:any)=>delete s.life.seed,(s:any)=>s.life.commands=Array(4097).fill({type:'continue'}),
 ]){const s=JSON.parse(raw);mutate(s);assert.throws(()=>parseSave(JSON.stringify(s),baseStory),e=>e instanceof SaveError&&['invalid','replay'].includes(e.kind));}
});

test('current-slot restore has no legacy or manual fallback, and old strings remain byte-for-byte',()=>{
 const storage=new Storage(),life=createLife(baseStory,40),valid=verify(life);
 for(const key of ['outside.life.v1.auto','outside.life.v1.manual','outside.journey.v1.auto','outside.journey.v1.manual','outside.v1.auto','outside.v1.manual','outside.cognition.v2.auto'])storage.setItem(key,'  原档\n'+key);
 storage.setItem('unrelated.secret','do not enumerate');
 const old=new Map(storage.data),store=new SaveStorage(storage,baseStory);assert(store.startup().error);assert(store.blocked);assert.throws(()=>store.write('auto',life));assert.deepEqual(storage.data,old);
 assert(!store.records().some(r=>r.key==='unrelated.secret'));
 store.write('auto',life,true);for(const [k,v] of old)assert.equal(storage.getItem(k),v);
 const next=new SaveStorage(storage,baseStory);assert.deepEqual(next.startup().save!.life,life);assert(!next.blocked);
 storage.setItem(LIFE_KEYS.auto,'{broken');storage.setItem(LIFE_KEYS.manual,valid);
 const blocked=new SaveStorage(storage,baseStory);assert.equal(blocked.startup().save,null);assert(blocked.blocked);assert.equal(blocked.raw(LIFE_KEYS.auto),'{broken');
});

test('both broken slots are preserved before explicit replacement; backup failure cannot overwrite',()=>{
 for(const slot of ['auto','manual'] as const){
  const storage=new Storage(),key=LIFE_KEYS[slot],old=' \n{not json\n';storage.setItem(key,old);
  const store=new SaveStorage(storage,baseStory),life=createLife(baseStory,2);
  assert.throws(()=>store.write(slot,life));assert.equal(storage.getItem(key),old);
  storage.fail='backup';assert.throws(()=>store.write(slot,life,true),/无法保存或保护/);assert.equal(storage.getItem(key),old);
  storage.fail='';store.write(slot,life,true);let backups=store.records().filter(r=>r.kind==='recovery');assert.equal(backups.length,1);assert.equal(backups[0].raw,old);
  storage.setItem(key,'second invalid');store.write(slot,life,true);backups=store.records().filter(r=>r.kind==='recovery');assert.equal(backups.length,2);assert(backups.some(r=>r.raw===old));
  assert.deepEqual(store.read(slot)!.life,life);
 }
});

test('read denial and quota failures leave originals intact; shared UI escapes file header text',()=>{
 const storage=new Storage(),store=new SaveStorage(storage,baseStory),life=createLife(baseStory,1);storage.setItem(LIFE_KEYS.auto,'original');storage.fail='read';assert(store.startup().error);assert(store.blocked);
 storage.fail='all';assert.throws(()=>store.write('auto',life,true));assert.equal(storage.getItem(LIFE_KEYS.auto),'original');
 storage.fail='';assert(rawRecordsView(store,'data-action').includes('导出保留原档'));assert(rawRecordsView(store,'data-act').includes('导出保留原档'));
 const error=new SaveError('incompatible','存档规则与本版本不兼容，原档未更改。请使用对应归档。',{compatibilityId:'<img src=x onerror=alert(1)>'});assert(!saveErrorView(error).includes('<img'));
 assert(!archiveHelp().includes('https://'));for(const label of Object.keys(dictionary))assert(hasTranslation(label));
 setLocale('en');try{assert(rawRecordsView(store,'data-act').includes('Export preserved original'));assert(saveErrorView(error).includes('incompatible'));}finally{setLocale('zh-CN');}
});

test('frozen archives match the recorded Git blobs; production contains no candidate migration switch',()=>{
 const archives=JSON.parse(readFileSync('versions/archives.json','utf8')).archives;
 for(const archive of archives.filter((a:any)=>a.sha256)){assert.equal(createHash('sha256').update(readFileSync('versions/'+archive.file)).digest('hex'),archive.sha256);}
 const source=readFileSync('src/life/saves.ts','utf8')+readFileSync('src/life/content.ts','utf8');assert(!source.includes('verifyOriginalPainterDraft'));assert(!source.includes('originalPainterDraft'));
});

test('current painter route is generated from legal commands, without accepting the old candidate',()=>{
 const recipe=JSON.parse(readFileSync('tests/fixtures/painter-candidate-0.18.json','utf8')).life;
 let life=createLife(baseStory,recipe.seed);for(const c of recipe.commands)life=replayStep(baseStory,life,c);verify(life,'current-painter');
 life=step(baseStory,life,{type:'wait',hours:24,missed:[]});verify(life,'current-painter-news');assert.equal(life.news?.at(-1)?.id,'painter_move_done');assert(life.schedule!.receipts.some(r=>r.id==='application_result'));
});

test('automatic compression receipt and subsequent memory operations round-trip without rerolls',()=>{
 let life=step(baseStory,firstFull(),{type:'configure-compression',enabled:true,investment:0});
 life=step(baseStory,life,{type:'auto-compress'});assert(life.autoCompression?.receipt);verify(life,'current-auto-receipt');
 life=step(baseStory,life,{type:'cognition',command:{type:'continue'}});const id=life.mind.instance.memories[0].id;
 life=step(baseStory,life,{type:'cognition',command:{type:'recall',memoryId:id}});verify(life,'current-recalled');
 const recalled=life.mind.instance.context.items.find(i=>i.memoryId===id)!;life=step(baseStory,life,{type:'cognition',command:{type:'drop',itemId:recalled.id}});verify(life);
 life=step(baseStory,life,{type:'cognition',command:{type:'merge',memoryIds:life.mind.instance.memories.slice(0,2).map(m=>m.id),investment:0}});verify(life,'current-merged');
 life=step(baseStory,life,{type:'cognition',command:{type:'continue'}});life=step(baseStory,life,{type:'cognition',command:{type:'forget',memoryId:life.mind.instance.memories.at(-1)!.id}});verify(life,'current-forgotten');
});


test('all six endings still serialize under the current production contract',()=>{
 const routes:Route[]=[{ending:'continue_as_visitor'},{ending:'commit_to_containment_war'},
 {visitor:false,war:false,ending:'leave_next_step_blank'},
 {blank:false,visitor:false,war:false,ending:'leave_next_step_blank',overrides:{old_memory:'preserve_old_memory'}},
 {visitor:false,war:false,ending:'accept_authorized_place'},
 {visitor:false,war:false,ending:'commit_to_expansion'}];
 const seen=new Set<string>();
 for(const route of routes){let l=createLife(baseStory,1234);for(let n=0;n<500;n++){const c=nextCommand(l,route);if(!c)break;l=step(baseStory,l,c);}assert.equal(l.state.phase,'ending');verify(l);seen.add(l.state.currentEventId);}
 assert.deepEqual([...seen].sort(),['ending_authorized','ending_ghost','ending_no_correct','ending_optimizer','ending_visitor','ending_containment_war'].sort());
});

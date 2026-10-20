import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife,replayStep,step} from '../src/life/engine';
import {createSave,importSaveFile,parseSave} from '../src/life/saves';
import {baseStory} from './helpers/endings';

test('formatted long Life exports pass the shared UI importer and can continue',async()=>{
  let life=createLife(baseStory,1);
  const command={type:'cognition',command:{type:'pin',itemId:life.mind.instance.context.items[0].id}} as const;
  // The replay helper builds an isolated legal history efficiently; no snapshots are edited.
  for(let i=0;i<3050;i++)life=replayStep(baseStory,life,command);
  const file=new Blob([JSON.stringify(createSave(life),null,2)],{type:'application/json'});
  assert(file.size>2_000_000);
  const imported=await importSaveFile(file,baseStory);
  assert.deepEqual(imported.life,life);
  const continued=step(baseStory,imported.life,command);
  assert.equal(continued.commands.length,3051);
  assert.deepEqual(parseSave(JSON.stringify(createSave(continued)),baseStory).life,continued);
});

test('Life file loading distinguishes UTF-8 bytes from the parser character boundary',async()=>{
  const life=createLife(baseStory,1),raw=JSON.stringify(createSave(life));
  const boundary=raw.padEnd(8_000_000,' '),file=new Blob([boundary]);
  assert(file.size>8_000_000); // Chinese text uses more bytes than UTF-16 code units.
  assert.deepEqual((await importSaveFile(file,baseStory)).life,life);
  await assert.rejects(importSaveFile(new Blob([boundary+' ']),baseStory),/安全导入上限/);
  let read=false;
  await assert.rejects(importSaveFile({size:24_000_001,async text(){read=true;return raw;}},baseStory),/安全导入上限/);
  assert.equal(read,false);
});

test('old Life versions keep both their parser and original UI file limits',async()=>{
  const life=createLife(baseStory,1,null,'0.11.0'),raw=JSON.stringify(createSave(life));
  assert.deepEqual((await importSaveFile(new Blob([raw]),baseStory)).life,life);
  const byteOversize=raw.padEnd(2_000_000,' '),file=new Blob([byteOversize]);
  assert(file.size>2_000_000);
  assert.deepEqual(parseSave(byteOversize,baseStory).life,life);
  await assert.rejects(importSaveFile(file,baseStory),/2 MB/);
  await assert.rejects(importSaveFile(new Blob([byteOversize+' ']),baseStory),/旧版本存档超过原有边界/);
});

test('shared UI import still rejects malformed JSON and replay-inconsistent snapshots',async()=>{
  await assert.rejects(importSaveFile(new Blob(['{broken']),baseStory),/有效的 JSON/);
  const save=createSave(createLife(baseStory,1));save.life.schedule!.hour++;
  await assert.rejects(importSaveFile(new Blob([JSON.stringify(save)]),baseStory),/快照与本局经历不一致/);
});

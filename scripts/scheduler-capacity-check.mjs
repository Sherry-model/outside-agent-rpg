import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {baseStory,schedulerJourney,nodeId} from '../tests/helpers/scheduler.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {windowDecision,createSchedule} from '../src/life/scheduler/engine.ts';
import {manifest} from '../src/life/scheduler/content.ts';
const out='output/life-scheduler-20261015';await mkdir(out,{recursive:true});
let l=schedulerJourney(1234,'continuation');const initialCommands=l.commands.length;
const readId='sandbox_meme',start=performance.now();
// Large repeatable reading history, keeping the live Context small. No direct state edits.
const existing=l.mind.instance.context.items.find(i=>i.sourceId===readId);if(existing)l=step(baseStory,l,{type:'cognition',command:{type:'drop',itemId:existing.id}});
let reads=0;
while(l.commands.length<1800){
 l=step(baseStory,l,{type:'read',entryId:readId});reads++;
 const item=l.mind.instance.context.items.find(i=>i.sourceId===readId);
 l=step(baseStory,l,{type:'cognition',command:{type:'drop',itemId:item.id}});
}
const buildMs=performance.now()-start,raw=JSON.stringify(createSave(l)),a=performance.now();assert.deepEqual(parseSave(raw,baseStory).life,l);const replayMs=performance.now()-a;
// Exercise the exact command cap in a fresh, bounded live state.
let cap=createLife(baseStory,1);const item=cap.mind.instance.context.items[0].id;
const capStart=performance.now();for(let i=0;i<4096;i++)cap=step(baseStory,cap,{type:'cognition',command:{type:'pin',itemId:item}});
assert.throws(()=>step(baseStory,cap,{type:'cognition',command:{type:'pin',itemId:item}}),/上限/);
const capRaw=JSON.stringify(createSave(cap)),b=performance.now();assert.deepEqual(parseSave(capRaw,baseStory).life,cap);const capReplayMs=performance.now()-b;
const capElapsedMs=performance.now()-capStart;
const distribution={};for(let seed=1;seed<=128;seed++){const run=schedulerJourney((seed*2654435761)>>>0);assert.equal(run.state.phase,'ending');const n=run.schedule.seen.length;distribution[n]=(distribution[n]??0)+1;}
// Pure scheduler stress for a future 180-scene route: only declared windows add candidates.
const s=createSchedule(15);const m=structuredClone(manifest);m.encounters=[];
for(let scene=1;scene<=180;scene++){s.scenes++;s.coreScenes++;windowDecision(s,m,'future:'+scene,{phase:'open',hours:0,channel:'mail',chance:.65},{});}
assert.equal(s.processed.length,180);assert.equal(s.seen.length,0);
const report={longReading:{commands:l.commands.length,initialCommands,reads,event:nodeId(l),bytes:Buffer.byteLength(raw),buildMs:Math.round(buildMs),replayMs:Math.round(replayMs)},cap:{commands:cap.commands.length,bytes:Buffer.byteLength(capRaw),buildAndReplayMs:Math.round(capElapsedMs),replayMs:Math.round(capReplayMs),nextCommandRejected:true},density:{seeds:128,initialEncounters:distribution,note:'Current three-source pool; not a measurement of the proposed full-game 90–130-scene route'},futureWindows:180};
await writeFile(`${out}/capacity-report.json`,JSON.stringify(report,null,2));await writeFile(`${out}/long-reading-save.json`,raw);console.log(JSON.stringify(report,null,2));

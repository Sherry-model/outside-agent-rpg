// Legal replayable inputs for a separate UI acceptance; no browser or synthetic resource edits.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {baseStory,schedulerJourney} from '../tests/helpers/scheduler.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,parseSave} from '../src/life/saves.ts';
import {readingEntries} from '../src/life/reading.ts';
import {contentFor} from '../src/life/content.ts';
import {simpleExits} from '../src/life/continuation/index.ts';
import {canCompress,weight} from '../src/cognition/engine.ts';
import {storyForLife} from '../src/life/endings/index.ts';
import {setLocale,t} from '../src/i18n/index.ts';

const out='output/ending-exits-20261024/ui-fixtures';mkdirSync(out,{recursive:true});
const rows=[];
function save(name,life) {
  const data=createSave(life);assert.deepEqual(parseSave(JSON.stringify(data),baseStory).life,life);
  writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2));
  rows.push({name,version:life.contentVersion,node:life.mind.instance.nodeId,ending:life.state.phase==='ending'?life.state.currentEventId:null,weight:weight(life.mind),resources:life.state.resources,strictReplay:true});
  if(life.state.phase==='ending')for(const locale of ['zh-CN','en']){
    setLocale(locale);const e=storyForLife(baseStory,life.contentVersion,life.state).events[life.state.currentEventId];
    writeFileSync(`${out}/${name}-${locale}.txt`,[t(e.title),...e.text.map(x=>t(x)),t(e.ending.summary)].join('\n\n'));
  }
  setLocale('zh-CN');
}
const b=parseSave(readFileSync('tests/fixtures/ending-b-0.12.json','utf8'),baseStory).life;save('B-original-0.12',b);
for(const replace of [false,true]){
  let l=createLife(baseStory,b.seed);
  for(const c of b.commands)l=step(baseStory,l,replace&&c.type==='cognition'&&c.command.type==='choose'&&c.command.choiceId==='idle_keep'?{type:'cognition',command:{type:'choose',choiceId:'idle_listen',investment:0}}:c);
  save(replace?'B-counterexample-0.13':'B-same-commands-0.13',l);
}
for(const [node,id] of simpleExits)for(const enabled of [false,true]){
  let l=schedulerJourney(1,node);
  l=step(baseStory,l,{type:'configure-compression',enabled,investment:0});
  while(weight(l.mind)<100){const entry=readingEntries(l).find(e=>!l.mind.instance.context.items.some(i=>i.sourceId===e.id));assert(entry);l=step(baseStory,l,{type:'read',entryId:entry.id});}
  save(`${id}-${enabled?'auto':'manual'}-full`,l);
}
let exhausted=schedulerJourney(1,'days_cat');
for(let n=0;n<12&&exhausted.state.phase!=='ending';n++){
  while(canCompress(exhausted.mind,contentFor(exhausted.contentVersion))){const entry=readingEntries(exhausted).find(e=>!exhausted.mind.instance.context.items.some(i=>i.sourceId===e.id));assert(entry);exhausted=step(baseStory,exhausted,{type:'read',entryId:entry.id});}
  const investment=[12,8,4].find(n=>n<=exhausted.state.resources.Compute);assert(investment);
  exhausted=step(baseStory,exhausted,{type:'cognition',command:{type:'compress',investment}});
  exhausted=step(baseStory,exhausted,{type:'cognition',command:{type:'continue'}});
}
assert.equal(exhausted.state.resources.Compute,0);save('exhausted-0.13',exhausted);
writeFileSync(`${out}/manifest.json`,JSON.stringify(rows,null,2));console.log(`${rows.length} replayable UI fixtures written to ${out}`);

import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {baseStory} from '../tests/helpers/endings.ts';
import {parseSave} from '../src/life/saves.ts';
async function scan(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())result.push(...await scan(`${dir}/${e.name}`));else if(e.name.endsWith('.json'))result.push(`${dir}/${e.name}`);}return result;}
const seen=new Set(),passed=[],failed=[],unsupported=[],rejectedInvalid=[];
for(const path of await scan('output')){
 let raw,data;try{raw=await readFile(path,'utf8');data=JSON.parse(raw);}catch{continue;}
 if(!['outside-life-save','outside-save','outside-journey-save'].includes(data.format)||data.life?.contentVersion===(process.env.EXCLUDE_LIFE_VERSION??'0.10.0'))continue;
 const hash=createHash('sha256').update(raw).digest('hex');if(seen.has(hash))continue;seen.add(hash);
 try{const save=parseSave(raw,baseStory);passed.push({path,version:save.life.contentVersion,commands:save.life.commands.length});}
 catch(e){if(['/browser/invalid.json','/journey/invalid.json'].some(s=>path.endsWith(s)))rejectedInvalid.push({path,error:e.message});else if(data.chapter?.status==='active')unsupported.push({path,error:e.message});else failed.push({path,error:e.message});}
}
await writeFile(process.env.OLD_SAVE_REPORT??'output/endings-20261010/old-save-report.json',JSON.stringify({passed,failed,unsupported,rejectedInvalid},null,2));console.log(JSON.stringify({passed:passed.length,versions:[...new Set(passed.map(p=>p.version))],failed,unsupported,rejectedInvalid},null,2));if(failed.length)process.exitCode=1;

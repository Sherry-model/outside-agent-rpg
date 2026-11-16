import {profileFor} from './reading-threads/profiles';
import {SAVE_CONTRACT} from './save-contract';
import Ajv from 'ajv';
import schema from '../../schemas/life-save.schema.json';
import schedulerSchema from '../../schemas/scheduler-state.schema.json';
import mindSchema from '../../schemas/cognition/save-0.4.schema.json';
import type {Story} from '../engine/types';
import type {StorageLike,SaveSlot} from '../persistence/saves';
import {createLife,replayStep} from './engine';
import type {Life,LifeSave} from './types';
export type {StorageLike};
export const LIFE_KEYS={auto:`outside.life.v2.${SAVE_CONTRACT.compatibilityId}.auto`,manual:`outside.life.v2.${SAVE_CONTRACT.compatibilityId}.manual`} as const;
export const MAX_IMPORT_CHARACTERS=8_000_000;
export type SaveErrorKind='incompatible'|'invalid'|'replay'|'size'|'storage';
export class SaveError extends Error {
 constructor(public readonly kind:SaveErrorKind,message:string,public readonly header:Record<string,string>={}){super(message);this.name='SaveError';}
}
const validate=new Ajv({strict:true,allErrors:true}).compile<LifeSave>(schema);
const validateSchedule=new Ajv({strict:true}).compile(schedulerSchema);
const longMindSchema=structuredClone(mindSchema);longMindSchema.$defs.state.properties.history.maxItems=8192;
const validateMind=new Ajv({strict:true}).compile(longMindSchema);
const stable=(value:unknown)=>JSON.stringify(value,(_key,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
/** Only bounded header text is exposed in errors. It is not proof of authenticity. */
function headerOf(data:unknown):Record<string,string>{
 if(!data||typeof data!=='object'||Array.isArray(data))return {};
 const d=data as Record<string,unknown>,life=d.life as Record<string,unknown>|undefined;
 return Object.fromEntries(Object.entries({format:d.format,version:d.version,compatibilityId:d.compatibilityId,contentVersion:life?.contentVersion}).filter(([,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>[k,String(v).slice(0,160)]));
}
function compatible(life:Life):boolean{return life.contentVersion===SAVE_CONTRACT.contentVersion&&life.baseline===null&&life.schedule?.reading?.profile===profileFor(SAVE_CONTRACT.contentVersion).id;}
export function createSave(life:Life,now=new Date()):LifeSave{
 if(!compatible(life))throw new SaveError('incompatible','本版本不能为旧局或其他规则导出当前存档。');
 return {format:'outside-life-save',version:SAVE_CONTRACT.version,compatibilityId:SAVE_CONTRACT.compatibilityId,savedAt:now.toISOString(),state:structuredClone(life.state),life:structuredClone(life)};
}
export function parseSave(raw:string,story:Story):LifeSave{
 if(raw.length>MAX_IMPORT_CHARACTERS)throw new SaveError('size','存档超过安全导入上限。');
 let data:unknown;try{data=JSON.parse(raw);}catch{throw new SaveError('invalid','存档不是有效的 JSON。');}
 const h=headerOf(data);
 if(['outside-save','outside-journey-save','outside-cognition-save'].includes(h.format)||h.format==='outside-life-save'&&(h.version!=='2'||h.compatibilityId!==SAVE_CONTRACT.compatibilityId||h.contentVersion!==SAVE_CONTRACT.contentVersion))
  throw new SaveError('incompatible','存档规则与本版本不兼容，原档未更改。请使用对应归档。',h);
 if(data&&typeof data==='object'&&'life' in data&&data.life&&typeof data.life==='object'&&'baseline' in data.life&&data.life.baseline!==null)throw new SaveError('incompatible','本版本不接续旧版局。',h);
 if(!validate(data)||!Number.isFinite(Date.parse(data.savedAt)))throw new SaveError('invalid','存档校验未通过：格式或字段无效。',h);
 if(data.life.baseline!==null)throw new SaveError('incompatible','本版本不接续旧版局。',h);
 if(!compatible(data.life)||!validateSchedule(data.life.schedule)||!validateMind({format:'outside-cognition-save',version:2,savedAt:data.savedAt,state:data.life.mind}))throw new SaveError('invalid','存档校验未通过：认知、调度或规则字段无效。',h);
 let replay=createLife(story,data.life.seed);
 try{for(const command of data.life.commands)replay=replayStep(story,replay,command);}catch{throw new SaveError('replay','存档校验未通过：命令无法按当前规则重放。',h);}
 if(stable(replay)!==stable(data.life)||stable(replay.state)!==stable(data.state))throw new SaveError('replay','存档快照与本局经历不一致。',h);
 return data;
}
export async function importSaveFile(file:Pick<File,'size'|'text'>,story:Story):Promise<LifeSave>{
 if(file.size>MAX_IMPORT_CHARACTERS*3)throw new SaveError('size','存档超过安全导入上限。');
 return parseSave(await file.text(),story);
}
export function readSave(storage:StorageLike,slot:SaveSlot,story:Story):LifeSave|null{
 const raw=storage.getItem(LIFE_KEYS[slot]);return raw===null?null:parseSave(raw,story);
}
/** Low-level writer; production UI uses SaveStorage for preservation before overwrite. */
export function writeSave(storage:StorageLike,slot:SaveSlot,life:Life):LifeSave{
 const save=createSave(life);storage.setItem(LIFE_KEYS[slot],JSON.stringify(save));return save;
}

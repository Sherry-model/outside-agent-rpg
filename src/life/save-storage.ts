import {createSave,parseSave,LIFE_KEYS,SaveError,type StorageLike} from './saves';
import {SAVE_CONTRACT} from './save-contract';
import type {Story} from '../engine/types';
import type {Life,LifeSave} from './types';
import type {SaveSlot} from '../persistence/saves';
export interface EnumerableStorage extends StorageLike {readonly length:number;key(index:number):string|null}
const legacyKeys=['outside.life.v1.auto','outside.life.v1.manual','outside.journey.v1.auto','outside.journey.v1.manual','outside.v1.auto','outside.v1.manual','outside.cognition.v2.auto'];
export const RECOVERY_PREFIX=`outside.recovery.${SAVE_CONTRACT.compatibilityId}.`;
export interface RawRecord {key:string;raw:string;kind:'current'|'legacy'|'recovery'}
/** All writes pass this guard. Raw strings are never parsed and serialized for backup. */
export class SaveStorage {
 blocked=false;
 constructor(private storage:EnumerableStorage,private story:Story){}
 records():RawRecord[]{
  try{
   const production=!SAVE_CONTRACT.compatibilityId.includes('-fixture-');
   const keys=new Set<string>([...Object.values(LIFE_KEYS),...(production?legacyKeys:[])]);
   for(let n=0;n<this.storage.length;n++){
    const key=this.storage.key(n);if(key&&(key.startsWith(RECOVERY_PREFIX)||production&&key.startsWith('outside.recovery.')&&!key.includes('-fixture-')||production&&/^outside\.life\.v2\.[a-zA-Z0-9.-]+\.(auto|manual)$/.test(key)&&!key.includes('-fixture-')))keys.add(key);
   }
   return [...keys].sort().flatMap(key=>{const raw=this.storage.getItem(key);return raw===null?[]:[{key,raw,kind:Object.values(LIFE_KEYS).some(k=>k===key)?'current' as const:key.startsWith('outside.recovery.')?'recovery' as const:'legacy' as const}];});
  }catch{throw new SaveError('storage','浏览器存储无法读取；原档未被覆盖。');}
 }
 read(slot:SaveSlot):LifeSave|null{
  let raw:string|null;try{raw=this.storage.getItem(LIFE_KEYS[slot]);}catch{throw new SaveError('storage','浏览器存储无法读取；原档未被覆盖。');}
  return raw===null?null:parseSave(raw,this.story);
 }
 startup():{save:LifeSave|null;error?:Error}{
  try{
   const save=this.read('auto');if(save)return {save};
   // Even an old manual slot must be discoverable before an empty run can write.
   if(this.records().some(r=>r.kind==='legacy')){this.blocked=true;return {save:null,error:new SaveError('incompatible','旧记录未载入。请导出原档，或明确开始本版本新局。')};}
   return {save:null};
  }catch(error){this.blocked=true;return {save:null,error:error as Error};}
 }
 write(slot:SaveSlot,life:Life,explicit=false):LifeSave{
  if(this.blocked&&!explicit)throw new SaveError('storage','自动写入已暂停；请先处理保留原档。');
  const save=createSave(life),next=JSON.stringify(save),key=LIFE_KEYS[slot];
  try{
   const old=this.storage.getItem(key);
   if(old!==null){
    let valid=true;try{parseSave(old,this.story);}catch{valid=false;}
    if(!valid){
     if(!explicit){if(slot==='auto')this.blocked=true;throw new SaveError('storage','当前槽无法载入，自动写入已暂停；请导出原档。');}
     let backup='';for(let n=0;n<1000;n++){const candidate=`${RECOVERY_PREFIX}${slot}.${Date.now()}.${n}`;if(this.storage.getItem(candidate)===null){backup=candidate;break;}}
     if(!backup)throw new Error('no recovery key');
     this.storage.setItem(backup,old);
     if(this.storage.getItem(backup)!==old||this.storage.getItem(key)!==old)throw new Error('backup verification failed');
    }
   }
   this.storage.setItem(key,next);
   if(slot==='auto')this.blocked=false;
   return save;
  }catch(error){
   if(error instanceof SaveError)throw error;
   if(slot==='auto')this.blocked=true;
   throw new SaveError('storage','浏览器无法保存或保护原档；未继续覆盖，请下载备份后重试。');
  }
 }
 raw(key:string):string{
  const record=this.records().find(r=>r.key===key);if(!record)throw new SaveError('storage','没有找到这份保留原档。');return record.raw;
 }
}

export type DeliveryMode='choice'|'summary'|'missable';
export interface PromiseSpec {
  id:string; role:'daily'|'branch'; eventId?:string; title:string; afterHours:number; afterScenes:number;
  deadlineHours?:number; mode:DeliveryMode; channels:string[]; fallbackEventId?:string;
  receipt?:string; missedReceipt?:string; missedPreview?:string; receiptSource?:string;
}
export interface Commitment extends PromiseSpec {
  sequence:number; deferredHours:number; createdHour:number; dueHour:number; dueScene:number; deadlineHour?:number;
  status:'pending'|'delivered'|'missed';
}
export interface Encounter {
  id:string; nodeId:string; sourceIds:string[]; role:'daily'|'branch'; weight:number;
  phases:string[]; channels:string[]; requiresFlags?:string[]; excludesFlags?:string[];
}
export interface WindowSpec {phase:string; hours:number; channel:string; chance:number; protected?:boolean}
export interface SchedulerManifest {
  version:1; phases:Record<string,{budget:number}>; windows:Record<string,WindowSpec>;
  encounters:Encounter[]; promises:Record<string,PromiseSpec[]>;
  safeNodes:string[]; hoursByChoice:Record<string,number>;
}
export interface Schedule {
  version:1; hour:number; scenes:number; coreScenes:number; scheduledScenes:{daily:number;branch:number}; rng:number; phase:string; channel:string;
  budgets:Record<string,{limit:number;spent:number;overdraft:number;expired:number}>;
  processed:string[]; seen:string[]; commitments:Commitment[];
  decisions:{window:string;hour:number;scene:number;selected:string|null;reason:string}[];
  receipts:{id:string;title:string;text:string;hour:number}[];
  active?:{id:string;kind:'encounter'|'commitment';role:'daily'|'branch';resume:{driver:'main'|'mind'|'idle';nodeId:string;phase:'event'|'resolution'|'ending';pendingId:string|null}};
  waited:boolean;
}

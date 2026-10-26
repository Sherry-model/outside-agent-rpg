import type {Schedule,SchedulerManifest} from '../scheduler/types';
import type {ReadingProfile,ReadingState,ReadingThread,ReadingWindow} from './types';

export const createReadingState=(profile:string):ReadingState=>({profile,opened:{},themes:{},shown:0,entrances:0,reserved:0,misses:0,closed:[]});
export function opened(s:Schedule,post:string) {
  if(s.reading&&s.reading.opened[post]===undefined)s.reading.opened[post]=s.coreScenes;
}
export function completedCore(s:Schedule,node:string,threads:ReadingThread[]) {
  if(!s.reading)return;
  for(const t of threads)if(t.themeNodes.includes(node))s.reading.themes[t.id]=s.coreScenes;
}
export function fits(w:ReadingWindow,node:string) {
  return w.load+(w.weights[node]??0)<w.capacity;
}
export function eligible(s:Schedule,w:ReadingWindow,id:string):boolean {
  const r=w.state,t=w.threads.find(t=>t.id===id);
  return w.entrances!==false&&!!t&&!r.active&&!r.closed.includes(id)&&r.entrances<2&&r.shown+r.reserved+t.maxScenes<=5
    &&r.opened[t.rootPost]!==undefined&&s.coreScenes-r.opened[t.rootPost]>=1
    &&(r.themes[id]===undefined||s.coreScenes-r.themes[id]>=2)&&fits(w,t.entry);
}
export function entered(w:ReadingWindow,id:string,first:boolean) {
  const r=w.state;
  if(first){r.entrances++;r.misses=0;r.active={id,status:'offered'};}
  else {if(r.active?.id!==id||r.reserved<1)throw new Error('阅读支线后续没有预留。');r.reserved--;}
  r.shown++;
}
export function chosen(s:Schedule,threads:ReadingThread[],node:string,choice:string) {
  const r=s.reading;if(!r?.active)return;
  const t=threads.find(t=>t.id===r.active!.id)!;
  const action=t.steps[node]?.[choice];if(!action)return; // An unrelated existing commitment may interrupt.
  if(action.remaining>5-r.shown)throw new Error('阅读支线预留超额。');
  r.reserved=action.remaining;
  if(action.promise)r.active.status='accepted';
  else {r.closed.push(t.id);delete r.active;}
}
export function withReadingSchedule(base:SchedulerManifest,p:ReadingProfile):SchedulerManifest {
  const m=structuredClone(base);
  for(const t of p.threads){
    if(m.encounters.some(e=>e.id===t.id))throw new Error('阅读支线与现有偶遇 ID 重复。');
    m.encounters.push({id:t.id,nodeId:t.entry,sourceIds:[t.rootPost],role:'branch',weight:1,phases:t.phases,channels:t.channels,readingThread:t.id});
    for(const actions of Object.values(t.steps))for(const [choice,a] of Object.entries(actions))if(a.promise){
      if(m.promises[choice])throw new Error('阅读支线选择与现有承诺重复。');
      if(Object.values(m.promises).flat().some(q=>q.id===a.promise!.id))throw new Error('阅读支线与现有承诺 ID 重复。');
      m.promises[choice]=[{...structuredClone(a.promise),readingThread:t.id}];
    }
  }
  return m;
}

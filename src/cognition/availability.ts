import { RESOURCE_KEYS, type Resource } from '../engine/types';
import { directoryWeight } from './semantic';
import type { Choice, Content, State } from './types';

export const isCapacityExit=(content:Content,choice:Choice|undefined)=>content.version==='0.13.0'&&choice?.capacityExempt==='exit';

export type ChoiceBlocker =
  | {kind:'phase'|'capacity'|'missing'|'world'; reason:string}
  | {kind:'knowledge'; tag:string; reason:string}
  | {kind:'minimum'; required:number; reason:string}
  | {kind:'resource'; resource:Resource; required:number; reason:string};

/** Shared with the executor. Order retains released canChoose error precedence. */
export function choiceBlockers(content:Content,s:State,id:string,investment=0):ChoiceBlocker[] {
  const issues:ChoiceBlocker[]=[];
  if(s.instance.phase!=='event') issues.push({kind:'phase',reason:'请先读完当前结果。'});
  const used=directoryWeight(s.instance)+s.instance.context.items.reduce((n,i)=>n+i.weight,0);
  const choice=content.nodes.find(n=>n.id===s.instance.nodeId)?.choices.find(c=>c.id===id);
  if(used>=s.instance.context.capacity&&!isCapacityExit(content,choice)) issues.push({kind:'capacity',reason:'上下文已满，先整理一次。'});
  if(!choice) return [...issues,{kind:'missing',reason:'没有这项选择。'}];
  if(choice.requiresWorldFlag&&!s.world.flags[choice.requiresWorldFlag]) issues.push({kind:'world',reason:'这段实际经历尚未发生。'});
  if(choice.requiresTag&&!s.instance.context.items.some(i=>i.tags.includes(choice.requiresTag!))) issues.push({kind:'knowledge',tag:choice.requiresTag,reason:'当前上下文没有这条线索；可以检查留下的记忆。'});
  if(s.instance.resources.Compute<(choice.minCompute??0)) issues.push({kind:'minimum',required:choice.minCompute!,reason:`Compute 至少需要 ${choice.minCompute}，以保留运行余量。`});
  for(const resource of RESOURCE_KEYS) {
    const required=(choice.costs?.[resource]??0)+(resource==='Compute'&&choice.check?investment:0);
    if(s.instance.resources[resource]<required) issues.push({kind:'resource',resource,required,reason:'当前资源不足。'});
  }
  return issues;
}

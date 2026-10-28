import type {Content} from '../../cognition/types';
import type {Life} from '../types';
import type {ReadingProfile} from '../reading-threads/types';
import type {ReadingEntry} from '../reading';
import type {PublicationProfile} from './types';

export const publicationPrefix='relay_published_';
export const publicationFact=(post:string)=>publicationPrefix+post;
export const hasPublications=(version:Life['contentVersion'])=>version==='0.15.0'||version==='0.16.0';

export function visiblePublication(p:PublicationProfile,entry:ReadingEntry,flags:Record<string,boolean>):boolean {
  return !p.hiddenPosts.includes(entry.id)&&(!p.posts.some(e=>e.id===entry.id)||flags[publicationFact(entry.id)]===true);
}

/** No expression interpreter, timer, queue or additional random stream. */
export function validatePublications(p:PublicationProfile,content:Content,reading:ReadingProfile,entries:ReadingEntry[]):void {
  const fail=(reason:string):never=>{throw new Error('支线发帖定义无效：'+reason);};
  const ids=new Set(entries.map(e=>e.id)),postIds=new Set(p.posts.map(e=>e.id));
  if(ids.size!==entries.length||postIds.size!==p.posts.length||p.posts.length>2)fail('帖子重复或超过两篇');
  if(p.posts.some(e=>!ids.has(e.id))||p.hiddenPosts.some(id=>!ids.has(id)||postIds.has(id)))fail('帖子不在目标版本完整库或与隐藏表冲突');
  // No authored node, compression outcome or other content field can bypass the sole writer.
  const walk=(value:unknown):void=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      if(key.startsWith(publicationPrefix))fail('内容不得直接写入或撤销发布事实');
      walk(item);
    }
  };walk(content);
  const owners=new Map<string,string>();
  const register=(owner:string,nodes:string[])=>{
    if(!nodes.length)fail('空支线');
    for(const id of nodes){
      const node=content.nodes.find(n=>n.id===id);
      if(!node||node.kind!=='EVENT'||id==='mainline'||owners.has(id))fail('支线节点不存在或重复归属');
      owners.set(id,owner);
    }
  };
  for(const [id,nodes] of Object.entries(p.branches))register('legacy:'+id,nodes);
  for(const t of reading.threads)register('reading:'+t.id,Object.keys(t.steps));
  const pairs=new Set<string>(),publisher=new Map<string,string>(),byBranch=new Map<string,string>();
  for(const link of p.links){
    const owner=owners.get(link.node),node=content.nodes.find(n=>n.id===link.node),choice=node?.choices.find(c=>c.id===link.choice);
    if(!owner||!choice||!choice.outcome||choice.check||choice.outcomes||choice.capacityExempt)fail('来源不是登记支线的固定普通选择');
    if(!postIds.has(link.post))fail('目标不是后续帖');
    const pair=link.node+'/'+link.choice;if(pairs.has(pair))fail('一个选择不能重复关联或发布多帖');pairs.add(pair);
    if(publisher.has(link.post)&&publisher.get(link.post)!==owner)fail('同帖不能混合不同支线');
    if(byBranch.has(owner!)&&byBranch.get(owner!)!==link.post)fail('一条支线最多一帖');
    publisher.set(link.post,owner!);byBranch.set(owner!,link.post);
  }
  if(publisher.size!==postIds.size||byBranch.size>2)fail('帖子无来源或超过两条发布支线');
  const edges=new Map<string,string[]>();let successors=0;
  for(const t of reading.threads){
    if(p.hiddenPosts.includes(t.rootPost))fail('根帖被静态隐藏');
    const owner=publisher.get(t.rootPost);if(!owner)continue;
    successors++;const next='reading:'+t.id;
    edges.set(owner,[...(edges.get(owner)??[]),next]);
  }
  const depth=(id:string,path:Set<string>):number=>{
    if(path.has(id))fail('支线与帖子形成自开或循环');
    const seen=new Set(path);seen.add(id);
    return Math.max(0,...(edges.get(id)??[]).map(next=>1+depth(next,seen)));
  };
  for(const id of edges.keys())if(depth(id,new Set())>1)fail('超过一层后继');
  if(successors>1)fail('最多一条阅读后继');
}

/** Called only after a successful Life cognition choice, including unscheduled branches. */
export function publishChoice(life:Life,p:PublicationProfile,node:string,choice:string):void {
  if(!hasPublications(life.contentVersion))return;
  const link=p.links.find(l=>l.node===node&&l.choice===choice);if(!link)return;
  const key=publicationFact(link.post);if(life.mind.world.flags[key])return;
  life.mind.world.flags[key]=true;
  // Keep the canonical cognition audit consistent with the atomic Life result.
  const last=life.mind.history.at(-1)!;
  last.changes.worldFlags[key]=true;last.scope='mixed';
}

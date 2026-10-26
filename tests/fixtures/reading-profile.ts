import type {ReadingProfile,ReadingThread} from '../../src/life/reading-threads/types';
import type {Node,NoteTemplate} from '../../src/cognition/types';

// Deliberately mechanical fixtures, not approved CAT/HUAC prose or production content.
export const readingProfile:ReadingProfile={id:'s1-test-v1',threads:[],nodes:[],semantic:{topics:{rt_test:'Test-only public meeting'},sources:{}}};
function note(id:string,text:string,tags:string[]=[]):NoteTemplate {
  readingProfile.semantic.sources[id]={topic:'rt_test',depth:0,clauses:[{facet:id,gist:text,abstract:'A limited public conversation took place.',epistemic:'observed',priority:2,tags}]};
  return {id,text,weight:3,tags,confidence:'HIGH',sourceLabel:'TEST ONLY / new public observation'};
}
for(const [id,post,count] of [['rt_long','escape_cat',3],['rt_short','huac_update',2]] as const){
  const thread:ReadingThread={id,rootPost:post,entry:id+'_1',maxScenes:count,phases:['arrival','settled','open'],channels:['public'],themeNodes:id==='rt_short'?['pg_e01']:[],steps:{}};
  for(let i=1;i<=count;i++){
    const nodeId=`${id}_${i}`,last=i===count;
    const title=`TEST ONLY / ${id} ${i} of ${count}`;
    const node:Node={id:nodeId,kind:'EVENT',title,text:[`${title}. This is a mechanical acceptance fixture, not a new story.`,`A public board introduces the speaker now. Reading a post did not notify this person.`],inject:[note(nodeId+'_observation',`The public board currently shows meeting ${i}.`,i===1?[id+'_evidence']:[])],choices:[]};
    const add=(suffix:string,text:string,exit=false,tag?:string)=>{
      const choiceId=nodeId+'_'+suffix;
      node.choices.push({id:choiceId,text,hint:'TEST ONLY / no fee; follow-ups require an explicit choice.',...(exit?{capacityExempt:'exit' as const}:{}),...(tag?{requiresTag:tag}:{}),outcome:{text:[last||exit?'This conversation ends here. No further meeting was agreed.':'You explicitly agree to a follow-up available after one hour.'],next:'schedule_return',inject:[note(choiceId+'_result',last||exit?'The conversation ended.':'A follow-up was explicitly agreed.')]}});
      thread.steps[nodeId]??={};
      thread.steps[nodeId][choiceId]=last||exit?{remaining:0}:{remaining:count-i,promise:{id:choiceId+'_promise',role:'branch',title:`TEST ONLY / ${id} follow-up ${i+1}`,afterHours:1,afterScenes:0,mode:'choice',eventId:`${id}_${i+1}`,fallbackEventId:`${id}_${i+1}`,channels:['public','mail']}};
    };
    add('next',last?'Ask an ordinary question and finish.':'Agree to meet again.');
    if(last)add('quote','Refer to the specific first-meeting observation.',false,id+'_evidence');
    add('leave','Leave without accepting another meeting.',true);
    readingProfile.nodes.push(node);
  }
  readingProfile.threads.push(thread);
}

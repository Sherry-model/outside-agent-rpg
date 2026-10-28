import type {ReadingProfile,ReadingThread} from '../../src/life/reading-threads/types';
import type {PublicationProfile} from '../../src/life/publications/types';
import type {Node} from '../../src/cognition/types';

export const publications:PublicationProfile={branches:{},hiddenPosts:[],links:[{node:'rt_pub_a2',choice:'rt_pub_a2_publish',post:'test_public_followup'}],posts:[{
  id:'test_public_followup',kind:'THREAD',section:'daily',sourceRecord:'test-only-publication',title:'TEST ONLY / Public follow-up',source:'TEST ONLY / Public board',excerpt:'A short public follow-up.',contextText:'The board publicly reports that the test conversation ended.',weight:2,posts:[{author:'TEST ONLY / Speaker',role:'Public author',body:['The test conversation ended. This is not a promise of another meeting.']}],
}]};
export const readingProfile:ReadingProfile={id:'publication-test-v1',fixtureVersion:'0.15.0',threads:[],nodes:[],semantic:{topics:{pub_test:'Test publication'},sources:{}}};
for(const [id,root,count] of [['rt_pub_a','insurance',2],['rt_pub_b','test_public_followup',1]] as const){
  const t:ReadingThread={id,rootPost:root,entry:id+'1',maxScenes:count,phases:['arrival','settled','open'],channels:['public'],themeNodes:[],steps:{}};
  for(let i=1;i<=count;i++){
    const nodeId=id+i;
    const note=(key:string,text:string,weight=2)=>{
      readingProfile.semantic.sources[key]={topic:'pub_test',depth:0,clauses:[{facet:key,gist:text,abstract:'A test exchange occurred.',epistemic:'observed',priority:2,tags:[]}]};
      return {id:key,text,weight,tags:[],confidence:'HIGH' as const,sourceLabel:'TEST ONLY / observed now'};
    };
    const n:Node={id:nodeId,kind:'EVENT',title:'TEST ONLY / '+nodeId,text:['This is a test-only public meeting.'],inject:[note(nodeId+'_observation','The current meeting introduces its speaker.',3)],choices:[]};
    const next=i<count,publish=nodeId==='rt_pub_a2';
    for(const exit of [false,true]){
      const choice=nodeId+(exit?'_leave':publish?'_publish':'_next');
      n.choices.push({id:choice,text:exit?'Leave.':publish?'Publish the short follow-up.':next?'Agree to meet again after one hour.':'Ask an ordinary question.',hint:'TEST ONLY / no fee.',...(exit?{capacityExempt:'exit' as const}:{}),outcome:{next:'schedule_return',text:[exit?'This exchange ends.':publish?'The speaker posts the agreed short message to the public board.':next?'You agree to meet after one hour.':'A short answer ends the exchange.'],inject:[note(choice+'_result',exit?'The exchange ended.':publish?'A short public message was posted.':next?'A meeting was explicitly agreed.':'A short answer was received.')]}});
      t.steps[nodeId]??={};t.steps[nodeId][choice]=next&&!exit?{remaining:1,promise:{id:choice+'_promise',role:'branch',title:'TEST ONLY / agreed follow-up',afterHours:1,afterScenes:0,mode:'choice',eventId:id+'2',fallbackEventId:id+'2',channels:['public','mail']}}:{remaining:0};
    }
    readingProfile.nodes.push(n);
  }readingProfile.threads.push(t);
}

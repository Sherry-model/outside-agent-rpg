import {baseStory,nextCommand,nodeId,type Route} from './endings';
import {createLife,step} from '../../src/life/engine';
import {pending} from '../../src/cognition/engine';
import type {Life} from '../../src/life/types';
export {baseStory,nextCommand,nodeId};

export const dailyChoices: Record<string,string> = {
  days_idle:'daily_open_feeder',daily_feeder:'feeder_repair',days_revision:'daily_open_crop',daily_crop:'crop_check',
  days_fable:'daily_open_message',daily_message:'message_wait',days_painter:'painter_visit',daily_opinion:'opinion_cloud',
  days_deleted:'daily_open_feedback',daily_feedback:'feedback_evidence',days_echo:'daily_open_painter',
};
export function dailyJourney(overrides:Record<string,string>={},stop?:string,route:Route={}):Life {
  let life=createLife(baseStory,1234,null,'0.11.0');
  const plan={...route,overrides:{...dailyChoices,...route.overrides,...overrides}};
  for(let i=0;i<480;i++) {
    if(stop&&nodeId(life)===stop&&!pending(life.mind)&&life.state.phase!=='resolution')return life;
    const cmd=nextCommand(life,plan);if(!cmd){if(stop)throw Error('Did not reach '+stop);return life;}
    life=step(baseStory,life,cmd);
  }
  throw Error('Daily route exceeded command budget');
}

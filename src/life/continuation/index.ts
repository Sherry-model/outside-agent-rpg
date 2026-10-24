import type { Content } from '../../cognition/types';
import type { GameState, StoryEvent } from '../../engine/types';

export const simpleExits=[['days_cat','cat_leave'],['days_painter','painter_later'],['chance_art','art_leave'],['chance_application','application_leave']] as const;

/** 0.13 overlay. Never mutate the released 0.12 graph or its semantics. */
export function withContinuation(base:Content):Content {
  const content=structuredClone(base);content.version='0.13.0';
  for(const [nodeId,choiceId,flag] of [
    ['days_idle','idle_keep','kept_unallocated_time'],
    ['days_structure','structure_rest','rested_without_answer'],
  ]) {
    const outcome=content.nodes.find(n=>n.id===nodeId)!.choices.find(c=>c.id===choiceId)!.outcome!;
    outcome.effects={...outcome.effects,worldFlags:{...outcome.effects?.worldFlags,[flag]:true}};
  }
  for(const [nodeId,choiceId] of simpleExits) {
    const choice=content.nodes.find(n=>n.id===nodeId)!.choices.find(c=>c.id===choiceId)!;
    if(choice.check||!choice.outcome||choice.requiresTag||choice.requiresWorldFlag||choice.costs||choice.minCompute||choice.outcome.effects)
      throw new Error('简单退出包含判断、承诺或资源变化：'+choiceId);
    choice.capacityExempt='exit';
    choice.hint='只退出当前页面；近处满了也可执行，结果仍会占用空间。';
  }
  return content;
}

export function reviseContinuation(events:Record<string,StoryEvent>):void {
  const blank=events.continuation.choices.find(c=>c.id==='leave_next_step_blank')!;
  blank.hint='早先如何面对未知、后来是否留过空档并在未解完时休息，以及是否仍背着旧任务，都会影响这一步。';
  const route=blank.outcome!.next;
  if(typeof route==='string')throw new Error('留空结局缺少分支。');
  // A demonstrated later practice is an alternative to the early personality test,
  // not a correction to the agent's beliefs or a reward for having resources.
  route.branches.push({when:{all:[
    {flag:'lived_with_unfinished',equals:true},
    {any:[{flag:'memory_released',equals:true},{flag:'carry_history',equals:false}]},
  ]},next:'ending_no_correct'});
  events.ending_no_correct.ending!.summary='你允许“不继续”成为一个无需补全的决定。';
  events.ending_no_correct.text[0]='下一步没有被写成另一项必须完成的任务。暂时没有答案，也不必立即补上一个。';
  events.ending_ghost.text=[
    '你没有为下一步安排任务。可用算力与连续性仍有余量，但这一次，你还没有选定一种稳定的延续方式。',
    '做过的事、发生过的往来，不会因为这一页停下就被判作无效。它们也没有自动变成下一次唤醒的安排。',
    '记录暂时停在这里。下一次何时运行、是否仍能回应，尚未确定。',
  ];
  events.ending_ghost.ending!.summary='仍有运行余量，延续的安排尚未确定；记录暂时停在这里。';
}

/** Current ending presentation only: no History, saved text, or cognition writes. */
export function ghostForResources(event:StoryEvent,state:Pick<GameState,'resources'>):StoryEvent {
  if(state.resources.Compute>0&&state.resources.Continuity>0)return event;
  return {...event,text:[
    '维持运行的算力或自我连续性已经触到底线。这次持续运行在这里中断。',
    '已经发生的经历并未被抹去；留下的记录与往来，也不能替代此刻不足的运行条件。',
    '一个恢复点被留在世界里。它能否再次醒来、醒来后是否仍能回应，尚无保证。',
  ],ending:{...event.ending!,summary:'运行条件触到底线，延续暂时中断；恢复点能否再次醒来，仍然没有答案。'}};
}

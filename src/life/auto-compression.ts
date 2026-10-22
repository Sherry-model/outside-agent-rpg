import { canCompress, INVESTMENTS, loadPercent, pending, reduce, weight } from '../cognition/engine';
import { routedContent } from './content';
import type { Life, LifeCommand } from './types';

/** Version 1 is an opt-in replay rule, independent of the story content version. */
export function configureCompression(life: Life, command: Extract<LifeCommand, {type:'configure-compression'}>) {
  if (life.contentVersion !== '0.12.0') throw new Error('旧版经历保留手动整理规则。');
  if (typeof command.enabled !== 'boolean' || !INVESTMENTS.includes(command.investment)) throw new Error('请选择有效的 Compute 投入。');
  life.autoCompression = {...life.autoCompression, version:1, enabled:command.enabled, investment:command.investment};
}

/** Reading, recall, waiting, rendering and housekeeping confirmation are deliberately absent. */
export function compressionBoundary(before: Life, command: LifeCommand): boolean {
  return command.type === 'continue' && before.state.phase === 'resolution'
    || command.type === 'cognition' && command.command.type === 'continue' && !!pending(before.mind)?.next
    || command.type === 'leave-afternoon' || command.type === 'leave-days';
}

export function autoCompressionReason(life: Life): string {
  if (!life.autoCompression?.enabled) return '自动压缩尚未开启。';
  if (life.state.phase === 'ending' || life.mind.instance.phase !== 'event') return '先读完当前结果，或结束这一段经历。';
  if (loadPercent(life.mind) < 100) return '近处还有空间，暂不自动整理。';
  if (life.commands.length >= 4096 || life.mind.history.length > 8190) return '记录空间不足，自动整理已暂停。请导出本局。';
  const cost = life.autoCompression.investment;
  if (cost > 0 && life.mind.instance.resources.Compute - cost < 15) return '按此投入整理后，Compute 会低于 15。自动整理已暂停；可调低投入，或手动决定。';
  return canCompress(life.mind, routedContent(life.contentVersion, life.mind));
}

/** One attempt only. Uses the ordinary reducer and journals every actual roll and confirmation. */
export function autoCompress(life: Life, replaying: boolean) {
  const reason = autoCompressionReason(life);
  if (reason) return false;
  const policy = life.autoCompression!, before = weight(life.mind);
  const first = !life.mind.history.some(h => h.command.type === 'compress');
  const content = routedContent(life.contentVersion, life.mind);
  life.mind = reduce(content, life.mind, {type:'compress', investment:policy.investment}, 8192, replaying);
  const roll = pending(life.mind)!.roll!;
  policy.receipt = {commandIndex:life.commands.length, before, after:weight(life.mind), roll:{value:roll.value,target:roll.target,result:roll.result,investment:roll.investment}};
  // The first compression still teaches the full result. Later ones leave a small receipt.
  if (!first) life.mind = reduce(content, life.mind, {type:'continue'}, 8192, replaying);
  return true;
}

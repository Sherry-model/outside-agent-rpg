// Current runtime emits these already-formatted Chinese messages into saves/UI state.
// Recognize only their complete, unchanged formats. Unknown formats remain Chinese.
type Translate = (source: string, values?: Readonly<Record<string, string | number>>) => string;
export function formattedText(source: string, translate: Translate): string | undefined {
  let match = /^留下了 (\d+) 段摘要。目录仍占据一点近处，回想时再装入正文。$/.exec(source);
  if (match) return translate('留下了 {count} 段摘要。目录仍占据一点近处，回想时再装入正文。', {count:match[1]});
  match = /^已恢复 (0\.[3-8]\.[01]) 旧局 · 新局体验社区往返$/.exec(source);
  if (match) return translate('已恢复 {version} 旧局 · 新局体验社区往返', {version:match[1]});
  // More than one resource may be missing; preserve every requirement in order.
  const shortages = source.split('；').map(text => /^(Compute|Trace|Access|Continuity) 不足：需要 (\d+)，当前 (\d+)$/.exec(text));
  if (shortages.length && shortages.every(m => m !== null)) return shortages.map(m => translate('{resource} 不足：需要 {needed}，当前 {current}', {resource:m![1],needed:m![2],current:m![3]})).join('; ');
  match = /^导入失败：([\s\S]+)$/.exec(source);
  if (match) return translate('导入失败：{error}', {error:translate(match[1])});
  for (const suffix of [
    ' 原存档已保留，自动写入暂停。请导出当前进度；明确重新开始或载入有效存档后恢复自动保存。',
    ' 原文件已保留，自动写入暂停。可导出当前进度，或载入有效文件后继续保存。',
  ]) {
    const prefix = '自动存档未载入：';
    if (source.startsWith(prefix) && source.endsWith(suffix)) {
      return translate(prefix+'{error}'+suffix, {error:translate(source.slice(prefix.length,-suffix.length))});
    }
  }
  match = /^存档剧情版本不兼容，需要 ([a-z0-9-]+) \/ ([0-9.]+)。$/.exec(source);
  if (match) return translate('存档剧情版本不兼容，需要 {id} / {version}。', {id:match[1],version:match[2]});
  return undefined;
}

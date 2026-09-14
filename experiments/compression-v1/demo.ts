import { readFileSync } from 'node:fs';
import { classify, compress, load, recall, type Note } from './model.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')) as {
  topics: Record<string, string>; notes: Note[];
};
const runs = [20, 45, 70, 95].map(value => {
  const grade = classify(value, 60, true);
  const result = compress(fixture.notes, fixture.topics, grade, 914);
  const first = result.memories[0];
  return { roll: { value, target: 60, stressed: true, grade }, ...result,
    firstRecall: first && recall(first, []),
    afterRecallLoad: load(result.retained, result.memories, first ? recall(first, []) : []),
  };
});
console.log(JSON.stringify({ notice: '设计实验；固定掷骰用于比较，未接入正式游戏。夹具含改写及假设经历，不是一条实际存档。', runs }, null, 2));

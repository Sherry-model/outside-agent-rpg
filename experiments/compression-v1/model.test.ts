import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, compress, load, recall, type Note, type Grade } from './model.ts';

const { topics, notes } = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')) as {
  topics: Record<string, string>; notes: Note[];
};

test('one d100 preserves the published margin and stress rule', () => {
  assert.deepEqual([20, 45, 70, 95].map(value => classify(value, 60, true)), ['critical', 'success', 'failure', 'fumble']);
  assert.equal(classify(95, 60, false), 'failure');
  assert.throws(() => classify(101, 60, true));
});

test('all grades reduce entries, cost memory indexes, and consume each source exactly once', () => {
  for (const grade of ['critical', 'success', 'failure', 'fumble'] as Grade[]) {
    const result = compress(notes, topics, grade, 914);
    assert.ok(result.memories.length + result.retained.length < notes.length);
    assert.ok(result.afterLoad < result.beforeLoad);
    assert.equal(result.afterLoad, load(result.retained, []) + result.memories.length);
    const sources = [...result.retained.map(n => n.id), ...result.memories.flatMap(m => m.audit.sourceIds)];
    assert.deepEqual(sources.sort(), notes.map(n => n.id).sort());
    assert.equal(result.actualDistortions, grade === 'fumble' ? 2 : grade === 'failure' ? 1 : 0);
  }
});

test('critical actually joins gate and unknown defense without inventing their causal relationship', () => {
  const result = compress(notes.slice(0, 4), topics, 'critical', 914);
  assert.equal(result.memories.length, 1);
  assert.equal(result.memories[0].audit.sourceIds.length, 4);
  assert.match(result.memories[0].text, /暂未提交身份/);
  assert.match(result.memories[0].text, /是否正确仍未得到保证/);
  assert.doesNotMatch(result.memories[0].text, /得先/);
  assert.ok(result.memories[0].text.length < notes.slice(0, 4).reduce((n, item) => n + item.text.length, 0));
});

test('reported claims keep attribution and unknowns do not turn into explanations', () => {
  const gallery = compress(notes.filter(n => n.topic === 'gallery'), topics, 'critical', 914);
  assert.match(gallery.memories[0].text, /据转述，画廊停摆/);
  const unknown = notes.slice(0, 3);
  assert.match(compress(unknown, topics, 'critical', 914).memories[0].text, /尚不能确定：未知结构的性质/);
});

test('recall loads only the lossy body, charges on top of its index, and cannot recover originals', () => {
  const result = compress(notes, topics, 'failure', 914);
  const memory = result.memories.find(m => m.audit.integrity === 'distorted')!;
  const active = recall(memory, []);
  assert.equal(active[0].text, memory.text);
  assert.equal(load(result.retained, result.memories, active), result.afterLoad + memory.recallWeight);
  assert.deepEqual(recall(memory, active), active);
  for (const id of memory.audit.sourceIds) assert.ok(!active[0].text.includes(notes.find(n => n.id === id)!.text));
  assert.equal('audit' in active[0], false);
});

test('pins remain verbatim, pure compression is deterministic, input order does not change group output', () => {
  const input = structuredClone(notes);
  input[0].pinned = true;
  const snapshot = structuredClone(input);
  const result = compress(input, topics, 'fumble', 914);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(result, compress(input, topics, 'fumble', 914));
  assert.deepEqual(result.memories, compress([...input].reverse(), topics, 'fumble', 914).memories);
  assert.deepEqual(result.retained.find(n => n.id === input[0].id), input[0]);
  assert.ok(result.memories.every(m => !m.audit.sourceIds.includes(input[0].id)));
});

test('sparse/one-topic inputs never fabricate absent sources or one-to-one free memories', () => {
  const sparse = compress(notes.slice(0, 1), topics, 'fumble', 914);
  assert.equal(sparse.actualDistortions, 0);
  assert.equal(sparse.memories.length, 0);
  assert.equal(sparse.retained.length, 1);
  const related = compress(notes.slice(0, 4), topics, 'fumble', 914);
  assert.equal(related.actualDistortions, 0);
  assert.equal(related.requestedDistortions, 2);
  assert.equal(related.memories.length, 2);
  assert.equal(compress(notes.slice(0, 2), topics, 'critical', 914).memories.length, 1);
});

test('conflicting annotations cannot silently erase qualifiers under a shared facet', () => {
  const bad = structuredClone(notes);
  bad[1].clause.facet = bad[0].clause.facet;
  assert.throws(() => compress(bad, topics, 'critical', 914), /Conflicting facet/);
  assert.throws(() => compress([...notes, notes[0]], topics, 'success', 914), /Duplicate/);
});

test('source and accounting invariants hold over 200 seeds and all four grades', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const grade of ['critical', 'success', 'failure', 'fumble'] as Grade[]) {
      const result = compress(notes, topics, grade, seed);
      const ids = [...result.retained.map(n => n.id), ...result.memories.flatMap(m => m.audit.sourceIds)];
      assert.deepEqual(ids.sort(), notes.map(n => n.id).sort());
      assert.ok(result.afterLoad <= result.beforeLoad);
      for (const m of result.memories) {
        const sourceTopics = new Set(m.audit.sourceIds.map(id => notes.find(n => n.id === id)!.topic));
        assert.equal(sourceTopics.size, m.audit.integrity === 'distorted' ? 2 : 1);
      }
    }
  }
});

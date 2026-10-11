import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
// @ts-expect-error Build tooling is JavaScript, outside the application TS graph.
import { offlineSnapshots, snapshotModule } from '../scripts/offline-snapshots.mjs';

test('offline frozen snapshots retain exact JSON and independent objects after bundling', async () => {
  const files: string[] = [];
  for (const folder of ['src/life/releases', 'src/story-tomorrow/releases']) {
    for (const name of (await readdir(folder)).sort()) if (name.endsWith('.json')) files.push(`${folder}/${name}`);
  }
  const input = files.map((file, i) => `import s${i} from './${file}';`).join('\n') +
    `\nexport default [${files.map((_, i) => `s${i}`).join(',')}];`;
  const bundle = await build({ stdin: { contents: input, resolveDir: process.cwd() }, bundle: true,
    write: false, format: 'esm', platform: 'node', plugins: [offlineSnapshots()] });
  const { default: snapshots } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const originals = await Promise.all(files.map(async f => JSON.parse(await readFile(f, 'utf8'))));
  snapshots.forEach((snapshot: unknown, i: number) => assert.equal(JSON.stringify(snapshot), JSON.stringify(originals[i]), files[i]));
  snapshots[0].observations.opening.text = 'changed only in this snapshot';
  for (let i = 1; i < snapshots.length; i++) assert.deepEqual(snapshots[i], originals[i]);
});

test('snapshot sharing preserves removed fields, array order and literal JSON keys', async () => {
  const base = { long: { text: 'shared material '.repeat(30) }, deleted: true, list: [1, 2, 3] };
  const snapshot = JSON.parse(`{"__proto__":{"safe":true},"long":${JSON.stringify(base.long)},"same":${JSON.stringify(base.long)},"list":[3,1],"new":"$&\\n</script>"}`);
  const result = await build({ stdin: { contents: snapshotModule(snapshot, base, 'base'), resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'base-fixture', setup(b) {
      b.onResolve({ filter: /^base$/ }, () => ({ path: 'base', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: JSON.stringify(base), loader: 'json' }));
    } }] });
  const { default: actual } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  assert.equal(JSON.stringify(actual), JSON.stringify(snapshot));
  assert.equal(Object.getPrototypeOf(actual), Object.prototype);
  actual.long.text = 'only this occurrence';
  assert.equal(actual.same.text, snapshot.same.text);
});

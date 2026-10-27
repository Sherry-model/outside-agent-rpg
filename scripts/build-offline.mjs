import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { embedStory } from './embed-story.mjs';
import { offlineSnapshots } from './offline-snapshots.mjs';

const result = await build({
  entryPoints: ['src/entry.ts'], bundle: true, write: false,
  outfile: 'outside.js', format: 'iife', target: 'es2022', minify: true,
  plugins: [offlineSnapshots(), embedStory()],
});
const script = result.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
let html = await readFile('index.html', 'utf8');
// A callback keeps JavaScript's literal $&, $` and $' strings from being
// interpreted as String.replace replacement patterns inside the bundle.
html = html.replace('<script type="module" src="/src/entry.ts"></script>', () => `<style>${css}</style><script>${script}</script>`);
await writeFile('dist/OUTSIDE.html', html);
// Preserve the previous executable before replacing the current delivery.
await mkdir('versions/builds', { recursive: true });
let previous;
try { previous = await readFile('OUTSIDE.html', 'utf8'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
if(previous && previous !== html) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(`versions/builds/OUTSIDE-before-${stamp}.html`, previous, { flag: 'wx' });
}
await writeFile('OUTSIDE.html', html);
console.log(`Offline game: OUTSIDE.html (${Math.round(Buffer.byteLength(html) / 1024)} KB, no external assets)`);

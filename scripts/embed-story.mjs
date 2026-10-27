import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Both offline deliveries must replace Vite's import.meta.glob before bundling.
export function embedStory() {
  return {
    name: 'embed-story-json',
    setup(builder) {
      builder.onLoad({ filter: /src\/story\/index\.ts$/ }, async () => {
        const manifest = JSON.parse(await readFile('src/story/manifest.json', 'utf8'));
        const files = (await readdir('src/story/events')).filter(f => f.endsWith('.json')).sort();
        const sources = await Promise.all(files.map(async source => ({ source, data: JSON.parse(await readFile(`src/story/events/${source}`, 'utf8')) })));
        return { contents: `import {parseStory} from '../engine/parser'; export const story=parseStory(${JSON.stringify(manifest)},${JSON.stringify(sources)});`, loader: 'ts', resolveDir: path.join(process.cwd(), 'src/story') };
      });
    },
  };
}

import manifest from './manifest.json';
import { parseStory } from '../engine/parser';
const sources = import.meta.glob('./events/*.json', { eager: true, import: 'default' });
export const story = parseStory(manifest, Object.entries(sources).map(([source, data]) => ({ source, data })));

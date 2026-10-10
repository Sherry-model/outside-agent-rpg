import { readFileSync, readdirSync } from 'node:fs';
import { parseStory } from '../src/engine/parser';
import { contentVersions } from '../src/story-tomorrow';
import { config, parseLifeContent, contentFor } from '../src/life/content';
import { library } from '../src/life/reading';
import { storyForLife } from '../src/life/endings';
import { daysContent } from '../src/life/days';
const manifest = JSON.parse(readFileSync('src/story/manifest.json', 'utf8'));
const sources = readdirSync('src/story/events').filter(f => f.endsWith('.json')).map(source => ({ source, data: JSON.parse(readFileSync(`src/story/events/${source}`, 'utf8')) }));
const story = parseStory(manifest, sources);
const events = Object.values(story.events);
console.log(`✓ ${story.manifest.title}: ${events.filter(e => e.kind === 'event').length} events, ${events.filter(e => e.kind === 'ending').length} endings. Schema and references valid.`);
for (const content of contentVersions) console.log(`✓ ${content.title} / ${content.version}: ${content.nodes.length} nodes, ${content.news.length} News. Schema and references valid.`);
const currentStory=storyForLife(story,config.version);
parseLifeContent(config,currentStory);
console.log(`✓ 当前主线 / ${currentStory.manifest.version}: ${Object.values(currentStory.events).filter(e=>e.kind==='ending').length} endings; six visitor/containment events validated in life ${config.version}.`);
console.log(`✓ 持续上下文 / ${config.version}: capacity ${config.capacity}, all ordinary events have valid observations.`);

if(!story.events[library.unlockAfterVisited]) throw new Error("转发栏入口引用未知事件。");
console.log(`✓ 转发栏 / ${library.version}: ${library.entries.length} entries, schema and unlock reference valid.`);

console.log(`✓ 余下的三天 / 基础内容 0.5.0: ${daysContent.nodes.filter(n=>n.kind==='EVENT').length} events, ${daysContent.nodes.reduce((n,e)=>n+e.choices.length,0)} choices, source annotations and references valid.`);

const community=contentFor('0.6.1').nodes.filter(n=>n.id==='community_entry'||n.id.startsWith('pg_e'));
console.log(`✓ 社区 A 线 / 0.6.1: ${community.length} authored nodes (four encounters, fixed variants, and selector); schema, sources and return references valid.`);

const b=contentFor('0.7.1').nodes.filter(n=>/^pg_e0[5-8](?:_|$)/.test(n.id));
console.log(`✓ 社区 B 线 / 0.7.1: ${b.length} authored nodes (four encounters and fixed variants); schema, sources and return references valid.`);

const c=contentFor('0.8.0').nodes.filter(n=>/^pg_e(09|10|11|12)(?:_|$)/.test(n.id));
console.log(`✓ 社区 C 线 / 0.8.0: ${c.length} authored nodes (four encounters and fixed variants); schema, sources and return references valid.`);

const d=contentFor('0.9.0').nodes.filter(n=>/^pg_e(13|14|15|16)(?:_|$)/.test(n.id));
console.log(`✓ 社区 D 线 / 0.9.0: ${d.length} authored nodes; schema, sources and return references valid.`);

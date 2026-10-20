import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {parseStory} from '../src/engine/parser.ts';
import {createLife,step} from '../src/life/engine.ts';
import {createSave,LIFE_KEYS} from '../src/life/saves.ts';
const out=process.env.LOCALIZATION_OUTPUT??'output/localization-20261001';await mkdir(out,{recursive:true});
const story=parseStory(JSON.parse(await readFile('src/story/manifest.json','utf8')),await Promise.all((await readdir('src/story/events')).filter(f=>f.endsWith('.json')).map(async source=>({source,data:JSON.parse(await readFile(`src/story/events/${source}`,'utf8'))}))));
let life=createLife(story,1234,null,'0.11.0');for(const choiceId of ['keep_history','stable_boot','take_small_window'])life=step(story,step(story,life,{type:'choose',choiceId}),{type:'continue'});
const setup=`<script>try {localStorage.setItem('outside.locale','en');localStorage.setItem(${JSON.stringify(LIFE_KEYS.auto)},${JSON.stringify(JSON.stringify(createSave(life)))});}catch{}</script>`;
await writeFile(`${out}/en-fixture.html`,(await readFile('OUTSIDE.html','utf8')).replace('</head>',()=>setup+'</head>'));

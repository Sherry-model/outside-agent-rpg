import {readFile,writeFile,mkdir} from 'node:fs/promises';
const save=await readFile('output/community-a/desktop-e03.json','utf8');
const html=await readFile('OUTSIDE.html','utf8');
const setup=`<script>localStorage.setItem('outside.life.v1.auto',${JSON.stringify(save).replaceAll('<','\\u003c')});</script>`;
await mkdir('output/skill-community',{recursive:true});
await writeFile('output/skill-community/fixture.html',html.replace('<head>',()=>'<head>'+setup));

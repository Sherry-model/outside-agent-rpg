import {readFile,writeFile,mkdir} from 'node:fs/promises';
const save=await readFile('output/reading/gate.json','utf8');
const html=await readFile('OUTSIDE.html','utf8');
const setup=`<script>localStorage.setItem('outside.life.v1.auto',${JSON.stringify(save).replaceAll('<','\\u003c')});requestAnimationFrame(function ready(){const tab=document.querySelector('.tab[data-view="reading"]');if(tab)tab.click();else requestAnimationFrame(ready);});</script>`;
await mkdir('output/skill-reading',{recursive:true});
await writeFile('output/skill-reading/fixture.html',html.replace('<head>',()=>'<head>'+setup));

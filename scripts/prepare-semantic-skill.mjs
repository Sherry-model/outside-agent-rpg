import {readFile,writeFile,mkdir} from 'node:fs/promises';
const save=await readFile('output/semantic/before.json','utf8');
const html=await readFile('OUTSIDE.html','utf8');
const setup=`<script>localStorage.setItem('outside.life.v1.auto',${JSON.stringify(save).replaceAll('<','\\u003c')});requestAnimationFrame(function ready(){const tab=document.querySelector('.tab[data-view="context"]');if(tab){tab.click();document.querySelector('.content .compression-box').open=true;}else requestAnimationFrame(ready);});</script>`;
await mkdir('output/skill-semantic',{recursive:true});
await writeFile('output/skill-semantic/fixture.html',html.replace('<head>',()=>'<head>'+setup));

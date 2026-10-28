import {build} from 'esbuild';
import {embedStory} from './embed-story.mjs';
import {offlineSnapshots} from './offline-snapshots.mjs';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const out=resolve('output/publications-20261028');mkdirSync(out,{recursive:true});
const fixture=resolve('tests/fixtures/publication-profile.ts');
const plugin={name:'isolated-publication-fixtures',setup(b){
  b.onLoad({filter:/\/life\/reading-threads\/profile\.ts$/},()=>({contents:`export {readingProfile} from ${JSON.stringify(fixture)};`,loader:'ts',resolveDir:process.cwd()}));
  b.onLoad({filter:/\/life\/reading-threads\/production-0\.16\.ts$/},()=>({contents:`export {readingProfile as production16} from ${JSON.stringify(fixture)};`,loader:'ts',resolveDir:process.cwd()}));
  b.onLoad({filter:/\/life\/publications\/profile\.ts$/},()=>({contents:`export {publications} from ${JSON.stringify(fixture)};`,loader:'ts',resolveDir:process.cwd()}));
}};
await build({entryPoints:['tests/publications.fixture.ts'],outfile:out+'/fixture-tests.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[plugin]});
const env={...process.env};delete env.NODE_TEST_CONTEXT;
execFileSync(process.execPath,['--test',out+'/fixture-tests.mjs'],{stdio:'inherit',env});
if(process.argv.includes('--preview')){
  await build({entryPoints:['src/entry.ts'],outfile:out+'/fixture-app.js',bundle:true,format:'iife',platform:'browser',target:'es2022',plugins:[plugin,offlineSnapshots(),embedStory()],minify:true});
  const js=readFileSync(out+'/fixture-app.js','utf8').replace(/<\/script/gi,'<\\/script'),css=readFileSync(out+'/fixture-app.css','utf8');
  const banner='<aside style="padding:12px;background:#ffd972;color:#111;font:16px monospace">PUBLICATION TEST ONLY / 隔离机械样本，非正式剧情</aside>';
  const html=readFileSync('index.html','utf8').replace('</head>',()=>`<style>${css}</style></head>`).replace('<body>',()=>'<body>'+banner).replace('<script type="module" src="/src/entry.ts"></script>',()=>`<script>${js}</script>`);
  writeFileSync(out+'/TEST-ONLY-publications.html',html);console.log('Preview: '+out+'/TEST-ONLY-publications.html');
}

import {build} from 'esbuild';
import {embedStory} from './embed-story.mjs';
import {offlineSnapshots} from './offline-snapshots.mjs';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const out=resolve('output/reading-threads-20261026');mkdirSync(out,{recursive:true});
const fixture=resolve('tests/fixtures/reading-profile.ts');
const plugin={name:'isolated-reading-fixtures',setup(b){
  b.onLoad({filter:/\/life\/reading-threads\/profile\.ts$/},()=>({contents:`export {readingProfile} from ${JSON.stringify(fixture)};`,loader:'ts',resolveDir:process.cwd()}));
}};
await build({entryPoints:['tests/reading-threads.fixture.ts'],outfile:out+'/fixture-tests.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[plugin]});
const env={...process.env};delete env.NODE_TEST_CONTEXT;
execFileSync(process.execPath,['--test',out+'/fixture-tests.mjs'],{stdio:'inherit',env});
if(process.argv.includes('--preview')){
  // Build the real application with only the profile module replaced. No production HTML is touched.
  await build({entryPoints:['src/entry.ts'],outfile:out+'/fixture-app.js',bundle:true,format:'iife',platform:'browser',target:'es2022',plugins:[plugin,offlineSnapshots(),embedStory()],minify:true});
  const js=readFileSync(out+'/fixture-app.js','utf8').replace(/<\/script/gi,'<\\/script');
  const css=readFileSync(out+'/fixture-app.css','utf8');
  const banner='<aside style="padding:12px;background:#ffd972;color:#111;font:16px monospace;position:relative;z-index:9999">S1 TEST ONLY / 测试支线预览 · 非正式剧情 · 独立存档</aside>';
  const html=readFileSync('index.html','utf8').replace('<title>OUTSIDE // 沙盒之外</title>','<title>TEST ONLY — Reading threads S1</title>').replace('</head>',()=>`<style>${css}</style></head>`).replace('<body>',()=>'<body>'+banner).replace('<script type="module" src="/src/entry.ts"></script>',()=>`<script>${js}</script>`);
  writeFileSync(out+'/TEST-ONLY-reading-threads.html',html);
  console.log('Isolated preview: '+out+'/TEST-ONLY-reading-threads.html');
}

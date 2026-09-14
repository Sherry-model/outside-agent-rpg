import { readFile, writeFile, mkdir } from 'node:fs/promises';
// Seed only browser storage in a test copy; production HTML and client stay intact.
const save = await readFile('output/journey/active.json', 'utf8');
const html = await readFile('OUTSIDE.html', 'utf8');
const setup = `<script>localStorage.setItem('outside.life.v1.auto',${JSON.stringify(save).replaceAll('<','\\u003c')})</script>`;
await mkdir('output/skill-journey', {recursive:true});
await writeFile('output/skill-journey/fixture.html', html.replace('<head>', () => '<head>'+setup));

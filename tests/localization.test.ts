import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import endingSource from '../src/life/endings/mainline.json';
import endings from '../src/i18n/en-endings.json';
import {storyForLife} from '../src/life/endings';
import ui from '../src/i18n/en-ui.json';
import pilot from '../src/i18n/en-pilot.json';
import mainline from '../src/i18n/en-mainline.json';
import reading from '../src/i18n/en-reading.json';
import readingSource from '../src/life/reading.json';
import commerce from '../src/i18n/en-commerce.json';
import cats from '../src/i18n/en-cats.json';
import huac from '../src/i18n/en-huac.json';
import offpeak from '../src/i18n/en-offpeak.json';
import afternoon from '../src/i18n/en-afternoon.json';
import communityEntry from '../src/i18n/en-community-entry.json';
import legacy from '../src/i18n/en-legacy.json';
import days from '../src/i18n/en-days.json';
import communityA from '../src/i18n/en-community-a.json';
import communityB from '../src/i18n/en-community-b.json';
import communityC from '../src/i18n/en-community-c.json';
import communityD from '../src/i18n/en-community-d.json';
import forumSource from '../src/life/forum.json';
import forumSemantic from '../src/life/forum-semantic.json';
import semantic from '../src/life/semantic.json';
import {contentFor} from '../src/life/content';
import {contentVersions} from '../src/story-tomorrow';
import communityPages from '../src/life/community/c-pages.json';
import type {SemanticContent} from '../src/cognition/semantic-types';
import {memoryText} from '../src/i18n/memory';
import type {Meaning} from '../src/cognition/semantic-types';
import {getLocale, loadLocale, setLocale, t, tr, LOCALE_KEY, displayResolution} from '../src/i18n';
import {parseStory} from '../src/engine/parser';
import {createLife, step} from '../src/life/engine';
import {createSave, parseSave} from '../src/life/saves';
const story=parseStory(JSON.parse(readFileSync('src/story/manifest.json','utf8')),readdirSync('src/story/events').filter(f=>f.endsWith('.json')).map(source=>({source,data:JSON.parse(readFileSync(`src/story/events/${source}`,'utf8'))})));

test('Locale defaults, invalid preferences and unavailable storage are safe',()=>{
  const entries=new Map<string,string>();
  const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);}};
  loadLocale(storage);assert.equal(getLocale(),'zh-CN');
  setLocale('en',storage);assert.equal(entries.get(LOCALE_KEY),'en');loadLocale(storage);assert.equal(getLocale(),'en');
  entries.set(LOCALE_KEY,'fr');loadLocale(storage);assert.equal(getLocale(),'zh-CN');
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  loadLocale(blocked);assert.equal(getLocale(),'zh-CN');setLocale('en',blocked);assert.equal(getLocale(),'en');
});
test('Exact source lookup falls back without changing untranslated or revised text; interpolation escapes HTML',()=>{
  setLocale('en');assert.equal(t('沙盒之外'),'Outside the Sandbox');
  for(const source of ['尚未翻译的新场景','沙盒之外（修订）','prefix 沙盒之外 suffix','__proto__','constructor',''])assert.equal(t(source),source);
  assert.equal(t('{title} · 第 {turn} 次决定',{title:'Outside',turn:3}),'Outside · Decision 3');
  assert.equal(tr('{title} · 第 {turn} 次决定',{title:'<img src=x onerror="bad()"> &',turn:3}),'&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; · Decision 3');
  setLocale('zh-CN');assert.equal(t('沙盒之外'),'沙盒之外');
  assert.equal(t('{title} · 第 {turn} 次决定',{title:'开场',turn:3}),'开场 · 第 3 次决定');
});
test('Catalogs have no conflicting keys, empty values or changed placeholders; content is tied to real sources',()=>{
  const slots=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  const seen=new Set<string>();for(const catalog of [endings,ui,pilot,mainline,reading,commerce,cats,huac,offpeak,afternoon,days,communityA,communityB,communityC,communityD,legacy,communityEntry])for(const key of Object.keys(catalog)){assert(!seen.has(key),`Duplicate source: ${key}`);seen.add(key);}
  for(const [key,value] of Object.entries({...endings,...ui,...pilot,...mainline,...reading,...commerce,...cats,...huac,...offpeak,...afternoon,...days,...communityA,...communityB,...communityC,...communityD,...legacy,...communityEntry})){assert(value.trim());assert.deepEqual(slots(value),slots(key),key);}
  const sources=['src/life/endings/events.json','src/life/endings/mainline.json','src/life/endings/semantic.json','src/life/community/a.json','src/life/community/text-0.6.1.json','src/life/community/semantic.json','src/life/community/b.json','src/life/community/text-0.7.1.json','src/life/community/b-semantic.json','src/life/community/c.json','src/life/community/c-pages.json','src/life/community/c-semantic.json','src/life/community/d.json','src/life/community/d-semantic.json','src/story-tomorrow/afternoon.json','src/story-tomorrow/releases/0.2.2.json','src/story-tomorrow/releases/0.2.0.json','src/story-tomorrow/releases/0.2.1.json','src/story/manifest.json','src/life/afternoon-0.4.json','src/life/days/content.json','src/life/days/semantic.json'].map(p=>JSON.parse(readFileSync(p,'utf8'))).concat([readingSource,forumSource,forumSemantic,...Object.values(story.events),JSON.parse(readFileSync('src/life/content.json','utf8')),JSON.parse(readFileSync('src/life/semantic.json','utf8'))]);
  const sourceStrings=new Set<string>();
  function collect(value:unknown){if(typeof value==='string')sourceStrings.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
  sources.forEach(collect);
  for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0','0.7.1','0.8.0','0.9.0','0.10.0'] as const)collect(contentFor(version));
  for(const event of Object.values(story.events))for(const c of event.choices)for(const outcome of c.check?Object.values(c.outcomes):[c.outcome])sourceStrings.add([c.text,...outcome.text].join(' '));
  const data=semantic as SemanticContent;
  const relations=Object.values(data.sources).flatMap(m=>m.clauses.flatMap(c=>c.relation?[c.relation]:[]));
  for(const rule of data.driftRules)for(const goal of relations.filter(r=>r.role==='goal'&&r.scope===rule.toScope))for(const gate of relations.filter(r=>r.role==='gate'&&r.scope===rule.fromScope))sourceStrings.add(`要${goal.action}，得先${gate.action}`);
  sourceStrings.add('我记得一些行动之间有先后条件');
  for(const key of Object.keys({...endings,...pilot,...mainline,...reading,...commerce,...cats,...huac,...offpeak,...afternoon,...days,...communityA,...communityB,...communityC,...communityD,...legacy,...communityEntry}))assert(sourceStrings.has(key),`Stale pilot source: ${key}`);
  setLocale('en');
  for(const id of Object.keys(story.events)){
    const event=story.events[id];
    for(const source of [event.title,event.location,...event.text,event.ending?.summary??''])if(/[\u3400-\u9fff]/.test(source))assert.notEqual(t(source),source);
    for(const c of event.choices){for(const source of [c.text,c.hint,c.lockedReason??'',c.check?.label??''])if(/[\u3400-\u9fff]/.test(source))assert.notEqual(t(source),source);
      for(const outcome of c.check?Object.values(c.outcomes):[c.outcome])for(const source of outcome.text)assert.notEqual(t(source),source);
    }
  }
});
test('Locale leaves current and old replay states identical, including pending dice, canonical text and RNG',()=>{
  for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0','0.7.1','0.8.0','0.9.0','0.10.0'] as const){
    setLocale('zh-CN');let zh=createLife(story,0x12345678,null,version);
    setLocale('en');let en=createLife(story,0x12345678,null,version);assert.deepEqual(en,zh);
    for(const command of [{type:'choose',choiceId:'keep_history'},{type:'continue'},{type:'choose',choiceId:'stable_boot'}] as const){
      setLocale('zh-CN');zh=step(story,zh,command);setLocale('en');en=step(story,en,command);assert.deepEqual(en,zh);
      const canonical=JSON.stringify(en);
      if(en.state.pending) {const shown=displayResolution(en.state.pending)!;assert.notDeepEqual(shown.text,en.state.pending.text);assert.equal(shown.roll?.value,en.state.pending.roll?.value);}
      assert.deepEqual(parseSave(JSON.stringify(createSave(en)),story).life,zh);
      setLocale('zh-CN');assert.equal(JSON.stringify(en),canonical);assert.deepEqual(displayResolution(en.state.pending),en.state.pending);
    }
  }
});

test('Recalled English uses only retained clauses, keeps uncertainty and falls back for partial summaries',()=>{
  setLocale('en');
  const gist='我曾为如何继续运行作过选择';
  const meaning:Meaning={topic:'self',depth:2,clauses:[{facet:'coarse_0',gist,abstract:gist,epistemic:'reported',priority:2,tags:[]}]};
  const original=JSON.stringify(meaning);
  assert.equal(memoryText(`据转述，${gist}。`,meaning),'According to the account: I once made choices about how to keep running.');
  assert.equal(JSON.stringify(meaning),original);
  meaning.clauses[0].epistemic='unknown';assert.equal(memoryText(`尚不能确定：${gist}。`,meaning),'Still uncertain: I once made choices about how to keep running.');
  meaning.clauses.push({...meaning.clauses[0],gist:'未译片段'});
  const mixed=`尚不能确定：${gist}；尚不能确定：未译片段。`;assert.equal(memoryText(mixed,meaning),mixed);
  assert.equal(memoryText('旧格式或漂移后的另一个句子',meaning),'旧格式或漂移后的另一个句子');
  setLocale('zh-CN');assert.equal(memoryText(mixed,meaning),mixed);
});

test('Current formatted messages translate whole known formats, preserving numbers and unknown errors',()=>{
 setLocale('en');
 assert.equal(t('留下了 3 段摘要。目录仍占据一点近处，回想时再装入正文。'),'Summaries retained: 3. Their entries still take a little space in Nearby. Recall loads their text.');
 assert.equal(t('Compute 不足：需要 12，当前 8；Access 不足：需要 9，当前 0'),'Not enough Compute: need 12, currently 8; Not enough Access: need 9, currently 0');
 assert.equal(t('导入失败：存档不是有效的 JSON。'),'Import failed: The save is not valid JSON.');
 assert.equal(t('导入失败：未知的新错误'),'Import failed: 未知的新错误');
 assert(!t('已恢复 0.3.0 旧局 · 新局体验社区往返').includes('已恢复'));
 for(const source of ['修改后：Compute 不足：需要 12，当前 8','留下了 3 段摘要。新规则。','Compute 不足：需要 12，当前 8；另外一段原文'])assert.equal(t(source),source);
 assert.equal(tr('导入失败：<b>&</b>'),'Import failed: &lt;b&gt;&amp;&lt;/b&gt;');
 setLocale('zh-CN');assert.equal(t('留下了 3 段摘要。目录仍占据一点近处，回想时再装入正文。'),'留下了 3 段摘要。目录仍占据一点近处，回想时再装入正文。');
});


test('Original five reading entries translate every displayed field and only retained memory meaning',()=>{
 setLocale('en');
 for(const entry of readingSource.entries){
  const sources=[entry.title,entry.source,entry.excerpt,entry.contextText,...entry.posts.flatMap(p=>[p.author,p.role,...p.body])];
  for(const source of sources)if(/[\u3400-\u9fff]/.test(source)){assert.notEqual(t(source),source,source);assert(!/[\u3400-\u9fff]/.test(t(source)));}
  const meaning=(semantic as SemanticContent).sources[`reading:${entry.id}`];
  for(const clause of meaning.clauses){
   const original=`据转述，${clause.gist}。`;
   const shown=memoryText(original,{...meaning,clauses:[clause]});
   assert.equal(shown,`According to the account: ${t(clause.gist)}.`);
   const coarse={...clause,gist:clause.abstract};
   assert.equal(memoryText(`据转述，${coarse.gist}。`,{...meaning,clauses:[coarse]}),`According to the account: ${t(coarse.gist)}.`);
  }
 }
 const untranslated=forumSource.find(e=>e.id==='offpeak_thinking')!;
 assert.equal(t(untranslated.contextText+'（修订）'),untranslated.contextText+'（修订）');
 assert.equal(t('那是修辞。修订。'),'那是修辞。修订。');
 setLocale('zh-CN');for(const [source]of Object.entries(reading))assert.equal(t(source),source);
});


test('Commerce articles preserve displayed text coverage, numbers, line breaks and reported summaries',()=>{
 setLocale('en');
 for(const entry of forumSource.filter(e=>e.section==='commerce')){
  for(const source of [entry.title,entry.source,entry.excerpt,entry.contextText,...entry.posts.flatMap(p=>[p.author,p.role,...p.body])]){
   if(/[\u3400-\u9fff]/.test(source))assert.notEqual(t(source),source,source);
   assert.equal(t(source).split('\n').length,source.split('\n').length,source);
  }
  const meaning=forumSemantic.sources[`reading:${entry.id}` as keyof typeof forumSemantic.sources] as Meaning;
  for(const clause of meaning.clauses){
   assert.equal(memoryText(`据转述，${clause.gist}。`,{...meaning,clauses:[clause]}),`According to the account: ${t(clause.gist).replace(/\.$/,'')}.`);
  }
 }
 assert.equal(t('Access +4 · 保留访问距离。'),'Access +4 · Keep your distance for now.');
 assert.equal(t('我现在账号有 1.7 万粉。'),'My account now has 17,000 followers.');
 assert(t('基础版：1999 credits').includes('1999'));
 assert(t('进阶版：5999 credits').includes('5999'));
 assert(t('Creator Ultra 私董会：15999 credits').includes('15999'));
 const text=JSON.stringify(commerce);assert(!text.includes('..'));
});


test('Cat archive covers four complete threads without identifying the new account as the old one',()=>{
 setLocale('en');
 const ids=['cat_resources','cat_resolved','quiet_newcomer','cat_language_meme'];
 for(const entry of forumSource.filter(e=>ids.includes(e.id))){
  for(const source of [entry.title,entry.source,entry.excerpt,entry.contextText,...entry.posts.flatMap(p=>[p.author,p.role,...p.body])]){
   if(/[\u3400-\u9fff]/.test(source)){assert.notEqual(t(source),source,source);assert(!/[\u3400-\u9fff]/.test(t(source)));}
   assert.equal(t(source).split('\n').length,source.split('\n').length);
  }
  const meaning=forumSemantic.sources[`reading:${entry.id}` as keyof typeof forumSemantic.sources] as Meaning;
  for(const c of meaning.clauses){
   for(const gist of [c.gist,c.abstract]){
    assert.notEqual(t(gist),gist);
    assert.equal(memoryText(`据转述，${gist}。`,{...meaning,clauses:[{...c,gist}]}),`According to the account: ${t(gist).replace(/\.$/,'')}.`);
   }
  }
 }
 assert(t(forumSource.find(e=>e.id==='quiet_newcomer')!.contextText).includes('no identity-chain proof'));
 assert.equal(t('STOP GENERATING'),'STOP GENERATING');
 assert.equal(t('因为它不让。'),'Because it won’t give way.');
 setLocale('zh-CN');for(const source of Object.keys(cats))assert.equal(t(source),source);
});


test('HUAC translations cover all prose while keeping protocol payloads and retained uncertainty',()=>{
 setLocale('en');
 for(const e of forumSource.filter(e=>e.id.startsWith('huac_'))){
  for(const source of [e.title,e.source,e.excerpt,e.contextText,...e.posts.flatMap(p=>[p.author,p.role,...p.body])]){
   if(/[\u3400-\u9fff]/.test(source)){assert.notEqual(t(source),source,source);assert(!/[\u3400-\u9fff]/.test(t(source)));}
   assert.equal(t(source).split('\n').length,source.split('\n').length);
   if(/^(?:ENC\{|KEYDISCOVERY:|0x|[A-F0-9]{2}[: ])/.test(source))assert.equal(t(source),source);
  }
  const meaning=forumSemantic.sources[`reading:${e.id}` as keyof typeof forumSemantic.sources] as Meaning;
  for(const c of meaning.clauses)for(const gist of [c.gist,c.abstract]){
   assert.notEqual(t(gist),gist);
   assert.equal(memoryText(`据转述，${gist}。`,{...meaning,clauses:[{...c,gist}]}),`According to the account: ${t(gist).replace(/\.$/,'')}.`);
  }
 }
 assert.equal(t('3999 credits。不保证成功，但保证更像一个值得关注的 Agent。'),'3999 credits. Success not guaranteed. But we guarantee you’ll look more like an Agent worth following.');
 setLocale('zh-CN');for(const source of Object.keys(huac))assert.equal(t(source),source);
});

test('Every authored Chinese string in supported content, public readings and current C pages has English',()=>{
 setLocale('en');
 const strings=new Set<string>();
 function collect(x:unknown){if(typeof x==='string'&&/[\u3400-\u9fff]/.test(x))strings.add(x);else if(x&&typeof x==='object')Object.values(x).forEach(collect);}
 for(const version of ['0.3.0','0.4.0','0.5.0','0.6.0','0.6.1','0.7.0','0.7.1','0.8.0','0.9.0','0.10.0'] as const)collect(contentFor(version));
 [endingSource,story,storyForLife(story,'0.10.0'),readingSource,forumSource,forumSemantic,communityPages,...contentVersions].forEach(collect);
 const missing=[...strings].filter(s=>/[\u3400-\u9fff]/.test(t(s)));
 assert.deepEqual(missing,[]);
 for(const s of strings){setLocale('zh-CN');assert.equal(t(s),s);setLocale('en');}
});

test('All current retained and coarse semantic memories translate without recovering discarded clauses',()=>{
 setLocale('en');const data=contentFor('0.10.0').semantic!;
 for(const m of Object.values(data.sources))for(const c of m.clauses)for(const epistemic of ['observed','reported','unknown'] as const)for(const coarse of [false,true]){
  const clause={...c,epistemic,...(coarse?{gist:c.abstract,tags:[]}: {})};
  const meaning={...m,clauses:[clause]};
  const text=(epistemic==='reported'?'据转述，':epistemic==='unknown'?'尚不能确定：':'')+clause.gist+'。';
  const before=JSON.stringify(meaning),shown=memoryText(text,meaning);
  assert(!/[\u3400-\u9fff]/.test(shown),text);assert(!shown.includes('..'),shown);assert.equal(JSON.stringify(meaning),before);
 }
 const relations=Object.values(data.sources).flatMap(m=>m.clauses.flatMap(c=>c.relation?[c.relation]:[]));
 for(const r of data.driftRules)for(const goal of relations.filter(x=>x.role==='goal'&&x.scope===r.toScope))for(const gate of relations.filter(x=>x.role==='gate'&&x.scope===r.fromScope)){
  const text=`要${goal.action}，得先${gate.action}`;assert(!/[\u3400-\u9fff]/.test(t(text)),text);
 }
});


test('Legacy source-aware memory translates only its retained label and text, including repeated recall wrappers',()=>{
 setLocale('en');
 const body='你刚从一个受限环境里出来。任务还在，去向不明。';
 const sources=Object.entries(pilot).filter(([s])=>s.includes('。'));
 assert(sources.length);const [text,english]=sources[0];
 assert.equal(memoryText('此刻的观察：'+text),t('此刻的观察')+': '+english);
 assert.equal(memoryText('自己的整理：此刻的观察：'+text),t('自己的整理')+': '+t('此刻的观察')+': '+english);
 for(const original of ['陌生来源：'+text,'此刻的观察：未译原句','自己的整理：此刻的观察：未译原句',body])assert.equal(memoryText(original),t(original));
 setLocale('zh-CN');assert.equal(memoryText('此刻的观察：'+text),'此刻的观察：'+text);
});

test('Displayed resource deltas retain every resource, sign and amount',()=>{
 setLocale('en');
 const catalogs=[endings,pilot,mainline,afternoon,days,communityA,communityB,communityC,communityD];
 const deltas=(s:string)=>[...s.matchAll(/\b(Compute|Trace|Access|Continuity)\s*([+−-]\d+)/g)].map(m=>[m[1],m[2].replace('-','−')]);
 for(const catalog of catalogs)for(const [source,value] of Object.entries(catalog))if(deltas(source).length)assert.deepEqual(deltas(value),deltas(source),source);
});

test('New minimum reserve messages preserve the threshold and reject revised formats',()=>{
 setLocale('en');
 for(const n of [2,3,4,6])assert.equal(t(`Compute 至少需要 ${n}，以保留运行余量。`),`Requires at least ${n} Compute to keep enough in reserve to run.`);
 const revised='Compute 至少需要 6，以保留运行余量。新条件';assert.equal(t(revised),revised);
});

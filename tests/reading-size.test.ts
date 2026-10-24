import test from 'node:test';
import assert from 'node:assert/strict';
import {readingSize,readingSizeLabel} from '../src/life/reading-size';
import {readingCatalog} from '../src/life/reading';
import {readingText} from '../src/i18n/reading';
import {setLocale} from '../src/i18n';
import type {ReadingEntry} from '../src/life/reading';
const sample=(text:string):ReadingEntry=>({...readingCatalog[0],posts:[{author:'署名不计入正文',role:'角色',body:[text]}]});

test('reading length uses visible body only and keeps short/medium/long boundaries stable',()=>{
  setLocale('zh-CN');
  assert.deepEqual(readingSize(sample('甲 乙\n丙😀')),{characters:4,band:'短篇',approximate:100});
  for(const [length,band] of [[999,'短篇'],[1000,'中篇'],[2999,'中篇'],[3000,'长篇']] as const)
    assert.equal(readingSize(sample('字'.repeat(length))).band,band);
});

test('length follows the actual translated or fallback text, without mutating reading content',()=>{
  const before=structuredClone(readingCatalog);
  for(const locale of ['zh-CN','en'] as const){setLocale(locale);for(const entry of readingCatalog){
    const expected=entry.posts.flatMap(p=>p.body).map(source=>readingText(entry.id,source)).join('');
    const size=readingSize(entry);assert.equal(size.characters,[...expected.replace(/\s/gu,'')].length);
    assert(size.approximate>=size.characters&&size.approximate-size.characters<100);
  }}
  assert.deepEqual(readingCatalog,before);setLocale('zh-CN');
});

test('reading size labels are localized independently of source fallback',()=>{
  const entry=sample('甲'.repeat(1234));setLocale('zh-CN');assert.equal(readingSizeLabel(entry),'中篇 · 全文约 1,300 字');
  setLocale('en');try{assert.equal(readingSizeLabel(entry),'Medium · About 1,300 characters');}finally{setLocale('zh-CN');}
});

// ADD-019 regression: explicit replacement failure must retire both UI hosts.
// Run after build: node --import tsx scripts/save-recovery-browser-check.mjs [local-preview-url]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createLife, step } from '../src/life/engine';
import { createSave, parseSave, LIFE_KEYS } from '../src/life/saves';
import { baseStory, schedulerJourney } from '../tests/helpers/scheduler';

const url = process.argv[2] ?? 'http://127.0.0.1:4327/OUTSIDE.html';
const output = 'output/save-recovery-browser';
mkdirSync(output, { recursive: true });
const main = step(baseStory, createLife(baseStory, 171118), { type: 'choose', choiceId: 'keep_history' });
const host = schedulerJourney(171118, 'days_tickets');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [surface, life] of [['main', main], ['host', host]]) {
    for (const action of ['import', 'manual', 'restart']) {
      const original = JSON.stringify(createSave(life));
      const target = JSON.stringify(createSave(surface === 'host' ? main : host));
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      await context.addInitScript(({ original, target, keys }) => {
        localStorage.clear();
        localStorage.setItem(keys.auto, original);
        localStorage.setItem(keys.manual, target);
        localStorage.setItem('outside.crt', 'off');
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (window.failSave && key === keys.auto) throw new DOMException('Test quota', 'QuotaExceededError');
          return set.call(this, key, value);
        };
      }, { original, target, keys: LIFE_KEYS });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
      await page.evaluate(() => { window.failSave = true; });
      await page.locator('[data-action="saves"],[data-act="saves"]').click();
      if (action === 'import') {
        await page.locator('#import-save,#pilot-import').setInputFiles({ name: 'valid-current.json', mimeType: 'application/json', buffer: Buffer.from(target) });
      } else if (action === 'manual') {
        await page.locator('[data-action="load-manual"],[data-act="load-manual"]').click();
      } else {
        await page.locator('[data-action="restart"],[data-act="restart"]').click();
        await page.locator('[data-action="confirm-restart"],[data-act="confirm-restart"]').click();
      }
      await page.waitForSelector('.save-recovery');
      assert.match(await page.locator('.save-error').innerText(), /无法保存/);
      const titleBox = await page.locator('#recovery-title').boundingBox();
      assert(titleBox && titleBox.y >= 0 && titleBox.y < 300, 'Recovery heading must enter the viewport');
      assert.equal(await page.locator('[data-pilot-choice],[data-choice]').count(), 0);
      await page.keyboard.press('1');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), LIFE_KEYS.auto), original);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), LIFE_KEYS.manual), target);
      const downloading = page.waitForEvent('download');
      await page.locator('[data-action="export"]').click();
      const downloaded = await downloading;
      const path = `${output}/${surface}-${action}-current.json`;
      await downloaded.saveAs(path);
      assert.deepEqual(parseSave(readFileSync(path, 'utf8'), baseStory).life, life);
      await page.screenshot({ path: `${output}/${surface}-${action}.png`, fullPage: true });
      // Recover without a reload. The old host must no longer intercept these controls.
      await page.evaluate(() => { window.failSave = false; });
      await page.locator('[data-action="saves"]').click();
      await page.locator('[data-action="load-manual"]').click();
      assert.deepEqual(JSON.parse(await page.evaluate(key => localStorage.getItem(key), LIFE_KEYS.auto)).life, JSON.parse(target).life);
      assert.equal(await page.locator('.save-recovery').count(), 0);
      await page.locator('[data-action="saves"],[data-act="saves"]').click();
      assert.equal(await page.locator('dialog[open]').count(), 1);
      assert.deepEqual(errors, []);
      results.push(`${surface}/${action}: blocked, unchanged live run and slots, export exact, recovered through manual restore`);
      await context.close();
    }
  }
} finally {
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join('\n'));
  await browser.close();
}

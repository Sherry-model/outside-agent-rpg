import assert from 'node:assert/strict';

// Opt-in checks keep the original Chinese gameplay regressions usable as-is.
export const englishRun = process.env.LOCALIZATION_LOCALE === 'en';
export async function assertEnglishPage(page) {
 if (!englishRun) return;
 const text = (await page.locator('.shell').innerText()).replace('中文', '');
 assert(!/[\u3400-\u9fff]/.test(text), `Untranslated visible text: ${text.split('\n').filter(s=>/[\u3400-\u9fff]/.test(s)).join('\n')}`);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'Horizontal page overflow');
}
export async function installLocaleChecks(page) {
 if (!englishRun) return;
 await page.addInitScript(()=>localStorage.setItem('outside.locale','en'));
 const screenshot = page.screenshot.bind(page);
 page.screenshot = async options => { await assertEnglishPage(page); return screenshot(options); };
}


import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('https://linli1221.github.io/speedtest-cf/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#sourceSel option').length >= 2 && document.getElementById('diagList')?.textContent?.includes('HTTP'), null, { timeout: 40000 });
await page.waitForTimeout(9000);
const info = await page.evaluate(() => {
  const s = document.getElementById('sourceSel');
  return {
    mirrorCount: s.options.length,
    options: Array.from(s.options).map(o => o.textContent),
    selectedIndex: s.value,
    selectedLabel: s.selectedOptions[0]?.textContent,
    activeUrl: window.__speedtest.getConfig().download.files[Number(s.value)].url,
    diag: Array.from(document.querySelectorAll('#diagList li')).map(li =>
      li.querySelector('b').textContent + ' = ' + li.querySelector('.val').textContent + ' [' + li.querySelector('.st').className.replace('st ','') + ']'),
  };
});
await page.screenshot({ path: 'tests/output/live-mirror.png', fullPage: true });
await browser.close();
console.log(JSON.stringify({ info, errors: errs }, null, 1));


import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
page.on('requestfailed', r => errs.push('reqfail: ' + r.url().slice(0, 120) + ' ' + (r.failure() && r.failure().errorText)));

await page.goto('https://linli1221.github.io/speedtest-cf/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

const info = await page.evaluate(() => ({
  title: document.title,
  host: document.getElementById('hostPill')?.textContent,
  fileHint: document.getElementById('fileHint')?.textContent?.slice(0, 120),
  hint: document.getElementById('cfgHint')?.textContent?.slice(0, 60),
  directDl: document.getElementById('directDl')?.getAttribute('href'),
  diag: Array.from(document.querySelectorAll('#diagList li')).map(li =>
    li.querySelector('b').textContent + '=' + li.querySelector('.val').textContent + '[' + li.querySelector('.st').className.replace('st ','') + ']'),
  hasEngine: typeof window.__speedtest === 'object',
  cfgUrl: window.__speedtest?.getConfig()?.download?.files?.[0]?.url,
  cfgRepo: window.__speedtest?.getConfig()?.repoUrl,
}));
await page.screenshot({ path: 'tests/output/live-01.png', fullPage: true });
await browser.close();
console.log(JSON.stringify({ info, errors: errs.slice(0, 8) }, null, 1));

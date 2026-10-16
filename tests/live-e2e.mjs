
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.goto('https://linli1221.github.io/speedtest-cf/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('diagList')?.textContent?.includes('HTTP 200') || document.getElementById('diagList')?.textContent?.includes('206'), null, { timeout: 40000 });
const diag = await page.evaluate(() => Array.from(document.querySelectorAll('#diagList li')).map(li =>
  li.querySelector('b').textContent + ' = ' + li.querySelector('.val').textContent + '  [' + li.querySelector('.st').className.replace('st ','') + ']'));
const t0 = Date.now();
await page.click('#startBtn');
await page.waitForFunction(() => document.getElementById('phaseText')?.textContent?.includes('完成'), null, { timeout: 180000 });
const secs = (Date.now() - t0) / 1000;
const r = await page.evaluate(() => {
  const g = id => document.getElementById(id)?.textContent.trim();
  return { dl: g('mDownload'), dlSub: g('mDownloadSub'), ul: g('mUpload'), ulSub: g('mUploadSub'),
           ping: g('mPing'), pingSub: g('mPingSub'), jitter: g('mJitter'), loaded: g('mLoaded'),
           loadedSub: g('mLoadedSub'), pts: window.__speedtest.state.series.dl.length,
           rows: document.querySelectorAll('#histBody tr').length };
});
await page.screenshot({ path: 'tests/output/live-final.png', fullPage: true });
await browser.close();
console.log(JSON.stringify({ diag, secs: +secs.toFixed(1), r, errors: errs.slice(0,6) }, null, 1));
#!/usr/bin/env node
/* ============================================================================
 * 端到端验证：用已安装的 Edge/Chrome 打开本地站点，跑一次完整测速并断言结果。
 * 不需要下载 Playwright 自带浏览器（使用 channel: msedge / chrome）。
 *
 * 用法: node tests/e2e.mjs
 * ==========================================================================*/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = parseInt(process.env.E2E_PORT || '8788', 10);
const BASE = 'http://127.0.0.1:' + PORT;
const SIZE = 256 * 1024 * 1024;
const OUT_DIR = path.resolve('tests', 'output');
fs.mkdirSync(OUT_DIR, { recursive: true });

const LOCAL_CONFIG = {
  siteName: 'Speedtest',
  repoUrl: 'https://github.com/USER/speedtest',
  download: {
    enabled: true,
    files: [
      { label: 'Local dev · 256 MB', url: BASE + '/speedtest-256mb.bin', sizeBytes: SIZE }
    ],
    durationSec: 8,
    connections: 6,
    chunkBytes: 4194304
  },
  upload: {
    enabled: true,
    url: BASE + '/upload',
    token: '',
    durationSec: 5,
    connections: 3,
    chunkBytes: 2097152
  },
  latency: { samples: 6, loadedSamples: 6, intervalMs: 400, probeUrl: BASE + '/ping.txt' },
  historyLimit: 20
};

function log() { console.log.apply(console, arguments); }

const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT), '--size', String(SIZE)], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});

function waitForServer() {
  return new Promise(function (resolve, reject) {
    const to = setTimeout(function () { reject(new Error('server did not start in 20s')); }, 20000);
    server.stdout.on('data', function (d) {
      const s = String(d);
      if (s.indexOf('speedtest local server') >= 0) { clearTimeout(to); setTimeout(resolve, 300); }
    });
    server.stderr.on('data', function (d) { process.stderr.write('[server] ' + d); });
    server.on('exit', function (c) { clearTimeout(to); reject(new Error('server exited early: ' + c)); });
  });
}

function pickChannel() {
  const env = process.env.E2E_CHANNEL;
  if (env) return env;
  return 'msedge';
}

async function main() {
  await waitForServer();
  log('[e2e] local server ready on ' + BASE);

  const channel = pickChannel();
  let browser;
  try {
    browser = await chromium.launch({ channel: channel, headless: true });
  } catch (e) {
    log('[e2e] channel ' + channel + ' failed (' + e.message + '), retrying with chrome');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 1500 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', function (e) { pageErrors.push(String(e)); });
  page.on('console', function (m) { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.route('**/config.json', function (route) {
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(LOCAL_CONFIG)
    });
  });

  log('[e2e] opening ' + BASE + '/');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  // 等自检完成
  await page.waitForFunction(function () {
    const list = document.getElementById('diagList');
    return list && list.textContent.indexOf('HTTP 200') >= 0;
  }, null, { timeout: 30000 });
  const diag = await page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('#diagList li'), function (li) {
      return li.querySelector('b').textContent + ' = ' + li.querySelector('.val').textContent +
        ' [' + li.querySelector('.st').className.replace('st ', '') + ']';
    });
  });
  log('[e2e] diagnostics:');
  diag.forEach(function (d) { log('        ' + d); });

  const uiSnapshot = function () {
    return page.evaluate(function () {
      function shown(sel) {
        const e = document.querySelector(sel);
        return !!e && getComputedStyle(e).display !== 'none';
      }
      return { stop: shown('#stopBtn'), again: shown('#againBtn'), spinner: shown('#startBtn .btn-spinner') };
    });
  };
  const uiIdle = await uiSnapshot();
  log('[e2e] idle ui: stop=' + uiIdle.stop + ' again=' + uiIdle.again + ' spinner=' + uiIdle.spinner);

  await page.screenshot({ path: path.join(OUT_DIR, '01-idle.png'), fullPage: true });

  log('[e2e] starting speedtest...');
  const started = Date.now();
  await page.click('#startBtn');
  await page.waitForTimeout(700);
  const uiRunning = await uiSnapshot();
  log('[e2e] running ui: stop=' + uiRunning.stop + ' again=' + uiRunning.again + ' spinner=' + uiRunning.spinner);

  await page.waitForFunction(function () {
    const p = document.getElementById('phaseText');
    return p && (p.textContent.indexOf('完成') >= 0 || p.textContent.indexOf('complete') >= 0);
  }, null, { timeout: 120000 });

  const uiDone = await uiSnapshot();
  log('[e2e] done ui: stop=' + uiDone.stop + ' again=' + uiDone.again + ' spinner=' + uiDone.spinner);

  const elapsed = (Date.now() - started) / 1000;
  const res = await page.evaluate(function () {
    function txt(id) {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : null;
    }
    return {
      download: txt('mDownload'),
      downloadSub: txt('mDownloadSub'),
      upload: txt('mUpload'),
      uploadSub: txt('mUploadSub'),
      ping: txt('mPing'),
      pingSub: txt('mPingSub'),
      jitter: txt('mJitter'),
      loaded: txt('mLoaded'),
      loadedSub: txt('mLoadedSub'),
      phase: txt('phaseText'),
      historyRows: document.querySelectorAll('#histBody tr').length,
      chartPoints: window.__speedtest.state.series.dl.length,
      gaugeValue: txt('gaugeValue')
    };
  });

  log('[e2e] test finished in ' + elapsed.toFixed(1) + 's');
  log('[e2e] download   = ' + res.download + ' Mbps   (' + res.downloadSub + ')');
  log('[e2e] upload     = ' + res.upload + ' Mbps   (' + res.uploadSub + ')');
  log('[e2e] ping       = ' + res.ping + ' ms     (' + res.pingSub + ')');
  log('[e2e] jitter     = ' + res.jitter + ' ms');
  log('[e2e] loaded     = ' + res.loaded + ' ms     (' + res.loadedSub + ')');
  log('[e2e] chart pts  = ' + res.chartPoints + ', history rows = ' + res.historyRows);

  await page.screenshot({ path: path.join(OUT_DIR, '02-result.png'), fullPage: true });

  // 再跑一次，验证历史记录与会话状态机
  await page.click('#againBtn');
  await page.waitForFunction(function () {
    const p = document.getElementById('phaseText');
    return p && (p.textContent.indexOf('完成') >= 0);
  }, null, { timeout: 120000 });
  const rows2 = await page.evaluate(function () { return document.querySelectorAll('#histBody tr').length; });
  log('[e2e] second run history rows = ' + rows2);
  await page.screenshot({ path: path.join(OUT_DIR, '03-second-run.png'), fullPage: true });

  // range 支持验证（直接对本地服务器）
  const rangeCheck = await page.evaluate(async function () {
    const url = 'http://127.0.0.1:' + location.port + '/speedtest-256mb.bin';
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023' }, cache: 'no-store' });
    const buf = await r.arrayBuffer();
    return { status: r.status, len: buf.byteLength, cr: r.headers.get('content-range') };
  });
  log('[e2e] range check = HTTP ' + rangeCheck.status + ', ' + rangeCheck.len + ' bytes, ' + rangeCheck.cr);

  await browser.close();

  const failures = [];
  if (!(parseFloat(res.download) > 20)) failures.push('download speed too low: ' + res.download);
  if (res.chartPoints < 8) failures.push('not enough chart samples: ' + res.chartPoints);
  if (res.historyRows < 1) failures.push('no history row written');
  if (!(parseFloat(res.upload) > 20)) failures.push('upload speed missing/too low: ' + res.upload);
  if (rows2 < 2) failures.push('second run did not append history');
  if (rangeCheck.status !== 206 || rangeCheck.len !== 1024) failures.push('range request broken');
  if (uiIdle.stop || uiIdle.again || uiIdle.spinner) failures.push('idle button state wrong: ' + JSON.stringify(uiIdle));
  if (!uiRunning.stop || !uiRunning.spinner) failures.push('running button state wrong: ' + JSON.stringify(uiRunning));
  if (uiDone.stop || !uiDone.again || uiDone.spinner) failures.push('done button state wrong: ' + JSON.stringify(uiDone));
  if (pageErrors.length) failures.push('page errors: ' + pageErrors.join(' | '));
  if (consoleErrors.length) failures.push('console errors: ' + consoleErrors.join(' | '));

  log('');
  if (failures.length) {
    log('[e2e] FAILED');
    failures.forEach(function (f) { log('   - ' + f); });
    return 1;
  }
  log('[e2e] PASSED — 截图见 tests/output/');
  return 0;
}

let code = 1;
try {
  code = await main();
} catch (e) {
  console.error('[e2e] ERROR: ' + (e && e.stack ? e.stack : e));
  code = 1;
} finally {
  try { server.kill(); } catch (e) {}
}
process.exit(code);

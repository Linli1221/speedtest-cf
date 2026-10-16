#!/usr/bin/env node
/* ============================================================================
 * Cloudflare R2 一键配置：建桶 -> 上传 >200MB 测试文件 -> 设置 CORS -> 开公共访问
 * 需要：已登录的 wrangler（npx wrangler login）或环境变量 CLOUDFLARE_API_TOKEN
 *
 * 用法:
 *   node scripts/r2-setup.mjs
 *   node scripts/r2-setup.mjs --domain speed.example.com --zone-id <ZONE_ID>
 *   node scripts/r2-setup.mjs --bucket my-bucket --file public/speedtest-256mb.bin
 * ==========================================================================*/
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0) return argv[i + 1];
  return def;
}
function has(name) { return argv.indexOf('--' + name) >= 0; }

const BUCKET = arg('bucket', 'speedtest-files');
const FILE = path.resolve(arg('file', path.join('public', 'speedtest-256mb.bin')));
const KEY = arg('key', path.basename(FILE));
const DOMAIN = arg('domain', '');
const ZONE = arg('zone-id', '');
const WRANGLER = 'npx --yes ' + arg('wrangler', 'wrangler');
const ROOT = process.cwd();

function q(s) { return '"' + String(s).replace(/"/g, '') + '"'; }

function run(line, allowFail) {
  console.log('');
  console.log('> ' + line);
  const r = spawnSync(line, { stdio: 'inherit', shell: true });
  if (r.status !== 0 && !allowFail) {
    console.error('command failed (exit ' + r.status + '): ' + line);
    process.exit(1);
  }
  return r.status === 0;
}
function capture(line) {
  const r = spawnSync(line, { shell: true, encoding: 'utf8' });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

/* ---------------------------------------------------------------- 前置检查 */
if (!fs.existsSync(FILE)) {
  console.error('找不到测试文件: ' + FILE);
  console.error('先运行: node scripts/make-testfile.mjs --size 256');
  process.exit(1);
}
const size = fs.statSync(FILE).size;
const mib = size / 1048576;
if (mib <= 200) {
  console.error('测试文件只有 ' + mib.toFixed(1) + ' MiB，需要 > 200 MiB');
  process.exit(1);
}
console.log('测试文件: ' + FILE + '  (' + mib.toFixed(1) + ' MiB)');

const who = capture(WRANGLER + ' whoami');
if (who.code !== 0 || /not authenticated|You are not authenticated/i.test(who.out)) {
  console.warn('');
  console.warn('!! 似乎还没登录 Cloudflare。先执行: npx wrangler login');
  console.warn('!! 或设置环境变量 CLOUDFLARE_API_TOKEN');
  console.warn('');
}

/* ---------------------------------------------------------------- 1. 建桶 */
run(WRANGLER + ' r2 bucket create ' + q(BUCKET), true);

/* ---------------------------------------------------------------- 2. 上传大文件 */
run(WRANGLER + ' r2 object put ' + q(BUCKET + '/' + KEY) +
    ' --file ' + q(FILE) + ' --content-type application/octet-stream --cache-control "public, max-age=3600"');

/* ---------------------------------------------------------------- 3. 上传探测小文件 */
const pingTmp = path.join(os.tmpdir(), 'speedtest-ping.txt');
fs.writeFileSync(pingTmp, 'speedtest-ping-probe\n');
run(WRANGLER + ' r2 object put ' + q(BUCKET + '/ping.txt') +
    ' --file ' + q(pingTmp) + ' --content-type text/plain --cache-control "no-store"');

/* ---------------------------------------------------------------- 4. CORS */
const corsFile = path.join(ROOT, 'cloudflare', 'r2-cors.json');
if (fs.existsSync(corsFile)) {
  run(WRANGLER + ' r2 bucket cors set ' + q(BUCKET) + ' --file ' + q(corsFile), true);
} else {
  console.warn('未找到 cloudflare/r2-cors.json，跳过 CORS 设置');
}

/* ---------------------------------------------------------------- 5. 公共访问 */
let base = '';
if (DOMAIN) {
  const line = WRANGLER + ' r2 bucket domain add ' + q(BUCKET) + ' --domain ' + q(DOMAIN) +
    (ZONE ? ' --zone-id ' + q(ZONE) : '');
  run(line, true);
  base = 'https://' + DOMAIN;
} else {
  const r = capture(WRANGLER + ' r2 bucket dev-url enable ' + q(BUCKET));
  console.log(r.out);
  const m = r.out.split(/\s+/).find(function (s) { return s.indexOf('.r2.dev') > 0; });
  if (m) base = m.indexOf('http') === 0 ? m : 'https://' + m.replace(/^\/*/, '');
  if (!base) {
    const g = capture(WRANGLER + ' r2 bucket dev-url get ' + q(BUCKET));
    console.log(g.out);
    const m2 = g.out.split(/\s+/).find(function (s) { return s.indexOf('.r2.dev') > 0; });
    if (m2) base = m2.indexOf('http') === 0 ? m2 : 'https://' + m2.replace(/^\/*/, '');
  }
}

if (!base || base === 'https://') {
  console.warn('');
  console.warn('未能自动拿到公共访问地址。请在 Cloudflare 控制台为桶 ' + BUCKET + ' 开启 Public Access，');
  console.warn('或绑定自定义域名后，手动把地址填进 config.json。');
  process.exit(2);
}

/* ---------------------------------------------------------------- 6. 回填 config.json */
const fileUrl = base.replace(/\/+$/, '') + '/' + KEY;
const pingUrl = base.replace(/\/+$/, '') + '/ping.txt';
console.log('');
console.log('公共地址 : ' + base);
console.log('测试文件 : ' + fileUrl);
console.log('延迟探针 : ' + pingUrl);

const cfgPath = path.join(ROOT, 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (!cfg.download) cfg.download = {};
if (!Array.isArray(cfg.download.files) || !cfg.download.files.length) cfg.download.files = [{}];
cfg.download.files[0].url = fileUrl;
cfg.download.files[0].sizeBytes = size;
cfg.download.files[0].label = 'Cloudflare R2 · ' + Math.round(mib) + ' MB';
if (!cfg.latency) cfg.latency = {};
cfg.latency.probeUrl = pingUrl;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('已更新 config.json');
console.log('');
console.log('提示: 用 r2.dev 地址会有速率限制，正式使用建议绑定自定义域名。');

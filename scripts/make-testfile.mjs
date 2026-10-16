#!/usr/bin/env node
/* ============================================================================
 * 生成 >200MB 的不可压缩测试文件（默认 256MB）。
 * 用于上传到 Cloudflare R2 公共桶。
 *
 * 用法:
 *   node scripts/make-testfile.mjs
 *   node scripts/make-testfile.mjs --size 256 --out public/speedtest-256mb.bin
 *   node scripts/make-testfile.mjs --size 300 --out public/speedtest-300mb.bin
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0) return argv[i + 1];
  return def;
}

const mb = parseFloat(arg('size', '256'));
const out = path.resolve(arg('out', path.join('public', 'speedtest-' + Math.round(mb) + 'mb.bin')));
const total = Math.round(mb * 1024 * 1024);
const CHUNK = 4 * 1024 * 1024;

fs.mkdirSync(path.dirname(out), { recursive: true });

const ws = fs.createWriteStream(out + '.part');
const hash = crypto.createHash('sha256');
let written = 0;
const started = Date.now();

function step() {
  while (written < total) {
    const n = Math.min(CHUNK, total - written);
    const buf = crypto.randomBytes(n);
    written += n;
    hash.update(buf);
    if (!ws.write(buf)) { ws.once('drain', step); return; }
  }
  ws.end();
}

ws.on('finish', function () {
  fs.renameSync(out + '.part', out);
  const secs = (Date.now() - started) / 1000;
  const st = fs.statSync(out);
  console.log('created : ' + out);
  console.log('size    : ' + st.size + ' bytes (' + (st.size / 1048576).toFixed(2) + ' MiB)');
  console.log('sha256  : ' + hash.digest('hex'));
  console.log('elapsed : ' + secs.toFixed(2) + 's');
  console.log('');
  console.log('下一步: node scripts/r2-setup.mjs --file "' + out + '"');
});

ws.on('error', function (e) { console.error('write failed: ' + e.message); process.exit(1); });
step();

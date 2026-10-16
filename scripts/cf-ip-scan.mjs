#!/usr/bin/env node
/* ============================================================================
 * Cloudflare 边缘 IP 优选扫描
 *
 * Cloudflare 是任播(anycast)：任意一个边缘 IP 都能服务你的域名。
 * 免费版 DNS 固定返回两个共享 IP，这两个 IP 在某些网络下会被限速/阻断，
 * 而别的 CF 边缘 IP 可能快几十倍。本脚本用 --resolve 等价的方式逐个实测。
 *
 * 用法:
 *   node scripts/cf-ip-scan.mjs --host speedtest.linli.eu.org
 *   node scripts/cf-ip-scan.mjs --host dl.example.com --bytes 8388608 --top 5
 *   node scripts/cf-ip-scan.mjs --host dl.example.com --ips 104.27.0.1,104.17.0.1
 *
 * 输出可直接用于 hosts / 路由器 DNS / 灰云 A 记录。
 * ==========================================================================*/
import https from 'node:https';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0) return argv[i + 1];
  return def;
}

const HOST = arg('host', '');
const BYTES = parseInt(arg('bytes', '4194304'), 10);
const PATHNAME = arg('path', '/ping.txt');
const BIGPATH = arg('big', '');
const TOP = parseInt(arg('top', '8'), 10);
const CONC = parseInt(arg('conc', '6'), 10);

if (!HOST) {
  console.error('必须指定 --host，例如: node scripts/cf-ip-scan.mjs --host speedtest.linli.eu.org');
  process.exit(1);
}

// Cloudflare 公开任播网段里的代表性地址
const DEFAULT_IPS = [
  '104.16.132.229', '104.17.0.1', '104.18.0.1', '104.19.0.1', '104.20.0.1',
  '104.21.0.1', '104.21.84.16', '104.22.0.1', '104.23.0.1', '104.24.0.1',
  '104.25.0.1', '104.26.0.1', '104.27.0.1', '104.28.0.1',
  '172.64.0.1', '172.65.0.1', '172.66.0.1', '172.67.0.1', '172.68.0.1', '172.69.0.1', '172.70.0.1',
  '162.159.36.1', '188.114.96.1', '188.114.97.1', '198.41.128.1', '141.101.64.1', '108.162.192.1',
];

const IPS = arg('ips', '') ? arg('ips').split(',').map(function (s) { return s.trim(); }).filter(Boolean) : DEFAULT_IPS;

function request(ip, path, range, timeoutMs) {
  return new Promise(function (resolve) {
    const started = Date.now();
    let firstByteAt = null, bytes = 0, settled = false;
    const finish = function (out) {
      if (settled) return;
      settled = true;
      try { req.destroy(); } catch (e) {}
      resolve(out);
    };
    const req = https.request({
      hostname: HOST,
      port: 443,
      path: path,
      method: 'GET',
      servername: HOST,
      headers: range ? { Range: range } : {},
      lookup: function (h, opts, cb) {
        if (opts && opts.all) cb(null, [{ address: ip, family: 4 }]);
        else cb(null, ip, 4);
      },
    }, function (res) {
      const code = res.statusCode;
      res.on('data', function (c) {
        if (firstByteAt === null) firstByteAt = Date.now();
        bytes += c.length;
      });
      res.on('end', function () {
        const ms = Date.now() - started;
        finish({ ip: ip, code: code, bytes: bytes, ms: ms, ttfb: firstByteAt ? firstByteAt - started : ms });
      });
      res.on('error', function () { finish({ ip: ip, code: code, bytes: bytes, ms: Date.now() - started, ttfb: NaN }); });
    });
    req.setTimeout(timeoutMs, function () { finish({ ip: ip, code: 0, bytes: bytes, ms: Date.now() - started, ttfb: NaN, timeout: true }); });
    req.on('error', function (e) { finish({ ip: ip, code: 0, bytes: bytes, ms: Date.now() - started, ttfb: NaN, err: e.code || e.message }); });
    req.end();
  });
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

function mbps(bytes, ms) { return ms > 0 ? (bytes * 8 / (ms / 1000) / 1e6) : 0; }
function human(mbpsV) { return mbpsV >= 1000 ? mbpsV.toFixed(0) : mbpsV.toFixed(1); }

console.log('host   : ' + HOST);
console.log('stage 1: reachability + TTFB (' + IPS.length + ' IPs, path ' + PATHNAME + ')');
console.log('');

const probe = await pool(IPS, CONC, function (ip) { return request(ip, PATHNAME + '?cb=' + Date.now(), 'bytes=0-1023', 6000); });
const alive = probe.filter(function (r) { return r.code === 200 || r.code === 206; })
  .sort(function (a, b) { return a.ttfb - b.ttfb; });
const dead = probe.filter(function (r) { return r.code !== 200 && r.code !== 206; });

alive.forEach(function (r) { console.log('  ok   ' + r.ip.padEnd(17) + ' ttfb ' + String(r.ttfb).padStart(5) + ' ms  [' + r.code + ']'); });
dead.forEach(function (r) { console.log('  dead ' + r.ip.padEnd(17) + ' ' + (r.err || r.code)); });

if (!alive.length) { console.log('没有任何 IP 可达'); process.exit(1); }

if (BIGPATH) {
  const top = alive.slice(0, TOP);
  console.log('');
  console.log('stage 2: throughput over ' + (BYTES / 1048576).toFixed(1) + ' MiB (sequential, top ' + top.length + ')');
  console.log('');
  const speeds = [];
  for (const t of top) {
    const r = await request(t.ip, BIGPATH, 'bytes=0-' + (BYTES - 1), 30000);
    const v = r.bytes >= BYTES ? mbps(r.bytes, r.ms) : 0;
    speeds.push({ ip: t.ip, mbps: v, bytes: r.bytes, ms: r.ms, complete: r.bytes >= BYTES });
    console.log('  ' + t.ip.padEnd(17) + (r.bytes / 1048576).toFixed(1) + ' MiB in ' + (r.ms / 1000).toFixed(1) + 's = ' + human(v) + ' Mbps' + (r.bytes >= BYTES ? '' : '  (incomplete)'));
  }
  speeds.sort(function (a, b) { return b.mbps - a.mbps; });
  console.log('');
  console.log('ranked:');
  speeds.forEach(function (s, i) { console.log('  ' + (i + 1) + '. ' + s.ip + '  ' + human(s.mbps) + ' Mbps'); });
  console.log('');
  console.log('hosts 写法 (只对本机生效):');
  console.log('  ' + speeds[0].ip + ' ' + HOST);
  console.log('');
  console.log('灰云 A 记录 (对所有访客生效, 需先把该主机名从 R2 自定义域/橙云代理中解绑):');
  speeds.slice(0, 3).forEach(function (s) { console.log('  A ' + HOST + ' -> ' + s.ip); });
} else {
  console.log('');
  console.log('提示: 加 --big /speedtest-256mb.bin 可以测真实吞吐（TTFB 快不等于吞吐高）。');
}

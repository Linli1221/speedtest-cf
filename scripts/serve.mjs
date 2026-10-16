#!/usr/bin/env node
/* ============================================================================
 * 本地开发服务器 —— 在本地 1:1 复刻 Cloudflare R2 公共桶的行为，用于离线验证：
 *   /speedtest-256mb.bin   >200MB 不可压缩二进制，支持 HTTP Range + CORS
 *   /ping.txt              1KB 小文件，用于延迟测量
 *   POST /upload           吞掉上传数据并返回 JSON，用于上传测速
 *   其余路径               静态文件（站点本身）
 *
 * 用法:
 *   node scripts/serve.mjs                       # 生成流式大文件
 *   node scripts/serve.mjs --file public/speedtest-256mb.bin
 *   node scripts/serve.mjs --size 268435456 --port 8080
 * ==========================================================================*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0) return argv[i + 1];
  return def;
}
const PORT = parseInt(arg('port', '8788'), 10);
const ROOT = path.resolve(arg('root', process.cwd()));
const SIZE = parseInt(arg('size', String(256 * 1024 * 1024)), 10);
const FILE = arg('file', '');
const BIG_NAME = arg('name', 'speedtest-256mb.bin');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.map': 'application/json; charset=utf-8'
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag, Date');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Timing-Allow-Origin', '*');
}

function parseRange(header, size) {
  if (!header) return null;
  if (header.indexOf('bytes=') !== 0) return null;
  const spec = header.slice(6).trim();
  if (spec.indexOf(',') >= 0) return null;
  const dash = spec.indexOf('-');
  if (dash < 0) return null;
  const a = spec.slice(0, dash).trim();
  const b = spec.slice(dash + 1).trim();
  let start, end;
  if (a === '') {
    const suffix = parseInt(b, 10);
    if (!isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(a, 10);
    end = b === '' ? size - 1 : parseInt(b, 10);
  }
  if (!isFinite(start) || !isFinite(end)) return null;
  if (start >= size) return { unsatisfiable: true };
  end = Math.min(end, size - 1);
  if (end < start) return { unsatisfiable: true };
  return { start: start, end: end };
}

const BLOCK = 1 << 20;
let cachedBlock = null;
function block() {
  if (!cachedBlock) cachedBlock = crypto.randomBytes(BLOCK);
  return cachedBlock;
}

function streamGenerated(res, size, start, end) {
  let remaining = end - start + 1;
  let off = start % BLOCK;
  function pump() {
    while (remaining > 0) {
      const take = Math.min(BLOCK - off, remaining);
      const buf = block().subarray(off, off + take);
      remaining -= take;
      off = 0;
      if (!res.write(buf)) { res.once('drain', pump); return; }
    }
    res.end();
  }
  pump();
}

function serveBig(req, res) {
  cors(res);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('ETag', '"local-big-file"');
  const useFile = FILE && fs.existsSync(FILE);
  const size = useFile ? fs.statSync(FILE).size : SIZE;
  const r = parseRange(req.headers.range, size);
  if (r && r.unsatisfiable) {
    res.statusCode = 416;
    res.setHeader('Content-Range', 'bytes */' + size);
    return res.end();
  }
  const start = r ? r.start : 0;
  const end = r ? r.end : size - 1;
  const len = end - start + 1;
  if (r) {
    res.statusCode = 206;
    res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  } else {
    res.statusCode = 200;
  }
  res.setHeader('Content-Length', String(len));
  if (req.method === 'HEAD') return res.end();
  if (useFile) {
    const s = fs.createReadStream(FILE, { start: start, end: end });
    s.on('error', function () { try { res.destroy(); } catch (e) {} });
    return s.pipe(res);
  }
  return streamGenerated(res, size, start, end);
}

function readBody(req) {
  return new Promise(function (resolve) {
    let n = 0;
    req.on('data', function (c) { n += c.length; });
    req.on('end', function () { resolve(n); });
    req.on('error', function () { resolve(n); });
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.resolve(ROOT, '.' + rel);
  if (target.indexOf(ROOT) !== 0) { res.statusCode = 403; return res.end('forbidden'); }
  fs.stat(target, function (err, st) {
    if (err || !st.isFile()) {
      const custom = path.join(ROOT, '404.html');
      if (fs.existsSync(custom) && fs.existsSync(custom)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        cors(res);
        return fs.createReadStream(custom).pipe(res);
      }
      res.statusCode = 404;
      return res.end('not found');
    }
    cors(res);
    res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', String(st.size));
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(function (req, res) {
  const pathname = (req.url || '/').split('?')[0];

  if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }

  if (pathname === '/' + BIG_NAME || pathname === '/bigfile.bin') return serveBig(req, res);

  if (pathname === '/ping.txt') {
    cors(res);
    const body = 'speedtest-ping-probe';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Length', String(Buffer.byteLength(body)));
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  }

  if (pathname === '/upload') {
    cors(res);
    res.setHeader('Cache-Control', 'no-store');
    readBody(req).then(function (n) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, received: n }));
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end('method not allowed'); }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, function () {
  const base = 'http://127.0.0.1:' + PORT;
  console.log('speedtest local server');
  console.log('  site     : ' + base + '/');
  console.log('  big file : ' + base + '/' + BIG_NAME + '  (' + SIZE + ' bytes' + (FILE ? ', from ' + FILE : ', generated') + ')');
  console.log('  ping     : ' + base + '/ping.txt');
  console.log('  upload   : POST ' + base + '/upload');
});

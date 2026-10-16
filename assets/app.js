/* ============================================================================
 * Speedtest — 纯前端多线程测速引擎
 * 站点: GitHub Pages   测速文件: Cloudflare R2 (>200MB, 支持 Range + CORS)
 * 无第三方依赖, 无构建步骤。
 * ==========================================================================*/
(function () {
  'use strict';

  /* ------------------------------------------------------------------ 默认配置 */
  var DEFAULTS = {
    siteName: 'Speedtest',
    repoUrl: 'https://github.com/USER/speedtest',
    download: {
      enabled: true,
      files: [
        {
          label: 'Cloudflare R2 · 256 MB',
          url: 'https://speedtest.example.com/speedtest-256mb.bin',
          sizeBytes: 268435456
        }
      ],
      durationSec: 10,
      connections: 6,
      chunkBytes: 8388608
    },
    upload: {
      enabled: false,
      url: '',
      token: '',
      durationSec: 8,
      connections: 3,
      chunkBytes: 4194304
    },
    latency: { samples: 10, loadedSamples: 8, intervalMs: 450, probeUrl: '' },
    historyLimit: 20
  };

  /* ------------------------------------------------------------------ i18n */
  var I18N = {
    zh: {
      'm.download': '下载', 'm.upload': '上传', 'm.uploadOff': '未启用', 'm.ping': '延迟',
      'm.jitter': '抖动', 'm.loaded': '负载延迟', 'chart.title': '实时速率',
      'panel.target': '测速目标', 'panel.source': '测速文件', 'panel.duration': '测试时长',
      'panel.conns': '并发连接数', 'panel.uploadTest': '包含上传测试', 'panel.loadedTest': '测量负载延迟',
      'diag.title': '资源自检', 'diag.run': '重新检测',
      'dl.button': '直接下载测试文件', 'dl.copy': '复制直链',
      'hist.title': '历史记录', 'hist.clear': '清空', 'hist.time': '时间',
      'hist.source': '来源', 'hist.empty': '暂无记录', 'note.title': '说明',
      'note.1': '测速文件是 Cloudflare R2 上的 256MB 随机二进制文件，支持 HTTP Range 与 CORS，可直链下载。',
      'note.2': '本页用多路并发 Range 请求拉取数据统计真实吞吐，测速期间禁用 HTTP 缓存，避免命中缓存导致虚高。',
      'note.3': '上传测速需要部署仓库内的 Cloudflare Worker：见 workers/speedtest-upload 与 README。',
      'note.4': '结果存在约 ±5% 波动，受 Wi-Fi、代理、VPN 与设备性能影响；建议多次测量取中位数。',
      start: '开始测速', stop: '停止', again: '再测一次', running: '测速中',
      phaseIdle: '准备就绪', phasePing: '测量延迟…', phasePingLoaded: '测量负载延迟…',
      phaseDownload: '下载测速中…', phaseUpload: '上传测速中…', phaseDone: '完成', phaseStopped: '已停止',
      srcNone: '未配置测速文件', copying: '已复制直链', copyFail: '复制失败，请手动复制',
      needConfig: '请先在 config.json 中配置测速文件地址',
      stopped: '已停止', done: '测速完成', single: '单连接', multi: '多连接',
      histClear: '历史记录已清空', dur: '时长', conn: '连接', progress: '已下载',
      diagUrl: '直链可访问', diagCors: 'CORS 允许跨域', diagRange: '支持 Range 分片',
      diagSize: '文件大小', diagTtfb: '首字节', diagRunning: '检测中…', diagFail: '检测失败',
      statusOk: '正常', statusBad: '异常', reqFail: '请求失败'
    },
    en: {
      'm.download': 'Download', 'm.upload': 'Upload', 'm.uploadOff': 'disabled', 'm.ping': 'Ping',
      'm.jitter': 'Jitter', 'm.loaded': 'Loaded ping', 'chart.title': 'Throughput',
      'panel.target': 'Test target', 'panel.source': 'Test file', 'panel.duration': 'Duration',
      'panel.conns': 'Parallel connections', 'panel.uploadTest': 'Include upload test',
      'panel.loadedTest': 'Measure loaded ping',
      'diag.title': 'Resource check', 'diag.run': 'Re-check',
      'dl.button': 'Download test file', 'dl.copy': 'Copy direct link',
      'hist.title': 'History', 'hist.clear': 'Clear', 'hist.time': 'Time',
      'hist.source': 'Source', 'hist.empty': 'No results yet', 'note.title': 'Notes',
      'note.1': 'The test file is a 256MB random binary blob on Cloudflare R2 with HTTP Range and CORS enabled.',
      'note.2': 'Downloads use multiple parallel Range requests with HTTP caching disabled, so results are not inflated by caches.',
      'note.3': 'Upload speed requires the bundled Cloudflare Worker: see workers/speedtest-upload and the README.',
      'note.4': 'Expect about +/-5% variance from Wi-Fi, VPN, proxies and CPU. Run several times and take the median.',
      start: 'Start test', stop: 'Stop', again: 'Test again', running: 'Testing',
      phaseIdle: 'Ready', phasePing: 'Measuring latency...', phasePingLoaded: 'Loaded latency...',
      phaseDownload: 'Testing download...', phaseUpload: 'Testing upload...', phaseDone: 'Done', phaseStopped: 'Stopped',
      srcNone: 'No test file configured', copying: 'Link copied', copyFail: 'Copy failed',
      needConfig: 'Configure a test file URL in config.json first',
      stopped: 'Stopped', done: 'Test complete', single: 'single', multi: 'multi',
      histClear: 'History cleared', dur: 'duration', conn: 'conn', progress: 'received',
      diagUrl: 'Direct link reachable', diagCors: 'CORS allowed', diagRange: 'Range supported',
      diagSize: 'File size', diagTtfb: 'TTFB', diagRunning: 'checking...', diagFail: 'failed',
      statusOk: 'ok', statusBad: 'error', reqFail: 'request failed'
    }
  };

  var lang = 'zh';
  function t(key) {
    var pack = I18N[lang] || I18N.zh;
    if (Object.prototype.hasOwnProperty.call(pack, key)) return pack[key];
    if (Object.prototype.hasOwnProperty.call(I18N.zh, key)) return I18N.zh[key];
    return key;
  }

  /* ------------------------------------------------------------------ 工具函数 */
  function byId(id) { return document.getElementById(id); }
  function now() { return performance.now(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function deepMerge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k) {
      if (isObj(base[k]) && isObj(over[k])) out[k] = deepMerge(base[k], over[k]);
      else if (over[k] !== undefined && over[k] !== null) out[k] = over[k];
    });
    return out;
  }

  function withParam(url, key, value) {
    return url + (url.indexOf('?') === -1 ? '?' : '&') +
      encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }

  function randToken() {
    var a = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    var s = '';
    for (var j = 0; j < a.length; j++) s += (a[j] + 256).toString(16).slice(1);
    return s;
  }

  function fmtSpeed(mbps) {
    if (!isFinite(mbps) || mbps < 0) return '—';
    if (mbps === 0) return '0';
    if (mbps >= 1000) return mbps.toFixed(0);
    if (mbps >= 100) return mbps.toFixed(1);
    if (mbps >= 10) return mbps.toFixed(2);
    return mbps.toFixed(3);
  }
  function fmtAxis(v) {
    if (!isFinite(v)) return '0';
    if (v === 0) return '0';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'G';
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(0);
    return v.toFixed(1);
  }
  function fmtMs(ms) {
    if (!isFinite(ms) || ms < 0) return '—';
    if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
    if (ms >= 100) return ms.toFixed(0);
    return ms.toFixed(1);
  }
  function fmtBytes(b) {
    if (!isFinite(b) || b < 0) return '—';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(b < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
  }
  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return url; }
  }

  /* ------------------------------------------------------------------ 状态 */
  var CFG = DEFAULTS;
  var state = {
    running: false,
    abort: null,
    series: { dl: [], ul: [] },
    pingPts: [],
    testStart: 0,
    currentFile: null,
    lastResult: null,
    hasRun: false,
    maxGauge: 1000
  };

  /* ------------------------------------------------------------------ 表盘 */
  var ARC_LEN = Math.PI * 130; // 半圆半径 130
  var TICKS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

  function speedRatio(mbps, max) {
    var floor = 0.5;
    var v = Math.max(mbps, 0);
    if (v <= floor) return 0;
    var r = Math.log10(v / floor) / Math.log10(max / floor);
    return clamp(r, 0, 1);
  }

  function buildTicks() {
    var g = byId('gaugeTicks');
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    var max = state.maxGauge;
    TICKS.forEach(function (v) {
      if (v > max) return;
      var ratio = speedRatio(v, max);
      var rad = (180 - ratio * 180) * Math.PI / 180;
      var x1 = 160 + Math.cos(rad) * 138, y1 = 160 - Math.sin(rad) * 138;
      var x2 = 160 + Math.cos(rad) * 152, y2 = 160 - Math.sin(rad) * 152;
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1.toFixed(1)); ln.setAttribute('y1', y1.toFixed(1));
      ln.setAttribute('x2', x2.toFixed(1)); ln.setAttribute('y2', y2.toFixed(1));
      g.appendChild(ln);
      var lx = clamp(160 + Math.cos(rad) * 163, 16, 304);
      var ly = clamp(160 - Math.sin(rad) * 163 + 3, 14, 192);
      var tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tx.setAttribute('x', lx.toFixed(1)); tx.setAttribute('y', ly.toFixed(1));
      tx.textContent = v >= 1000 ? (v / 1000) + 'G' : String(v);
      g.appendChild(tx);
    });
  }

  function setGauge(mbps, unit) {
    var max = state.maxGauge;
    if (mbps > max) { state.maxGauge = mbps > 2500 ? 10000 : 2500; max = state.maxGauge; buildTicks(); }
    var r = speedRatio(mbps, max);
    var arc = byId('gaugeArc');
    if (arc) arc.style.strokeDashoffset = String(ARC_LEN * (1 - r));
    var nd = byId('gaugeNeedle');
    if (nd) nd.style.transform = 'rotate(' + ((r - 0.5) * 180).toFixed(2) + 'deg)';
    var gv = byId('gaugeValue');
    if (gv) gv.textContent = mbps > 0 ? fmtSpeed(mbps) : '0';
    var gu = byId('gaugeUnit');
    if (gu) gu.textContent = unit || 'Mbps';
  }

  /* ------------------------------------------------------------------ 图表 */
  var chartEl = byId('chart');
  var ctx = chartEl ? chartEl.getContext('2d') : null;

  function chartDims() {
    var dpr = window.devicePixelRatio || 1;
    var w = chartEl.clientWidth || 600, h = chartEl.clientHeight || 220;
    if (chartEl.width !== Math.round(w * dpr) || chartEl.height !== Math.round(h * dpr)) {
      chartEl.width = Math.round(w * dpr); chartEl.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  function drawChart() {
    if (!ctx) return;
    var d = chartDims();
    var w = d.w, h = d.h, padL = 46, padR = 12, padT = 12, padB = 22;
    var iw = w - padL - padR, ih = h - padT - padB;
    ctx.clearRect(0, 0, w, h);

    var all = state.series.dl.concat(state.series.ul);
    var maxV = 0;
    for (var i = 0; i < all.length; i++) if (all[i].v > maxV) maxV = all[i].v;
    maxV = maxV > 0 ? maxV * 1.18 : 10;
    var maxT = Math.max(1, state.durSec || 10);
    var lastT = 0;
    for (var k = 0; k < all.length; k++) if (all[k].t > lastT) lastT = all[k].t;
    if (lastT > maxT) maxT = lastT;

    var xOf = function (t) { return padL + clamp(t / maxT, 0, 1) * iw; };
    var yOf = function (v) { return padT + ih - clamp(v / maxV, 0, 1) * ih; };
    var grid = cssVar('--line');
    var mute = cssVar('--txt-mute');

    ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.strokeStyle = grid; ctx.fillStyle = mute; ctx.lineWidth = 1;
    for (var r2 = 0; r2 <= 4; r2++) {
      var y = padT + (ih * r2 / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      var val = maxV * (1 - r2 / 4);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtAxis(val), padL - 7, y);
    }
    var steps = maxT <= 12 ? 6 : 4;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var s = 0; s <= steps; s++) {
      var tt = maxT * s / steps;
      ctx.fillText(tt.toFixed(0) + 's', xOf(tt), h - padB + 5);
    }

    function area(series, color, fillTop) {
      if (series.length < 2) return;
      var grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
      grad.addColorStop(0, fillTop);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.moveTo(xOf(series[0].t), yOf(series[0].v));
      for (var i = 1; i < series.length; i++) ctx.lineTo(xOf(series[i].t), yOf(series[i].v));
      var lx = xOf(series[series.length - 1].t);
      ctx.lineTo(lx, padT + ih);
      ctx.lineTo(xOf(series[0].t), padT + ih);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xOf(series[0].t), yOf(series[0].v));
      for (var j = 1; j < series.length; j++) ctx.lineTo(xOf(series[j].t), yOf(series[j].v));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.stroke();
      var tip = series[series.length - 1];
      ctx.beginPath(); ctx.arc(xOf(tip.t), yOf(tip.v), 3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }

    area(state.series.dl, cssVar('--dl'), 'rgba(34,211,238,.26)');
    area(state.series.ul, cssVar('--ul'), 'rgba(168,85,247,.26)');

    if (state.pingPts.length) {
      var pmax = 0;
      for (var p = 0; p < state.pingPts.length; p++) if (state.pingPts[p].v > pmax) pmax = state.pingPts[p].v;
      pmax = pmax > 0 ? pmax * 1.25 : 100;
      ctx.fillStyle = cssVar('--ping');
      for (var q = 0; q < state.pingPts.length; q++) {
        var pt = state.pingPts[q];
        var py = padT + ih - clamp(pt.v / pmax, 0, 1) * (ih * 0.25) - 3;
        ctx.beginPath(); ctx.arc(xOf(pt.t), py, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* ------------------------------------------------------------------ 测速引擎 */
  function pingOnce(url, useRange, signal) {
    var u = withParam(url, '_', randToken());
    var opts = { cache: 'no-store', credentials: 'omit', signal: signal, mode: 'cors' };
    if (useRange) opts.headers = { Range: 'bytes=0-0' };
    var t0 = now();
    return fetch(u, opts).then(function (res) {
      if (!res.ok && res.status !== 206) throw new Error('HTTP ' + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      return { ms: now() - t0, bytes: buf.byteLength, status: 200 };
    });
  }

  function measureLatency(cfg, signal, onSample) {
    var url = cfg.probeUrl || cfg.fileUrl;
    var useRange = !cfg.probeUrl;
    var warm = pingOnce(url, useRange, signal);
    var chain = warm.then(function () {
      var out = [];
      var seq = Promise.resolve();
      for (var i = 0; i < cfg.samples; i++) {
        (function () {
          seq = seq.then(function () {
            return pingOnce(url, useRange, signal).then(function (r) {
              out.push(r.ms);
              if (onSample) onSample(out, r.ms);
            }).catch(function () { out.push(NaN); });
          });
        })();
      }
      return seq.then(function () { return out; });
    });
    return chain;
  }

  function startLoadedProbe(url, useRange, signal, intervalMs, out) {
    var stopped = false;
    function loop() {
      if (stopped || signal.aborted) return Promise.resolve();
      var t0 = now();
      return pingOnce(url, useRange, signal).then(function () {
        out.push(now() - t0);
      }).catch(function () { out.push(NaN); }).then(function () {
        if (stopped || signal.aborted) return;
        return new Promise(function (res) { setTimeout(res, intervalMs); }).then(loop);
      });
    }
    var p = loop();
    return { stop: function () { stopped = true; }, done: p };
  }

  function measureDownload(cfg, signal, onTick) {
    var url = cfg.url, size = cfg.sizeBytes, durationMs = cfg.durationSec * 1000;
    var conns = Math.max(1, cfg.connections | 0), chunk = Math.max(65536, cfg.chunkBytes | 0);
    var t0 = now();
    var total = 0, alive = true, ttfb = null, errors = 0;
    var series = [];
    var ctrl = new AbortController();
    var stopped = false;
    function hardStop() { stopped = true; alive = false; try { ctrl.abort(); } catch (e) {} }
    function onParentAbort() { hardStop(); }
    signal.addEventListener('abort', onParentAbort);

    function worker(idx) {
      var base = Math.floor(size * idx / conns);
      var limit = Math.floor(size * (idx + 1) / conns);
      var offset = base;
      function next() {
        if (stopped || !alive) return Promise.resolve();
        var end = Math.min(offset + chunk - 1, limit - 1);
        if (end < offset) { offset = base; end = Math.min(offset + chunk - 1, limit - 1); }
        var reqStart = now();
        return fetch(url, {
          headers: { Range: 'bytes=' + offset + '-' + end },
          cache: 'no-store',
          credentials: 'omit',
          mode: 'cors',
          signal: ctrl.signal
        }).then(function (res) {
          if (ttfb === null) ttfb = now() - reqStart;
          if (!res.ok && res.status !== 206) throw new Error('HTTP ' + res.status);
          if (!res.body || !res.body.getReader) {
            return res.arrayBuffer().then(function (b) {
              total += b.byteLength;
              return null;
            });
          }
          var reader = res.body.getReader();
          function pump() {
            return reader.read().then(function (r) {
              if (r.done) return null;
              total += r.value.byteLength;
              if (!alive) { try { reader.cancel(); } catch (e) {} return null; }
              return pump();
            });
          }
          return pump();
        }).then(function () {
          offset = end + 1;
          if (offset >= limit) offset = base;
          return next();
        }).catch(function (err) {
          if (stopped || !alive || signal.aborted) return;
          errors++;
          if (errors > conns * 40) { stopped = true; throw err; }
          return new Promise(function (res) { setTimeout(res, 60); }).then(next);
        });
      }
      return next();
    }

    var lastT = t0, lastB = 0;
    var timer = setInterval(function () {
      var n = now();
      var dt = (n - lastT) / 1000;
      if (dt <= 0) return;
      var mbps = ((total - lastB) * 8) / dt / 1e6;
      lastB = total; lastT = n;
      var pt = { t: (n - t0) / 1000, v: mbps };
      series.push(pt);
      if (onTick) onTick({ mbps: mbps, bytes: total, elapsed: n - t0, series: series });
    }, 120);

    var stopTimer = setTimeout(hardStop, durationMs);
    var jobs = [];
    for (var i = 0; i < conns; i++) jobs.push(worker(i));

    return Promise.all(jobs.map(function (p) { return p.catch(function () {}); })).then(function () {
      clearInterval(timer); clearTimeout(stopTimer);
      signal.removeEventListener('abort', onParentAbort);
      var secs = (now() - t0) / 1000;
      var mbps = secs > 0 ? (total * 8) / secs / 1e6 : 0;
      return { mbps: mbps, bytes: total, seconds: secs, ttfb: ttfb, series: series };
    });
  }

  function randomPayload(size) {
    var buf = new Uint8Array(size);
    var step = 65536;
    for (var off = 0; off < size; off += step) {
      var sub = buf.subarray(off, Math.min(off + step, size));
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(sub);
      else for (var i = 0; i < sub.length; i++) sub[i] = (Math.random() * 256) | 0;
    }
    return buf;
  }

  function measureUpload(cfg, signal, onTick) {
    var url = cfg.url, durationMs = cfg.durationSec * 1000;
    var conns = Math.max(1, cfg.connections | 0);
    var chunk = Math.max(65536, cfg.chunkBytes | 0);
    var payload = randomPayload(chunk);
    var t0 = now(), total = 0, alive = true, errors = 0;
    var series = [];
    var ctrl = new AbortController();
    var stopped = false;
    function hardStop() { stopped = true; alive = false; try { ctrl.abort(); } catch (e) {} }
    function onParentAbort() { hardStop(); }
    signal.addEventListener('abort', onParentAbort);

    function worker() {
      function next() {
        if (stopped || !alive) return Promise.resolve();
        var hs = { 'Content-Type': 'application/octet-stream' };
        if (cfg.token) hs.Authorization = 'Bearer ' + cfg.token;
        return fetch(url, {
          method: 'POST', body: payload, headers: hs,
          cache: 'no-store', credentials: 'omit', mode: 'cors', signal: ctrl.signal
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          total += payload.byteLength;
          return next();
        }).catch(function (err) {
          if (stopped || !alive || signal.aborted) return;
          errors++;
          if (errors > conns * 20) { stopped = true; throw err; }
          return new Promise(function (res) { setTimeout(res, 80); }).then(next);
        });
      }
      return next();
    }

    var lastT = t0, lastB = 0;
    var timer = setInterval(function () {
      var n = now();
      var dt = (n - lastT) / 1000;
      if (dt <= 0) return;
      var mbps = ((total - lastB) * 8) / dt / 1e6;
      lastB = total; lastT = n;
      var pt = { t: (n - t0) / 1000 + (cfg.timeOffset || 0), v: mbps };
      series.push(pt);
      if (onTick) onTick({ mbps: mbps, bytes: total, elapsed: n - t0, series: series });
    }, 120);

    var stopTimer = setTimeout(hardStop, durationMs);
    var jobs = [];
    for (var i = 0; i < conns; i++) jobs.push(worker());

    return Promise.all(jobs.map(function (p) { return p.catch(function () {}); })).then(function () {
      clearInterval(timer); clearTimeout(stopTimer);
      signal.removeEventListener('abort', onParentAbort);
      var secs = (now() - t0) / 1000;
      return { mbps: secs > 0 ? (total * 8) / secs / 1e6 : 0, bytes: total, seconds: secs, series: series };
    });
  }

  /* ------------------------------------------------------------------ 统计 */
  function statsOf(arr) {
    var v = arr.filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
    if (!v.length) return { min: NaN, max: NaN, avg: NaN, median: NaN, jitter: NaN, loss: 1 };
    var sum = 0;
    for (var i = 0; i < v.length; i++) sum += v[i];
    var jit = 0, cnt = 0;
    for (var j = 1; j < v.length; j++) { jit += Math.abs(v[j] - v[j - 1]); cnt++; }
    return {
      min: v[0], max: v[v.length - 1], avg: sum / v.length,
      median: v[Math.floor(v.length / 2)],
      jitter: cnt ? jit / cnt : 0,
      loss: (arr.length - v.length) / arr.length
    };
  }

  /* ------------------------------------------------------------------ UI 助手 */
  function setPhase(key, literal) {
    var el = byId('phaseText');
    if (el) el.textContent = literal !== undefined ? literal : t(key);
  }
  function toast(msg) {
    var el = byId('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._tid);
    el._tid = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }
  function busy(on) {
    var s = byId('startBtn'), st = byId('stopBtn'), ag = byId('againBtn');
    if (s) {
      s.disabled = on;
      var lab = s.querySelector('.btn-label');
      if (lab) lab.textContent = on ? t('running') : t('start');
      var sp = s.querySelector('.btn-spinner');
      if (sp) sp.hidden = !on;
    }
    if (st) st.hidden = !on;
    if (ag) ag.hidden = on || !state.hasRun;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      el.textContent = t(k);
    });
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    var lb = byId('langBtn');
    if (lb) lb.textContent = lang === 'zh' ? '中文' : 'EN';
    busy(state.running);
    if (!state.running) setPhase('phaseIdle');
  }

  /* ------------------------------------------------------------------ 目标 / 设置 UI */
  function currentFile() {
    var files = (CFG.download && CFG.download.files) || [];
    var idx = byId('sourceSel') ? byId('sourceSel').value | 0 : 0;
    return files[idx] || null;
  }

  function fillSources() {
    var sel = byId('sourceSel');
    if (!sel) return;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var files = (CFG.download && CFG.download.files) || [];
    if (!files.length) {
      var o = document.createElement('option');
      o.value = '0'; o.textContent = t('srcNone');
      sel.appendChild(o);
      return;
    }
    files.forEach(function (f, i) {
      var op = document.createElement('option');
      op.value = String(i);
      op.textContent = f.label || hostOf(f.url) || ('file ' + i);
      sel.appendChild(op);
    });
    var saved = null;
    try { saved = localStorage.getItem('st.source'); } catch (e) {}
    if (saved !== null && files[saved | 0]) sel.value = String(saved | 0);
  }

  function buildChips(container, values, current, fmt, onPick) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    values.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === current));
      b.textContent = fmt(v);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(container.children, function (c) { c.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true');
        onPick(v);
      });
      container.appendChild(b);
    });
  }

  function refreshMeta() {
    var f = currentFile();
    state.currentFile = f;
    var pill = byId('hostPill');
    if (pill) pill.textContent = f ? hostOf(f.url) : t('srcNone');
    var dl = byId('directDl');
    if (dl) { dl.href = f ? f.url : '#'; dl.style.pointerEvents = f ? '' : 'none'; }
    var fh = byId('fileHint');
    if (fh) {
      if (f) {
        fh.textContent = fmtBytes(f.sizeBytes) + ' · ' + f.url;
        fh.title = f.url;
      } else fh.textContent = t('needConfig');
    }
    var ci = byId('connInfo');
    if (ci) ci.textContent = (byId('connChips') ? currentChip(byId('connChips')) : CFG.download.connections) + ' ' + t('conn');
    var di = byId('durInfo');
    if (di) di.textContent = (byId('durationChips') ? currentChip(byId('durationChips')) : CFG.download.durationSec) + 's ' + t('dur');
  }
  function currentChip(container) {
    var c = container.querySelector('[aria-checked="true"]');
    return c ? c.textContent : '—';
  }
  function chipValue(container, fallback) {
    var c = container ? container.querySelector('[aria-checked="true"]') : null;
    return c ? num(c.textContent, fallback) : fallback;
  }

  /* ------------------------------------------------------------------ 自检 */
  function diagRow(label, status, value) {
    var li = document.createElement('li');
    var s = document.createElement('span');
    s.className = 'st ' + status;
    var b = document.createElement('b');
    b.textContent = label;
    var v = document.createElement('span');
    v.className = 'val';
    v.textContent = value || '';
    v.title = value || '';
    li.appendChild(s); li.appendChild(b); li.appendChild(v);
    return li;
  }

  function runDiagnostics() {
    var list = byId('diagList');
    var f = currentFile();
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!f) {
      list.appendChild(diagRow(t('needConfig'), 'bad', ''));
      return;
    }
    var rows = {};
    function push(id, label, st, val) {
      if (rows[id] && rows[id].parentNode) rows[id].parentNode.removeChild(rows[id]);
      var li = diagRow(label, st, val);
      rows[id] = li;
      list.appendChild(li);
    }
    push('url', t('diagUrl'), 'run', t('diagRunning'));
    push('cors', t('diagCors'), 'run', t('diagRunning'));
    push('range', t('diagRange'), 'run', t('diagRunning'));
    push('size', t('diagSize'), 'run', t('diagRunning'));

    var t0 = now();
    fetch(f.url, { method: 'HEAD', cache: 'no-store', credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        var ttfb = now() - t0;
        var len = parseInt(res.headers.get('content-length') || '0', 10);
        var ar = res.headers.get('accept-ranges');
        push('url', t('diagUrl'), res.ok ? 'ok' : 'bad', 'HTTP ' + res.status);
        push('cors', t('diagCors'), 'ok', 'Access-Control-Allow-Origin');
        push('range', t('diagRange'), ar && ar.indexOf('bytes') >= 0 ? 'ok' : 'warn', ar || 'none');
        push('size', t('diagSize'), len && Math.abs(len - f.sizeBytes) < 1048576 ? 'ok' : 'warn',
          fmtBytes(len || f.sizeBytes) + ' / ' + fmtMs(ttfb));
        return fetch(withParam(f.url, '_', randToken()), {
          headers: { Range: 'bytes=0-1023' }, cache: 'no-store', credentials: 'omit', mode: 'cors'
        });
      })
      .then(function (res) {
        if (res.status === 206) {
          push('range', t('diagRange'), 'ok', 'HTTP 206 partial');
        } else if (res.status === 200) {
          push('range', t('diagRange'), 'warn', 'HTTP 200 (no 206)');
        }
        if (res.body && res.body.cancel) { try { res.body.cancel(); } catch (e) {} }
      })
      .catch(function (err) {
        push('url', t('diagUrl'), 'bad', String(err && err.message ? err.message : err));
        push('cors', t('diagCors'), 'bad', 'blocked');
        push('range', t('diagRange'), 'bad', '—');
        push('size', t('diagSize'), 'bad', '—');
      });
  }

  /* ------------------------------------------------------------------ 历史 */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem('st.history') || '[]'); } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem('st.history', JSON.stringify(list)); } catch (e) {}
  }
  function renderHistory() {
    var body = byId('histBody'), empty = byId('histEmpty');
    var list = loadHistory();
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (empty) empty.hidden = list.length > 0;
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      function td(txt, hi) {
        var c = document.createElement('td');
        c.textContent = txt;
        if (hi) c.className = 'hi';
        return c;
      }
      var d = new Date(r.at);
      var stamp = d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });
      tr.appendChild(td(stamp));
      tr.appendChild(td(fmtSpeed(r.download), true));
      tr.appendChild(td(r.upload === null || r.upload === undefined ? '—' : fmtSpeed(r.upload)));
      tr.appendChild(td(fmtMs(r.ping)));
      tr.appendChild(td(fmtMs(r.jitter)));
      tr.appendChild(td(r.loaded === null || r.loaded === undefined ? '—' : fmtMs(r.loaded)));
      tr.appendChild(td(r.source || '—'));
      body.appendChild(tr);
    });
  }
  function addHistory(rec) {
    var list = loadHistory();
    list.unshift(rec);
    var lim = num(CFG.historyLimit, 20) | 0;
    if (list.length > lim) list = list.slice(0, lim);
    saveHistory(list);
    renderHistory();
  }

  /* ------------------------------------------------------------------ 主流程 */
  function setMetric(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }
  function resetMetrics() {
    ['mDownload', 'mUpload', 'mPing', 'mJitter', 'mLoaded'].forEach(function (k) { setMetric(k, '—'); });
    setMetric('mDownloadSub', '—'); setMetric('mPingSub', '—');
    setMetric('mJitterSub', '—'); setMetric('mLoadedSub', '—');
    state.series.dl = []; state.series.ul = []; state.pingPts = [];
    drawChart();
    setGauge(0, 'Mbps');
  }

  function stopTest() {
    if (state.abort) { try { state.abort.abort(); } catch (e) {} }
    state.running = false;
    state.hasRun = true;
    busy(false);
    setPhase('phaseStopped');
    toast(t('stopped'));
  }

  function runTest() {
    if (state.running) return;
    var f = currentFile();
    if (!f || !f.url) { toast(t('needConfig')); return; }

    state.running = true;
    state.maxGauge = 1000;
    state.durSec = chipValue(byId('durationChips'), CFG.download.durationSec);
    state.abort = new AbortController();
    var signal = state.abort.signal;
    busy(true);
    resetMetrics();
    buildTicks();

    var conns = chipValue(byId('connChips'), CFG.download.connections);
    var wantUpload = byId('uploadToggle') && byId('uploadToggle').checked;
    var wantLoaded = byId('loadedToggle') && byId('loadedToggle').checked;
    var uploadOn = wantUpload && CFG.upload && CFG.upload.enabled && CFG.upload.url;

    var result = { at: Date.now(), source: hostOf(f.url), download: NaN, upload: null, ping: NaN, jitter: NaN, loaded: null };
    state.testStart = now();
    var probeCfg = {
      probeUrl: (CFG.latency && CFG.latency.probeUrl) || '',
      fileUrl: f.url,
      samples: num(CFG.latency.samples, 10) | 0
    };

    setPhase('phasePing');
    measureLatency(probeCfg, signal, function (out, ms) {
      setMetric('mPing', fmtMs(ms));
      setMetric('mPingSub', out.length + '/' + probeCfg.samples);
      var s = statsOf(out);
      if (isFinite(s.jitter)) setMetric('mJitter', fmtMs(s.jitter));
      state.pingPts.push({ t: (now() - state.testStart) / 1000, v: ms });
      drawChart();
    }).then(function (pings) {
      if (signal.aborted) throw new Error('aborted');
      var st = statsOf(pings);
      result.ping = st.median;
      result.jitter = st.jitter;
      setMetric('mPing', fmtMs(st.median));
      setMetric('mPingSub', 'min ' + fmtMs(st.min) + ' / max ' + fmtMs(st.max) + (st.loss > 0 ? ' / loss ' + Math.round(st.loss * 100) + '%' : ''));
      setMetric('mJitter', fmtMs(st.jitter));
      setMetric('mJitterSub', 'n=' + pings.length);

      setPhase('phaseDownload');
      var loadedOut = [];
      var probe = wantLoaded
        ? startLoadedProbe(probeCfg.probeUrl || f.url, !probeCfg.probeUrl, signal,
            num(CFG.latency.intervalMs, 450), loadedOut)
        : null;
      var phaseBase = (now() - state.testStart) / 1000;

      return measureDownload({
        url: f.url, sizeBytes: num(f.sizeBytes, 268435456),
        durationSec: state.durSec, connections: conns, chunkBytes: CFG.download.chunkBytes
      }, signal, function (tick) {
        setGauge(tick.mbps, 'Mbps');
        setMetric('mDownload', fmtSpeed(tick.mbps));
        setMetric('mDownloadSub', fmtBytes(tick.bytes) + ' / ' + (tick.elapsed / 1000).toFixed(1) + 's');
        setMetric('progressInfo', t('progress') + ' ' + fmtBytes(tick.bytes) + ' · ' + (tick.elapsed / 1000).toFixed(1) + 's');
        state.series.dl.push({ t: phaseBase + tick.elapsed / 1000, v: tick.mbps });
        drawChart();
      }).then(function (dl) {
        if (probe) { probe.stop(); }
        result.download = dl.mbps;
        setMetric('mDownload', fmtSpeed(dl.mbps));
        setMetric('mDownloadSub', fmtBytes(dl.bytes) + ' / ' + dl.seconds.toFixed(1) + 's' +
          (dl.ttfb ? ' · ttfb ' + fmtMs(dl.ttfb) : ''));
        return probe ? probe.done.then(function () { return dl; }) : dl;
      }).then(function (dl) {
        if (loadedOut.length) {
          var ls = statsOf(loadedOut);
          result.loaded = ls.median;
          setMetric('mLoaded', fmtMs(ls.median));
          setMetric('mLoadedSub', 'min ' + fmtMs(ls.min) + ' / max ' + fmtMs(ls.max));
          loadedOut.forEach(function (ms, i) {
            state.pingPts.push({ t: phaseBase + 0.4 + i * (num(CFG.latency.intervalMs, 450) / 1000), v: ms });
          });
          drawChart();
        } else {
          setMetric('mLoadedSub', '—');
        }
        if (!uploadOn) return null;
        setPhase('phaseUpload');
        var upBase = (now() - state.testStart) / 1000;
        return measureUpload({
          url: CFG.upload.url, token: CFG.upload.token,
          durationSec: num(CFG.upload.durationSec, 8), connections: num(CFG.upload.connections, 3),
          chunkBytes: num(CFG.upload.chunkBytes, 4194304)
        }, signal, function (tick) {
          setGauge(tick.mbps, 'Mbps');
          setMetric('mUpload', fmtSpeed(tick.mbps));
          setMetric('mUploadSub', fmtBytes(tick.bytes) + ' / ' + (tick.elapsed / 1000).toFixed(1) + 's');
          state.series.ul.push({ t: upBase + tick.elapsed / 1000, v: tick.mbps });
          drawChart();
        }).then(function (ul) {
          result.upload = ul.mbps;
          setMetric('mUpload', fmtSpeed(ul.mbps));
          setMetric('mUploadSub', fmtBytes(ul.bytes) + ' / ' + ul.seconds.toFixed(1) + 's');
        });
      });
    }).then(function () {
      if (signal.aborted) return;
      state.running = false;
      state.hasRun = true;
      busy(false);
      setPhase('phaseDone');
      setGauge(result.download, 'Mbps');
      setMetric('mDownload', fmtSpeed(result.download));
      addHistory(result);
      state.lastResult = result;
      toast(t('done') + ' · ' + fmtSpeed(result.download) + ' Mbps');
    }).catch(function (err) {
      state.running = false;
      busy(false);
      if (signal.aborted) { setPhase('phaseStopped'); return; }
      setPhase(t('reqFail') + ': ' + (err && err.message ? err.message : err));
      toast(String(err && err.message ? err.message : err));
    });
  }

  /* ------------------------------------------------------------------ 初始化 */
  function applyConfig(cfg) {
    CFG = deepMerge(DEFAULTS, cfg || {});
    if (CFG.repoUrl) {
      var rl = byId('repoLink');
      if (rl) rl.href = CFG.repoUrl;
    }
    fillSources();
    var dc = byId('durationChips');
    buildChips(dc, [5, 10, 15, 30], num(CFG.download.durationSec, 10), function (v) { return v + 's'; },
      function () { refreshMeta(); });
    var cc = byId('connChips');
    buildChips(cc, [1, 2, 4, 6, 8, 16], num(CFG.download.connections, 6), function (v) { return v + 'x'; },
      function () { refreshMeta(); });
    var ut = byId('uploadToggle');
    var upOk = !!(CFG.upload && CFG.upload.enabled && CFG.upload.url);
    if (ut) {
      ut.checked = upOk;
      ut.disabled = !upOk;
      var lab = ut.parentNode.querySelector('b');
      if (lab && !upOk) lab.textContent = t('panel.uploadTest') + ' (' + t('m.uploadOff') + ')';
    }
    var ch = byId('cfgHint');
    if (ch) {
      ch.textContent = upOk
        ? t('panel.uploadTest') + ' -> ' + hostOf(CFG.upload.url)
        : t('note.3');
    }
    var srcSel = byId('sourceSel');
    if (srcSel) srcSel.addEventListener('change', function () {
      try { localStorage.setItem('st.source', srcSel.value); } catch (e) {}
      refreshMeta(); runDiagnostics();
    });
    refreshMeta();
  }

  function init() {
    try {
      var savedLang = localStorage.getItem('st.lang');
      if (savedLang === 'zh' || savedLang === 'en') lang = savedLang;
      else lang = (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
      var savedTheme = localStorage.getItem('st.theme');
      if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (e) {}

    var y = byId('year');
    if (y) y.textContent = String(new Date().getFullYear());

    applyI18n();
    buildTicks();
    setGauge(0, 'Mbps');
    drawChart();

    window.addEventListener('resize', function () { drawChart(); });

    byId('startBtn').addEventListener('click', runTest);
    byId('againBtn').addEventListener('click', runTest);
    byId('stopBtn').addEventListener('click', stopTest);
    byId('diagBtn').addEventListener('click', runDiagnostics);
    byId('langBtn').addEventListener('click', function () {
      lang = lang === 'zh' ? 'en' : 'zh';
      try { localStorage.setItem('st.lang', lang); } catch (e) {}
      applyI18n();
      renderHistory();
      refreshMeta();
    });
    byId('themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      try { localStorage.setItem('st.theme', cur); } catch (e) {}
      setTimeout(drawChart, 30);
    });
    byId('copyUrl').addEventListener('click', function () {
      var f = currentFile();
      if (!f) return;
      var ok = false;
      try {
        var ta = document.createElement('textarea');
        ta.value = f.url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {}
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(f.url).then(function () { toast(t('copying')); },
          function () { toast(ok ? t('copying') : t('copyFail')); });
      } else toast(ok ? t('copying') : t('copyFail'));
    });
    byId('clearHist').addEventListener('click', function () {
      saveHistory([]); renderHistory(); toast(t('histClear'));
    });

    var embed = false;
    try { embed = new URLSearchParams(location.search).get('embed') === '1'; } catch (e) {}
    if (embed) document.body.classList.add('embed');

    fetch('config.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (cfg) {
        applyConfig(cfg);
        renderHistory();
        runDiagnostics();
        var intro = byId('footNote');
        if (intro) intro.textContent = (CFG.siteName || 'Speedtest') + ' · GitHub Pages + Cloudflare R2';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__speedtest = { state: state, getConfig: function () { return CFG; }, run: runTest, stop: stopTest };
})();

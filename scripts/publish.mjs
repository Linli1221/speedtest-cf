#!/usr/bin/env node
/* ============================================================================
 * 发布到 GitHub Pages
 *   1) git init / commit
 *   2) 用 GitHub REST API 创建仓库（已存在则跳过）
 *   3) push
 *   4) 打开 GitHub Pages（Actions 模式）
 *   5) 触发部署工作流并打印站点地址
 *
 * 用法:
 *   set GITHUB_TOKEN=ghp_xxx          # Windows: $env:GITHUB_TOKEN="ghp_xxx"
 *   node scripts/publish.mjs --repo your-name/speedtest
 *
 *   node scripts/publish.mjs --repo your-name/speedtest --token ghp_xxx
 *   node scripts/publish.mjs --repo your-name/speedtest --private
 * ==========================================================================*/
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1] && argv[i + 1].indexOf('--') !== 0) return argv[i + 1];
  return def;
}
function has(name) { return argv.indexOf('--' + name) >= 0; }

const REPO = arg('repo', '');
const TOKEN = arg('token', process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '');
const BRANCH = arg('branch', 'main');
const PRIVATE = has('private');
const WAIT = !has('no-wait');

if (!REPO || REPO.indexOf('/') < 0) {
  console.error('用法: node scripts/publish.mjs --repo <owner>/<repo> [--token <token>] [--private]');
  process.exit(1);
}
if (!TOKEN) {
  console.error('缺少 GitHub Token。设置环境变量 GITHUB_TOKEN，或用 --token 传入。');
  console.error('Token 权限: Contents=write, Pages=write, Administration=write (创建仓库用), Workflows=write');
  process.exit(1);
}

const parts = REPO.split('/');
const OWNER = parts[0];
const NAME = parts[1];

const API = 'https://api.github.com';
const HEADERS = {
  'Authorization': 'Bearer ' + TOKEN,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'speedtest-cf-publish',
  'Content-Type': 'application/json'
};

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

function git(args, opts) {
  const r = spawnSync('git', args, Object.assign({ stdio: 'inherit' }, opts || {}));
  return r.status === 0;
}
function gitOut(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return ((r.stdout || '') + (r.stderr || '')).trim();
}
function gitQuiet(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0;
}

/* ---------------------------------------------------------------- 1. 本地提交 */
console.log('==> 准备本地仓库');
if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
  if (!git(['init'])) process.exit(1);
}
if (!gitOut(['config', 'user.email'])) git(['config', 'user.email', 'speedtest@example.com']);
if (!gitOut(['config', 'user.name'])) git(['config', 'user.name', 'speedtest-bot']);
git(['add', '-A']);
const dirty = gitQuiet(['diff', '--cached', '--quiet']) ? '' : 'staged';
if (dirty) {
  git(['commit', '-m', 'deploy: speedtest site']);
} else {
  console.log('没有需要提交的改动');
}
git(['branch', '-M', BRANCH]);

/* ---------------------------------------------------------------- 2. 创建远端仓库 */
console.log('');
console.log('==> 检查远端仓库 ' + REPO);
const check = await api('GET', '/repos/' + REPO);
if (check.ok) {
  console.log('仓库已存在');
} else if (check.status === 404) {
  const me = await api('GET', '/user');
  const myLogin = me.ok && me.json && me.json.login ? me.json.login : '';
  const isOrg = myLogin !== '' && OWNER.toLowerCase() !== myLogin.toLowerCase();
  const url = isOrg ? '/orgs/' + OWNER + '/repos' : '/user/repos';
  const created = await api('POST', url, {
    name: NAME,
    private: PRIVATE,
    description: 'Speedtest site on GitHub Pages + Cloudflare R2 (>200MB test file)',
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    auto_init: false
  });
  if (!created.ok) {
    console.error('创建仓库失败: HTTP ' + created.status);
    console.error(JSON.stringify(created.json));
    process.exit(1);
  }
  console.log('仓库创建成功: ' + created.json.html_url);
} else {
  console.error('访问仓库失败: HTTP ' + check.status);
  console.error(JSON.stringify(check.json));
  process.exit(1);
}

/* ---------------------------------------------------------------- 3. push */
console.log('');
console.log('==> 推送代码');
if (gitOut(['remote']).indexOf('origin') >= 0) git(['remote', 'remove', 'origin']);
git(['remote', 'add', 'origin', 'https://github.com/' + REPO + '.git']);
const pushUrl = 'https://x-access-token:' + TOKEN + '@github.com/' + REPO + '.git';
if (!git(['push', '-u', pushUrl, BRANCH, '--force'])) {
  console.error('推送失败，请检查 Token 权限是否包含 Contents: write');
  process.exit(1);
}
git(['remote', 'set-url', 'origin', 'https://github.com/' + REPO + '.git']);
gitOut(['branch', '--set-upstream-to=origin/' + BRANCH, BRANCH]);

/* ---------------------------------------------------------------- 4. 打开 Pages */
console.log('');
console.log('==> 配置 GitHub Pages (Actions 模式)');
const pagesUrl = 'https://' + OWNER.toLowerCase() + '.github.io/' + NAME + '/';
let pages = await api('GET', '/repos/' + REPO + '/pages');
if (!pages.ok) {
  pages = await api('POST', '/repos/' + REPO + '/pages', { build_type: 'workflow' });
  if (!pages.ok) {
    pages = await api('PUT', '/repos/' + REPO + '/pages', { build_type: 'workflow' });
  }
} else {
  pages = await api('PUT', '/repos/' + REPO + '/pages', { build_type: 'workflow' });
}
if (pages.ok) console.log('Pages 已启用: ' + (pages.json.html_url || pagesUrl));
else {
  console.warn('自动启用 Pages 失败 (HTTP ' + pages.status + ')。');
  console.warn('请手动打开 https://github.com/' + REPO + '/settings/pages 选择 Source = GitHub Actions');
}

/* ---------------------------------------------------------------- 5. 触发工作流 */
console.log('');
console.log('==> 触发部署工作流');
const disp = await api('POST', '/repos/' + REPO + '/actions/workflows/pages.yml/dispatches', { ref: BRANCH });
if (disp.status === 204) console.log('已触发 pages.yml');
else console.warn('触发失败 (HTTP ' + disp.status + ')，推送到 main 时应该也会自动触发。');

/* ---------------------------------------------------------------- 6. 输出 */
const runsUrl = 'https://github.com/' + REPO + '/actions';
console.log('');
console.log('----------------------------------------------------------------');
console.log('仓库      : https://github.com/' + REPO);
console.log('Actions   : ' + runsUrl);
console.log('站点地址  : ' + pagesUrl);
console.log('----------------------------------------------------------------');

if (WAIT) {
  console.log('');
  console.log('等待 Pages 就绪（最多 3 分钟）...');
  const deadline = Date.now() + 180000;
  for (;;) {
    const st = await api('GET', '/repos/' + REPO + '/pages');
    if (st.ok && st.json.status === 'built' && st.json.html_url) {
      console.log('Pages 构建完成: ' + st.json.html_url);
      break;
    }
    if (Date.now() > deadline) {
      console.log('等待超时，请到 ' + runsUrl + ' 查看进度');
      break;
    }
    await new Promise(function (r) { setTimeout(r, 6000); });
    process.stdout.write('.');
  }
}
console.log('');
console.log('别忘了：config.json 里的测速文件地址需要已经指向你的 Cloudflare R2 公共桶。');

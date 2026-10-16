/* ============================================================================
 * Cloudflare Worker —— 上传测速接收端
 *
 * 作用：提供一个支持 CORS 的 POST 端点，把浏览器上传的数据流读掉后返回 JSON。
 * 部署：cd workers/speedtest-upload && npx wrangler deploy
 * 然后把输出的地址填进站点根目录的 config.json -> upload.url
 * ==========================================================================*/
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
  'Timing-Allow-Origin': '*'
};

function withCors(headers) {
  const out = Object.assign({}, CORS);
  if (headers) Object.assign(out, headers);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: withCors() });
    }

    if (url.pathname === '/upload' || url.pathname === '/') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: true, service: 'speedtest-upload', hint: 'POST here to measure upload' }), {
          status: 200,
          headers: withCors({ 'Content-Type': 'application/json; charset=utf-8' })
        });
      }

      if (env && env.TOKEN) {
        const auth = request.headers.get('Authorization') || '';
        if (auth !== 'Bearer ' + env.TOKEN) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
            status: 401,
            headers: withCors({ 'Content-Type': 'application/json; charset=utf-8' })
          });
        }
      }

      let received = 0;
      if (request.body) {
        const reader = request.body.getReader();
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            received += chunk.value.byteLength;
          }
        } catch (e) {
          // 客户端提前断开：仍然按已收到的字节数返回
        }
      }

      return new Response(JSON.stringify({ ok: true, received }), {
        status: 200,
        headers: withCors({
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        })
      });
    }

    return new Response('speedtest upload worker', { status: 404, headers: withCors() });
  }
};

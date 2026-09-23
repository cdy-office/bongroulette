import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/soop-client.js', ['soop-client.js', 'text/javascript']],
  ['/soop-chat.js', ['soop-chat.js', 'text/javascript']],
  ['/soop.svg', ['soop.svg', 'image/svg+xml']],
  ['/soop.css', ['soop.css', 'text/css']],
  ['/colosseum3d.bundle.js', ['colosseum3d.bundle.js', 'text/javascript']],
  ['/THREE-LICENSE.txt', ['THREE-LICENSE.txt', 'text/plain']]
]);

export function createApp({ clientId = '', clientSecret = '', origin = 'http://127.0.0.1:4174', bridge, fetchImpl = fetch, now = Date.now, staticRoot = root } = {}) {
  const publicUrl = new URL(origin);
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) throw new Error('APP_ORIGIN must be an origin without a path');
  const secure = publicUrl.protocol === 'https:';
  if (!secure && !(publicUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(publicUrl.hostname))) throw new Error('Production requires HTTPS');
  origin = publicUrl.origin;
  const cookieName = secure ? '__Host-bong_soop' : 'bong_soop';
  const configured = Boolean(clientId && clientSecret);
  const sessions = new Map();
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' };
  function json(res, status, body) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
  function redirect(res, url) { res.writeHead(303, { ...headers, Location: url }); res.end(); }
  function destroy(s) {
    if (!s || !sessions.has(s.id)) return;
    sessions.delete(s.id); s.active = false;
    if (s.stream) { s.stream.write('event: closed\ndata: {}\n\n'); s.stream.end(); }
    if (s.connection) void s.connection.close();
    s.connection = null; s.pending = null;
  }
  function getSession(req) {
    const cookies = String(req.headers.cookie || '').split(';').map(v => v.trim());
    const id = cookies.find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const s = sessions.get(id);
    if (s && s.expires <= now()) { destroy(s); return null; }
    return s;
  }
  function newSession(res) {
    for (const s of sessions.values()) if (s.expires <= now()) destroy(s);
    if (sessions.size >= 50) return null;
    const s = { id: random(), chatId: random().slice(0, 16), csrf: random(), expires: now() + 10 * 60000, pending: null, active: false, stream: null, connection: null, sequence: 0 };
    sessions.set(s.id, s);
    res.setHeader('Set-Cookie', `${cookieName}=${s.id}; HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}`);
    return s;
  }
  function validPost(req, s) { return s && req.headers.origin === origin && equal(req.headers['x-csrf-token'], s.csrf); }
  function push(s, message) {
    if (!s.active || !s.stream || typeof message !== 'string') return;
    if (s.stream.writableLength > 65536) { destroy(s); return; }
    // Do not retain/replay any chat. Every stream has an independent sequence.
    const data = { id: `${s.chatId}:${++s.sequence}`, text: message.slice(0, 320), at: now() };
    s.stream.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  async function handler(req, res) {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true });
      let s = getSession(req);
      if (url.pathname === '/api/soop/status' && req.method === 'GET') {
        if (!s) s = newSession(res);
        if (!s) return json(res, 503, { error: '연결이 많습니다. 잠시 후 다시 시도해주세요.' });
        return json(res, 200, { configured, csrf: s.csrf, serverTime: now(), connected: Boolean(s.connection), broadcaster: s.connection?.broadcaster || '', redirectUrl: origin + '/' });
      }
      if (url.pathname === '/api/soop/login' && req.method === 'POST') {
        if (!validPost(req, s)) return json(res, 403, { error: '페이지를 새로고침한 뒤 다시 로그인해주세요.' });
        if (!configured) return json(res, 503, { error: '서버에 SOOP 키를 설정해야 합니다.' });
        if (s.pending?.expires <= now()) s.pending = null;
        if (s.connection) return json(res, 409, { error: '이미 연결되어 있습니다. 페이지를 새로고침해주세요.' });
        if (s.authorizing) return json(res, 409, { error: '로그인을 처리 중입니다. 잠시 후 새로고침해주세요.' });
        // A fresh, CSRF-checked click replaces an abandoned authorization request.
        s.pending = { state: random(), expires: now() + 5 * 60000 };
        const auth = new URL('https://openapi.sooplive.com/auth/code');
        auth.searchParams.set('client_id', clientId);
        auth.searchParams.set('response_type', 'code');
        auth.searchParams.set('state', s.pending.state);
        return json(res, 200, { url: auth.href });
      }
      // The Developers redirect is the root URL. Consume the code on the server,
      // before serving HTML or loading third-party resources.
      if (url.pathname === '/' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
        if (!s?.pending || s.pending.expires <= now()) return redirect(res, '/?soop=expired');
        const pending = s.pending;
        // State passthrough needs verification with the real approved app. Fail
        // closed if SOOP omits it; never silently weaken the CSRF binding.
        if (!equal(url.searchParams.get('state'), pending.state)) return redirect(res, '/?soop=state');
        s.pending = null;
        if (url.searchParams.has('error')) return redirect(res, '/?soop=cancelled');
        const code = url.searchParams.get('code');
        if (!code || code.length > 2048) return redirect(res, '/?soop=auth');
        let connection;
        s.authorizing = true;
        try {
          const response = await fetchImpl('https://openapi.sooplive.com/auth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: origin + '/' }),
            signal: AbortSignal.timeout(15000)
          });
          if (!response.ok) throw new Error('Token exchange failed');
          const tokens = await response.json();
          if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw new Error('No token');
          if (!sessions.has(s.id)) throw new Error('Session expired');
          connection = await bridge.connect(tokens.access_token, text => push(s, text), () => destroy(s));
          if (!sessions.has(s.id)) { await connection.close(); return redirect(res, '/?soop=closed'); }
          s.connection = connection; s.active = true;
          s.authorizing = false;
          const lifetime = Number(tokens.expires_in);
          s.expires = now() + Math.min(Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3600, 28800) * 1000;
          // Refresh tokens are deliberately not saved. Expiry requires re-login.
          return redirect(res, '/?soop=connected');
        } catch {
          if (connection) await connection.close();
          destroy(s);
          return redirect(res, '/?soop=connection');
        }
      }
      if (url.pathname === '/api/soop/events' && req.method === 'GET') {
        if (!s?.active) return json(res, 401, { error: 'SOOP 로그인이 필요합니다.' });
        if (s.stream) return json(res, 409, { error: '다른 게임 창에서 이미 연결 중입니다.' });
        res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        s.stream = res;
        res.write('event: ready\ndata: {}\n\n');
        const keepalive = setInterval(() => {
          if (s.expires <= now()) destroy(s);
          else res.write(': heartbeat\n\n');
        }, 15000);
        res.on('close', () => { clearInterval(keepalive); if (s.stream === res) { s.stream = null; destroy(s); } });
        return;
      }
      if (url.pathname === '/api/soop/logout' && req.method === 'POST') {
        if (!validPost(req, s)) return json(res, 403, { error: '잘못된 연결 해제 요청입니다.' });
        destroy(s);
        res.setHeader('Set-Cookie', `${cookieName}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
      const asset = assets.get(url.pathname);
      if (!asset) return json(res, 404, { error: 'Not found' });
      const data = await readFile(resolve(staticRoot, asset[0]));
      res.writeHead(200, { ...headers, 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { if (!res.headersSent) json(res, 500, { error: '연결 처리 중 오류가 발생했습니다. 다시 시도해주세요.' }); else res.end(); }
  }
  const reaper = setInterval(() => { for (const s of sessions.values()) if (s.expires <= now()) destroy(s); }, 30000);
  reaper.unref();
  return { handler, async close() { clearInterval(reaper); for (const s of sessions.values()) destroy(s); await bridge?.close?.(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { createSdkBridge } = await import('./sdk-bridge.mjs');
  const config = { clientId: process.env.SOOP_CLIENT_ID || '', clientSecret: process.env.SOOP_CLIENT_SECRET || '', origin: process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:4174' };
  const app = createApp({ ...config, bridge: createSdkBridge(config) });
  const server = http.createServer(app.handler);
  server.listen(Number(process.env.PORT || 4174), process.env.HOST || '127.0.0.1', () => console.log(`봉룰렛 SOOP: ${config.origin} (keys ${config.clientId && config.clientSecret ? 'configured' : 'not configured'})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); server.close(); });
}

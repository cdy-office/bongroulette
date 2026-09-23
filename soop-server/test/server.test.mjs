import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.mjs';

async function fixture(t, options = {}) {
  let callback, closed = 0, exchanges = 0;
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const app = createApp({ origin, clientId: 'test-client', clientSecret: 'SERVER-ONLY-SECRET',
    bridge: { connect: async (token, fn) => { assert.equal(token, 'private-access'); callback = fn; return { broadcaster: 'test-streamer', close: async () => closed++ }; } },
    fetchImpl: async (url, init) => {
      exchanges++; assert.equal(url, 'https://openapi.sooplive.com/auth/token');
      assert.equal(init.body.get('client_secret'), 'SERVER-ONLY-SECRET');
      return Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 100 });
    }, ...options });
  server.on('request', app.handler);
  t.after(async () => { await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const first = await fetch(origin + '/api/soop/status');
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const status = await first.json();
  const call = (path, opts = {}) => fetch(origin + path, { redirect: 'manual', ...opts, headers: { cookie, Origin: origin, 'X-CSRF-Token': status.csrf, ...opts.headers } });
  async function login() {
    const res = await call('/api/soop/login', { method: 'POST' });
    const body = await res.json();
    return new URL(body.url).searchParams.get('state');
  }
  return { call, login, status, send: text => callback(text), closed: () => closed, exchanges: () => exchanges };
}

test('secret, tokens and private files are never served; unconfigured login is blocked', async t => {
  const f = await fixture(t, { clientSecret: '' });
  assert.equal(f.status.configured, false);
  for (const path of ['/.env.local', '/soop-server/.env.local', '/soop-server/server.mjs', '/src/../.env']) assert.equal((await f.call(path)).status, 404);
  assert.equal((await f.call('/api/soop/login', { method: 'POST' })).status, 503);
  assert.equal(JSON.stringify(f.status).includes('SECRET'), false);
});

test('foreign origins, forged and missing state cannot exchange a code', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/soop/login', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  await f.login();
  const response = await f.call('/?code=attack&state=wrong');
  assert.equal(response.headers.get('location'), '/?soop=state');
  await f.login();
  assert.equal((await f.call('/?code=attack')).headers.get('location'), '/?soop=state');
  assert.equal(f.exchanges(), 0);
});

test('one-time callback connects, SSE receives no credentials, logout destroys connection', async t => {
  const f = await fixture(t);
  const state = await f.login();
  const callbackUrl = `/?code=one-use-code&state=${state}`;
  assert.equal((await f.call(callbackUrl)).headers.get('location'), '/?soop=connected');
  assert.equal((await f.call(callbackUrl)).headers.get('location'), '/?soop=expired');
  assert.equal(f.exchanges(), 1);
  const status = await (await f.call('/api/soop/status')).json();
  assert.equal(status.connected, true); assert.equal(status.broadcaster, 'test-streamer');
  assert.equal(JSON.stringify(status).includes('private-'), false);
  const response = await f.call('/api/soop/events');
  const reader = response.body.getReader(); const decode = new TextDecoder();
  assert.match(decode.decode((await reader.read()).value), /event: ready/);
  f.send('!왼');
  const packet = decode.decode((await reader.read()).value);
  assert.match(packet, /!왼/); assert.equal(/SECRET|private-access|private-refresh/.test(packet), false);
  assert.equal((await f.call('/api/soop/events')).status, 409);
  assert.equal((await f.call('/api/soop/logout', { method: 'POST' })).status, 200);
  assert.equal((await f.call('/api/soop/events')).status, 401);
  assert.equal(f.closed(), 1);
  await reader.cancel();
});

test('production refuses unencrypted authentication', () => {
  assert.throws(() => createApp({ origin: 'http://bongroulette.com' }), /HTTPS/);
});

test('retry replaces abandoned login without a stale callback consuming the new request', async t => {
  const f = await fixture(t);
  const oldState = await f.login();
  const newState = await f.login();
  assert.notEqual(oldState, newState);
  assert.equal((await f.call(`/?code=old&state=${oldState}`)).headers.get('location'), '/?soop=state');
  assert.equal(f.exchanges(), 0);
  assert.equal((await f.call(`/?code=new&state=${newState}`)).headers.get('location'), '/?soop=connected');
  assert.equal(f.exchanges(), 1);
});

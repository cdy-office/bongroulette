import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { createApp } from '../server.mjs';

test('browser: login relay, donation names, gate commands, pause, audience text and disconnect', { timeout: 90000 }, async t => {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let send;
  const app = createApp({ origin, clientId: 'mock-id', clientSecret: 'mock-secret',
    fetchImpl: async () => Response.json({ access_token: 'mock-token', expires_in: 3600 }),
    bridge: { connect: async (_, callback) => { send = callback; return { broadcaster: 'test-streamer', close: async () => {} }; } }
  });
  server.on('request', app.handler);
  t.diagnostic('mock server ready');
  const browser = await chromium.launch({ headless: true });
  t.diagnostic('browser ready');
  t.after(async () => { await browser.close(); await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  t.diagnostic('page ready');
  await page.waitForFunction(() => document.getElementById('soopLogin')?.disabled === false);
  const state = await page.evaluate(async () => {
    const s = await (await fetch('/api/soop/status')).json();
    const r = await (await fetch('/api/soop/login', { method: 'POST', headers: { 'X-CSRF-Token': s.csrf } })).json();
    return new URL(r.url).searchParams.get('state');
  });
  await page.goto(`${origin}/?code=mock-code&state=${state}`);
  t.diagnostic('callback ready');
  await page.waitForFunction(() => window.RW?.soopConnected);
  assert.equal(await page.locator('#gateAuto').isDisabled(), true);
  await page.locator('#donationToggle').click();
  const namesBefore = '메리미*1, 안나*1';
  assert.equal(await page.locator('#names').inputValue(), '');
  assert.equal(await page.locator('#donationWait').count(), 0);
  send({ type: 'donation', userId: 'donor-a', nickname: '후원자', count: 100 });
  send({ type: 'chat', userId: 'someone-else', text: '오등록' });
  send({ type: 'chat', userId: 'donor-a(2)', text: '아무이름123' });
  await page.waitForFunction(() => document.getElementById('names').value.includes('아무이름123*10'));
  assert.equal((await page.locator('#names').inputValue()).includes('오등록'), false);
  assert.equal((await page.locator('#names').inputValue()).includes('후원자'), false);
  assert.equal(await page.evaluate(() => RW.S.marbles.filter(m => m.name === '아무이름123').length), 10);
  await page.screenshot({ path: 'C:/Users/andth/AppData/Local/Temp/donation-arbitrary-name.png' });
  await page.locator('#gameSeg [data-v="gate"]').click();
  await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.RW.S.phase === 'battle');
  const battleNames = await page.locator('#names').inputValue();
  send({ type: 'donation', userId: 'donor-b', nickname: '다른 후원자', count: 20 });
  send({ type: 'chat', userId: 'donor-b', text: '테스트이름' });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#names').inputValue(), battleNames);
  send('!왼'); send('!왼'); send('!왼');
  await page.waitForFunction(() => window.RW.gateGame.round.opened[0] > 0);
  await page.evaluate(() => window.RW.setPaused(true));
  const before = await page.evaluate(() => [...window.RW.gateGame.round.counts]);
  send('!오');
  // Wait on transport receipt in the test before comparing frozen game counters.
  await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(() => [...window.RW.gateGame.round.counts]), before);
  await page.locator('#btnStop').click();
  await page.waitForFunction(() => document.getElementById('names').value.includes('테스트이름*2'));
  await page.locator('#names').fill(namesBefore);
  await page.waitForTimeout(300);
  await page.locator('#gameSeg [data-v="arena"]').click();
  await page.evaluate(() => { window.RW.opt.view3d = false; });
  await page.locator('#btnStart').click();
  try { await page.waitForFunction(() => window.RW.S.phase === 'battle'); }
  catch (error) { t.diagnostic(JSON.stringify(await page.evaluate(() => ({phase: RW.S.phase, paused: RW.S.paused, countdown: RW.S.countdown, marbles: RW.S.marbles.length})))); t.diagnostic(JSON.stringify(errors)); throw error; }
  await page.waitForTimeout(250);
  send('<img src=x onerror=alert(1)> 응원합니다');
  await page.waitForFunction(() => document.querySelector('#soopAudience')?.textContent.includes('응원합니다'));
  assert.equal(await page.locator('#soopAudience img').count(), 0);
  for (let i = 0; i < 15; i++) send(`응원 ${i}`);
  await page.waitForFunction(() => document.querySelector('#soopAudience')?.textContent.includes('응원 14'));
  assert.ok(await page.locator('.soop-bubble').count() <= 4);
  const bottom = await page.locator('#soopAudience').boundingBox();
  assert.ok(bottom.y > 600, 'audience stays at the bottom of the 900px viewport');
  send('!화이팅');
  await page.waitForFunction(() => document.querySelector('.soop-marble-bubble')?.textContent === '화이팅');
  assert.equal(await page.locator('#soopAudience').textContent().then(text => text.includes('!화이팅')), false);
  await page.locator('.soop-marble-bubble').waitFor({ state: 'visible' });
  const targetName = await page.evaluate(() => RW.aliveList()[0].name);
  send(`!${targetName} 지정 응원`);
  await page.waitForFunction(() => [...document.querySelectorAll('.soop-marble-bubble')].some(e => e.textContent === '지정 응원' && !e.hidden));
  assert.equal(await page.evaluate(name => {
    const el = [...document.querySelectorAll('.soop-marble-bubble')].find(e => e.textContent === '지정 응원');
    return RW.aliveList().filter(m => m.name === name).some(m => {
      const p = RW.chatAnchor(m); return p.visible && Math.abs(parseFloat(el.style.left) - p.x) < 30 && Math.abs(parseFloat(el.style.top) - p.y) < 30;
    });
  }, targetName), true);
  send('!(존재하지않는구슬) 잘못된 대상');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.soop-marble-bubble').allTextContents().then(texts => texts.includes('잘못된 대상')), false);
  await page.screenshot({path:'../artifacts/soop-chat-bottom.png'});
  await page.evaluate(() => window.RW.setPaused(true));
  await page.waitForFunction(() => !document.querySelector('.soop-marble-bubble'));
  await page.locator('#soopLogout').click();
  await page.waitForFunction(() => !window.RW.soopConnected);
  assert.equal(await page.locator('.soop-bubble').count(), 0);
  assert.deepEqual(errors, []);
});

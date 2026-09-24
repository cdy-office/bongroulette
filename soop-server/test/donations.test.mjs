import test from 'node:test';
import assert from 'node:assert/strict';
import { DonationCollector, addNames, validName, donorAccountId } from '../../soop-donations.js';

test('gift and chat connection IDs match the same account without mixing other donors', () => {
  const c = new DonationCollector({ now: () => 1000 }); c.start(10);
  c.receive({ id: 'g', type: 'donation', userId: 'viewer', count: 100, at: 1000 });
  c.receive({ id: 'other', type: 'chat', userId: 'viewer2(1)', text: '다른 사람', at: 1000 });
  assert.equal(c.rows[0].status, 'waiting');
  c.receive({ id: 'c', type: 'chat', userId: 'viewer(2)', text: '새로운이름', at: 1000 });
  assert.equal(c.rows[0].name, '새로운이름');
  assert.equal(c.rows[0].status, 'ready');
  c.receive({ id: 'repeat', type: 'chat', userId: 'viewer(3)', text: '중복 금지', at: 1000 });
  assert.equal(c.rows[0].name, '새로운이름');
  assert.equal(donorAccountId('viewer(12)'), 'viewer');
  assert.equal(donorAccountId('viewer2'), 'viewer2');
});

test('timely server arrival survives a busy UI without extending the five-second window', () => {
  let now = 1000;
  const c = new DonationCollector({ now: () => now }); c.start(10);
  c.receive({ id: 'g', type: 'donation', userId: 'a', count: 10, at: 1000 });
  now = 7000; c.tick();
  c.receive({ id: 'c', type: 'chat', userId: 'a', text: '정상 수신', at: 2000 });
  assert.equal(c.rows[0].status, 'ready');
  c.rows[0].status = 'applied';
  c.receive({ id: 'next', type: 'donation', userId: 'a(2)', count: 10, at: 7000 });
  assert.equal(c.rows[0].status, 'applied');
  c.receive({ id: 'g2', type: 'donation', userId: 'b', count: 10, at: 7000 });
  now = 13000; c.tick(); c.stop(); c.start(10);
  c.receive({ id: 'c2', type: 'chat', userId: 'b', text: '이전 접수', at: 8000 });
  assert.equal(c.rows[2].status, 'unmatched');
});

test('matches only the following chat of the same donor, once, within the TTS window', () => {
  let now = 1000;
  const c = new DonationCollector({ now: () => now }); c.start(10);
  const gift = { id: 'g1', type: 'donation', userId: 'a', nickname: '후원자', count: 105, at: now };
  c.receive(gift); c.receive(gift);
  assert.equal(c.rows.length, 1);
  c.receive({ id: 'c1', type: 'chat', userId: 'b', text: '잘못된 이름', at: now });
  assert.equal(c.rows[0].status, 'waiting');
  c.receive({ id: 'c2', type: 'chat', userId: 'a', text: '메리미', at: now });
  assert.equal(c.rows[0].name, '메리미'); assert.equal(c.rows[0].quantity, 10); assert.equal(c.rows[0].remainder, 5);
  c.receive({ id: 'c3', type: 'chat', userId: 'a', text: '바꾸지 않기', at: now });
  assert.equal(c.rows[0].name, '메리미');
  c.receive({ ...gift, id: 'g2' }); now += 5001;
  c.receive({ id: 'c4', type: 'chat', userId: 'a', text: '늦은 메시지', at: now });
  assert.equal(c.rows[1].status, 'unmatched'); assert.equal(c.rows[1].name, '');
});
test('new gift supersedes unmatched gift; stop prevents accidental next-session matches', () => {
  const c = new DonationCollector({ now: () => 1000 }); c.start(20);
  for (const id of ['a', 'b']) c.receive({ id, type: 'donation', userId: 'u', count: 100, at: 1000 });
  assert.equal(c.rows[0].status, 'unmatched'); c.stop(); c.start(1);
  assert.equal(c.receive({ id: 'chat', type: 'chat', userId: 'u', text: '이름', at: 1000 }), false);
  assert.equal(c.rows[1].quantity, 5);
});
test('merges existing names, preserves more than 500 copies, refuses overflow and count injection', () => {
  assert.equal(addNames('메리미*2, 안나*1', '메리미', 10), '메리미*12, 안나*1');
  assert.equal(addNames('메리미*500', '메리미', 100), '메리미*500, 메리미*100');
  assert.throws(() => addNames('메리미*500,메리미*500', '안나', 1), /1,000/);
  for (const name of ['메리미*100', '안나,메리미', '안나\n메리미', '안나x100', '']) assert.equal(validName(name), false);
});

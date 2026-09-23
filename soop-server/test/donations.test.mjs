import test from 'node:test';
import assert from 'node:assert/strict';
import { DonationCollector, addNames, validName } from '../../soop-donations.js';

test('matches only the following chat of the same donor, once, within the TTS window', () => {
  let now = 1000;
  const c = new DonationCollector({ now: () => now }); c.start(10, 15);
  const gift = { id: 'g1', type: 'donation', userId: 'a', nickname: '후원자', count: 105, at: now };
  c.receive(gift); c.receive(gift);
  assert.equal(c.rows.length, 1);
  c.receive({ id: 'c1', type: 'chat', userId: 'b', text: '잘못된 이름', at: now });
  assert.equal(c.rows[0].status, 'waiting');
  c.receive({ id: 'c2', type: 'chat', userId: 'a', text: '메리미', at: now });
  assert.equal(c.rows[0].name, '메리미'); assert.equal(c.rows[0].quantity, 10); assert.equal(c.rows[0].remainder, 5);
  c.receive({ id: 'c3', type: 'chat', userId: 'a', text: '바꾸지 않기', at: now });
  assert.equal(c.rows[0].name, '메리미');
  c.receive({ ...gift, id: 'g2' }); now += 16000;
  c.receive({ id: 'c4', type: 'chat', userId: 'a', text: '늦은 메시지', at: now });
  assert.equal(c.rows[1].status, 'unmatched'); assert.equal(c.rows[1].name, '');
});
test('new gift supersedes unmatched gift; stop prevents accidental next-session matches', () => {
  const c = new DonationCollector({ now: () => 1000 }); c.start(20, 15);
  for (const id of ['a', 'b']) c.receive({ id, type: 'donation', userId: 'u', count: 100, at: 1000 });
  assert.equal(c.rows[0].status, 'unmatched'); c.stop(); c.start(1, 15);
  assert.equal(c.receive({ id: 'chat', type: 'chat', userId: 'u', text: '이름', at: 1000 }), false);
  assert.equal(c.rows[1].quantity, 5);
});
test('merges existing names, preserves more than 500 copies, refuses overflow and count injection', () => {
  assert.equal(addNames('메리미*2, 안나*1', '메리미', 10), '메리미*12, 안나*1');
  assert.equal(addNames('메리미*500', '메리미', 100), '메리미*500, 메리미*100');
  assert.throws(() => addNames('메리미*500,메리미*500', '안나', 1), /1,000/);
  for (const name of ['메리미*100', '안나,메리미', '안나\n메리미', '안나x100', '']) assert.equal(validName(name), false);
});

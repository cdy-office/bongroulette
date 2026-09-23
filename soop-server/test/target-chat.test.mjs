import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatReceiver, speechCandidates } from '../../soop-chat.js';
test('targeted speech parses name separately; untargeted speech stays random and ordinary chat stays audience', () => {
  const spoken = [], shown = [];
  const receiver = createChatReceiver({ now: () => 1000, game: () => ({ phase: 'battle', mode: 'arena' }), command: () => false,
    show: text => shown.push(text), speak: (...args) => { spoken.push(args); return true; } });
  const send = (id, text) => receiver.receive({ id, text, at: 1000 });
  send('1', '!(아무이름123) 화이팅'); send('2', '!힘내'); send('3', '일반 채팅');
  assert.deepEqual(spoken, [['화이팅', '아무이름123'], ['힘내']]); assert.deepEqual(shown, ['일반 채팅']);
  for (const [i, text] of ['!() 대사', '!(이름)', '!(이름)   ', '!(이름 대사'].entries()) assert.equal(send(`bad${i}`, text), false);
});
test('target selection is exact, alive-only, accepts arbitrary names and retains same-name candidates', () => {
  const marbles = [{ name: '새 이름', alive: true }, { name: '새 이름', alive: true }, { name: '새', alive: true }, { name: '탈락자', alive: false }];
  assert.equal(speechCandidates(marbles, '새 이름').length, 2);
  assert.equal(speechCandidates(marbles).length, 3);
  assert.equal(speechCandidates(marbles, '탈락자').length, 0);
  assert.equal(speechCandidates(marbles, '없는 이름').length, 0);
});

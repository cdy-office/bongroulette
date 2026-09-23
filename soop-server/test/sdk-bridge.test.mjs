import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSdk } from '../sdk-bridge.mjs';

test('SDK readiness enables room access before relaying text without closing', async t => {
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  let instance, closed = 0;
  const messages = [];
  class Sdk {
    constructor() { instance = this; this.ready = false; }
    handleReady(fn) { this.onReady = () => { this.ready = true; fn(); }; }
    handleMessageReceived(fn) { this.onMessage = fn; }
    handleChatClosed(fn) { this.onClose = fn; }
    handleError(fn) { this.onError = fn; }
    setAuth() {}
    async connect() { this.onReady?.(); this.onMessage('JOIN', {}); }
    getRoomInfo() {
      if (!this.ready) { this.onError(); throw new Error('connection-failed'); }
      return { bjId: 'test-streamer' };
    }
  }
  globalThis.window = { SOOP: { ChatSDK: Sdk }, deliverChat: text => messages.push(text), chatClosed: () => closed++ };
  await initializeSdk({ clientId: 'test', clientSecret: 'test', accessToken: 'test' });
  assert.equal(instance.getRoomInfo().bjId, 'test-streamer');
  instance.onMessage('MESSAGE', { message: '!왼', userId: 'not-forwarded' });
  instance.onMessage('DONATION', { message: 'not-forwarded' });
  assert.deepEqual(messages, ['!왼']);
  assert.equal(closed, 0);
  instance.onClose();
  assert.equal(closed, 1);
});

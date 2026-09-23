import { chromium } from 'playwright';

const SDK_URL = 'https://static.sooplive.com/asset/app/chat-sdk/sooplive-chat-sdk.js';

// Serialized into the private browser by Playwright; keep this self-contained.
export async function initializeSdk({ clientId, clientSecret, accessToken }) {
  const sdk = new window.SOOP.ChatSDK(clientId, clientSecret);
  window.privateChatSdk = sdk;
  let ready, rejectReady;
  const joined = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const timeout = setTimeout(() => rejectReady(new Error('Chat join timed out')), 20000);
  // The SDK sets its internal readiness flag inside this handler. A JOIN
  // message alone does not unlock getRoomInfo() and other room methods.
  sdk.handleReady(() => ready());
  sdk.handleMessageReceived((action, data) => {
    if (action === 'MESSAGE' && typeof data?.message === 'string') {
      window.deliverChat({ type: 'chat', text: data.message.slice(0, 320), userId: String(data.userId || '').slice(0, 100) });
    }
    if (action === 'BALLOON_GIFTED' && !data?.fromVod && !data?.relaysBroad && Number.isSafeInteger(data?.count) && data.count > 0) {
      window.deliverChat({ type: 'donation', count: data.count, userId: String(data.userId || '').slice(0, 100), nickname: String(data.userNickname || '').slice(0, 100) });
    }
  });
  sdk.handleChatClosed(() => {
    rejectReady(new Error('Chat closed before ready'));
    window.chatClosed();
  });
  sdk.handleError(() => { rejectReady(new Error('Chat connection failed')); window.chatClosed(); });
  sdk.setAuth(accessToken);
  try { await Promise.all([sdk.connect(), joined]); } finally { clearTimeout(timeout); }
}

// SOOP's SDK sends the client secret on chat join. Run it ONLY in a private
// server-side browser, never in the visitor's browser or a public asset.
export function createSdkBridge({ clientId, clientSecret, origin = 'http://127.0.0.1:4174' }) {
  let browserPromise;
  async function browser() {
    if (!browserPromise) browserPromise = chromium.launch({ headless: true }).catch(error => {
      browserPromise = null;
      throw error;
    });
    return browserPromise;
  }
  return {
    async connect(accessToken, onMessage, onClosed) {
      const context = await (await browser()).newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      let stopped = false;
      const close = async () => {
        if (stopped) return;
        stopped = true;
        await context.close().catch(() => {});
      };
      try {
        const runtimeUrl = new URL('/__private-sdk', origin).href;
        await page.route(runtimeUrl, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Private SOOP runtime</title>' }));
        await page.goto(runtimeUrl);
        await page.exposeFunction('deliverChat', message => {
          if (!stopped) onMessage(message);
        });
        await page.exposeFunction('chatClosed', () => { if (!stopped) onClosed(); });
        await page.addScriptTag({ url: SDK_URL });
        await page.evaluate(initializeSdk, { clientId, clientSecret, accessToken });
        const room = await page.evaluate(() => window.privateChatSdk.getRoomInfo());
        if (!room?.bjId) throw new Error('Broadcast unavailable');
        return { broadcaster: String(room.bjId).slice(0, 100), close };
      } catch {
        await close();
        throw new Error('방송 채팅에 접속하지 못했습니다. 본인 방송이 진행 중인지와 승인 범위를 확인해주세요.');
      }
    },
    async close() {
      if (browserPromise) await (await browserPromise).close();
      browserPromise = null;
    }
  };
}

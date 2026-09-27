import { createChatReceiver, speechCandidates } from './soop-chat.js';
import { mountDonations } from './soop-donations.js';
const $ = id => document.getElementById(id);
const welcome = document.createElement('dialog');
welcome.id = 'soopWelcome';
welcome.setAttribute('aria-labelledby', 'soopWelcomeTitle');
welcome.innerHTML = `<section id="soopPanel">
  <img class="soop-logo" src="soop.svg" alt="SOOP">
  <p class="soop-eyebrow">봉룰렛에 오신 것을 환영합니다</p>
  <h2 id="soopWelcomeTitle">시청자와 함께 플레이하세요</h2>
  <p class="soop-intro">방송 채팅과 별풍선 자동 입력을 연결해<br>시청자와 함께 즐길 수 있어요.</p>
  <div class="soop-actions"><button type="button" id="soopLogin" disabled>SOOP 로그인 · 연결</button><button type="button" id="soopGuest">로그인 없이 시작</button></div>
  <p id="soopStatus" role="status">연결 설정 확인 중…</p>
  <small>연결하려면 본인 방송을 켜주세요.<br>채팅 내용이 게임 화면과 방송에 표시될 수 있습니다.</small>
</section>`;
document.body.append(welcome);
let guestDismissed = false;
try { guestDismissed = sessionStorage.getItem('rw-soop-guest') === '1'; } catch {}
function showWelcome(force = false) {
  if ((force || !guestDismissed) && !welcome.open) welcome.showModal();
}
function dismissWelcome() {
  guestDismissed = true;
  try { sessionStorage.setItem('rw-soop-guest', '1'); } catch {}
  welcome.close();
  $('names')?.focus({ preventScroll: true });
}
$('soopGuest').addEventListener('click', dismissWelcome);
welcome.addEventListener('cancel', event => { event.preventDefault(); dismissWelcome(); });
const audience = document.createElement('aside');
audience.id = 'soopAudience';
audience.setAttribute('aria-label', '관중석 채팅');
audience.hidden = true;
document.body.append(audience);
const marbleChat = document.createElement('aside');
marbleChat.id = 'soopMarbleChat';
marbleChat.setAttribute('aria-label', '구슬 응원 채팅');
document.body.append(marbleChat);
let speeches = [], speechFrame = 0;
function animateSpeech() {
  speechFrame = 0;
  const s = state();
  speeches = speeches.filter(entry => {
    const valid = live && s?.phase === 'battle' && !s.paused && !s.finished && s.mode === entry.mode && window.RW.S.time >= entry.gameTime && window.RW.S.marbles.includes(entry.marble) && entry.marble.alive && Date.now() < entry.expires;
    if (!valid) { entry.node.remove(); return false; }
    const p = window.RW.chatAnchor(entry.marble);
    entry.node.hidden = !p?.visible;
    if (p?.visible) { entry.node.style.left = `${p.x}px`; entry.node.style.top = `${p.y}px`; }
    return true;
  });
  if (speeches.length) speechFrame = requestAnimationFrame(animateSpeech);
}
function speak(text, target = '') {
  const alive = speechCandidates(window.RW.aliveList(), target);
  if (!alive.length) return false;
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const marble = alive[Math.floor(random * alive.length)];
  speeches = speeches.filter(entry => { if (entry.marble !== marble) return true; entry.node.remove(); return false; });
  const node = document.createElement('div'); node.className = 'soop-marble-bubble'; node.textContent = text;
  node.hidden = true; marbleChat.append(node);
  speeches.push({ node, marble, mode: state().mode, gameTime: window.RW.S.time, expires: Date.now() + 4000 });
  if (speeches.length > 4) speeches.shift().node.remove();
  if (!speechFrame) speechFrame = requestAnimationFrame(animateSpeech);
  return true;
}
let csrf = '', stream = null, live = false, pending = false, configured = false, clockOffset = 0;
const donations = mountDonations({ host: $('nameEntry'), names: $('names'), idle: () => window.RW?.S.phase === 'idle', now: () => Date.now() + clockOffset, onNamesChanged: () => window.RW.setup() });
let items = [], lastPhase = '', lastMode = '', lastTime = 0;
function state() {
  const rw = window.RW;
  if (!rw) return null;
  return { phase: rw.S.phase, paused: rw.S.paused, finished: !!rw.S.finish, mode: rw.opt.game, round: (rw.opt.game === 'cannon' ? rw.cannonGame : rw.gateGame)?.round?.round };
}
function drawAudience() {
  const fragment = document.createDocumentFragment();
  for (const entry of items) {
    const bubble = document.createElement('div');
    bubble.className = 'soop-bubble';
    bubble.textContent = entry.text;
    fragment.append(bubble);
  }
  audience.replaceChildren(fragment); audience.hidden = !items.length;
}
function clearAudience() { items = []; drawAudience(); speeches = []; marbleChat.replaceChildren(); if (speechFrame) cancelAnimationFrame(speechFrame); speechFrame = 0; }
const receiver = createChatReceiver({
  now: () => Date.now() + clockOffset,
  game: state,
  names: () => window.RW?.S.marbles.map(m => m.name) || [],
  command: (text, meta) => window.RW?.gateCommand(text, meta) || false,
  speak,
  show: text => {
    items.push({ text, expires: Date.now() + 6000 });
    items = items.slice(-4); drawAudience();
  }
});
function setStatus(message) {
  $('soopStatus').textContent = message;
}
function setLive(value) {
  live = value;
  donations.connected(value);
  if (window.RW) window.RW.soopConnected = value;
  if (value) welcome.close();
  $('soopLogin').disabled = pending || !configured;
  if (!value) { clearAudience(); receiver.clear(); }
}
function stopStream() { if (stream) stream.close(); stream = null; setLive(false); }
async function api(path, method = 'GET') {
  const response = await fetch(`/api/soop/${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: method === 'POST' ? { 'X-CSRF-Token': csrf } : {} });
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('이 주소에서는 아직 SOOP 연결 서버를 사용할 수 없습니다.');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '연결 요청에 실패했습니다.');
  return body;
}
function connectStream(broadcaster) {
  stopStream(); stream = new EventSource('/api/soop/events');
  stream.addEventListener('ready', () => { setLive(true); setStatus(`${broadcaster} 방송 채팅에 연결되었습니다.`); });
  stream.onmessage = event => { try { const data = JSON.parse(event.data); const used = donations.receive(data); if (data.type !== 'donation' && !used) receiver.receive(data); } catch { /* Invalid events are discarded. */ } };
  const closed = () => { stopStream(); setStatus('채팅 연결이 종료되었습니다. 방송 상태를 확인하고 다시 로그인해주세요.'); };
  stream.addEventListener('closed', closed);
  stream.onerror = closed; // No automatic reconnect or replay into another round.
}
async function refresh() {
  try {
    const status = await api('status'); csrf = status.csrf; configured = status.configured;
    clockOffset = Number.isFinite(status.serverTime) ? status.serverTime - Date.now() : 0;
    setLive(false);
    if (status.connected) connectStream(status.broadcaster);
    else setStatus(configured ? '본인 방송을 켜고 SOOP 로그인으로 연결해주세요.' : 'SOOP 키 설정이 필요합니다. 운영자 설정을 완료한 뒤 새로고침해주세요.');
    return status.connected;
  } catch (error) { configured = false; setLive(false); setStatus(error.message); return false; }
}
$('soopLogin').addEventListener('click', async () => {
  if (pending) return;
  pending = true; $('soopLogin').disabled = true;
  try {
    const status = await api('status'); csrf = status.csrf;
    const result = await api('login', 'POST'); const url = new URL(result.url);
    if (url.origin !== 'https://openapi.sooplive.com' || url.pathname !== '/auth/code') throw new Error('로그인 주소를 확인하지 못했습니다.');
    location.assign(url.href);
  } catch (error) { setStatus(error.message); pending = false; $('soopLogin').disabled = !configured; }
});
window.addEventListener('pagehide', () => stopStream());
setInterval(() => {
  const s = state(), time = window.RW?.S.time || 0;
  if (!s || !live || s.phase !== 'battle' || s.paused || s.finished || s.mode !== lastMode || s.phase !== lastPhase || time < lastTime) clearAudience();
  const keep = items.filter(entry => entry.expires > Date.now());
  if (keep.length !== items.length) { items = keep; drawAudience(); }
  lastMode = s?.mode; lastPhase = s?.phase; lastTime = time;
}, 200);
const current = new URL(location.href), result = current.searchParams.get('soop');
if (current.searchParams.has('code')) {
  current.searchParams.delete('code'); current.searchParams.delete('state');
  history.replaceState(null, '', current.pathname + current.search + current.hash);
  setStatus('로그인 복귀 주소가 인증 서버로 연결되지 않았습니다. 운영자 설정을 확인해주세요.');
  showWelcome(true);
} else {
  current.searchParams.delete('soop');
  if (result) history.replaceState(null, '', current.pathname + current.search + current.hash);
  const connected = await refresh();
  const errors = {
    state: '로그인 보안 확인에 실패했습니다. SOOP의 인증 응답 설정을 확인해야 합니다.',
    expired: '로그인 요청 시간이 만료되었습니다. 다시 로그인해주세요.',
    cancelled: 'SOOP 로그인이 취소되었습니다.',
    auth: 'SOOP 인증을 완료하지 못했습니다. 다시 로그인해주세요.',
    connection: '채팅 연결에 실패했습니다. 본인 방송이 진행 중인지와 승인 범위를 확인해주세요.',
    closed: '채팅 연결이 종료되었습니다. 다시 로그인해주세요.'
  };
  if (errors[result]) { setStatus(errors[result]); showWelcome(true); }
  else if (!connected) showWelcome();
}

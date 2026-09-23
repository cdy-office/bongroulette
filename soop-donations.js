// SOOP's own notice widget matches a gift to the sender's following chat.
// Keep the match one-shot and short-lived; never use a donor nickname as a name.
export class DonationCollector {
  constructor({ now = Date.now, onChange = () => {} } = {}) {
    this.now = now; this.onChange = onChange; this.rows = []; this.seen = new Set(); this.active = false;
  }
  start(unit, seconds) {
    if (!Number.isSafeInteger(unit) || unit < 1 || unit > 100000 || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 120) return false;
    this.unit = unit; this.seconds = seconds; this.active = true; return true;
  }
  stop() { this.active = false; for (const row of this.rows) if (row.status === 'waiting') row.status = 'unmatched'; this.onChange(); }
  tick() {
    let changed = false;
    for (const row of this.rows) if (row.status === 'waiting' && this.now() > row.deadline) { row.status = 'unmatched'; changed = true; }
    if (changed) this.onChange();
  }
  receive(event) {
    this.tick();
    if (!this.active || !event?.id || this.seen.has(event.id) || !Number.isFinite(event.at) || Math.abs(this.now() - event.at) > 15000) return false;
    this.seen.add(event.id); if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value);
    if (event.type === 'donation') {
      if (!Number.isSafeInteger(event.count) || event.count <= 0) return false;
      // As in the SOOP widget, a newer gift replaces the previous unmatched
      // gift from this sender. Preserve the older row for manual correction.
      for (const row of this.rows) if (event.userId && row.userId === event.userId && row.status === 'waiting') row.status = 'unmatched';
      if (this.rows.length >= 1000) { this.stop(); return false; }
      this.rows.push({ id: event.id, userId: event.userId, donor: event.nickname || '후원자', count: event.count,
        quantity: Math.floor(event.count / this.unit), remainder: event.count % this.unit,
        at: event.at, deadline: event.at + this.seconds * 1000, name: '', status: event.userId ? 'waiting' : 'unmatched' });
      if (this.rows.length >= 1000) { this.stop(); return true; }
      this.onChange(); return true;
    }
    if (event.type !== 'chat' || !event.userId || typeof event.text !== 'string' || !event.text.trim()) return false;
    const row = [...this.rows].reverse().find(r => r.status === 'waiting' && r.userId === event.userId && event.at >= r.at && event.at <= r.deadline);
    if (!row) return false;
    row.name = event.text.trim(); row.status = validName(row.name) ? 'ready' : 'invalid';
    this.onChange(); return true;
  }
}
export function validName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 80 && !/[\r\n,*×\u0000-\u001f]/u.test(name) && !/[xX]\s*\d+$/.test(name);
}
export function addNames(text, name, quantity) {
  if (!validName(name) || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('이름 또는 구슬 수를 확인해주세요.');
  const counts = new Map(); let total = 0;
  for (const token of text.split(/[\n,]/).map(s => s.trim()).filter(Boolean)) {
    const m = token.match(/^(.*?)\s*[*xX×]\s*(\d+)$/);
    const key = m?.[1]?.trim() || token;
    const count = m?.[1]?.trim() ? Math.max(1, Math.min(500, parseInt(m[2], 10) || 1)) : 1;
    counts.set(key, (counts.get(key) || 0) + count); total += count;
  }
  if (total + quantity > 1000) throw new Error('구슬 최대 1,000개를 초과해 대기 중입니다. 명단을 정리한 뒤 반영해주세요.');
  counts.set(name, (counts.get(name) || 0) + quantity);
  const tokens = [];
  for (const [key, count] of counts) for (let left = count; left > 0; left -= 500) tokens.push(`${key}*${Math.min(left, 500)}`);
  return tokens.join(', ');
}

export function mountDonations({ host, names, idle, now, onNamesChanged }) {
  const box = document.createElement('details'); box.id = 'donationPanel';
  box.innerHTML = '<summary>🎈 별풍선 자동 입력 <span id="donationBadge"></span></summary><div class="donation-settings"><label>구슬 1개당 <input id="donationUnit" type="number" min="1" max="100000" value="10" list="donationUnits"> 개</label><datalist id="donationUnits"><option value="1"><option value="10"><option value="20"><option value="100"></datalist><label>메시지 대기 <input id="donationWait" type="number" min="1" max="120" value="15"> 초</label><button id="donationToggle" type="button" disabled>접수 시작</button></div><p class="donation-help">별풍선 후원 후 같은 사람이 쓰는 첫 채팅을 구슬 이름으로 등록합니다. SOOP TTS 대기 시간과 맞춰주세요. 후원 건별 나머지는 제외합니다.</p><p id="donationStatus" role="status">SOOP 연결 후 접수를 시작해주세요.</p><div id="donationRows"></div><small>경기 중에는 대기하며, 종료 후 반영할 수 있습니다. 새로고침하면 접수 내역이 지워집니다.</small>';
  host.append(box);
  const $ = id => box.querySelector('#' + id);
  let connected = false;
  const collector = new DonationCollector({ now, onChange: draw });
  function apply(row) {
    if (!idle() || row.status !== 'ready') return;
    if (!row.quantity) { row.status = 'below'; return; }
    try { names.value = addNames(names.value, row.name, row.quantity); onNamesChanged(); row.status = 'applied'; row.error = ''; }
    catch (error) { row.error = error.message; }
  }
  function draw() {
    for (const row of collector.rows) if (row.status === 'ready' && !row.error) apply(row);
    $('donationUnit').disabled = $('donationWait').disabled = collector.active;
    $('donationToggle').disabled = !connected || collector.rows.length >= 1000;
    $('donationToggle').textContent = collector.active ? '접수 마감' : '접수 시작';
    $('donationBadge').textContent = collector.active ? '· 접수 중' : '';
    const waiting = collector.rows.filter(r => !['applied', 'below'].includes(r.status)).length;
    $('donationStatus').textContent = `접수 ${collector.rows.length}건 · 반영 ${collector.rows.filter(r => r.status === 'applied').reduce((n, r) => n + r.quantity, 0)}구슬 · 대기 ${waiting}건${collector.rows.length >= 1000 ? ' · 1,000건 접수 한도로 마감됨' : ''}`;
    const fragment = document.createDocumentFragment();
    // All unresolved entries stay accessible; completed entries show the last ten.
    const completed = collector.rows.filter(r => ['applied', 'below'].includes(r.status)).slice(-10);
    for (const row of [...collector.rows.filter(r => !['applied', 'below'].includes(r.status)), ...completed].reverse()) {
      const el = document.createElement('div'); el.className = 'donation-row';
      const line = document.createElement('div');
      const labels = { waiting: '메시지 대기', unmatched: '메시지 미수신', invalid: '이름 확인 필요', ready: '반영 대기', applied: '반영 완료', below: '기준 미달' };
      line.textContent = `${row.donor} · ${row.count}개 → ${row.quantity}구슬 · ${labels[row.status]}${row.remainder ? ` (나머지 ${row.remainder}개 제외)` : ''}`; el.append(line);
      if (row.name) { const text = document.createElement('b'); text.textContent = row.name; el.append(text); }
      if (row.error) { const error = document.createElement('div'); error.textContent = row.error; el.append(error); }
      if (['unmatched', 'invalid'].includes(row.status)) {
        const input = document.createElement('input'); input.placeholder = '후원 메시지의 이름'; input.maxLength = 80; input.value = row.name; input.setAttribute('aria-label', '후원 메시지의 이름');
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '이름 확인';
        button.onclick = () => { if (!validName(input.value.trim())) { input.setCustomValidity('이름은 80자 이내로, 쉼표·줄바꿈·수량 표기 없이 입력해주세요.'); input.reportValidity(); return; } row.name = input.value.trim(); row.status = 'ready'; row.error = ''; draw(); };
        input.oninput = () => input.setCustomValidity(''); el.append(input, button);
      } else if (row.status === 'ready') {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '명단에 반영'; button.disabled = !idle();
        button.onclick = () => { row.error = ''; apply(row); draw(); }; el.append(button);
      }
      fragment.append(el);
    }
    $('donationRows').replaceChildren(fragment);
  }
  $('donationToggle').onclick = () => {
    if (collector.active) collector.stop();
    else if (!collector.start(Number($('donationUnit').value), Number($('donationWait').value))) { $('donationStatus').textContent = '별풍선 수는 1~100000, 대기 시간은 1~120의 정수로 입력해주세요.'; return; }
    draw();
  };
  let wasIdle = idle();
  setInterval(() => { collector.tick(); const isIdle = idle(); if (isIdle !== wasIdle) { wasIdle = isIdle; draw(); } }, 500);
  return { receive: event => collector.receive(event), connected(value) { connected = value; if (!value) collector.stop(); draw(); } };
}

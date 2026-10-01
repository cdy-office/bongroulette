// 면접 순서 추첨: 지원자 얼굴 공을 로또 추첨기에 넣고 한 명씩 뽑아 순번을 정한다.
// 결과는 순서판에 쌓이고, 끝나면 이미지(복사/저장)와 텍스트로 내보낸다.
// index.html의 모드 바에서 InterviewDraw.show()/hide()로 켜고 끈다.
(() => {
  'use strict';

  // 봉우리 모집글 지원자 (닉네임, SOOP 아이디). 목록에 없는 사람은 화면에서 아이디로 추가한다.
  const APPLICANTS = [
    ['카노ミ☆', 'kanoz0'], ['하루아_', 'tdw0926'], ['흠냥b', 'ttu0221'], ['소세비', 'sausevi'],
    ['아유앙레아엔', 'ayu0918v'], ['하링!', 'ruringruming'], ['해파린~', 'haepalin'], ['소라Sora', 'soraneko'],
    ['진저에일', 'gingerale24'], ['파깡', 'pakkangmon'], ['이샤리×', '22sharii22'], ['김잇딥', 'kim852134'],
    ['#김미키', 'xxxkimmickey'], ['김먕이', 'mynagi0307'], ['최강이연지', 'odaoda0988'], ['리르', 'allure282'],
    ['여올', 'tjdgk31470'], ['르니', 'leuni158'], ['매그피이', 'alskflcb123'], ['히요리-3-', 'hiyori71'],
    ['글리치코', 'glichko'], ['채서_', 'yea6218'], ['타마즈', 'tamazu'], ['오복이._.', 'jaengee'],
    ['제이제이잉', 'jejong5'], ['♥쥬링', 'jurin9'], ['리요', 'imleeyo'], ['네아♥', 'ranche4301'],
    ['♥미오', 'shiroganemio'], ['고백일', 'gobackil'], ['나비보라♥', 'nabibora'], ['델라리', 'dellary'],
    ['돝돝_', 'cyborgdotdot'], ['쁘이님', 'ioop0932'], ['루엔!', 'aksmfskfk'], ['크으캬', 'keueukya'],
    ['정밀류', 'jeongmillyu'], ['카우리3', 'kawri3'],
  ].map(([name, id]) => ({ name, id }));
  const STORE = 'bongInterview.v1';
  const ID_RE = /^[a-z0-9]{2,24}$/;
  const BOARD_COL = 225, BAR_H = 84;
  // 단계별 시간(초). speed로 한꺼번에 줄인다.
  const T = { mix: 1.6, toExit: .35, tube: .5, pop: .45, hold: 1.7, fly: .6, autoGap: .55 };

  const st = {
    title: '봉우리 면접 순서', sub: '', selected: [], extra: [], order: [],
    phase: 'setup', // setup → ready ⇄ (mixing → rising → reveal → fly) → done
    auto: false, fast: false,
  };
  let root, canvas, ctx, ui = {}, built = false, visible = false, raf = 0, last = 0;
  let W = 0, H = 0, dpr = 1, drum = { cx: 0, cy: 0, R: 200, tube: 70 }, cxNow = null;
  let balls = [], captured = null, timer = 0, air = .45, confetti = [], resetArmed = 0, autoWait = 0, mixSound = 0;
  const faces = new Map(), sprites = new Map();
  let layers = null;
  const api = { speed: 1, show, hide, get state() { return { phase: st.phase, order: [...st.order], pool: balls.map(b => b.id), selected: [...st.selected] }; } };
  window.InterviewDraw = api;

  const people = () => [...APPLICANTS, ...st.extra];
  const personOf = id => people().find(p => p.id === id) || { id, name: id };
  const sfx = (name, args) => { try { if (typeof SFX !== 'undefined') SFX.play(name, args || {}); } catch {} };
  const sp = () => api.speed * (st.fast ? 2 : 1);
  const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const hueOf = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!s || s.v !== 1) return;
      if (typeof s.title === 'string') st.title = s.title.slice(0, 30);
      if (typeof s.sub === 'string') st.sub = s.sub.slice(0, 30);
      st.extra = (Array.isArray(s.extra) ? s.extra : []).filter(p => p && ID_RE.test(p.id) && typeof p.name === 'string' && !APPLICANTS.some(a => a.id === p.id)).map(p => ({ id: p.id, name: p.name.slice(0, 20) }));
      const known = new Set(people().map(p => p.id));
      st.selected = (Array.isArray(s.selected) ? s.selected : []).filter(id => known.has(id));
      st.order = (Array.isArray(s.order) ? s.order : []).filter(id => st.selected.includes(id));
      st.fast = !!s.fast;
      if (st.order.length) st.phase = st.order.length >= st.selected.length ? 'done' : 'ready';
      else if (s.locked && st.selected.length) st.phase = 'ready';
    } catch {}
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ v: 1, title: st.title, sub: st.sub, selected: st.selected, extra: st.extra, order: st.order, fast: st.fast, locked: st.phase !== 'setup' })); } catch {}
  }

  // 얼굴: 지원자 38명은 사이트에 들어 있는 240px 움직이는 webp, 직접 추가한 사람은 서버가 SOOP에서 받아 준다.
  const faceSrc = id => APPLICANTS.some(a => a.id === id) ? `/assets/applicants/${id}.webp` : `/thumb/${id}`;
  function face(id) {
    let im = faces.get(id);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = faceSrc(id); faces.set(id, im); }
    return im;
  }
  const faceReady = im => im.complete && im.naturalWidth > 0;
  function faceEl(id, cls) {
    const box = document.createElement('span'); box.className = cls;
    box.style.setProperty('--h', hueOf(id));
    box.textContent = initial(id);
    const im = document.createElement('img'); im.alt = ''; im.src = faceSrc(id); im.draggable = false; im.onerror = () => im.remove();
    box.append(im);
    return box;
  }
  const initial = id => [...personOf(id).name.replace(/[^\p{L}\p{N}]/gu, '')][0] || '?';

  function build() {
    built = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    root = document.createElement('div'); root.id = 'iv'; root.hidden = true;
    root.innerHTML = `
      <canvas id="ivCanvas"></canvas>
      <aside id="ivSetup">
        <div class="ivHead">🎟️ 면접 순서 추첨<small>지원자를 골라 추첨기에 넣으세요</small></div>
        <label class="ivField"><span>제목</span><input id="ivTitle" maxlength="30"></label>
        <label class="ivField"><span>부제</span><input id="ivSub" maxlength="30" placeholder="예: 10월 3일 (토)"></label>
        <div class="ivPickHead"><span>지원자 <b id="ivCount">0</b>명</span><button type="button" id="ivAll">전체 선택</button><button type="button" id="ivNone">전체 해제</button></div>
        <div id="ivPeople"></div>
        <form id="ivAdd" autocomplete="off"><input id="ivAddId" placeholder="SOOP 아이디" maxlength="24"><input id="ivAddName" placeholder="닉네임" maxlength="20"><button type="submit">추가</button></form>
        <button type="button" id="ivStart" class="ivPrimary">🎟️ 추첨 시작</button>
      </aside>
      <aside id="ivBoard"><div class="ivBoardHead"><div id="ivBTitle"></div><div id="ivBSub"></div></div><ol id="ivSlots"></ol></aside>
      <div id="ivBar"></div>
      <div id="ivReveal"><div class="ivRevNum"></div><span class="ivRevFace"></span><div class="ivRevName"></div></div>
      <div id="ivToast" hidden></div>`;
    document.body.append(root);
    canvas = root.querySelector('#ivCanvas'); ctx = canvas.getContext('2d');
    for (const id of ['ivSetup', 'ivTitle', 'ivSub', 'ivCount', 'ivAll', 'ivNone', 'ivPeople', 'ivAdd', 'ivAddId', 'ivAddName', 'ivStart', 'ivBoard', 'ivBTitle', 'ivBSub', 'ivSlots', 'ivBar', 'ivReveal', 'ivToast']) ui[id] = root.querySelector('#' + id);
    ui.ivTitle.value = st.title; ui.ivSub.value = st.sub;
    // 숨은 카드에 모든 이름을 한 번 배치해 두면 첫 공개 때 글꼴 준비로 멈칫하지 않는다.
    ui.ivReveal.querySelector('.ivRevNum').textContent = '0번';
    ui.ivReveal.querySelector('.ivRevName').textContent = APPLICANTS.map(p => p.name).join(' ');
    ui.ivTitle.addEventListener('input', () => { st.title = ui.ivTitle.value; renderBoardHead(); save(); });
    ui.ivSub.addEventListener('input', () => { st.sub = ui.ivSub.value; renderBoardHead(); save(); });
    ui.ivAll.onclick = () => { st.selected = people().map(p => p.id); syncSelection(); };
    ui.ivNone.onclick = () => { st.selected = []; syncSelection(); };
    ui.ivAdd.addEventListener('submit', e => {
      e.preventDefault();
      const id = ui.ivAddId.value.trim().toLowerCase(), name = ui.ivAddName.value.trim() || id;
      if (!ID_RE.test(id)) return toast('SOOP 아이디는 영문 소문자와 숫자만 입력하세요');
      if (people().some(p => p.id === id)) { if (!st.selected.includes(id)) st.selected.push(id); syncSelection(); return toast('이미 목록에 있어 선택했어요'); }
      st.extra.push({ id, name: name.slice(0, 20) }); st.selected.push(id);
      ui.ivAddId.value = ui.ivAddName.value = '';
      renderPeople(); syncSelection();
    });
    ui.ivStart.onclick = () => { if (st.selected.length < 2) return toast('2명 이상 골라주세요'); ui.ivStart.blur(); st.phase = 'ready'; save(); renderAll(); sfx('go'); };
    window.addEventListener('keydown', e => {
      if (!visible || e.repeat || (e.code !== 'Space' && e.code !== 'Enter')) return;
      if (e.target.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      // 보이는 버튼에 포커스가 있으면 그 버튼이 눌리게 두고, 방금 숨겨진 버튼(추첨 시작)이면 뽑기로 받는다.
      if (e.target.closest?.('button') && e.target.offsetParent !== null) return;
      e.preventDefault(); draw();
    });
    window.addEventListener('resize', () => visible && layout());
    renderPeople();
  }

  function renderPeople() {
    ui.ivPeople.replaceChildren(...people().map(p => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ivPerson'; b.dataset.id = p.id; b.title = p.id;
      const nm = document.createElement('span'); nm.className = 'ivPName'; nm.textContent = p.name;
      b.append(faceEl(p.id, 'ivFace'), nm);
      if (st.extra.some(x => x.id === p.id)) {
        const x = document.createElement('i'); x.className = 'ivDel'; x.textContent = '×'; x.title = '목록에서 지우기';
        x.onclick = e => { e.stopPropagation(); st.extra = st.extra.filter(q => q.id !== p.id); st.selected = st.selected.filter(id => id !== p.id); renderPeople(); syncSelection(); };
        b.append(x);
      }
      b.onclick = () => { const i = st.selected.indexOf(p.id); i < 0 ? st.selected.push(p.id) : st.selected.splice(i, 1); syncSelection(); sfx(i < 0 ? 'ui' : 'uiOff'); };
      return b;
    }));
    syncSelection();
  }
  function syncSelection() {
    // 선택 순서와 상관없이 목록 순서로 정리한다.
    const all = people().map(p => p.id);
    st.selected = all.filter(id => st.selected.includes(id));
    ui.ivPeople.querySelectorAll('.ivPerson').forEach(b => b.classList.toggle('on', st.selected.includes(b.dataset.id)));
    ui.ivCount.textContent = st.selected.length;
    ui.ivStart.textContent = `🎟️ ${st.selected.length}명으로 추첨 시작`;
    if (st.phase === 'setup') syncBalls();
    layout(); save();
  }

  // 공: 추첨기 중심 기준 좌표. 이미 뽑힌 사람은 넣지 않는다.
  function syncBalls() {
    const want = st.selected.filter(id => !st.order.includes(id));
    balls = balls.filter(b => want.includes(b.id));
    const r = ballRadius(want.length);
    for (const b of balls) b.r = r;
    for (const id of want) if (!balls.some(b => b.id === id)) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * drum.R * .5;
      balls.push({ id, x: Math.cos(a) * d, y: -drum.R * .5 + Math.sin(a) * d * .5, vx: (Math.random() - .5) * 200, vy: 0, r });
      face(id);
    }
  }
  const ballRadius = n => Math.max(16, Math.min(drum.R * .27, drum.R * Math.sqrt(.3 / Math.max(n, 1))));

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const narrow = W < 900, n = Math.max(st.selected.length, 1);
    // 순서판: 세로로 다 들어가도록 열을 늘리고, 3열부터는 칸을 좁힌다.
    const maxRows = Math.max(6, Math.floor((H - BAR_H - 120) / 31));
    const cols = Math.max(n > 12 ? 2 : 1, Math.ceil(n / maxRows)), rows = Math.ceil(n / cols);
    const colW = cols >= 3 ? 172 : BOARD_COL, boardW = narrow ? 0 : cols * colW + 32;
    const setupW = st.phase === 'setup' && !narrow ? 340 : 0;
    // 모드 바와 겹치는 쪽 패널은 그 아래에서 시작한다.
    const side = (W - Math.min(920, W - 32)) / 2;
    const setupTop = side >= 340 ? 12 : BAR_H, boardTop = side >= boardW + 12 ? 12 : BAR_H;
    const rowH = Math.max(22, Math.min(56, Math.floor((H - boardTop - 12 - 92) / rows) - 6));
    for (const [k, v] of Object.entries({ '--ivCols': cols, '--ivRows': rows, '--ivColW': colW + 'px', '--ivRow': rowH + 'px', '--ivSetupTop': setupTop + 'px', '--ivBoardTop': boardTop + 'px' })) root.style.setProperty(k, v);
    const top = 92, bottom = 104, tube = 70, availW = W - setupW - boardW - 40;
    const R = Math.max(110, Math.min(availW / 2 - 20, (H - top - bottom - tube) / 2 - 6));
    const old = drum.R;
    drum = { cx: setupW + 20 + availW / 2, cy: top + tube + R, R, tube };
    if (cxNow === null) cxNow = drum.cx;
    ui.ivBar.style.left = drum.cx + 'px';
    if (old && old !== R) for (const b of balls) { b.x *= R / old; b.y *= R / old; }
    const r = ballRadius(balls.length); for (const b of balls) b.r = r;
    renderSlots();
  }

  function renderBoardHead() { ui.ivBTitle.textContent = st.title || '면접 순서'; ui.ivBSub.textContent = st.sub; ui.ivBSub.hidden = !st.sub; }
  function slotEl(i) {
    const li = document.createElement('li'); li.className = 'ivSlot';
    const num = document.createElement('b'); num.textContent = i + 1;
    li.append(num);
    const id = st.order[i];
    if (id) { li.classList.add('filled'); const nm = document.createElement('span'); nm.className = 'ivSName'; nm.textContent = personOf(id).name; li.append(faceEl(id, 'ivFace'), nm); }
    else { const e = document.createElement('span'); e.className = 'ivEmpty'; li.append(e); }
    return li;
  }
  function renderSlots() {
    renderBoardHead();
    ui.ivSlots.replaceChildren(...Array.from({ length: st.selected.length }, (_, i) => slotEl(i)));
  }

  function renderBar() {
    const bar = ui.ivBar; bar.replaceChildren();
    const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.onclick = e => { e.currentTarget.blur(); fn(); }; bar.append(b); return b; };
    if (st.phase === 'setup') return;
    if (st.phase === 'done') {
      btn('📋 텍스트 복사', copyText);
      btn('🖼️ 이미지 복사', copyImage, 'ivPrimary');
      btn('💾 이미지 저장', saveImage);
      btn(resetArmed ? '정말 처음부터?' : '↺ 처음부터', resetDraw, resetArmed ? 'ivWarn' : '');
      return;
    }
    const busy = st.phase !== 'ready', next = st.order.length + 1, left = st.selected.length - st.order.length;
    const main = btn(left === 1 ? `🎟️ 마지막 ${next}번 뽑기` : `🎟️ ${next}번 뽑기`, draw, 'ivPrimary ivDraw');
    main.disabled = busy;
    btn(st.auto ? '⏸ 자동 멈춤' : '▶ 자동 뽑기', () => { st.auto = !st.auto; autoWait = 0; renderBar(); }, st.auto ? 'on' : '');
    btn(st.fast ? '⏩ 빠르게' : '▶ 보통 속도', () => { st.fast = !st.fast; save(); renderBar(); }, st.fast ? 'on' : '');
    btn(resetArmed ? '정말 처음부터?' : '↺ 처음부터', resetDraw, resetArmed ? 'ivWarn' : '');
    const info = document.createElement('span'); info.className = 'ivLeft'; info.textContent = `남은 ${left}명`; bar.append(info);
  }
  function resetDraw() {
    if (!resetArmed) { resetArmed = performance.now(); renderBar(); return; }
    resetArmed = 0; st.order = []; st.phase = 'setup'; st.auto = false; captured = null; hideCard();
    balls = []; syncBalls(); save(); renderAll();
  }
  function renderAll() {
    root.dataset.phase = st.phase;
    ui.ivSetup.hidden = st.phase !== 'setup';
    layout(); renderBar();
    if (st.phase !== 'setup') syncBalls();
  }

  function draw() {
    if (st.phase !== 'ready' || !balls.length) return;
    st.phase = 'mixing'; timer = 0; mixSound = 0; root.dataset.phase = st.phase; renderBar();
  }
  function capture() {
    // 출구(통 맨 위)에 가장 가까운 공이 빨려 올라간다.
    let best = null, bd = Infinity;
    for (const b of balls) { const d = Math.hypot(b.x, b.y + drum.R); if (d < bd) { bd = d; best = b; } }
    balls = balls.filter(b => b !== best);
    captured = { ...best, sx: best.x, sy: best.y };
    st.phase = 'rising'; timer = 0; sfx('suck');
    // 공이 관을 올라가는 동안 카드 내용을 미리 채우고 이미지를 풀어 둔다.
    const card = ui.ivReveal;
    card.querySelector('.ivRevNum').textContent = `${st.order.length + 1}번`;
    card.querySelector('.ivRevName').textContent = personOf(captured.id).name;
    const box = faceEl(captured.id, 'ivRevFace');
    card.querySelector('.ivRevFace').replaceWith(box);
    box.querySelector('img')?.decode?.().catch(() => {});
  }
  // 카드는 숨길 때도 배치는 남겨 두고(첫 등장 때 글꼴·배치 준비로 멈칫하지 않게),
  // transform/opacity 애니메이션으로만 움직여 위치를 다시 계산하지 않는다.
  const cardAt = (x, y, s) => `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s})`;
  let cardAnim = null, cardTo = '';
  function moveCard(to, seconds, easing, opacity = [1, 1]) {
    const from = cardTo || to;
    cardAnim?.cancel(); cardTo = to;
    ui.ivReveal.classList.add('on');
    cardAnim = ui.ivReveal.animate([{ transform: from, opacity: opacity[0] }, { transform: to, opacity: opacity[1] }], { duration: seconds * 1000, easing, fill: 'forwards' });
  }
  function hideCard() { cardAnim?.cancel(); cardAnim = null; cardTo = ''; ui.ivReveal.classList.remove('on'); }
  function reveal() {
    const exit = toScreen(0, -drum.R - drum.tube);
    cardTo = cardAt(exit.x, exit.y, (captured.r * 2) / 220);
    moveCard(cardAt(drum.cx, drum.cy - drum.R * .12, 1), T.pop / sp(), 'cubic-bezier(.2,1.3,.4,1)');
    st.phase = 'reveal'; timer = 0; sfx('lap'); burst(drum.cx, drum.cy - drum.R * .12);
  }
  function fly() {
    const i = st.order.length;
    st.order.push(captured.id); captured = null; save();
    // 순서판 전체를 다시 만들지 않고 이번 칸만 바꾼다.
    const slot = slotEl(i);
    ui.ivSlots.children[i]?.replaceWith(slot);
    const faceBox = slot.querySelector('.ivFace');
    slot.classList.add('incoming');
    const target = (faceBox || slot).getBoundingClientRect();
    st.phase = 'fly'; timer = 0;
    if (!target.width) { hideCard(); return; }
    moveCard(cardAt(target.left + target.width / 2, target.top + target.height / 2, target.height / 220), T.fly / sp(), 'cubic-bezier(.6,0,.3,1)', [1, .35]);
  }
  function landed() {
    hideCard();
    const slot = ui.ivSlots.children[st.order.length - 1];
    slot?.classList.remove('incoming'); slot?.classList.add('pop');
    sfx('pass');
    if (st.order.length >= st.selected.length) { st.phase = 'done'; st.auto = false; save(); sfx('win'); burst(drum.cx, drum.cy, 160); }
    else st.phase = 'ready';
    autoWait = 0; root.dataset.phase = st.phase; renderBar();
  }

  function burst(x, y, n = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 220 + Math.random() * 520;
      confetti.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 260, life: 1.3 + Math.random() * .9, t: 0, h: Math.random() * 360, s: 5 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - .5) * 14 });
    }
  }

  function physics(dt) {
    const R = drum.R, k = R / 300, g = 1500 * k;
    for (const b of balls) {
      b.vy += g * dt;
      const depth = (b.y + R) / (2 * R);
      const j = air * (.55 + Math.random() * .9);
      b.vy -= j * 2300 * k * Math.max(0, depth - .2) * dt;
      b.vx += (Math.random() - .5) * air * 2600 * k * dt;
      const d = Math.hypot(b.x, b.y) || 1;
      b.vx += (-b.y / d) * air * 420 * k * dt; b.vy += (b.x / d) * air * 420 * k * dt;
      const damp = Math.exp(-.9 * dt); b.vx *= damp; b.vy *= damp;
      const s = Math.hypot(b.vx, b.vy), cap = 1500 * k; if (s > cap) { b.vx *= cap / s; b.vy *= cap / s; }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { const imp = -(1 + .78) * rel / 2; a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny; }
    }
    for (const b of balls) {
      const d = Math.hypot(b.x, b.y), lim = R - b.r - 3;
      if (d > lim) {
        const nx = b.x / d, ny = b.y / d; b.x = nx * lim; b.y = ny * lim;
        const vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
      }
    }
  }

  function update(dt) {
    const s = sp();
    if (resetArmed && performance.now() - resetArmed > 3000) { resetArmed = 0; renderBar(); }
    cxNow += (drum.cx - cxNow) * Math.min(1, dt * 6);
    const target = st.phase === 'mixing' ? 2.7 : st.phase === 'setup' ? .35 : .5;
    air += (target - air) * Math.min(1, dt * 3);
    const n = 4; for (let i = 0; i < n; i++) physics(dt / n);
    timer += dt * s;
    if (st.phase === 'mixing') {
      mixSound -= dt; if (mixSound <= 0) { sfx('shuffle'); mixSound = .22; }
      if (timer >= T.mix) capture();
    } else if (st.phase === 'rising') {
      if (timer >= T.toExit + T.tube) reveal();
    } else if (st.phase === 'reveal') {
      if (timer >= T.pop + T.hold) fly();
    } else if (st.phase === 'fly') {
      if (timer >= T.fly) landed();
    } else if (st.phase === 'ready' && st.auto) {
      autoWait += dt * s; if (autoWait >= T.autoGap) draw();
    }
    for (const c of confetti) { c.t += dt; c.vy += 900 * dt; c.vx *= Math.exp(-1.2 * dt); c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; }
    confetti = confetti.filter(c => c.t < c.life);
  }

  const toScreen = (x, y) => ({ x: cxNow + x, y: drum.cy + y });
  function risingPos() {
    const t = timer, R = drum.R, c = captured;
    if (t < T.toExit) { const k = ease(t / T.toExit); return { x: c.sx + (0 - c.sx) * k, y: c.sy + (-R + c.r * .3 - c.sy) * k }; }
    const k = ease(Math.min(1, (t - T.toExit) / T.tube));
    return { x: 0, y: -R + c.r * .3 + (-drum.tube + c.r * .2 - c.r * .3) * k };
  }

  // 움직이지 않는 그림(받침대, 관, 유리, 테두리)과 공 장식은 미리 그려 두고 매 프레임 붙이기만 한다.
  function offscreen(w, h) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    return { c, g, w, h, ox: 0, oy: 0 };
  }
  function drumLayers() {
    const { R, tube } = drum, tw = Math.round(balls.reduce((m, b) => Math.max(m, b.r), captured?.r || 24) + 9);
    const key = `${R}|${tube}|${tw}|${dpr}`;
    if (layers?.key === key) return layers;
    const pad = 12, baseW = R * 1.15;
    // 뒤: 받침대, 관, 유리 뒷면. 통 중심이 (ox, oy)에 온다.
    const back = offscreen(baseW * 2 + pad * 2, R * 2 + tube + 8 + 56 + pad * 2);
    back.ox = back.w / 2; back.oy = R + tube + 8 + pad;
    let g = back.g, cx = back.ox, cy = back.oy;
    const metal = g.createLinearGradient(cx - baseW, 0, cx + baseW, 0);
    metal.addColorStop(0, '#39424f'); metal.addColorStop(.5, '#8693a5'); metal.addColorStop(1, '#2f3742');
    g.fillStyle = metal;
    g.beginPath(); g.moveTo(cx - R * .45, cy + R * .78); g.lineTo(cx + R * .45, cy + R * .78); g.lineTo(cx + baseW / 1.1, cy + R + 46); g.lineTo(cx - baseW / 1.1, cy + R + 46); g.closePath(); g.fill();
    g.fillStyle = '#1d232c'; g.fillRect(cx - baseW, cy + R + 44, baseW * 2, 12);
    const tg = g.createLinearGradient(cx - tw, 0, cx + tw, 0);
    tg.addColorStop(0, 'rgba(160,210,255,.10)'); tg.addColorStop(.5, 'rgba(160,210,255,.03)'); tg.addColorStop(1, 'rgba(160,210,255,.12)');
    g.fillStyle = tg; g.fillRect(cx - tw, cy - R - tube, tw * 2, tube + 6);
    g.strokeStyle = 'rgba(190,225,255,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - tw, cy - R + 4); g.lineTo(cx - tw, cy - R - tube); g.moveTo(cx + tw, cy - R + 4); g.lineTo(cx + tw, cy - R - tube); g.stroke();
    g.fillStyle = '#c9a54a'; g.fillRect(cx - tw - 6, cy - R - tube - 8, tw * 2 + 12, 8);
    const glass = g.createRadialGradient(cx - R * .25, cy - R * .3, R * .1, cx, cy, R);
    glass.addColorStop(0, 'rgba(120,190,255,.10)'); glass.addColorStop(1, 'rgba(40,80,130,.22)');
    g.fillStyle = glass; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    // 앞: 테두리와 유리 반사광.
    const front = offscreen(R * 2 + 16, R * 2 + 16);
    front.ox = front.oy = R + 8; g = front.g; cx = cy = R + 8;
    const rim = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, '#dfe7f1'); rim.addColorStop(.5, '#7d8a9b'); rim.addColorStop(1, '#c5cfdb');
    g.strokeStyle = rim; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = R * .05; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, R * .86, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    g.lineWidth = R * .02; g.beginPath(); g.arc(cx, cy, R * .86, Math.PI * 1.5, Math.PI * 1.56); g.stroke();
    return (layers = { key, back, front });
  }
  const blit = (L, x, y) => ctx.drawImage(L.c, x - L.ox, y - L.oy, L.w, L.h);

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { R } = drum, cx = cxNow, cy = drum.cy, L = drumLayers();
    blit(L.back, cx, cy);
    // 바람 거품
    ctx.fillStyle = 'rgba(200,235,255,.16)';
    const tt = performance.now() / 1000;
    for (let i = 0; i < 26 * air; i++) {
      const ph = (tt * (.6 + (i % 5) * .13) + i * .37) % 1, x = Math.sin(i * 12.9) * R * .55, y = R * .9 - ph * R * 1.5;
      if (Math.hypot(x, y) < R - 6) { ctx.beginPath(); ctx.arc(cx + x, cy + y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
    }
    // 공
    const labels = balls.length <= 26;
    for (const b of balls) drawBall(cx + b.x, cy + b.y, b.r, b.id, labels);
    if (captured && st.phase === 'rising') { const p = risingPos(); drawBall(cx + p.x, cy + p.y, captured.r, captured.id, false); }
    blit(L.front, cx, cy);
    // 문구
    if (!balls.length && !captured && st.phase === 'setup') {
      ctx.fillStyle = 'rgba(220,230,245,.55)'; ctx.font = '600 18px Pretendard, "Noto Sans KR", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('왼쪽에서 지원자를 고르면 추첨기에 들어가요', cx, cy);
    }
    if (st.phase === 'done' && !balls.length) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd166'; ctx.font = `900 ${Math.round(R * .2)}px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.fillText('추첨 완료!', cx, cy - R * .06);
      ctx.fillStyle = 'rgba(220,230,245,.75)'; ctx.font = `700 ${Math.round(R * .08)}px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.fillText(`${st.order.length}명의 순서가 정해졌어요`, cx, cy + R * .14);
      ctx.fillStyle = '#9af2dd'; ctx.font = `700 ${Math.round(Math.max(14, R * .065))}px Pretendard, "Noto Sans KR", sans-serif`;
      ctx.fillText('아래 「텍스트 복사」 「이미지 복사」를 눌러주세요', cx, cy + R * .32);
    }
    if (st.phase === 'reveal') { ctx.fillStyle = `rgba(5,8,12,${Math.min(.55, timer * 2)})`; ctx.fillRect(0, 0, W, H); }
    for (const c of confetti) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - c.t / c.life); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = `hsl(${c.h} 90% 62%)`; ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); ctx.restore();
    }
  }
  // 공 위 장식(광택, 테두리, 이름표). 사람과 크기마다 한 번만 그린다.
  function ballOverlay(id, r, label) {
    const key = `${id}|${r.toFixed(1)}|${label ? 1 : 0}|${dpr}`;
    let s = sprites.get(key);
    if (s) return s;
    if (sprites.size > 300) sprites.clear();
    const font = '700 12px Pretendard, "Noto Sans KR", sans-serif', nm = personOf(id).name;
    ctx.font = font;
    const textW = label ? ctx.measureText(nm).width + 10 : 0;
    s = offscreen(Math.max(2 * r + 6, textW), Math.max(2 * r + 6, r * 1.55 + 22));
    const g = s.g, x = s.ox = s.w / 2, y = s.oy = r + 3;
    const gl = g.createRadialGradient(x - r * .35, y - r * .45, r * .05, x - r * .2, y - r * .2, r * 1.05);
    gl.addColorStop(0, 'rgba(255,255,255,.55)'); gl.addColorStop(.35, 'rgba(255,255,255,.08)'); gl.addColorStop(1, 'rgba(0,0,0,.28)');
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = gl; g.fill();
    g.lineWidth = Math.max(2, r * .09); g.strokeStyle = `hsl(${hueOf(id)} 85% 70%)`; g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x, y, r + 1, 0, Math.PI * 2); g.stroke();
    if (label) {
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(nm, x, y + r * .55);
      g.fillStyle = '#fff'; g.fillText(nm, x, y + r * .55);
    }
    sprites.set(key, s);
    return s;
  }
  function drawBall(x, y, r, id, label) {
    const im = face(id);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hueOf(id)} 55% 40%)`; ctx.fill();
    if (faceReady(im)) {
      // 얼굴은 움직이는 이미지라 매 프레임 그린다.
      ctx.clip();
      const s = Math.max(2 * r / im.naturalWidth, 2 * r / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
      ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
    } else {
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r * .9)}px Pretendard, "Noto Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initial(id), x, y + 1);
    }
    ctx.restore();
    blit(ballOverlay(id, r, label), x, y);
  }

  function frame(now) {
    if (!visible) return;
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
    update(dt); render();
    raf = requestAnimationFrame(frame);
  }

  // ---------- 내보내기 ----------
  function resultText() {
    const head = [st.title || '면접 순서', st.sub].filter(Boolean).join(' · ');
    return [head, ...st.order.map((id, i) => `${i + 1}. ${personOf(id).name}`)].join('\n');
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(resultText()); toast('텍스트를 복사했어요'); }
    catch { toast('복사하지 못했어요. 브라우저 권한을 확인하세요'); }
  }
  async function resultCanvas() {
    const n = st.order.length, cols = n > 10 ? 2 : 1, rows = Math.ceil(n / cols), rowH = 76, w = cols === 2 ? 1200 : 720, head = st.sub ? 170 : 130;
    const c = document.createElement('canvas'); c.width = w; c.height = head + rows * rowH + 40;
    const g = c.getContext('2d');
    await Promise.all(st.order.map(id => { const im = face(id); return im.decode ? im.decode().catch(() => {}) : null; }));
    const bg = g.createLinearGradient(0, 0, 0, c.height); bg.addColorStop(0, '#182231'); bg.addColorStop(1, '#0b1018'); g.fillStyle = bg; g.fillRect(0, 0, w, c.height);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f2f6ff';
    g.font = '800 46px Pretendard, "Noto Sans KR", sans-serif'; g.fillText(st.title || '면접 순서', w / 2, 76);
    if (st.sub) { g.fillStyle = '#9af2dd'; g.font = '600 28px Pretendard, "Noto Sans KR", sans-serif'; g.fillText(st.sub, w / 2, 122); }
    const colW = (w - 80) / cols;
    st.order.forEach((id, i) => {
      const col = Math.floor(i / rows), row = i % rows, x = 40 + col * colW, y = head + row * rowH;
      g.fillStyle = row % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.06)'; roundRect(g, x + 6, y + 4, colW - 12, rowH - 8, 14); g.fill();
      g.fillStyle = '#9af2dd'; g.font = '800 28px Pretendard, "Noto Sans KR", sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), x + 66, y + rowH / 2);
      const fx = x + 112, fy = y + rowH / 2, fr = 26, im = face(id);
      g.save(); g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fillStyle = `hsl(${hueOf(id)} 55% 40%)`; g.fill(); g.clip();
      if (faceReady(im)) { const s = Math.max(2 * fr / im.naturalWidth, 2 * fr / im.naturalHeight); g.drawImage(im, fx - im.naturalWidth * s / 2, fy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s); }
      g.restore();
      g.textAlign = 'left'; g.fillStyle = '#f2f6ff'; g.font = '700 28px Pretendard, "Noto Sans KR", sans-serif';
      g.fillText(personOf(id).name, fx + fr + 18, fy + 1, colW - 170);
    });
    return c;
  }
  const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const toBlob = c => new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('blob')), 'image/png'));
  async function copyImage() {
    try {
      const blob = toBlob(await resultCanvas());
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('이미지를 복사했어요. 디스코드에 붙여넣으세요');
    } catch { toast('이미지 복사가 안 돼요. 이미지 저장을 써주세요'); }
  }
  async function saveImage() {
    try {
      const url = URL.createObjectURL(await toBlob(await resultCanvas()));
      const a = document.createElement('a'); a.href = url; a.download = `${(st.title || '면접 순서')}${st.sub ? ' ' + st.sub : ''}.png`.replace(/[\\/:*?"<>|]/g, '');
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('이미지를 저장했어요');
    } catch { toast('이미지를 만들지 못했어요'); }
  }
  let toastTimer = 0;
  function toast(text) { ui.ivToast.textContent = text; ui.ivToast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.ivToast.hidden = true; }, 2200); }

  function show() {
    if (!built) { load(); build(); }
    visible = true; root.hidden = false; document.body.classList.add('ivOn');
    cxNow = null; renderAll();
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function hide() {
    if (!built) return;
    visible = false; root.hidden = true; document.body.classList.remove('ivOn'); cancelAnimationFrame(raf);
    if (captured) { // 추첨 도중 나가면 그 공은 통에 돌려놓는다
      balls.push({ ...captured, x: 0, y: 0, vx: 0, vy: 0 }); captured = null; hideCard();
      if (st.phase === 'fly') st.order.pop();
    }
    if (st.phase !== 'setup' && st.phase !== 'done') st.phase = 'ready';
    st.auto = false; save();
  }

  const CSS = `
#iv{position:fixed;inset:0;z-index:2;color:#ecedf3;background:radial-gradient(circle calc(max(100vw,100vh) * .75) at 50% 45%,#16202d,#090c12);font-family:Pretendard,"Noto Sans KR","Malgun Gothic",system-ui,sans-serif}
#iv[hidden]{display:none}
#ivCanvas{position:absolute;inset:0;width:100%;height:100%}
body.ivOn #ctrl,body.ivOn #rank,body.ivOn #mtabs,body.ivOn #soopAudience,body.ivOn #soopMarbleChat{display:none!important}
body.ivOn #credit{z-index:3}
#ivSetup{position:absolute;left:12px;top:var(--ivSetupTop,12px);bottom:12px;width:316px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:14px;background:linear-gradient(165deg,#1b2330f5,#10151ff5);border:1px solid #364153;border-radius:12px;box-shadow:0 12px 40px #0005;font-size:13px}
#ivSetup[hidden]{display:none}
.ivHead{font-size:16px;font-weight:800}.ivHead small{display:block;color:#8b8d9c;font-weight:500;font-size:12px;margin-top:3px}
.ivField{display:flex;align-items:center;gap:8px}.ivField span{width:34px;color:#a4a9b8;font-size:12px}
#iv input{flex:1;min-width:0;height:32px;box-sizing:border-box;background:#0c111a;color:#ecedf3;border:1px solid #364153;border-radius:8px;padding:5px 9px;font:inherit;font-size:13px}
#iv input:focus{outline:2px solid #5c9f93;outline-offset:-1px}
.ivPickHead{display:flex;align-items:center;gap:6px;color:#a4a9b8;font-size:12px}.ivPickHead span{flex:1}.ivPickHead b{color:#9af2dd}
#iv button{font-family:inherit;color:#dfe5ef;background:#1d2734;border:1px solid #364153;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:650;cursor:pointer}
#iv button:hover{background:#253548;color:#fff}
#iv button:disabled{opacity:.45;cursor:default}
#iv button.on{background:#294442;color:#9af2dd;border-color:#5c9f93}
#iv .ivPrimary{background:#2f6f63;border-color:#5ec4ae;color:#fff}
#iv .ivPrimary:hover{background:#38806f}
#iv .ivWarn{background:#6b2b36;border-color:#c45c6d;color:#fff}
#ivPeople{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:5px;align-content:start;scrollbar-width:thin;scrollbar-color:#3a3a4a transparent}
#iv .ivPerson{position:relative;display:flex;align-items:center;gap:7px;padding:4px 6px;text-align:left;background:#121a24;border-color:#2a3442;color:#9aa2b2;opacity:.62}
#iv .ivPerson.on{opacity:1;background:#1f3a38;border-color:#5c9f93;color:#f2f6ff}
.ivPName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.ivDel{position:absolute;right:4px;top:2px;font-style:normal;color:#c98a95;font-size:13px;padding:0 3px}
.ivFace,.ivRevFace{position:relative;flex:none;display:inline-grid;place-items:center;border-radius:50%;overflow:hidden;background:hsl(var(--h) 55% 40%);color:#fff;font-weight:800}
.ivFace{width:26px;height:26px;font-size:12px}
.ivFace img,.ivRevFace img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#ivAdd{display:flex;gap:5px}#ivAdd input{height:30px}#ivAddName{max-width:86px}
#ivStart{padding:12px;font-size:14px}
#ivBoard{position:absolute;right:12px;top:var(--ivBoardTop,12px);bottom:12px;width:calc(var(--ivCols,1) * var(--ivColW,${BOARD_COL}px) + 20px);box-sizing:border-box;padding:14px 12px;background:linear-gradient(180deg,#121b27f0,#0d131cf0);border:1px solid #364153;border-radius:12px;display:flex;flex-direction:column;gap:10px}
.ivBoardHead{text-align:center}#ivBTitle{font-size:18px;font-weight:800}#ivBSub{font-size:13px;color:#9af2dd;margin-top:2px;font-weight:650}
#ivSlots{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(var(--ivCols,1),1fr);grid-auto-flow:column;grid-template-rows:repeat(var(--ivRows,1),auto);gap:6px 8px;align-content:start}
.ivSlot{display:flex;align-items:center;gap:8px;height:var(--ivRow,44px);padding:0 8px;box-sizing:border-box;background:#ffffff08;border:1px dashed #2f3a48;border-radius:9px;min-width:0}
.ivSlot b{width:22px;flex:none;text-align:right;color:#5f6b7c;font-size:min(14px,calc(var(--ivRow,44px) * .5))}
.ivSlot.filled{background:#1c2a2e;border:1px solid #3f6f69}.ivSlot.filled b{color:#9af2dd}
.ivSlot .ivFace{width:calc(var(--ivRow,44px) - 10px);height:calc(var(--ivRow,44px) - 10px)}
.ivSlot.incoming .ivFace,.ivSlot.incoming .ivSName{visibility:hidden}
.ivSName{font-size:min(14px,calc(var(--ivRow,44px) * .5));font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ivSlot.pop{animation:ivPop .45s cubic-bezier(.2,1.4,.4,1)}
@keyframes ivPop{0%{transform:scale(1.12);background:#2f6f63}100%{transform:none}}
#ivBar{position:absolute;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;white-space:nowrap;pointer-events:none}
#ivBar>*{pointer-events:auto}
#iv[data-phase="setup"] #ivBar{display:none}
#ivBar button{padding:11px 16px;font-size:14px;border-radius:10px;box-shadow:0 6px 18px #0006}
#ivBar .ivDraw{padding:13px 26px;font-size:17px}
.ivLeft{color:#a4a9b8;font-size:13px;margin-left:6px}
#ivReveal{position:absolute;left:0;top:0;visibility:hidden;opacity:0;will-change:transform,opacity;width:300px;padding:22px 18px 20px;box-sizing:border-box;text-align:center;background:radial-gradient(circle at 50% 0,#2f6f63,#141d29 70%);border:2px solid #9af2dd;border-radius:22px;box-shadow:0 0 0 6px #9af2dd22,0 20px 60px #000c;z-index:3;pointer-events:none}
#ivReveal.on{visibility:visible}
.ivRevNum{font-size:40px;font-weight:900;color:#ffd166;text-shadow:0 2px 0 #0008;line-height:1}
#ivReveal .ivRevFace{width:220px;height:220px;font-size:80px;margin:14px auto 12px;display:grid;box-shadow:0 0 0 4px #fff,0 0 30px #9af2dd88}
.ivRevName{font-size:28px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ivToast{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);background:#0c111aee;border:1px solid #5c9f93;color:#dff;padding:9px 16px;border-radius:9px;font-size:13px;z-index:4}
#ivToast[hidden]{display:none}
@media(max-width:899px){#ivBoard{display:none}#ivSetup{right:12px;width:auto;top:auto;height:58vh}}
`;
})();

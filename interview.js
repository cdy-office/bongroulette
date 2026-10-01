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
  const imgs = new Map();
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

  function img(id) {
    let im = imgs.get(id);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = '/thumb/' + id; imgs.set(id, im); }
    return im;
  }
  const imgReady = im => im.complete && im.naturalWidth > 0;
  function faceEl(id, cls) {
    const box = document.createElement('span'); box.className = cls;
    box.style.setProperty('--h', hueOf(id));
    box.textContent = [...personOf(id).name.replace(/[^\p{L}\p{N}]/gu, '')][0] || '?';
    const im = document.createElement('img'); im.alt = ''; im.src = '/thumb/' + id; im.draggable = false;
    im.onload = () => box.classList.add('loaded'); im.onerror = () => im.remove();
    box.append(im);
    return box;
  }

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
      <div id="ivReveal" hidden><div class="ivRevNum"></div><span class="ivRevFace"></span><div class="ivRevName"></div></div>
      <div id="ivToast" hidden></div>`;
    document.body.append(root);
    canvas = root.querySelector('#ivCanvas'); ctx = canvas.getContext('2d');
    for (const id of ['ivSetup', 'ivTitle', 'ivSub', 'ivCount', 'ivAll', 'ivNone', 'ivPeople', 'ivAdd', 'ivAddId', 'ivAddName', 'ivStart', 'ivBoard', 'ivBTitle', 'ivBSub', 'ivSlots', 'ivBar', 'ivReveal', 'ivToast']) ui[id] = root.querySelector('#' + id);
    ui.ivTitle.value = st.title; ui.ivSub.value = st.sub;
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
    ui.ivStart.onclick = () => { if (st.selected.length < 2) return toast('2명 이상 골라주세요'); st.phase = 'ready'; save(); renderAll(); sfx('go'); };
    window.addEventListener('keydown', e => {
      if (!visible || e.repeat || (e.code !== 'Space' && e.code !== 'Enter')) return;
      if (e.target.closest?.('input,textarea,select,button,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
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
      img(id);
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
  function renderSlots() {
    renderBoardHead();
    const n = st.selected.length;
    const items = [];
    for (let i = 0; i < n; i++) {
      const li = document.createElement('li'); li.className = 'ivSlot';
      const num = document.createElement('b'); num.textContent = i + 1;
      li.append(num);
      const id = st.order[i];
      if (id) { li.classList.add('filled'); const nm = document.createElement('span'); nm.className = 'ivSName'; nm.textContent = personOf(id).name; li.append(faceEl(id, 'ivFace'), nm); }
      else { const e = document.createElement('span'); e.className = 'ivEmpty'; li.append(e); }
      items.push(li);
    }
    ui.ivSlots.replaceChildren(...items);
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
    resetArmed = 0; st.order = []; st.phase = 'setup'; st.auto = false; captured = null; ui.ivReveal.hidden = true;
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
  }
  function reveal() {
    const id = captured.id, n = st.order.length + 1, p = personOf(id);
    const card = ui.ivReveal;
    card.querySelector('.ivRevNum').textContent = `${n}번`;
    card.querySelector('.ivRevName').textContent = p.name;
    card.querySelector('.ivRevFace').replaceWith(faceEl(id, 'ivRevFace'));
    const exit = toScreen(0, -drum.R - drum.tube);
    card.style.transition = 'none';
    card.style.left = exit.x + 'px'; card.style.top = exit.y + 'px';
    card.style.transform = `translate(-50%,-50%) scale(${(captured.r * 2) / 220})`; card.style.opacity = '1';
    card.hidden = false; card.classList.remove('land');
    card.getBoundingClientRect();
    card.style.transition = `left ${T.pop / sp()}s cubic-bezier(.2,1.3,.4,1), top ${T.pop / sp()}s cubic-bezier(.2,1.3,.4,1), transform ${T.pop / sp()}s cubic-bezier(.2,1.3,.4,1)`;
    card.style.left = drum.cx + 'px'; card.style.top = (drum.cy - drum.R * .12) + 'px';
    card.style.transform = 'translate(-50%,-50%) scale(1)';
    st.phase = 'reveal'; timer = 0; sfx('lap'); burst(drum.cx, drum.cy - drum.R * .12);
  }
  function fly() {
    const card = ui.ivReveal, i = st.order.length;
    st.order.push(captured.id); captured = null; save();
    renderSlots();
    const slot = ui.ivSlots.children[i], face = slot?.querySelector('.ivFace');
    slot?.classList.add('incoming');
    const target = (face || slot)?.getBoundingClientRect();
    st.phase = 'fly'; timer = 0;
    if (!target || !target.width) { card.hidden = true; return; }
    card.style.transition = `left ${T.fly / sp()}s cubic-bezier(.6,0,.3,1), top ${T.fly / sp()}s cubic-bezier(.6,0,.3,1), transform ${T.fly / sp()}s cubic-bezier(.6,0,.3,1), opacity ${T.fly / sp()}s ease-in`;
    card.style.left = target.left + target.width / 2 + 'px'; card.style.top = target.top + target.height / 2 + 'px';
    card.style.transform = `translate(-50%,-50%) scale(${target.height / 220})`; card.style.opacity = '.35';
  }
  function landed() {
    ui.ivReveal.hidden = true;
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

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, Math.max(W, H) * .75);
    bg.addColorStop(0, '#16202d'); bg.addColorStop(1, '#090c12');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const { R, tube } = drum, cx = cxNow, cy = drum.cy, maxR = balls.reduce((m, b) => Math.max(m, b.r), captured?.r || 24);
    // 받침대
    ctx.save();
    const baseTop = cy + R * .78, baseW = R * 1.15;
    const metal = ctx.createLinearGradient(cx - baseW, 0, cx + baseW, 0);
    metal.addColorStop(0, '#39424f'); metal.addColorStop(.5, '#8693a5'); metal.addColorStop(1, '#2f3742');
    ctx.fillStyle = metal;
    ctx.beginPath(); ctx.moveTo(cx - R * .45, baseTop); ctx.lineTo(cx + R * .45, baseTop); ctx.lineTo(cx + baseW / 1.1, cy + R + 46); ctx.lineTo(cx - baseW / 1.1, cy + R + 46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1d232c'; ctx.fillRect(cx - baseW, cy + R + 44, baseW * 2, 12);
    ctx.restore();
    // 관(출구)
    const tw = maxR + 9;
    ctx.save();
    const tg = ctx.createLinearGradient(cx - tw, 0, cx + tw, 0);
    tg.addColorStop(0, 'rgba(160,210,255,.10)'); tg.addColorStop(.5, 'rgba(160,210,255,.03)'); tg.addColorStop(1, 'rgba(160,210,255,.12)');
    ctx.fillStyle = tg; ctx.fillRect(cx - tw, cy - R - tube, tw * 2, tube + 6);
    ctx.strokeStyle = 'rgba(190,225,255,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - tw, cy - R + 4); ctx.lineTo(cx - tw, cy - R - tube); ctx.moveTo(cx + tw, cy - R + 4); ctx.lineTo(cx + tw, cy - R - tube); ctx.stroke();
    ctx.fillStyle = '#c9a54a'; ctx.fillRect(cx - tw - 6, cy - R - tube - 8, tw * 2 + 12, 8);
    ctx.restore();
    // 통 뒷면
    ctx.save();
    const glass = ctx.createRadialGradient(cx - R * .25, cy - R * .3, R * .1, cx, cy, R);
    glass.addColorStop(0, 'rgba(120,190,255,.10)'); glass.addColorStop(1, 'rgba(40,80,130,.22)');
    ctx.fillStyle = glass; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // 바람 거품
    ctx.fillStyle = 'rgba(200,235,255,.16)';
    const tt = performance.now() / 1000;
    for (let i = 0; i < 26 * air; i++) {
      const ph = (tt * (.6 + (i % 5) * .13) + i * .37) % 1, x = Math.sin(i * 12.9) * R * .55, y = R * .9 - ph * R * 1.5;
      if (Math.hypot(x, y) < R - 6) { ctx.beginPath(); ctx.arc(cx + x, cy + y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    // 공
    const labels = balls.length <= 26;
    for (const b of balls) drawBall(cx + b.x, cy + b.y, b.r, b.id, labels);
    if (captured && st.phase === 'rising') { const p = risingPos(); drawBall(cx + p.x, cy + p.y, captured.r, captured.id, false); }
    // 앞 유리, 테두리
    ctx.save();
    const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, '#dfe7f1'); rim.addColorStop(.5, '#7d8a9b'); rim.addColorStop(1, '#c5cfdb');
    ctx.strokeStyle = rim; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = R * .05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, R * .86, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
    ctx.lineWidth = R * .02; ctx.beginPath(); ctx.arc(cx, cy, R * .86, Math.PI * 1.5, Math.PI * 1.56); ctx.stroke();
    ctx.restore();
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
    }
    if (st.phase === 'reveal') { ctx.fillStyle = `rgba(5,8,12,${Math.min(.55, timer * 2)})`; ctx.fillRect(0, 0, W, H); }
    for (const c of confetti) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - c.t / c.life); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = `hsl(${c.h} 90% 62%)`; ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); ctx.restore();
    }
  }
  function drawBall(x, y, r, id, label) {
    const im = img(id), h = hueOf(id);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = `hsl(${h} 55% 40%)`; ctx.fill();
    ctx.save(); ctx.clip();
    if (imgReady(im)) {
      const s = Math.max(2 * r / im.naturalWidth, 2 * r / im.naturalHeight), w = im.naturalWidth * s, hh = im.naturalHeight * s;
      ctx.drawImage(im, x - w / 2, y - hh / 2, w, hh);
    } else {
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r * .9)}px Pretendard, "Noto Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText([...personOf(id).name.replace(/[^\p{L}\p{N}]/gu, '')][0] || '?', x, y + 1);
    }
    const gl = ctx.createRadialGradient(x - r * .35, y - r * .45, r * .05, x - r * .2, y - r * .2, r * 1.05);
    gl.addColorStop(0, 'rgba(255,255,255,.55)'); gl.addColorStop(.35, 'rgba(255,255,255,.08)'); gl.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = gl; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.lineWidth = Math.max(2, r * .09); ctx.strokeStyle = `hsl(${h} 85% 70%)`; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke();
    if (label) {
      ctx.font = '700 12px Pretendard, "Noto Sans KR", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      const nm = personOf(id).name; ctx.strokeText(nm, x, y + r * .55); ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y + r * .55);
    }
    ctx.restore();
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
    const c = document.createElement('canvas'); c.width = w; c.height = head + rows * rowH + 70;
    const g = c.getContext('2d');
    await Promise.all(st.order.map(id => { const im = img(id); return im.decode ? im.decode().catch(() => {}) : null; }));
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
      const fx = x + 112, fy = y + rowH / 2, fr = 26, im = img(id);
      g.save(); g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fillStyle = `hsl(${hueOf(id)} 55% 40%)`; g.fill(); g.clip();
      if (imgReady(im)) { const s = Math.max(2 * fr / im.naturalWidth, 2 * fr / im.naturalHeight); g.drawImage(im, fx - im.naturalWidth * s / 2, fy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s); }
      g.restore();
      g.textAlign = 'left'; g.fillStyle = '#f2f6ff'; g.font = '700 28px Pretendard, "Noto Sans KR", sans-serif';
      g.fillText(personOf(id).name, fx + fr + 18, fy + 1, colW - 170);
    });
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.28)'; g.font = '500 18px Pretendard, "Noto Sans KR", sans-serif';
    g.fillText('봉신_듀이쵸', w - 30, c.height - 26);
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
      balls.push({ ...captured, x: 0, y: 0, vx: 0, vy: 0 }); captured = null; ui.ivReveal.hidden = true;
      if (st.phase === 'fly') st.order.pop();
    }
    if (st.phase !== 'setup' && st.phase !== 'done') st.phase = 'ready';
    st.auto = false; save();
  }

  const CSS = `
#iv{position:fixed;inset:0;z-index:2;color:#ecedf3;font-family:Pretendard,"Noto Sans KR","Malgun Gothic",system-ui,sans-serif}
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
#ivReveal{position:absolute;width:300px;padding:22px 18px 20px;box-sizing:border-box;text-align:center;background:radial-gradient(circle at 50% 0,#2f6f63,#141d29 70%);border:2px solid #9af2dd;border-radius:22px;box-shadow:0 0 0 6px #9af2dd22,0 20px 60px #000c;z-index:3;pointer-events:none}
#ivReveal[hidden]{display:none}
.ivRevNum{font-size:40px;font-weight:900;color:#ffd166;text-shadow:0 2px 0 #0008;line-height:1}
#ivReveal .ivRevFace{width:220px;height:220px;font-size:80px;margin:14px auto 12px;display:grid;box-shadow:0 0 0 4px #fff,0 0 30px #9af2dd88}
.ivRevName{font-size:28px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ivToast{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);background:#0c111aee;border:1px solid #5c9f93;color:#dff;padding:9px 16px;border-radius:9px;font-size:13px;z-index:4}
#ivToast[hidden]{display:none}
@media(max-width:899px){#ivBoard{display:none}#ivSetup{right:12px;width:auto;top:auto;height:58vh}}
`;
})();

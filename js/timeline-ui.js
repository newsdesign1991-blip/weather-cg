/* [모듈] js/timeline-ui.js — 타임라인 화면(AE식): 레이어 열·아이콘·막대·키·눈금자 canvas·CTI·내비게이터, 그리기 스케줄러(rAF 하나·바뀐 것만), 열기·높이·미리보기, 카메라 키 팝오버, 추출 안내 */
'use strict';

// ===================== 아이콘(24 그리드, currentColor — 이모지 없음) =====================
const TL_ICONS = {
  typhoon: '<path fill="currentColor" fill-rule="evenodd" d="M12 7a5 5 0 110 10 5 5 0 010-10zm0 2.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z"/><path fill="currentColor" d="M17 12C17 6 11 3 2.4 6.4 8.6 5.2 12 6.6 12 7zM7 12C7 18 13 21 21.6 17.6 15.4 18.8 12 17.4 12 17z"/>',
  typhoon2: '<g transform="translate(-1 -1) scale(.62)"><path fill="currentColor" fill-rule="evenodd" d="M12 7a5 5 0 110 10 5 5 0 010-10zm0 2.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z"/><path fill="currentColor" d="M17 12C17 6 11 3 2.4 6.4 8.6 5.2 12 6.6 12 7zM7 12C7 18 13 21 21.6 17.6 15.4 18.8 12 17.4 12 17z"/></g><g transform="translate(10.1 10.1) scale(.62)"><path fill="currentColor" fill-rule="evenodd" d="M12 7a5 5 0 110 10 5 5 0 010-10zm0 2.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z"/><path fill="currentColor" d="M17 12C17 6 11 3 2.4 6.4 8.6 5.2 12 6.6 12 7zM7 12C7 18 13 21 21.6 17.6 15.4 18.8 12 17.4 12 17z"/></g>',
  camera: '<path fill="currentColor" fill-rule="evenodd" d="M9.2 4h5.6l1.6 2.2H19a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V8.2a2 2 0 012-2h2.6zM12 9a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z"/>',
  fill: '<path fill="currentColor" d="M4.5 7.2L10 3.8l8.6 2.6 1.4 9-6.6 5-8.2-2.4-1.6-6.4z"/>',
  brush: '<path fill="currentColor" d="M20.7 3.3a1 1 0 010 1.4l-8.6 8.6-2.8-2.8 8.6-8.6a1 1 0 011.4 0zM8.6 12.1l2.8 2.8c-.4 3.6-3.4 5.6-7.9 5.1 1.9-1.4 1.3-3.2 2-5 .5-1.4 1.6-2.6 3.1-2.9z"/>',
  tag: '<path fill="currentColor" fill-rule="evenodd" d="M3 4.6A1.6 1.6 0 014.6 3h6.7l9.2 9.2a1.6 1.6 0 010 2.3l-6 6a1.6 1.6 0 01-2.3 0L3 11.3zM7.6 6a1.6 1.6 0 100 3.2A1.6 1.6 0 007.6 6z"/>',
  mtn: '<path fill="currentColor" d="M2 20L9.3 7.5l3.9 6.4 2.6-3.9L22 20z"/>',
  path: '<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" d="M5 18.5c4.5 0 3.4-6.5 7.4-6.5S15 5.5 19 5.5"/><circle cx="5" cy="18.5" r="2.3" fill="currentColor"/><circle cx="19" cy="5.5" r="2.3" fill="currentColor"/>',
  title: '<path fill="currentColor" d="M4.5 4.5h15v3.3h-5.7V20h-3.6V7.8H4.5z"/>',
  legend: '<path fill="currentColor" d="M3.5 5h4v4h-4zM10 6h10.5v2H10zM3.5 10h4v4h-4zM10 11h10.5v2H10zM3.5 15h4v4h-4zM10 16h10.5v2H10z"/>',
  image: '<path fill="currentColor" fill-rule="evenodd" d="M4.5 4h15A1.5 1.5 0 0121 5.5v13a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5v-13A1.5 1.5 0 014.5 4zM5 17.5h14l-4.6-6.2-3.4 4.4-2.3-2.6zM8.3 7a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z"/>',
  lines: '<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-dasharray="3 2.2" d="M4.5 7.2L10 3.8l8.6 2.6 1.4 9-6.6 5-8.2-2.4-1.6-6.4z"/>',
  pin: '<path fill="currentColor" fill-rule="evenodd" d="M12 2.5a7 7 0 017 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 017-7zm0 4.3a2.7 2.7 0 100 5.4 2.7 2.7 0 000-5.4z"/>',
  vf: '<path fill="currentColor" fill-rule="evenodd" d="M3 5.5A1.5 1.5 0 014.5 4h15A1.5 1.5 0 0121 5.5v13a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5zm2 .5v3h14V6z"/>',
  lock: '<path fill="currentColor" fill-rule="evenodd" d="M12 2.5a4.5 4.5 0 014.5 4.5v2.5h.5A1.5 1.5 0 0118.5 11v9A1.5 1.5 0 0117 21.5H7A1.5 1.5 0 015.5 20v-9A1.5 1.5 0 017 9.5h.5V7A4.5 4.5 0 0112 2.5zm0 2.2A2.3 2.3 0 009.7 7v2.5h4.6V7A2.3 2.3 0 0012 4.7z"/>',
  watch: '<path fill="currentColor" fill-rule="evenodd" d="M9.5 1.8h5v2h-1.5v1.3a8.5 8.5 0 11-2 0V3.8H9.5zM12 7a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm-1 2.5h2v4.6l3 1.8-1 1.7-4-2.4z"/>',
  aeDiff: '<path fill="currentColor" fill-rule="evenodd" d="M12 2.5l10 17.5H2zm-1.1 6.3v6h2.2v-6zm0 7.6v2.2h2.2v-2.2z"/>',
  twirl: '<path fill="currentColor" d="M3 1.5l7 4.5-7 4.5z"/>',
  kPrev: '<path fill="currentColor" d="M8 1L2 6l6 5z"/>', kNext: '<path fill="currentColor" d="M4 1l6 5-6 5z"/>', kDia: '<path fill="currentColor" d="M6 .8L11.2 6 6 11.2.8 6z"/>',
  kHollow: '<path fill="none" stroke="currentColor" stroke-width="1.4" d="M6 1.6L10.4 6 6 10.4 1.6 6z"/>',
  play: '<path fill="currentColor" d="M7 4.8v14.4a.8.8 0 001.22.68l11.5-7.2a.8.8 0 000-1.36L8.22 4.12A.8.8 0 007 4.8z"/>',
  pause: '<path fill="currentColor" d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/>',
};
function tlIco(k, vb) { return `<svg viewBox="${vb || '0 0 24 24'}" aria-hidden="true">${TL_ICONS[k] || ''}</svg>`; }
const TL_KEY_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 .8h10L6 6l5 5.2H1L6 6z"/></svg>';   // 모래시계 = AE 이지 이즈 키

// ===================== 상태(화면용 — 저장·되돌리기에 안 들어간다) =====================
const TL_PAD = 12;
const TLD = { STRUCT: 1, GEOM: 2, RULER: 4, FRAME: 8, HEAD: 16 };
const TL_UI_KEY = 'wcg_tl_ui';
const tlState = {
  pps: 100, zoom: 0, scrollX: 0, viewW: 0, hdrW: 0, maxEnd: 0,
  sel: new Set(), keySel: new Set(), focus: false, open: { cam: true, typ: true }, shy: false, nameW: 340, timeMode: 'tc',
  lowQ: false, playing: false, play: null, rows: [], plan: [], sig: '', els: new Map(), colors: null, isOpen: false, uiLoaded: false,
};
let tlDirty = 0, tlRaf = 0, tlRafT = 0, tlSettleTimer = 0;
let camKeyEditorSel = null;   // 팝오버로 편집 중인 카메라 키 id

// 화면 1초당 픽셀(캐시값 — 레이아웃을 읽지 않는다. 폭은 ResizeObserver에서만 읽는다)
function tlPxPerSec() { return tlState.pps; }
function tlLoadUi() {
  if (tlState.uiLoaded) return; tlState.uiLoaded = true;
  try {
    const o = JSON.parse(localStorage.getItem(TL_UI_KEY) || '{}');
    if (o.nameW) tlState.nameW = Math.max(240, Math.min(520, +o.nameW || 340));
    if (o.timeMode && /^(tc|s|f)$/.test(o.timeMode)) tlState.timeMode = o.timeMode;
    tlState.shy = !!o.shy;
    if (o.open) tlState.open = { cam: o.open.cam !== false, typ: o.open.typ !== false };
    if (o.h) tlH = +o.h;
    else tlH = Math.round(Math.max(300, window.innerHeight * 0.4));   // 처음 = 창 높이의 40%
  } catch (e) { tlH = Math.round(Math.max(300, window.innerHeight * 0.4)); }
}
function tlSaveUi() {
  try { localStorage.setItem(TL_UI_KEY, JSON.stringify({ h: tlH, nameW: tlState.nameW, timeMode: tlState.timeMode, shy: tlState.shy, open: tlState.open })); } catch (e) {}
}

// 브라우저가 만들 수 있는 최고 코덱. 이 크로미움은 H.264 MP4를 지원한다.
// 되면 mp4(H.264), 안 되면 webm 으로 물러난다.
function videoType() {
  const cands = [
    ['video/mp4;codecs=avc1.42E01E', 'mp4', 'H.264 MP4'],
    ['video/mp4;codecs=avc1', 'mp4', 'H.264 MP4'],
    ['video/mp4', 'mp4', 'MP4'],
    ['video/webm;codecs=vp9', 'webm', 'WebM(VP9)'],
    ['video/webm;codecs=vp8', 'webm', 'WebM(VP8)'],
    ['video/webm', 'webm', 'WebM'],
  ];
  for (const [mime, ext, label] of cands) if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) return { mime, ext, label };
  return null;
}

// 해상도마다 렌더 방법이 다르다. 노말 CG의 방송용 MXF는 브라우저로 못 만든다.
function tlNote() {
  const A = anim();
  const vf = S.res === '1920x1080-vf';
  const bake = $('#tlBake');   // VF에선 이 MP4 버튼을 숨긴다 — 대신 "알파MOV로 추출"(헬퍼) 버튼을 쓴다
  if (bake) {
    bake.style.display = vf ? 'none' : '';
    bake.textContent = 'MP4로 추출';
    bake.disabled = false;
    bake.title = '타임라인을 길이가 정확한 MP4 영상으로 만듭니다 — 저장 위치를 먼저 물어봅니다';
  }
  const png = $('#tlExportPng');   // VF에선 이 버튼만 남으므로 양쪽 다 둥글게(반쪽 알약 방지)
  if (png) png.style.borderRadius = vf ? '11px' : '';
  const el = $('#tlNote');
  if (!el) return;
  if (tlState.notice) { el.style.display = ''; return; }   // 해상도 알림 줄(tlNoticeRes)이 떠 있으면 그대로
  const vt = videoType();
  const touch = S.res === '2158x1214';
  if (touch) {
    el.innerHTML = `<b>터치 스크린</b> · ${vt ? vt.label : '영상'} ${A.fps}fps 로 <b>영상 추출</b>을 누르면 바로 나옵니다.`;
    el.style.display = '';
  } else {
    el.innerHTML = '';
    el.style.display = 'none';
  }
}

// ===================== 행(레이어 계획 → 화면 행) =====================
// 카메라 속성 줄 — AE Transform처럼. 키 하나 = 같은 시각의 위치·확대·방향·기울기 묶음(저장 구조 그대로)
function tlCamProps() {
  const ks = camKeys();
  const P = [
    { p: 'pos', name: '위치', fields: ['x', 'y'], step: 1, fmt: (c) => [Math.round(c.x) + ',', Math.round(c.y)] },
    { p: 's', name: '확대', fields: ['s'], step: 0.01, fmt: (c) => [(c.s * 100).toFixed(1) + '%'] },
    { p: 'rz', name: '방향', fields: ['rz'], step: 1, fmt: (c) => [(+c.rz || 0).toFixed(1) + '°'] },
    { p: 'rx', name: '기울기', fields: ['rx'], step: 1, fmt: (c) => [(+c.rx || 0).toFixed(1) + '°'] },
  ];
  if (ks.some((k) => Math.abs(+k.ry || 0) > 0.05)) P.push({ p: 'ry', name: '회전 Y', fields: ['ry'], step: 1, fmt: (c) => [(+c.ry || 0).toFixed(1) + '°'] });
  for (const q of P) q.varies = ks.length === 1 || q.fields.some((f) => new Set(ks.map((k) => (+k[f] || 0).toFixed(4))).size > 1);
  return P;
}
function tlRowsOf(plan) {
  const rows = []; let no = 0;
  for (const L of plan) {
    no++;
    if (tlState.shy && L.kind === 'static') continue;
    rows.push({ id: L.id, L, depth: 0, no });
    if (L.kind === 'typhoon' && tlState.open.typ && L.children) for (const c of L.children) rows.push({ id: c.id, L: c, parent: L, depth: 1, child: true });
    if (L.kind === 'camera' && tlState.open.cam) for (const P of tlCamProps()) rows.push({ id: 'cam:' + P.p, L: { id: 'cam:' + P.p, kind: 'camProp', name: P.name, parent: L }, prop: P, parent: L, depth: 1 });
  }
  return rows;
}
// 행 구조 서명 — 같으면 DOM을 다시 만들지 않는다(위치·글자만 갱신)
function tlRowSig(rows) {
  const ks = camKeys().map((k) => k.id).join(',');
  return rows.map((r) => {
    const L = r.L;
    if (r.prop) return 'P' + r.id + (r.prop.varies ? 1 : 0) + ks;
    return [r.id, L.kind, L.name, L.note, L.col, L.track ? 1 : 0, L.implicit ? 1 : 0, L.gone ? 1 : 0, L.dim ? 1 : 0, (L.diff || []).join('|'), r.no,
      L.kind === 'camera' ? ks + (tlState.open.cam ? 'o' : 'c') : '', L.kind === 'typhoon' ? (tlState.open.typ ? 'o' : 'c') : ''].join('\u0001');
  }).join('\u0002');
}
function tlSync(force) {
  const plan = tlLayerPlan();
  const rows = tlRowsOf(plan);
  const sig = tlRowSig(rows);
  tlState.plan = plan; tlState.rows = rows;
  // 계획이 바뀌면 같은 id 행에 새 계획 객체를 이어 준다(끌기 중인 데이터 참조는 S의 트랙이라 그대로 유효)
  if (!force && sig === tlState.sig && tlState.els.size) { for (const r of rows) { const e = tlState.els.get(r.id); if (e) e.row = r; } return false; }
  tlState.sig = sig;
  tlBuildRows();
  return true;
}
function tlBuildRows() {
  const names = $('#tlNames'), lanes = $('#tlTracks');
  if (!names || !lanes) return;
  names.textContent = ''; lanes.textContent = '';
  tlState.els.clear();
  for (const r of tlState.rows) {
    const L = r.L;
    const nm = document.createElement('div'), ln = document.createElement('div');
    nm.className = 'tlName'; ln.className = 'tlLane';
    nm.dataset.id = r.id; ln.dataset.id = r.id;
    const e = { row: r, nm, ln, clip: null, tail: null, vin: null, vlen: null, ticks: [], keys: [], vals: null, kd: null };
    if (r.prop) {
      nm.classList.add('prop'); ln.classList.add('prop');
      const P = r.prop, ks = camKeys();
      nm.innerHTML = `<span class="tlKnav"><i data-kn="prev" title="이전 키 (J)">${tlIco('kPrev', '0 0 12 12')}</i><i data-kn="here" class="kd" title="이 시각에 키 추가/삭제">${tlIco('kHollow', '0 0 12 12')}</i><i data-kn="next" title="다음 키 (K)">${tlIco('kNext', '0 0 12 12')}</i></span>`
        + `<span class="tlWatch${P.varies ? ' on' : ''}" data-watch="${P.p}" title="${P.varies ? '이 속성이 움직임 — 누르면 지금 값으로 고정(모든 키)' : '이 속성은 키 사이에서 안 움직임 — 값을 바꾸면 그 시각에 키가 생기며 움직이기 시작'}">${tlIco('watch')}</span>`
        + `<span class="tlNm"><span class="t"></span></span><span class="tlV" data-prop="${P.p}"></span>`;
      nm.querySelector('.tlNm .t').textContent = P.name;
      e.kd = nm.querySelector('.kd');
      e.vals = nm.querySelector('.tlV');
      e.vals.innerHTML = P.fields.map((f) => `<span data-f="${f}"></span>`).join('');
      for (const k of ks) {
        const d = document.createElement('div');
        d.className = 'tlKey' + (P.varies ? '' : ' flat');
        d.dataset.k = k.id; d.innerHTML = TL_KEY_SVG;
        d.title = `${tlFmtShort(k.t)} (${(+k.t).toFixed(2)}s) — 끌어서 이동 · 더블클릭: 값 편집`;
        ln.append(d); e.keys.push({ el: d, k });
      }
    } else {
      const col = L.col || (r.parent && r.parent.col) || '#888';
      nm.style.setProperty('--c', col); ln.style.setProperty('--c', col);   // 파일에서 온 색은 마크업이 아니라 style 속성으로
      if (r.child) { nm.classList.add('child'); ln.classList.add('child'); }
      if (L.kind === 'static' || L.kind === 'oldText') nm.classList.add('static');
      if (L.dim) nm.classList.add('dim');
      const tw = (L.kind === 'typhoon' || L.kind === 'camera') && !r.child
        ? `<span class="tlTw${(L.kind === 'typhoon' ? tlState.open.typ : tlState.open.cam) ? ' open' : ''}" data-tw="${L.kind === 'typhoon' ? 'typ' : 'cam'}" title="펼치기/접기 (Alt+클릭 = 모두)">${tlIco('twirl', '0 0 12 12')}</span>` : '<span></span>';
      const chip = r.child ? '<span></span>' : `<span class="tlChip"${L.kind === 'static' ? ' style="--c:var(--tl-static)"' : ''}></span>`;
      const no = r.child ? '<span></span>' : `<span class="tlNo">${r.no}</span>`;
      const locked = L.kind === 'static' || L.kind === 'oldText';
      const vals = locked ? `<span></span><span class="tlLockCell" title="정적 레이어 — 처음부터 끝까지 보임(AE에도 그대로)"><span class="tlLock">${tlIco('lock')}</span></span>`
        : `<span class="tlV" data-in title="시작 — 클릭해 입력, 좌우로 끌어 1프레임씩"></span><span class="tlV" data-len title="등장 길이 — 클릭해 입력, 좌우로 끌어 1프레임씩"></span>`;
      nm.innerHTML = `${tw}${chip}${no}<span class="tlIcon">${tlIco(L.icon)}</span><span class="tlNm"><span class="t"></span></span>${vals}`;
      if (r.child) nm.classList.add('colIcon');
      const nmEl = nm.querySelector('.tlNm');
      nmEl.querySelector('.t').textContent = L.name;
      if (L.note) { const sm = document.createElement('small'); sm.textContent = L.note; if (L.gone) sm.classList.add('warn'); nmEl.append(sm); }
      if (L.diff && L.diff.length) { const w = document.createElement('span'); w.className = 'aeDiff'; w.innerHTML = tlIco('aeDiff'); w.title = 'AE 차이 — ' + L.diff.join(' / '); nmEl.append(w); }
      nm.title = L.name + (L.note ? ' · ' + L.note : '');
      e.vin = nm.querySelector('[data-in]'); e.vlen = nm.querySelector('[data-len]');
      // 레인 막대
      const clip = document.createElement('div'); clip.className = 'tlClip'; clip.dataset.id = r.id; e.clip = clip;
      if (L.kind === 'static' || L.kind === 'oldText') clip.classList.add('static');
      else if (L.kind === 'camera') {
        clip.classList.add('cam'); clip.title = '카메라 — 이름을 누르면 키 전부 선택';
        for (const k of camKeys()) { const tk = document.createElement('div'); tk.className = 'tlTick'; tk.dataset.k = k.id; clip.append(tk); e.ticks.push({ el: tk, k }); }
      } else if (L.kind === 'vfEnter') { clip.classList.add('lock'); clip.title = 'VF 진입(1.0초부터 1.2초 동안) — 고정'; e.tail = document.createElement('div'); e.tail.className = 'tlTail'; ln.append(e.tail); }
      else {
        const hasSpan = !!(L.track || (r.child && L.span) || L.kind === 'typhoon' && L.track);
        if (!hasSpan && L.implicit) { clip.classList.add('implicit'); clip.title = '트랙 없음 — 앱 기본 타이밍(끌면 트랙이 생깁니다)'; }
        else if (!hasSpan) { clip.classList.add('none'); clip.title = '타이밍 없음 — 처음부터 보임. 끌면 그 시각에 등장하는 트랙이 생깁니다'; }
        if (L.gone) clip.classList.add('gone');
        if (L.kind === 'typhoon') { if (hasSpan) clip.classList.add('parent'); clip.title = hasSpan ? '태풍 경로 — 끌면 경로·라벨 전체 이동' : clip.title; }
        else if (hasSpan || L.implicit) clip.innerHTML = '<div class="tlEdge l" data-e="l"></div><div class="tlEdge r" data-e="r"></div>';
        if (hasSpan || L.implicit) { e.tail = document.createElement('div'); e.tail.className = 'tlTail'; ln.append(e.tail); }
      }
      ln.append(clip);
    }
    names.append(nm); lanes.append(ln);
    tlState.els.set(r.id, e);
  }
  const bz = document.createElement('div'); bz.className = 'tlBeyond'; bz.id = 'tlBeyond'; lanes.append(bz);
  const mq = document.createElement('div'); mq.className = 'tlMarq'; mq.id = 'tlMarq'; lanes.append(mq);
  tlSelSync();
}
// 막대·키 위치(쓰기만 — 레이아웃 읽기 없음)
function tlLayoutBars() {
  const lanes = $('#tlTracks'); if (!lanes) return;
  const pps = tlState.pps, A = anim(), dur = +A.dur || 6, P = TL_PAD;
  let maxEnd = dur;
  const km = new Map(camKeys().map((k) => [k.id, k]));   // 키는 id로(같은 id면 행을 재사용하므로 객체가 바뀌었을 수 있다)
  for (const e of tlState.els.values()) {
    const r = e.row, L = r.L;
    if (r.prop) { for (const k of e.keys) { k.k = km.get(k.k.id) || k.k; k.el.style.left = (P + (+k.k.t) * pps) + 'px'; } continue; }
    if (!e.clip) continue;
    let sp = null;
    if (L.kind !== 'static' && L.kind !== 'oldText' && L.kind !== 'camera') sp = tlSpanNow(L) || L.implicit;
    if (!sp) {
      e.clip.style.left = P + 'px'; e.clip.style.width = (dur * pps) + 'px';
      for (const tk of e.ticks) { tk.k = km.get(tk.k.id) || tk.k; tk.el.style.left = ((+tk.k.t) * pps) + 'px'; }
      if (e.vin) { e.vin.textContent = L.kind === 'camera' ? camKeys().length + '키' : '—'; e.vin.classList.add('dim'); }
      if (e.vlen) { e.vlen.textContent = L.kind === 'camera' ? '' : '—'; e.vlen.classList.add('dim'); }
      continue;
    }
    maxEnd = Math.max(maxEnd, sp[1]);
    e.clip.style.left = (P + sp[0] * pps) + 'px'; e.clip.style.width = Math.max(3, (sp[1] - sp[0]) * pps) + 'px';
    if (e.tail) { e.tail.style.left = (P + sp[1] * pps - 2) + 'px'; e.tail.style.width = Math.max(0, (dur - sp[1]) * pps + 2) + 'px'; }
    if (e.vin) { e.vin.textContent = tlFmtShort(sp[0]); e.vin.classList.toggle('dim', L.kind === 'vfEnter' || !(L.track || r.child)); }
    if (e.vlen) { e.vlen.textContent = tlFmtShort(sp[1] - sp[0]); e.vlen.classList.toggle('dim', L.kind === 'vfEnter' || !(L.track || r.child)); }
  }
  tlState.maxEnd = maxEnd;
  const W = P * 2 + maxEnd * pps;
  lanes.style.width = Math.max(W, tlState.viewW) + 'px';
  const bz = $('#tlBeyond');
  if (bz) { const x0 = P + dur * pps; bz.style.left = x0 + 'px'; bz.style.width = Math.max(0, Math.max(W, tlState.viewW + tlState.scrollX) - x0) + 'px'; }
  tlUpdateFootWarn();
}
// 길이 밖(넘친) 막대 안내 — B11
function tlUpdateFootWarn() {
  const w = $('#tlFootWarn'); if (!w) return;
  const dur = +anim().dur || 6; let n = 0;
  for (const L of tlState.plan) { const sp = tlSpanNow(L); if (sp && sp[1] > dur + 1e-4 && L.kind !== 'vfEnter') n++; for (const c of (L.children || [])) { const cs = tlSpanNow(c); if (cs && cs[1] > dur + 1e-4) n++; } }
  for (const k of camKeys()) if (+k.t > dur + 1e-4) n++;
  const none = !anim().tracks.length && !camKeys().length && tlState.plan.some((L) => L.animatable && !L.gone);
  w.textContent = n ? `길이 밖 ${n}개 — 길이를 늘리거나 당겨 오세요(추출엔 안 나옴)` : none ? '타이밍 없음 — 자동 구성을 누르거나 점선 막대를 끌어 등장 시각을 만드세요' : '';
}
function tlSelSync() {
  for (const [id, e] of tlState.els) {
    const on = tlState.sel.has(id);
    e.nm.classList.toggle('sel', on); e.ln.classList.toggle('sel', on);
    if (e.clip) e.clip.classList.toggle('sel', on);
    for (const k of e.keys) k.el.classList.toggle('sel', tlState.keySel.has(k.k.id));
  }
}
// 색 토큰(눈금자 canvas용) — 테마가 바뀔 때만 다시 읽는다
function tlColors() {
  if (tlState.colors) return tlState.colors;
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  tlState.colors = { tick: g('--tl-tick'), txt: g('--tl-tick-txt'), hatch: g('--tl-hatch'), font: g('--ui-font') || 'sans-serif' };
  return tlState.colors;
}
// 눈금자(canvas) — 줌에 따라 라벨 간격: 프레임 [1,2,5,10,15,1초,2초,5초,10초,30초] 중 라벨 사이가 70px 이상인 첫 값
function tlDrawRuler() {
  const cv = $('#tlRuler'); if (!cv) return;
  const w = tlState.hdrW, h = 24; if (!w) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const C = tlColors(), A = anim(), fps = tlFps(), nom = tlNomFps(), dur = +A.dur || 6;
  const ppf = tlState.pps / fps, sx = tlState.scrollX, P = TL_PAD;
  const LAB = [1, 2, 5, 10, 15, nom, nom * 2, nom * 5, nom * 10, nom * 30];
  const lab = LAB.find((s) => s * ppf >= 70) || LAB[LAB.length - 1];
  const minor = [1, 2, 5, 10, 15, nom, nom * 5].find((s) => s * ppf >= 7 && lab % s === 0) || lab;
  const total = Math.round(Math.max(dur, tlState.maxEnd) * fps) + lab;
  const f0 = Math.max(0, Math.floor(((sx - P) / tlState.pps) * fps) - 1), f1 = Math.min(total, Math.ceil(((sx + w - P) / tlState.pps) * fps) + 1);
  g.font = `600 10px ${C.font}`; g.textBaseline = 'top'; g.lineWidth = 1;
  const durF = Math.round(dur * fps);
  for (let f = Math.floor(f0 / minor) * minor; f <= f1; f += minor) {
    if (f < 0) continue;
    const x = Math.round(P + (f / fps) * tlState.pps - sx) + 0.5, isLab = f % lab === 0, half = (f * 2) % lab === 0;
    g.strokeStyle = C.tick; g.globalAlpha = f > durF ? 0.35 : 1;
    g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - (isLab ? 11 : half ? 7 : 4)); g.stroke();
    if (isLab) { g.fillStyle = C.txt; const s = Math.floor(f / nom), ff = f % nom; g.fillText(lab >= nom ? (s ? tlPad(s) + 's' : '0s') : `${tlPad(s)}:${tlPad(ff)}f`, x + 3, 2); }
  }
  g.globalAlpha = 1;
  const xe = P + dur * tlState.pps - sx;   // 길이 밖 = 빗금 바탕
  if (xe < w) { g.fillStyle = C.hatch; g.fillRect(Math.max(0, xe), 0, w - Math.max(0, xe), h); }
  // 내비게이터(보이는 범위)·작업 영역 바
  const W = P * 2 + Math.max(dur, tlState.maxEnd) * tlState.pps;
  const nw = $('#tlNavWin');
  if (nw) { const vw = tlState.viewW || w; nw.style.left = (sx / W * w) + 'px'; nw.style.width = Math.max(8, Math.min(w, vw / W * w)) + 'px'; }
  const wk = $('#tlWork');
  if (wk) { const a = A.work ? +A.work.a : 0, b = A.work ? +A.work.b : dur; wk.style.left = (P + a * tlState.pps - sx) + 'px'; wk.style.width = Math.max(2, (b - a) * tlState.pps) + 'px'; }
}
// 지금 시각 표기
function tlTimeText(t) {
  const f = tlFrameOf(t);
  return tlState.timeMode === 'tc' ? tlFmtTC(t) : tlState.timeMode === 's' ? (+t).toFixed(2) + 's' : tlPad(f, 5);
}
// 이 시각(±반 프레임)에 있는 카메라 키
function tlKeyAtT(t) { const h = 0.5 / tlFps(); return camKeys().find((k) => Math.abs(+k.t - t) < h) || null; }
// CTI(transform만)·시각 글자·속성 값
function tlPlaceHead() {
  const t = +tlHeadT || 0;
  const head = $('#tlHead');
  if (head) head.style.transform = `translateX(${(TL_PAD + t * tlState.pps - tlState.scrollX).toFixed(1)}px)`;
  const big = $('#tlTime'); if (big) { const s = tlTimeText(t); if (big.textContent !== s) big.textContent = s; }
  const sub = $('#tlTimeSub'); if (sub) { const s = `${tlPad(tlFrameOf(t), 5)} · ${tlFps()} fps · ${t.toFixed(2)}초`; if (sub.textContent !== s) sub.textContent = s; }
  if (camKeys().length) {
    const c = camAt(t), on = !!tlKeyAtT(t);
    for (const e of tlState.els.values()) {
      if (!e.row.prop || !c) continue;
      const v = e.row.prop.fmt(c), sp = e.vals.children;
      for (let i = 0; i < sp.length; i++) { const s = String(v[i]); if (sp[i].textContent !== s) sp[i].textContent = s; }
      if (e.kd && e.kd.classList.contains('on') !== on) { e.kd.classList.toggle('on', on); e.kd.innerHTML = tlIco(on ? 'kDia' : 'kHollow', '0 0 12 12'); }
    }
  }
}
// 폭 측정(ResizeObserver 콜백에서만) → 맞춤 배율 다시
function tlMeasure() {
  const g = $('#tlGrid'), h = $('#tlTimeHdr');
  tlState.viewW = g ? g.clientWidth : 600;
  tlState.hdrW = h ? h.clientWidth : tlState.viewW;
  tlZoomTo(tlState.zoom, null, null, true);
}
// 줌(0=전체 맞춤 … 1000=1프레임 48px). anchorT 시각이 anchorX(레인 기준 px)에 그대로 있게 스크롤.
function tlZoomTo(z, anchorT, anchorX, quiet) {
  const dur = Math.max(0.5, +anim().dur || 6), vw = Math.max(50, tlState.viewW || 600);
  const fit = Math.max(4, (vw - TL_PAD * 2) / dur), max = tlFps() * 48;
  tlState.zoom = Math.max(0, Math.min(1000, z));
  tlState.pps = max > fit ? fit * Math.pow(max / fit, tlState.zoom / 1000) : fit;
  const zi = $('#tlZoom'); if (zi && +zi.value !== Math.round(tlState.zoom)) zi.value = Math.round(tlState.zoom);
  if (anchorT != null) tlScrollTo(TL_PAD + anchorT * tlState.pps - anchorX, true);
  else tlScrollTo(tlState.scrollX, true);
  if (!quiet) { /* noop */ }
  tlInvalidate(TLD.GEOM | TLD.RULER | TLD.HEAD);
}
function tlScrollTo(x, noInv) {
  const W = TL_PAD * 2 + Math.max(+anim().dur || 6, tlState.maxEnd) * tlState.pps;
  tlState.scrollX = Math.max(0, Math.min(Math.max(0, W - tlState.viewW), x));
  const lanes = $('#tlTracks'); if (lanes) lanes.style.transform = `translateX(${-tlState.scrollX}px)`;
  if (!noInv) tlInvalidate(TLD.RULER | TLD.HEAD | TLD.GEOM);
}

// ===================== 그리기 스케줄러 — rAF 하나, 바뀐 것만 =====================
// rAF가 안 오는 숨김 창·백그라운드에서도 멈추지 않게 150ms 타이머를 같이 건다(먼저 온 쪽이 그리고 다른 쪽은 취소)
function tlSchedule() { if (tlRaf) return; tlRaf = requestAnimationFrame(tlFrame); clearTimeout(tlRafT); tlRafT = setTimeout(() => { if (tlRaf) { cancelAnimationFrame(tlRaf); tlRaf = 0; tlFrame(performance.now()); } }, 150); }
function tlInvalidate(bits) { tlDirty |= bits; tlSchedule(); }
function tlFrame(now) {
  tlRaf = 0; clearTimeout(tlRafT);
  let d = tlDirty; tlDirty = 0;
  if (tlState.playing) {
    const P = tlState.play;
    let t = P.t0 + ((now || performance.now()) - P.start) / 1000;
    if (t >= P.end) { t = P.end; tlState.playing = false; animPlaying = false; tlState.lowQ = false; tlPlayBtn(false); }
    tlHeadT = t; d |= TLD.FRAME | TLD.HEAD;
  }
  if (d & TLD.STRUCT) { if (tlSync()) d |= TLD.GEOM; if (_animFast) animFastOff(); }
  if (d & (TLD.STRUCT | TLD.GEOM)) tlLayoutBars();
  if (d & (TLD.STRUCT | TLD.GEOM | TLD.RULER)) tlDrawRuler();
  if (d & TLD.FRAME) tlRenderFrame();
  if (d & (TLD.HEAD | TLD.GEOM | TLD.RULER | TLD.FRAME | TLD.STRUCT)) tlPlaceHead();
  if (tlState.playing) tlSchedule();
}
// 지금 바로(동기) 한 번 — buildTimeline 등
function tlFrameNow(bits) { tlDirty |= bits; if (tlRaf) { cancelAnimationFrame(tlRaf); tlRaf = 0; } clearTimeout(tlRafT); tlFrame(performance.now()); }
function tlRenderFrame() {
  if (_exportingFrames || !tlState.isOpen || !hasAnim()) return;   // 추출 중엔 미리보기를 그리지 않는다(추출 프레임과 섞이지 않게)
  if (tlState.lowQ) animFastOn(); else animFastOff();
  renderAnimFrame(+tlHeadT || 0);
}
// CTI를 t로 — live=true면 연속 조작(스크럽·끌기·키 반복)이라 가벼운 미리보기로 그리고, 멈추면 tlSettle이 정확히 한 번
function tlSetT(t, opt) {
  opt = opt || {};
  const A = anim();
  t = Math.max(0, +t || 0);
  if (!opt.raw) t = tlQuant(t);
  t = Math.min(+A.dur || 0, t);   // 프레임 경계로 맞춘 뒤 길이 끝을 넘지 않게(끝 = 길이 그대로)
  if (tlState.playing) animStop();
  tlHeadT = t;
  if (opt.live) { tlState.lowQ = true; tlSettle(opt.settle == null ? 160 : opt.settle); }
  tlInvalidate(TLD.HEAD | TLD.FRAME);
}
function tlSettle(ms) {
  clearTimeout(tlSettleTimer);
  tlSettleTimer = setTimeout(() => { tlSettleTimer = 0; if (tlState.playing || tlState.dragging) return; tlState.lowQ = false; if (tlState.isOpen) tlInvalidate(TLD.FRAME); }, ms == null ? 120 : ms);
}
function tlSettleCancel() { clearTimeout(tlSettleTimer); tlSettleTimer = 0; tlState.lowQ = false; tlDirty &= ~TLD.FRAME; }
function tlPlayBtn(on) {
  const b = $('#tlPlay'); if (!b) return;
  b.classList.toggle('playing', on);
  const lbl = b.querySelector('.lbl'); if (lbl) lbl.textContent = on ? '멈춤' : '재생';
  const sv = b.querySelector('svg'); if (sv) sv.innerHTML = on ? TL_ICONS.pause : TL_ICONS.play;
}
// 재생 시작 — CTI부터(B6). 끝(작업 영역 끝)에 있으면 처음(작업 영역 시작)부터. 끝나면 멈춤.
function tlPlayStart(fromStart) {
  const A = anim(), f1 = tlFrameDur(), dur = +A.dur || 6;
  const w = A.work && +A.work.b > +A.work.a ? A.work : null;
  const a = w ? Math.max(0, +w.a) : 0, b = w ? Math.min(+w.b, dur) : dur;
  let t0 = +tlHeadT || 0;
  if (fromStart || t0 < a - 1e-6 || t0 >= b - f1 * 0.5) t0 = a;
  tlClosePopover();
  clearTimeout(tlSettleTimer); tlSettleTimer = 0;
  tlState.playing = true; animPlaying = true; tlState.lowQ = true;
  tlState.play = { t0, start: performance.now(), end: b };
  tlHeadT = t0;
  tlPlayBtn(true);
  tlInvalidate(TLD.FRAME | TLD.HEAD);
}
// animStop() 뒤 — 재생 중이었으면 그 프레임에서 멈추고 정확한 그림으로
function tlPlayStopped(was) {
  if (!was && !tlState.playing) { tlPlayBtn(false); return; }
  tlState.playing = false;
  tlHeadT = tlQuant(tlHeadT);
  tlPlayBtn(false);
  if (_exportingFrames) return;
  tlSettle(0);
  tlInvalidate(TLD.HEAD);
}

// ===================== 공개 — 다시 그리기·열기·미리보기 =====================
// 타임라인 전체 다시(동기) — 트랙·키·지도 종류가 바뀐 뒤 부른다(이름 유지: 여러 파일이 부른다)
function buildTimeline() {
  const A = anim();
  if (!A.tracks.length && !camKeys().length && !isTyphoon() && A.dur < 6) A.dur = 6;   // 빈 타임라인은 기본 6초(카메라 키·태풍이 있으면 정한 길이 유지)
  tlLoadUi();
  const tl = $('#timeline');
  $('#tlDur').value = A.dur;
  // 저장된 fps가 목록에 없으면(옛 파일 등) 29.97로 맞춘다
  const fpsSel = $('#tlFps');
  fpsSel.value = String(A.fps);
  if (fpsSel.selectedIndex < 0) { fpsSel.value = '29.97'; A.fps = 29.97; }
  $('#tlReveal').value = A.reveal || 'dissolve';
  $('#tlBlindSize').value = A.blindSize == null ? 8 : A.blindSize;
  $('#tlBlindAngle').value = A.blindAngle == null ? -45 : A.blindAngle;
  $('#blindOpts').style.display = (A.reveal === 'blinds') ? 'inline-flex' : 'none';
  tlNote();
  tl.style.setProperty('--nameW', tlState.nameW + 'px');
  const shy = $('#tlShy'); if (shy) shy.classList.toggle('on', tlState.shy);
  tlSync(true);
  const animatable = tlState.plan.some((L) => L.animatable || L.kind === 'camera' || L.kind === 'vfEnter');
  tl.classList.toggle('empty', !animatable && !A.tracks.length && !camKeys().length && !isTyphoon());
  // 선택·키 선택 정리(지운 대상)
  for (const id of [...tlState.sel]) if (!tlState.els.has(id)) tlState.sel.delete(id);
  for (const id of [...tlState.keySel]) if (!camKeys().some((k) => k.id === id)) tlState.keySel.delete(id);
  if (camKeyEditorSel && !camKeys().some((k) => k.id === camKeyEditorSel)) { camKeyEditorSel = null; tlClosePopover(); }
  tlSelSync();
  if (tlState.isOpen && tlState.viewW) tlZoomTo(tlState.zoom);
  tlFrameNow(TLD.GEOM | TLD.RULER | TLD.HEAD);
}
// 열기/닫기(집중 모드·무대 줄이기·높이) — wiring.js의 tlShow가 부른다
function tlSetOpen(on) {
  tlLoadUi();
  tlState.isOpen = !!on;
  document.documentElement.classList.toggle('tlOpen', !!on);
  const tl = $('#timeline');
  if (on) { tlApplyHeight(); tlState.focus = true; tl.classList.add('focus'); requestAnimationFrame(() => { tlMeasure(); tlInvalidate(TLD.GEOM | TLD.RULER | TLD.HEAD); }); }
  else { tlState.focus = false; tl.classList.remove('focus'); tlClosePopover(); tlState.playing = false; tlSettleCancel(); }
}
// 높이 — 무대도 그만큼 줄어든다(css html.tlOpen .stage). 너무 크면 창에 맞게.
function tlApplyHeight() {
  const maxH = Math.max(160, window.innerHeight - titleBarH() - 160);
  tlH = Math.round(Math.max(150, Math.min(maxH, +tlH || 300)));
  $('#timeline').style.height = tlH + 'px';
  document.documentElement.style.setProperty('--tlH', tlH + 'px');
  syncCamGuidePos();
}
// 지금 CTI 시각의 정확한 프레임을 다시(열 때·해상도 바꿀 때·추출 뒤 — B7)
function tlRefreshPreview() {
  if (!tlState.isOpen || !hasAnim() || _exportingFrames) return;
  tlState.lowQ = false;
  animSeek(Math.min(+tlHeadT || 0, +anim().dur || 0));
}
// 작업 내용이 바뀌었다(칠·라벨·산 추가·지도 종류 등) — 다음 프레임에 행 구성을 확인(서명이 같으면 아무것도 안 함).
// 미리보기 중에 화면을 통째로 다시 그렸으면(renderAll) 그 위에 재생헤드 시각 프레임을 다시 얹는다(B14).
function tlContentChanged(refreshFrame) {
  if (!tlState.isOpen || tlState.playing || _exportingFrames) return;
  tlInvalidate(TLD.STRUCT | (refreshFrame && animT != null ? TLD.FRAME : 0));
}
// 되돌리기·다시 실행 뒤 — 막대·키를 되돌린 값으로, 미리보기 중이었으면 그 시각 프레임을 다시(B3)
function tlAfterStateApplied() {
  if (!tlState.isOpen) return;
  const was = animT != null;
  buildTimeline();
  if (was) tlRefreshPreview();
}
// 해상도를 바꿨다 — 막대·안내 다시 + 재생헤드 프레임(B7) + 시작 시각 알림 줄(B15)
function tlAfterResChange(oldStart) {
  if (!tlState.isOpen) return;
  buildTimeline();
  tlNoticeRes(oldStart);
  tlRefreshPreview();
}
// 해상도를 바꿨는데 트랙이 옛 기본 시작에 맞춰져 있으면 알림 줄(자동으로 바꾸지 않음 — B15)
function tlNoticeRes(oldStart) {
  const A = anim(), nw = animStart(), d = +(nw - oldStart).toFixed(4);
  const el = $('#tlNote'); if (!el) return;
  const tr = A.tracks.filter((x) => x.kind !== 'typhoon' && x.kind !== 'text');
  if (!tlState.isOpen || !tr.length || Math.abs(d) < 1e-4) return;
  const first = Math.min(...tr.map((x) => +x.start));
  if (Math.abs(first - oldStart) > 0.02) return;   // 이미 손봐서 옛 기본 시작과 다르면 묻지 않는다
  tlState.notice = true;
  el.innerHTML = `해상도가 바뀌어 기본 시작 시각이 <b>${oldStart.toFixed(2)}초 → ${nw.toFixed(2)}초</b>가 됐어요.`;
  const b1 = document.createElement('button'); b1.textContent = `타이밍 ${d > 0 ? '+' : ''}${d.toFixed(2)}초 옮기기`;
  const b2 = document.createElement('button'); b2.textContent = '그대로 두기';
  const done = () => { tlState.notice = false; tlNote(); };
  b1.onclick = () => { pushUndo(); for (const x of A.tracks) { if (x.kind === 'typhoon') { tlSetSpan({ kind: 'typhoon', track: x, children: [] }, +x.ps + d, 0); } else if (x.kind !== 'text') x.start = +Math.max(0, +x.start + d).toFixed(4); } done(); buildTimeline(); tlRefreshPreview(); status('타이밍을 ' + d.toFixed(2) + '초 옮겼습니다 (되돌리기 Ctrl+Z)'); };
  b2.onclick = done;
  el.append(b1, b2); el.style.display = '';
}

// ===================== 카메라 키 값 팝오버(토스 카드) =====================
function tlClosePopover() { const p = document.querySelector('#camKeyPop'); if (p) p.remove(); camKeyEditorSel = null; }
function openCamKeyPopover(id) {
  camKeyEditorSel = id;
  let pop = document.querySelector('#camKeyPop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'camKeyPop'; pop.className = 'camKeyPop'; document.body.appendChild(pop); }
  const K = () => camKeys().find((x) => x.id === id);
  const k = K(); if (!k) { pop.remove(); return; }
  const showRy = camKeys().some((x) => Math.abs(+x.ry || 0) > 0.05);
  pop.innerHTML =
    `<div class="ckpHead"><b>카메라 키</b><span class="ckpT"></span><button class="ckpX" title="닫기 (Esc)" aria-label="닫기">${POP_X_SVG}</button></div>`
    + '<div class="ckpBody">'
    + '<label>시각<input class="ckt" type="text" title="1.5 · 1:15 · 45f · +10"></label>'
    + '<label>확대<input class="ck_s" type="number" step="0.1" title="%"></label>'
    + '<label>X<input class="ck_x" type="number" step="1"></label>'
    + '<label>Y<input class="ck_y" type="number" step="1"></label>'
    + '<label>방향<input class="ck_rz" type="number" step="1" title="°"></label>'
    + '<label>기울기<input class="ck_rx" type="number" step="1" title="°"></label>'
    + (showRy ? '<label>회전 Y<input class="ck_ry" type="number" step="1" title="°"></label><label></label>' : '')
    + '<div class="ckpBtns"><button class="ckpSeek">이 시각으로</button><button class="ckpDel">키 삭제</button></div>'
    + '</div>';
  const fill = () => {
    const kk = K(); if (!kk) return;
    pop.querySelector('.ckpT').textContent = `${tlFmtShort(kk.t)} · ${(+kk.t).toFixed(2)}s`;
    const set = (cls, v) => { const n = pop.querySelector('.' + cls); if (n && document.activeElement !== n) n.value = v; };
    set('ckt', tlFmtShort(kk.t)); set('ck_s', +((+kk.s) * 100).toFixed(1)); set('ck_x', Math.round(kk.x)); set('ck_y', Math.round(kk.y));
    set('ck_rz', +(+kk.rz || 0).toFixed(1)); set('ck_rx', +(+kk.rx || 0).toFixed(1)); set('ck_ry', +(+kk.ry || 0).toFixed(1));
  };
  fill();
  const after = () => { tlInvalidate(TLD.STRUCT | TLD.GEOM | TLD.HEAD | TLD.FRAME); fill(); };
  // 숫자 = 확정(Enter·포커스 빠짐) 때 되돌리기 1번
  const bind = (cls, field, conv, min, max) => {
    const n = pop.querySelector('.' + cls); if (!n) return;
    n.onchange = () => { const kk = K(); if (!kk) return; let v = Number(n.value); if (!isFinite(v)) { fill(); return; } v = conv ? conv(v) : v; if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v); pushUndo(); kk[field] = v; after(); };
  };
  bind('ck_x', 'x'); bind('ck_y', 'y'); bind('ck_s', 's', (v) => +(v / 100).toFixed(4), 0.02, 4);
  bind('ck_rz', 'rz', null, -180, 180); bind('ck_rx', 'rx', null, -85, 85); bind('ck_ry', 'ry', null, -85, 85);
  const tin = pop.querySelector('.ckt');
  tin.onchange = () => {
    const kk = K(); if (!kk) return;
    const v = tlParseTime(tin.value, kk.t); if (v == null) { fill(); return; }
    pushUndo(); kk.t = tlQuant(Math.max(0, v));
    const end = Math.max(anim().dur, ...camKeys().map((x) => +x.t)); if (end > anim().dur) anim().dur = Math.ceil((end + 0.4) * 2) / 2;   // 길이 밖 시각이면 다른 경로처럼 길이를 늘린다
    buildTimeline(); after(); tlPlacePopover();
  };
  pop.querySelectorAll('input').forEach((n) => { n.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') n.blur(); if (ev.key === 'Escape') tlClosePopover(); }; });
  pop.querySelector('.ckpSeek').onclick = () => { const kk = K(); if (kk) tlSetT(+kk.t); };
  pop.querySelector('.ckpDel').onclick = () => { const arr = camKeys(), idx = arr.findIndex((x) => x.id === id); if (idx >= 0) { pushUndo(); arr.splice(idx, 1); } tlState.keySel.delete(id); tlClosePopover(); buildTimeline(); tlRefreshPreview(); status('카메라 키 삭제 (되돌리기 Ctrl+Z)'); };
  pop.querySelector('.ckpX').onclick = () => tlClosePopover();
  tlPlacePopover();
}
// 팝오버를 그 키 위에(제목줄 아래로는 안 올라가게, 자리가 없으면 아래로)
function tlPlacePopover() {
  const pop = document.querySelector('#camKeyPop'); if (!pop || !camKeyEditorSel) return;
  const mk = document.querySelector(`.tlLane.prop .tlKey[data-k="${camKeyEditorSel}"]`) || document.querySelector(`.tlTick[data-k="${camKeyEditorSel}"]`);
  if (mk) {
    const r = mk.getBoundingClientRect(), ph = pop.offsetHeight, minTop = titleBarH() + 8;
    let top = r.top - ph - 12;
    if (top < minTop) top = (r.bottom + 12 + ph <= window.innerHeight - 8) ? r.bottom + 12 : minTop;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
    pop.style.top = Math.max(minTop, top) + 'px';
  } else { pop.style.left = '50%'; pop.style.top = '40%'; }
}

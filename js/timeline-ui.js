/* [모듈] js/timeline-ui.js — 타임라인 UI(막대·키 드래그·카메라 키 팝오버) */
'use strict';

// ===================== 타임라인 UI =====================
// Shift 스크럽·드래그가 붙을 모든 키 시각(초): 0·끝 + 카메라 키 + 태풍 경로/라벨 키 + 일반 클립 시작·끝.
function timelineSnapTimes() {
  const A = anim();
  const out = [0, +A.dur];
  for (const k of camKeys()) out.push(+k.t);
  for (const tr of A.tracks) {
    if (tr.kind === 'typhoon') { ensureTyphoonKeys(tr); out.push(+tr.ps, +tr.pe); if (!typhoonLineMode()) for (const id in (tr.lab || {})) { const e = tr.lab[id]; if (e) out.push(+e.s, +e.e); } }
    else { out.push(+tr.start, +(tr.start + tr.len)); }
  }
  return out;
}
const TL_PAD = 24;
const tlPxPerSec = () => {
  const g = $('#tlGrid');
  const w = (g ? g.clientWidth : 600) - TL_PAD;
  return Math.max(20, w / Math.max(anim().dur, 0.5));
};

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

function buildTimeline() {
  const A = anim();
  if (!A.tracks.length && !camKeys().length && !isTyphoon() && A.dur < 6) A.dur = 6;   // 빈 타임라인은 기본 6초(카메라 키·태풍이 있으면 정한 길이 유지)
  const tl = $('#timeline');
  tl.classList.toggle('empty', !A.tracks.length && !camKeys().length && !isTyphoon());   // 카메라 키만 있어도, 태풍(경로 애니 내재)이어도 타임라인 본문은 보인다
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
  hideCamKeyPanel();   // 옛 도킹 패널 제거 — 카메라는 아래 타임라인 본문(카메라/위치/확대/회전 행)에 표시

  const pps = tlPxPerSec();
  const names = $('#tlNames'), rows = $('#tlTracks'), ruler = $('#tlRuler');
  names.textContent = ''; rows.textContent = ''; ruler.textContent = '';

  // 눈금자 — 0.5초마다, 1초에만 숫자
  const step = A.dur > 12 ? 1 : 0.5;
  for (let s = 0; s <= A.dur + 1e-6; s += step) {
    const d = document.createElement('div');
    d.className = 'tlTick';
    d.style.left = (s * pps) + 'px';
    if (Math.abs(s - Math.round(s)) < 1e-6) d.innerHTML = `<span>${Math.round(s)}s</span>`;
    ruler.append(d);
  }
  ruler.style.width = (A.dur * pps + TL_PAD) + 'px';
  rows.style.width = ruler.style.width;

  A.tracks.forEach((tr, i) => {
    const info = trackInfo(tr);
    const nm = document.createElement('div');
    nm.className = 'tlName';
    nm.innerHTML = '<div class="dot"></div><div class="nm"></div>';
    nm.querySelector('.dot').style.background = info.col;   // 파일에서 온 색 문자열을 마크업에 넣지 않는다
    nm.querySelector('.nm').textContent = info.name;
    nm.title = info.name;
    names.append(nm);

    const row = document.createElement('div');
    row.className = 'tlRow';
    if (tr.kind === 'typhoon') {   // 태풍: 카메라처럼 부모 '태풍 경로' + 하위 행(경로 / 라벨마다) 각각 시작·끝 키
      ensureTyphoonKeys(tr);
      row.classList.add('tlTypHead');
      const headBar = document.createElement('div'); headBar.className = 'tlTypBar path'; headBar.style.opacity = '.28';   // 부모 행엔 전체 범위 얇은 바(정보용)
      const layoutHead = () => { headBar.style.left = (tr.start * pps) + 'px'; headBar.style.width = Math.max(2, tr.len * pps) + 'px'; };
      layoutHead(); row.append(headBar); rows.append(row);
      // 하위 행 하나(라벨/경로) = 이름칸 + [시작 다이아] ─바─ [끝 다이아]. aKey/bKey = {get,set}.
      const addSub = (label, cls, aKey, bKey) => {
        const snm = document.createElement('div'); snm.className = 'tlName tlCamSubName';
        snm.innerHTML = '<div class="nm"></div>'; snm.querySelector('.nm').textContent = label; snm.title = '태풍 · ' + label; names.append(snm);
        const srow = document.createElement('div'); srow.className = 'tlRow tlCamRow tlCamProp tlTypSub';
        const bar = document.createElement('div'); bar.className = 'tlTypBar tlTypBarGrab ' + cls;   // 바를 잡으면 전체 이동
        const kA = document.createElement('div'); kA.className = 'tlTypKey ' + cls + ' kStart';
        const kB = document.createElement('div'); kB.className = 'tlTypKey ' + cls + ' kEnd';
        const layout = () => { const a = aKey.get(), b = bKey.get(); bar.style.left = (a * pps) + 'px'; bar.style.width = Math.max(2, (b - a) * pps) + 'px'; kA.style.left = (a * pps) + 'px'; kB.style.left = (b * pps) + 'px'; bar.title = label + ' 전체 이동 (' + a.toFixed(2) + '~' + b.toFixed(2) + 's)'; kA.title = label + ' 시작 ' + a.toFixed(2) + 's'; kB.title = label + ' 끝 ' + b.toFixed(2) + 's'; layoutHead(); };
        layout();
        kA.addEventListener('pointerdown', (e) => startTypKeyDrag(e, tr, { get: aKey.get, set: aKey.set, min: () => 0, max: () => bKey.get() - 0.05 }, layout));
        kB.addEventListener('pointerdown', (e) => startTypKeyDrag(e, tr, { get: bKey.get, set: bKey.set, min: () => aKey.get() + 0.05, max: () => Infinity }, layout));
        bar.addEventListener('pointerdown', (e) => startTypBarDrag(e, tr, aKey, bKey, layout));
        srow.append(bar, kA, kB); rows.append(srow);
      };
      addSub('경로', 'path', { get: () => tr.ps, set: (v) => tr.ps = v }, { get: () => tr.pe, set: (v) => tr.pe = v });
      // 라인 모드는 경로 시각 라벨이 안 보이므로 라벨 하위 행을 만들지 않는다
      if (!typhoonLineMode()) for (const b of typhoonLabels()) { const id = b.id; if (!tr.lab[id]) continue; addSub(b.txt || '라벨', 'label', { get: () => tr.lab[id].s, set: (v) => tr.lab[id].s = v }, { get: () => tr.lab[id].e, set: (v) => tr.lab[id].e = v }); }
      return;
    }
    const clip = document.createElement('div');
    clip.className = 'tlClip';
    clip.style.left = (tr.start * pps) + 'px';
    clip.style.width = Math.max(14, tr.len * pps) + 'px';
    clip.style.background = info.col;
    // 클립 색이 밝으면 흰 글씨가 안 보인다 — 밝기 보고 고른다
    clip.style.color = lum(info.col) > 0.55 ? '#101317' : '#fff';
    { const sp = document.createElement('span'); sp.textContent = info.name; const rz = document.createElement('div'); rz.className = 'rz'; clip.append(sp, rz); }   // 이름은 사용자/파일 입력 — 텍스트로만
    clip.addEventListener('pointerdown', (e) => startClipDrag(e, tr, clip));
    row.append(clip);
    rows.append(row);
  });
  // 카메라 — 기존 타임라인 안에 '카메라' 항목 + 그 아래 속성(위치/확대/회전)을 나열. 별도 도킹 창 없음.
  // 키(다이아몬드): 클릭=그 시각으로 이동 + 값 팝오버, 드래그=시각 옮김. 한 키가 세 속성 공유(같은 t).
  {
    const ks = camKeys();
    const addName = (label, sub) => {
      const nm = document.createElement('div');
      nm.className = 'tlName' + (sub ? ' tlCamSubName' : '');
      nm.innerHTML = sub ? `<div class="nm">${label}</div>` : '<div class="dot" style="background:#7FD0FF"></div><div class="nm">카메라</div>';
      nm.title = sub ? ('카메라 · ' + label) : '카메라 (지도 위치·확대·회전) — 재생/추출 때만 적용. 키를 클릭해 값 편집';
      names.append(nm);
    };
    const addRow = (cls) => {
      const row = document.createElement('div');
      row.className = 'tlRow tlCamRow ' + cls;
      if (ks.length >= 2) {   // 키가 2개 이상이면 첫~끝 키를 잇는 연결 바(태풍 키처럼). 바를 잡으면 전체 이동.
        const ts = ks.map((k) => +k.t), a = Math.min(...ts), b = Math.max(...ts);
        const bar = document.createElement('div'); bar.className = 'tlCamBar';
        bar.style.left = (a * pps) + 'px'; bar.style.width = Math.max(2, (b - a) * pps) + 'px';
        bar.title = '카메라 키 전체 이동 (' + a.toFixed(2) + '~' + b.toFixed(2) + 's)';
        bar.addEventListener('pointerdown', (e) => startCamBarDrag(e));
        row.append(bar);
      }
      for (const k of ks) {
        const mk = document.createElement('div');
        mk.className = 'tlCamKey' + (k.id === camKeyEditorSel ? ' sel' : '');
        mk.dataset.id = k.id;
        mk.style.left = (k.t * pps) + 'px';
        mk.title = `${(+k.t).toFixed(2)}s`;
        mk.addEventListener('pointerdown', (e) => startCamKeyDrag(e, k, mk));
        row.append(mk);
      }
      rows.append(row);
    };
    addName('카메라', false); addRow('tlCamHead');
    addName('위치', true); addRow('tlCamProp');
    addName('확대', true); addRow('tlCamProp');
    addName('회전', true); addRow('tlCamProp');
  }
  $('#tlHead').style.left = ((animT != null ? animT : tlHeadT) * pps) + 'px';
  hideCamKeyPanel();   // 옛 도킹 패널은 숨긴다(이제 타임라인 안 + 팝오버로 편집)
  if (camKeyEditorSel && !camKeys().some((k) => k.id === camKeyEditorSel)) { camKeyEditorSel = null; const p = document.querySelector('#camKeyPop'); if (p) p.remove(); }
}

// 카메라 연결 바 드래그 — 모든 카메라 키를 함께(전체) 이동. 키 사이 간격은 유지.
function startCamBarDrag(e) {
  const A = anim();
  const pps = tlPxPerSec();
  const ks = camKeys();
  if (ks.length < 2) return;
  const x0 = e.clientX, t0s = ks.map((k) => +k.t), minT = Math.min(...t0s);
  pushUndo();
  const p0 = document.querySelector('#camKeyPop'); if (p0) p0.remove();
  const mv = (ev) => {
    let d = (ev.clientX - x0) / pps;
    d = Math.max(d, -minT);   // 가장 이른 키가 0 밑으로 안 내려가게
    ks.forEach((k, i) => { k.t = +(t0s[i] + d).toFixed(2); });
    ks.forEach((k) => document.querySelectorAll(`.tlCamKey[data-id="${k.id}"]`).forEach((el) => el.style.left = (k.t * pps) + 'px'));
    const ts = ks.map((k) => +k.t), a = Math.min(...ts), b = Math.max(...ts);
    document.querySelectorAll('.tlCamRow .tlCamBar').forEach((bar) => { bar.style.left = (a * pps) + 'px'; bar.style.width = Math.max(2, (b - a) * pps) + 'px'; });
    renderAnimFrame(+tlHeadT || 0);   // 재생헤드 고정, 미리보기만 갱신
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    const end = Math.max(A.dur, ...camKeys().map((x) => x.t));
    if (end > A.dur) A.dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}
// 카메라 키는 이제 '기존 타임라인' 안(카메라+위치/확대/회전 행)에 표시하고, 값은 다이아몬드 클릭 팝오버로 편집.
let camKeyEditorSel = null;   // 선택된 카메라 키 id
function hideCamKeyPanel() { const box = document.querySelector('#camKeyEditor'); if (box) { box.style.display = 'none'; box.innerHTML = ''; } }
function buildCamKeyEditor() { hideCamKeyPanel(); }   // 옛 도킹 패널 제거 — 호환용 껍데기
// 카메라 키 추가 — 현재 재생헤드 시각에 지금 지도 위치·확대·회전을 저장(같은 시각이면 갱신).
function camKeyAddHere() {
  const t = +(animT || 0), ks = camKeys(), R = camRot();
  const snap = { t: +t.toFixed(2), x: Math.round(S.map.x), y: Math.round(S.map.y), s: +(+S.map.s).toFixed(4), rx: +R.rx.toFixed(1), ry: +R.ry.toFixed(1), rz: +R.rz.toFixed(1) };
  pushUndo();
  const near = ks.find((k) => Math.abs(k.t - t) < 0.05);
  if (near) { Object.assign(near, snap); camKeyEditorSel = near.id; }
  else { const nk = { id: 'c' + (seq++), ...snap }; ks.push(nk); camKeyEditorSel = nk.id; }
  const end = Math.max(anim().dur, ...ks.map((x) => x.t));
  if (end > anim().dur) anim().dur = Math.ceil((end + 0.4) * 2) / 2;
  buildTimeline();
  status(`카메라 키 ${snap.t}s 저장`);
}
// 카메라 키 값 편집 팝오버 — 타임라인의 다이아몬드를 클릭하면 그 키 위로 뜬다(별도 도킹창 없음).
function openCamKeyPopover(id) {
  camKeyEditorSel = id;
  let pop = document.querySelector('#camKeyPop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'camKeyPop'; pop.className = 'camKeyPop'; document.body.appendChild(pop); }
  const K = () => camKeys().find((x) => x.id === id);
  const k = K(); if (!k) { pop.remove(); return; }
  pop.innerHTML =
    `<div class="ckpHead"><b>카메라 키</b><span>${(+k.t).toFixed(2)}s</span><button class="ckpX" title="닫기">✕</button></div>`
    + '<div class="ckpBody">'
    + `<label>시각<input class="ckt" type="number" step="0.05" value="${(+k.t).toFixed(2)}"></label>`
    + `<label>확대<input class="ck_s" type="number" step="0.01" value="${(+k.s).toFixed(3)}"></label>`
    + `<label>X<input class="ck_x" type="number" step="1" value="${Math.round(k.x)}"></label>`
    + `<label>Y<input class="ck_y" type="number" step="1" value="${Math.round(k.y)}"></label>`
    + `<label>회전X<input class="ck_rx" type="number" step="1" value="${+(+k.rx || 0).toFixed(1)}"></label>`
    + `<label>회전Y<input class="ck_ry" type="number" step="1" value="${+(+k.ry || 0).toFixed(1)}"></label>`
    + `<label>회전Z<input class="ck_rz" type="number" step="1" value="${+(+k.rz || 0).toFixed(1)}"></label>`
    + '<label></label>'
    + '<div class="ckpBtns"><button class="ckpSeek">이 시각으로</button><button class="ckpDel">삭제</button></div>'
    + '</div>';
  const preview = () => { if (animT != null) animSeek(animT); };
  const bind = (cls, field, min) => { const el = pop.querySelector('.' + cls); if (!el) return; el.oninput = () => { const kk = K(); if (!kk) return; pushUndo('camkey'); let v = Number(el.value); if (min != null) v = Math.max(min, v); kk[field] = v; preview(); }; };
  bind('ck_x', 'x'); bind('ck_y', 'y'); bind('ck_s', 's', 0.02);
  bind('ck_rx', 'rx'); bind('ck_ry', 'ry'); bind('ck_rz', 'rz');
  const tin = pop.querySelector('.ckt'); if (tin) tin.onchange = () => { const kk = K(); if (!kk) return; pushUndo('camkeyt'); kk.t = Math.max(0, +(+tin.value || 0).toFixed(2)); { const end = Math.max(anim().dur, ...camKeys().map((x) => +x.t)); if (end > anim().dur) anim().dur = Math.ceil((end + 0.4) * 2) / 2; /* 길이 밖 시각이면 다른 경로처럼 길이를 늘린다 */ } buildTimeline(); if (animT != null) animSeek(animT); openCamKeyPopover(id); };
  pop.querySelector('.ckpSeek').onclick = () => { const kk = K(); if (kk) animSeek(+kk.t); };
  pop.querySelector('.ckpDel').onclick = () => { const arr = camKeys(), idx = arr.findIndex((x) => x.id === id); if (idx >= 0) { pushUndo(); arr.splice(idx, 1); } camKeyEditorSel = null; pop.remove(); buildTimeline(); if (animT != null) animSeek(animT); };
  pop.querySelector('.ckpX').onclick = () => { camKeyEditorSel = null; pop.remove(); buildTimeline(); };
  // 선택된 다이아몬드(카메라 헤더 행) 위쪽에 배치 — 맨 위 제목줄(데스크톱=창 끌기·창 버튼 자리)엔 안 올라가게,
  // 타임라인을 높이 끌어 올려 위에 자리가 없으면 키 아래로 뒤집는다.
  const mk = document.querySelector('.tlCamRow.tlCamHead .tlCamKey.sel') || document.querySelector('.tlCamKey.sel');
  if (mk) {
    const r = mk.getBoundingClientRect(), ph = pop.offsetHeight, minTop = titleBarH() + 8;
    let top = r.top - ph - 12;
    if (top < minTop) top = (r.bottom + 12 + ph <= window.innerHeight - 8) ? r.bottom + 12 : minTop;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
    pop.style.top = Math.max(minTop, top) + 'px';
  }
  else { pop.style.left = '50%'; pop.style.top = '40%'; }
}
function startCamKeyDrag(e, k, mk) {
  const pps = tlPxPerSec(), x0 = e.clientX, t0 = +k.t;
  let moved = false;
  camKeyEditorSel = k.id;
  const sameKey = () => document.querySelectorAll(`.tlCamKey[data-id="${k.id}"]`);   // 카메라+위치/확대/회전 4행의 같은 키
  sameKey().forEach((d) => d.classList.add('sel'));
  pushUndo();
  const mv = (ev) => { if (Math.abs(ev.clientX - x0) > 3) moved = true; const d = (ev.clientX - x0) / pps; k.t = Math.max(0, +(t0 + d).toFixed(2)); sameKey().forEach((d2) => d2.style.left = (k.t * pps) + 'px'); const ts = camKeys().map((x) => +x.t), a = Math.min(...ts), b = Math.max(...ts); document.querySelectorAll('.tlCamRow .tlCamBar').forEach((bar) => { bar.style.left = (a * pps) + 'px'; bar.style.width = Math.max(2, (b - a) * pps) + 'px'; });   if (moved) { renderAnimFrame(+tlHeadT || 0); const p = document.querySelector('#camKeyPop'); if (p) p.remove(); } };   // 재생헤드 고정, 미리보기만 갱신
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    const end = Math.max(anim().dur, ...camKeys().map((x) => x.t));
    if (end > anim().dur) anim().dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline();
    if (!moved) { animSeek(k.t); openCamKeyPopover(k.id); }   // 클릭 = 그 시각으로 이동 + 값 편집 팝오버
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}

function startClipDrag(e, tr, clip) {
  const A = anim();
  const rz = !!e.target.closest('.rz');
  const pps = tlPxPerSec();
  const x0 = e.clientX, s0 = tr.start, l0 = tr.len;
  pushUndo();
  const mv = (ev) => {
    const d = (ev.clientX - x0) / pps;
    if (rz) tr.len = Math.max(0.05, +(l0 + d).toFixed(2));
    else tr.start = Math.max(0, +(s0 + d).toFixed(2));
    clip.style.left = (tr.start * pps) + 'px';
    clip.style.width = Math.max(14, tr.len * pps) + 'px';
    animSeek(tr.start + tr.len);   // 끄는 동안 그 시점을 보여준다
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    // 길이를 넘겼으면 전체 길이를 늘린다 — 클립이 눈금자 밖으로 나가면 손댈 수가 없다
    const end = Math.max(...A.tracks.map((x) => x.start + x.len));
    if (end > A.dur) A.dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}

// 태풍 트랙 세부 키 드래그 — spec={get,set,min,max}로 경로/라벨 각각의 시작·끝 시각을 바꾼다. layout()=그 하위 행만 즉시 갱신.
function startTypKeyDrag(e, tr, spec, layout) {
  const A = anim();
  const pps = tlPxPerSec();
  const x0 = e.clientX, v0 = spec.get();
  pushUndo();
  const mv = (ev) => {
    const d = (ev.clientX - x0) / pps;
    const v = Math.max(spec.min(), Math.min(spec.max(), +(v0 + d).toFixed(2)));
    spec.set(v);
    syncTyphoonSpan(tr);   // start/len = 경로키+라벨키의 최소~최대 (다른 로직·저장 호환)
    layout();
    renderAnimFrame(+tlHeadT || 0);   // 재생헤드는 고정, 그 시점 미리보기만 갱신
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    const end = Math.max(...A.tracks.map((x) => x.start + x.len));
    if (end > A.dur) A.dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}

// 태풍 하위 행의 바 드래그 — 시작·끝 키를 함께(전체) 이동. layout()=그 행만 즉시 갱신.
function startTypBarDrag(e, tr, aKey, bKey, layout) {
  const A = anim();
  const pps = tlPxPerSec();
  const x0 = e.clientX, a0 = aKey.get(), b0 = bKey.get();
  pushUndo();
  const mv = (ev) => {
    let d = (ev.clientX - x0) / pps;
    d = Math.max(d, -a0);   // 시작이 0 밑으로 안 내려가게
    aKey.set(+(a0 + d).toFixed(2)); bKey.set(+(b0 + d).toFixed(2));
    syncTyphoonSpan(tr); layout(); renderAnimFrame(+tlHeadT || 0);   // 재생헤드 고정, 미리보기만 갱신
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    const end = Math.max(...A.tracks.map((x) => x.start + x.len));
    if (end > A.dur) A.dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}

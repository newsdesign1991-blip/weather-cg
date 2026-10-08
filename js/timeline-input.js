/* [모듈] js/timeline-input.js — 타임라인 조작(AE식): 막대·키 끌기(프레임 단위·Shift 스냅·다중 선택·사각 선택), 눈금자·CTI·시각 칸 스크럽, 휠 줌·스크롤·내비게이터·작업 영역, 이름 열(펼침·선택·숫자 끌기·키 내비게이터), 키보드 단축키·패널 포커스, Alt 카메라 자동 키 */
'use strict';

// 타임라인이 열려 있고 포커스(파란 테두리)일 때만 ←/→·PageUp/Down·J/K·[ ] 등이 타임라인 것(B18)
function tlOwnsKeys() { return tlState.isOpen && tlState.focus; }
function tlRowById(id) { const e = tlState.els.get(id); return e ? e.row : null; }
function tlGridLeft() { const g = $('#tlGrid'); return g ? g.getBoundingClientRect().left : 0; }
function tlTimeAtX(clientX, gridLeft) { return (clientX - gridLeft + tlState.scrollX - TL_PAD) / tlState.pps; }
// 끌기 중 읽기 표시(마우스 옆 작은 카드)
function tlReadout(ev, html) {
  const ro = $('#tlReadout'), body = $('#tlBody'); if (!ro || !body) return;
  const b = body.getBoundingClientRect();
  ro.innerHTML = html; ro.style.display = 'block';
  ro.style.left = Math.min(b.width - 260, ev.clientX - b.left + 14) + 'px'; ro.style.top = Math.max(2, ev.clientY - b.top - 34) + 'px';
}
function tlReadoutHide() { const ro = $('#tlReadout'); if (ro) ro.style.display = 'none'; tlSnapLine(null); }
function tlSnapLine(t) {
  const sl = $('#tlSnapLine'); if (!sl) return;
  if (t == null) { sl.style.display = 'none'; return; }
  sl.style.display = 'block'; sl.style.transform = `translateX(${(TL_PAD + t * tlState.pps - tlState.scrollX).toFixed(1)}px)`;
}
// 끌기 공통 — 3px 넘게 움직여야 시작(클릭만으론 되돌리기 기록 없음 — B10), 첫 움직임에서 start()
function tlDragGesture(e, o) {
  const x0 = e.clientX, y0 = e.clientY; let moved = false;
  const mv = (ev) => {
    if (!moved) { if (Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return; moved = true; tlState.dragging = true; if (o.start) o.start(ev); }
    o.move(ev, ev.clientX - x0, ev.clientY - y0);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    tlState.dragging = false;
    if (o.end) o.end(moved, ev);
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
// 끝을 넘겨 끌었으면 전체 길이를 늘린다 — 막대가 눈금자 밖으로 나가면 손댈 수가 없다(옛 동작 그대로)
function tlGrowDur() {
  const A = anim(); let end = 0;
  for (const tr of A.tracks) { end = Math.max(end, (+tr.start || 0) + (+tr.len || 0)); if (tr.kind === 'typhoon') end = Math.max(end, +tr.pe || 0); }
  for (const k of camKeys()) end = Math.max(end, +k.t);
  if (end > A.dur + 1e-4) A.dur = Math.ceil((end + 0.4) * 2) / 2;
}
const tlFmtSpan = (sp) => `시작 <b>${tlFmtShort(sp[0])}</b> · 길이 <b>${tlFmtShort(sp[1] - sp[0])}</b> <span style="opacity:.6">(${sp[0].toFixed(2)}s · ${(sp[1] - sp[0]).toFixed(2)}s)</span>`;

// ===================== 막대 끌기(이동·시작 자르기·길이) =====================
function tlStartBarDrag(e, clip, edge) {
  const id = clip.dataset.id, row = tlRowById(id); if (!row) return;
  const L = row.L;
  // 선택 — Shift/Ctrl = 더하기·빼기, 아니면(선택 안 된 것을 누르면) 그것만
  if (e.shiftKey || e.ctrlKey || e.metaKey) { if (tlState.sel.has(id)) tlState.sel.delete(id); else tlState.sel.add(id); }
  else if (!tlState.sel.has(id)) { tlState.sel.clear(); tlState.sel.add(id); tlState.keySel.clear(); }
  if (L.kind === 'camera') { tlState.keySel = new Set(camKeys().map((k) => k.id)); }   // 카메라 막대 = 키 전부 선택(AE)
  tlSelSync();
  if (L.kind === 'camera') { tlStartKeyDrag(e, null); return; }
  if (L.kind === 'static' || L.kind === 'oldText' || L.kind === 'vfEnter') return;
  const type = edge ? edge.dataset.e : 'move';
  const gl = tlGridLeft(), tDown = tlTimeAtX(e.clientX, gl);
  let items = null, grab = null;
  tlDragGesture(e, {
    start: () => {
      if (tlState.playing) animStop();   // 재생 중 끌기 = 재생 멈춤(B9)
      tlClosePopover();
      pushUndo();
      // 트랙 없는 레이어는 누른 시각에 기본 길이 트랙을 만들고 이어서 끈다(B12)
      if (!tlSpanNow(L)) {
        if (L.kind === 'typPath' || L.kind === 'typLabel') tlEnsureTrack(L.parent, tDown);
        else if (L.animatable) tlEnsureTrack(L, tDown);
        tlState.sel = new Set([id]);
      }
      const rows = [...tlState.sel].map(tlRowById).filter((r) => r && !r.prop && tlSpanNow(r.L) && r.L.kind !== 'vfEnter' && r.L.kind !== 'camera');
      const ids = new Set(rows.map((r) => r.id));
      // 부모(태풍 경로)를 같이 옮기면 하위는 빼고(두 번 옮김 방지) — 부모는 이동만
      items = rows.filter((r) => !(r.parent && ids.has(r.parent.id) && type === 'move')).map((r) => ({ L: r.L, id: r.id, s0: tlSpanNow(r.L).slice(), parentOnly: r.L.kind === 'typhoon' }));
      grab = items.find((it) => it.id === id) || items[0];
      tlState.lowQ = true;
      tlInvalidate(TLD.STRUCT);
    },
    move: (ev, dx) => {
      if (!items || !grab) return;
      let d = dx / tlState.pps;
      let snapT = null;
      if (ev.shiftKey) {   // Shift = 스냅(CTI·0·끝·다른 막대·키·작업 영역) + 노란 안내선
        const skip = new Set(items.map((it) => it.id)); if (grab.L.parent) skip.add(grab.L.parent.id);
        const T = tlSnapTargets(skip, tlState.plan), thr = 8 / tlState.pps;
        const tryEdge = (edgeT) => { const s = tlSnapNear(edgeT, T, thr); return s == null ? null : { s, dd: s - edgeT }; };
        const g = grab.parentOnly ? 'move' : type;
        const cands = [];
        if (g === 'move' || g === 'l') cands.push(tryEdge(grab.s0[0] + d));
        if (g === 'move' || g === 'r') cands.push(tryEdge(grab.s0[1] + d));
        const best = cands.filter(Boolean).sort((a, b) => Math.abs(a.dd) - Math.abs(b.dd))[0];
        if (best) { d += best.dd; snapT = best.s; }
      }
      // 0 밑으로 못 가게 — 이동은 가장 이른 시작 기준
      if (type === 'move' || grab.parentOnly) { const minA = Math.min(...items.map((it) => it.s0[0])); if (minA + d < 0) d = -minA; }
      for (const it of items) {
        const ty = it.parentOnly ? 'move' : type;
        const [a, b] = tlDragCalc(ty, it.s0, d);
        tlSetSpan(it.L, a, b);
      }
      tlSnapLine(snapT);
      const sp = tlSpanNow(grab.L);
      if (sp) tlReadout(ev, tlFmtSpan(sp) + (snapT != null ? (Math.abs(snapT - tlHeadT) < 1e-4 ? '<span class="snap">재생헤드에 붙음</span>' : '<span class="snap">붙음</span>') : ''));
      tlInvalidate(TLD.GEOM | TLD.FRAME | TLD.HEAD);   // 재생헤드는 그대로(B8) — 그 시각 미리보기만
    },
    end: (moved) => {
      tlReadoutHide();
      if (!moved) return;   // 클릭 = 선택만
      tlGrowDur();
      buildTimeline();
      tlSettle(0);
    },
  });
  e.preventDefault(); e.stopPropagation();
}

// ===================== 카메라 키 끌기 =====================
function tlStartKeyDrag(e, keyEl) {
  const kid = keyEl ? keyEl.dataset.k : null;
  if (kid) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (tlState.keySel.has(kid)) tlState.keySel.delete(kid); else tlState.keySel.add(kid); }
    else if (!tlState.keySel.has(kid)) tlState.keySel = new Set([kid]);
    tlState.sel.clear(); tlSelSync();
  }
  let ks = null, g0 = 0, grabK = null, anchor = null;
  tlDragGesture(e, {
    start: (ev) => {
      if (tlState.playing) animStop();
      tlClosePopover();
      pushUndo();
      ks = camKeys().filter((k) => tlState.keySel.has(k.id)).map((k) => ({ k, t0: +k.t }));
      grabK = (kid && ks.find((x) => x.k.id === kid)) || ks[0];
      if (!grabK) { ks = null; return; }
      g0 = grabK.t0;
      if (ev.altKey && ks.length > 1) {   // Alt = 선택 키 간격 비례 늘이기(잡은 키 반대쪽 끝이 고정)
        const ts = ks.map((x) => x.t0), mn = Math.min(...ts), mx = Math.max(...ts);
        anchor = Math.abs(g0 - mx) < 1e-6 ? mn : mx;
      }
      tlState.lowQ = true;
    },
    move: (ev, dx) => {
      if (!ks) return;
      let nt = g0 + dx / tlState.pps, snapT = null;
      if (ev.shiftKey) { const skip = new Set(ks.map((x) => x.k.id)); const s = tlSnapNear(nt, tlSnapTargets(skip, tlState.plan), 8 / tlState.pps); if (s != null) { nt = s; snapT = s; } }
      nt = tlQuant(Math.max(0, nt));
      if (anchor != null && Math.abs(g0 - anchor) > 1e-6) {
        const r = (nt - anchor) / (g0 - anchor);
        for (const x of ks) x.k.t = tlQuant(Math.max(0, anchor + (x.t0 - anchor) * Math.max(0, r)));
      } else {
        let delta = nt - g0; const mn = Math.min(...ks.map((x) => x.t0)); if (mn + delta < 0) delta = -mn;
        for (const x of ks) x.k.t = tlQuant(x.t0 + delta);
      }
      tlSnapLine(snapT);
      tlReadout(ev, `키 <b>${tlFmtShort(grabK.k.t)}</b> <span style="opacity:.6">(${(+grabK.k.t).toFixed(2)}s)</span>` + (ks.length > 1 ? ` · ${ks.length}개` : '') + (snapT != null ? '<span class="snap">붙음</span>' : ''));
      tlInvalidate(TLD.GEOM | TLD.FRAME | TLD.HEAD);
    },
    end: (moved) => {
      tlReadoutHide();
      if (!moved) return;
      tlGrowDur();
      buildTimeline();
      tlSettle(0);
    },
  });
  e.preventDefault(); e.stopPropagation();
}

// ===================== 빈 레인 — 선택 해제 + 사각 선택(키) =====================
function tlStartMarquee(e) {
  if (!(e.shiftKey || e.ctrlKey || e.metaKey)) { tlState.sel.clear(); tlState.keySel.clear(); tlSelSync(); }
  const lanes = $('#tlTracks'), mq = $('#tlMarq'); if (!lanes || !mq) return;
  const lr = lanes.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  const base = new Set(tlState.keySel);
  const keyRects = [];
  tlDragGesture(e, {
    start: () => { for (const el of lanes.querySelectorAll('.tlLane.prop .tlKey')) keyRects.push({ id: el.dataset.k, r: el.getBoundingClientRect() }); mq.style.display = 'block'; },
    move: (ev) => {
      const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), t = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY);
      mq.style.left = (l - lr.left) + 'px'; mq.style.top = (t - lr.top) + 'px'; mq.style.width = (r - l) + 'px'; mq.style.height = (b - t) + 'px';
      const s = new Set(base);
      for (const k of keyRects) { const cx = (k.r.left + k.r.right) / 2, cy = (k.r.top + k.r.bottom) / 2; if (cx >= l && cx <= r && cy >= t && cy <= b) s.add(k.id); }
      tlState.keySel = s; tlSelSync();
    },
    end: () => { mq.style.display = 'none'; },
  });
}

// ===================== 숫자 칸(시작·길이·속성 값) — 클릭 = 입력, 좌우 끌기 = 1단위씩 =====================
function tlInlineInput(host, value, commit) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = value;
  const old = host.innerHTML; host.textContent = ''; host.append(inp);
  inp.focus(); inp.select();
  let done = false;
  const fin = (ok) => { if (done) return; done = true; const v = inp.value; inp.remove(); host.innerHTML = old; if (ok) commit(v); tlInvalidate(TLD.GEOM | TLD.HEAD); };
  inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') fin(false); };
  inp.onblur = () => fin(true);
}
function tlScrubNumber(e, o) {   // o: { step(px→단위수), apply(n, ev), click() }
  let last = 0;
  tlDragGesture(e, {
    start: () => { if (tlState.playing) animStop(); pushUndo(); tlState.lowQ = true; },
    move: (ev, dx) => { const n = Math.round(dx / (o.px || 3)) * (ev.shiftKey ? 10 : 1); if (n !== last) { last = n; o.apply(n, ev); tlInvalidate(TLD.GEOM | TLD.HEAD | TLD.FRAME); } },
    end: (moved) => { if (!moved) o.click(); else { tlGrowDur(); buildTimeline(); tlSettle(0); } },
  });
  e.preventDefault();
}
// 시작(In)·길이 칸 — AE처럼 시작을 바꾸면 막대가 통째로 이동(길이 유지)
function tlEditSpanCell(e, row, which) {
  const L = row.L, sp0 = tlSpanNow(L); if (!sp0 || L.kind === 'vfEnter') return;
  const f1 = tlFrameDur();
  const applySpan = (a, b) => tlSetSpan(L, a, b);
  const host = e.target.closest('.tlV');
  tlScrubNumber(e, {
    px: 3,
    apply: (n) => { if (which === 'in') { const a = tlQuant(Math.max(0, sp0[0] + n * f1)); applySpan(a, +(a + sp0[1] - sp0[0]).toFixed(4)); } else applySpan(sp0[0], Math.max(+(sp0[0] + f1).toFixed(4), tlQuant(sp0[1] + n * f1))); },
    click: () => tlInlineInput(host, tlFmtShort(which === 'in' ? sp0[0] : sp0[1] - sp0[0]), (v) => {
      const cur = which === 'in' ? sp0[0] : sp0[1] - sp0[0];
      const t = tlParseTime(v, cur); if (t == null) { status('시각을 읽지 못했어요 — 1.5 · 1:15 · 45f · +10 처럼 적으세요', true); return; }
      pushUndo();
      if (which === 'in') { const a = tlQuant(Math.max(0, t)); applySpan(a, +(a + sp0[1] - sp0[0]).toFixed(4)); }
      else applySpan(sp0[0], Math.max(+(sp0[0] + f1).toFixed(4), tlQuant(sp0[0] + Math.max(f1, t))));
      tlGrowDur(); buildTimeline(); tlRefreshPreview();
    }),
  });
}

// ===================== 카메라 키 — 자동 키·속성 값 =====================
// t 시각의 키(없으면 보간 값으로 새로 만든다 — AE: 스톱워치 켜진 속성 값을 바꾸면 키가 생김)
function tlCamKeyAt(t) {
  t = tlQuant(t);
  let k = tlKeyAtT(t);
  if (!k) { const c = camAt(t) || { x: S.map.x, y: S.map.y, s: S.map.s, rx: 0, ry: 0, rz: 0 }; k = { id: 'c' + (seq++), t, x: Math.round(c.x), y: Math.round(c.y), s: +(+c.s).toFixed(4), rx: +(+c.rx || 0).toFixed(1), ry: +(+c.ry || 0).toFixed(1), rz: +(+c.rz || 0).toFixed(1) }; camKeys().push(k); }
  return k;
}
// 카메라 키가 있고 미리보기 중이면 Alt 팬·줌·회전 = 그 시각의 키(B4: 라벨을 옮기지 않는다)
function tlCamAutoKeyOn() { return tlState.isOpen && camKeys().length > 0 && animT != null; }
function tlCamAutoKey() {
  const t = tlQuant(+tlHeadT || 0), R = camRot();
  const vals = { x: Math.round(S.map.x), y: Math.round(S.map.y), s: +(+S.map.s).toFixed(4), rx: +R.rx.toFixed(1), ry: +R.ry.toFixed(1), rz: +R.rz.toFixed(1) };
  const had = tlKeyAtT(t);
  const k = tlCamKeyAt(t); Object.assign(k, vals);
  tlGrowDur();
  buildTimeline(); animSeek(t);
  status(`카메라 키 ${had ? '고침' : '만듦'} · ${tlFmtShort(t)} · 위치(${vals.x},${vals.y}) 확대 ×${vals.s.toFixed(2)} (되돌리기 Ctrl+Z)`);
}
const TL_PROP_LIM = { s: [0.02, 4], rz: [-180, 180], rx: [-85, 85], ry: [-85, 85] };
function tlSetCamProp(k, f, v) { const lim = TL_PROP_LIM[f]; if (lim) v = Math.max(lim[0], Math.min(lim[1], v)); k[f] = f === 's' ? +(+v).toFixed(4) : (f === 'x' || f === 'y') ? Math.round(v) : +(+v).toFixed(1); }
function tlEditPropValue(e, row, f) {
  const t = +tlHeadT || 0, c0 = camAt(t); if (!c0) return;
  const host = e.target.closest('[data-f]');
  const unit = f === 's' ? 0.005 : (f === 'x' || f === 'y') ? 1 : 0.5;
  let k = null, v0 = +c0[f] || 0;
  tlScrubNumber(e, {
    px: 1,
    apply: (n) => { if (!k) k = tlCamKeyAt(t); tlSetCamProp(k, f, v0 + n * unit); },
    click: () => tlInlineInput(host, f === 's' ? (v0 * 100).toFixed(1) : String(+(+v0).toFixed(1)), (s) => {
      let v = parseFloat(String(s).replace(/[%°\s]/g, '')); if (!isFinite(v)) return;
      if (f === 's') v /= 100;
      pushUndo(); tlSetCamProp(tlCamKeyAt(t), f, v); buildTimeline(); tlRefreshPreview();
    }),
  });
}
// 키 내비게이터 ◀ ◆ ▶
function tlKnav(which) {
  const t = +tlHeadT || 0, ts = camKeys().map((k) => +k.t).sort((a, b) => a - b), h = 0.5 / tlFps();
  if (which === 'prev') { const p = ts.filter((x) => x < t - h).pop(); if (p != null) tlSetT(p); return; }
  if (which === 'next') { const n = ts.find((x) => x > t + h); if (n != null) tlSetT(n); return; }
  const k = tlKeyAtT(t);
  pushUndo();
  if (k) { const arr = camKeys(); arr.splice(arr.indexOf(k), 1); tlState.keySel.delete(k.id); status('이 시각의 카메라 키를 지웠습니다 (되돌리기 Ctrl+Z)'); }
  else { const nk = tlCamKeyAt(t); tlState.keySel = new Set([nk.id]); status('이 시각에 카메라 키를 넣었습니다 — 지금 보이는 값'); }
  tlGrowDur(); buildTimeline(); tlRefreshPreview();
}
// 스톱워치 — 움직이는 속성이면 '고정'(모든 키의 그 속성을 지금 값으로)
function tlWatch(p) {
  const P = tlCamProps().find((x) => x.p === p); if (!P) return;
  if (!P.varies) { status(`${P.name}은(는) 지금 안 움직여요 — 다른 시각에서 값을 바꾸면 그 시각에 키가 생기며 움직이기 시작합니다`, true); return; }
  const c = camAt(+tlHeadT || 0); if (!c) return;
  pushUndo();
  for (const k of camKeys()) for (const f of P.fields) tlSetCamProp(k, f, +c[f] || 0);
  buildTimeline(); tlRefreshPreview();
  status(`${P.name} 고정 — 모든 키를 지금 값으로 맞췄습니다 (되돌리기 Ctrl+Z)`);
}

// ===================== 스크럽(눈금자·CTI 머리·시각 칸) =====================
function tlStartScrub(e) {
  if (tlState.playing) animStop();
  tlClosePopover();
  const gl = tlGridLeft();
  const at = (ev) => {
    let t = tlTimeAtX(ev.clientX, gl), snapT = null;
    if (ev.shiftKey) { const s = tlSnapNear(t, tlSnapTargets(null, tlState.plan), 8 / tlState.pps); if (s != null) { t = s; snapT = s; } }
    tlSnapLine(snapT);
    tlSetT(t, { live: true, raw: snapT != null, settle: 100000 });
  };
  at(e);
  tlState.dragging = true;
  const mv = (ev) => at(ev);
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); tlState.dragging = false; tlSnapLine(null); tlSettle(0); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  e.preventDefault();
}
function tlStartTimeBox(e) {
  if (e.ctrlKey || e.metaKey) { tlState.timeMode = { tc: 's', s: 'f', f: 'tc' }[tlState.timeMode] || 'tc'; tlSaveUi(); tlPlaceHead(); return; }
  const t0 = +tlHeadT || 0;
  tlDragGesture(e, {
    start: () => { if (tlState.playing) animStop(); },
    move: (ev, dx) => tlSetT(t0 + Math.round(dx / 2) * tlFrameDur(), { live: true, settle: 100000 }),   // 2px = 1프레임
    end: (moved) => {
      if (moved) { tlSettle(0); return; }
      const box = $('#tlTimeBox'), big = $('#tlTime');
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'tlTimeIn'; inp.value = tlTimeText(t0);
      big.style.display = 'none'; box.insertBefore(inp, big); inp.focus(); inp.select();
      let done = false;
      const fin = (ok) => { if (done) return; done = true; const v = inp.value; inp.remove(); big.style.display = ''; if (!ok) return; const t = tlParseTime(v, t0, tlState.timeMode === 'f'); if (t == null) { status('시각을 읽지 못했어요 — 1.5 · 1:15 · 45f · +10 · 0;00;01;15', true); return; } tlSetT(t); };
      inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') fin(false); };
      inp.onblur = () => fin(true);
    },
  });
}

// ===================== 키보드(타임라인 포커스) — pointer-drag.js의 keydown이 맡긴다 =====================
// 보이는 시각들(J/K): 키·막대 시작/끝·작업 영역 끝·0·길이
function tlVisibleTimes() {
  const A = anim(), s = new Set([0, +A.dur]);
  if (A.work) { s.add(+A.work.a); s.add(+A.work.b); }
  for (const L of tlState.plan) { const sp = tlSpanNow(L); if (sp && L.kind !== 'vfEnter') { s.add(sp[0]); s.add(sp[1]); } for (const c of (L.children || [])) { const cs = tlSpanNow(c); if (cs) { s.add(cs[0]); s.add(cs[1]); } } }
  for (const k of camKeys()) s.add(+k.t);
  return [...s].map((x) => +(+x).toFixed(4)).sort((a, b) => a - b);
}
function tlSelLayers() { return [...tlState.sel].map(tlRowById).filter((r) => r && !r.prop && tlSpanNow(r.L) && r.L.animatable !== false && r.L.kind !== 'vfEnter' && r.L.kind !== 'static' && r.L.kind !== 'camera'); }
let tlClipKeys = null;   // Ctrl+C 한 카메라 키(시각은 첫 키 기준 상대)
function tlKeydown(e) {
  const k = e.key, code = e.code;
  // Space·Numpad0 = 타임라인이 열려 있으면 늘(포커스 무관)
  // 누른 채 있으면 오는 반복 keydown은 무시(재생·멈춤이 초당 수십 번 번갈아 깜빡이지 않게 — AE도 한 번 누름 = 한 번)
  if (code === 'Space' && !e.ctrlKey && !e.altKey) { e.preventDefault(); if (!e.repeat) animPlay(); return true; }
  if (code === 'Numpad0') { e.preventDefault(); if (e.repeat) return true; if (animPlaying) animStop(); else if (hasAnim()) tlPlayStart(true); return true; }
  if (!tlOwnsKeys()) return false;
  const ctrl = e.ctrlKey || e.metaKey, f1 = tlFrameDur(), A = anim();
  const step = (e.shiftKey ? 10 : 1) * f1;
  const sel = () => tlSelLayers();
  const done = () => { e.preventDefault(); return true; };
  if (ctrl) {
    const lk = k.toLowerCase();
    if (lk === 'a') { if (tlState.keySel.size) tlState.keySel = new Set(camKeys().map((x) => x.id)); else tlState.sel = new Set(tlState.rows.filter((r) => !r.prop && !r.child).map((r) => r.id)); tlSelSync(); return done(); }
    if (lk === 'c' && tlState.keySel.size) { const ks = camKeys().filter((x) => tlState.keySel.has(x.id)); const t0 = Math.min(...ks.map((x) => +x.t)); tlClipKeys = ks.map((x) => Object.assign({}, x, { t: +x.t - t0 })); status(`카메라 키 ${ks.length}개 복사 — 재생헤드에서 Ctrl+V`, true); return done(); }
    if (lk === 'v' && tlClipKeys && tlClipKeys.length) {
      pushUndo(); const t = +tlHeadT || 0, ns = new Set();
      for (const c of tlClipKeys) { const tt = tlQuant(t + c.t); const ex = tlKeyAtT(tt); const v = { x: c.x, y: c.y, s: c.s, rx: c.rx, ry: c.ry, rz: c.rz }; if (ex) { Object.assign(ex, v); ns.add(ex.id); } else { const nk = Object.assign({ id: 'c' + (seq++), t: tt }, v); camKeys().push(nk); ns.add(nk.id); } }
      tlState.keySel = ns; tlGrowDur(); buildTimeline(); tlRefreshPreview(); status(`카메라 키 ${ns.size}개 붙여넣음`); return done();
    }
    return false;   // Ctrl+Z 등은 그대로
  }
  if (k === 'Home') { tlSetT(A.work ? +A.work.a : 0); return done(); }
  if (k === 'End') { tlSetT(A.work ? Math.min(+A.work.b, +A.dur) : +A.dur); return done(); }
  if ((k === 'PageDown' || k === 'PageUp') && e.altKey) {   // 선택 레이어·키 1프레임(Shift 10) 밀기
    const d = (k === 'PageDown' ? 1 : -1) * step;
    const ls = sel(), ks = camKeys().filter((x) => tlState.keySel.has(x.id));
    if (!ls.length && !ks.length) return done();
    pushUndo('tl-nudge');
    for (const r of ls) { const sp = tlSpanNow(r.L); tlSetSpan(r.L, tlQuant(Math.max(0, sp[0] + d)), +(tlQuant(Math.max(0, sp[0] + d)) + sp[1] - sp[0]).toFixed(4)); }
    for (const x of ks) x.t = tlQuant(Math.max(0, +x.t + d));
    tlGrowDur(); tlInvalidate(TLD.GEOM | TLD.HEAD | TLD.FRAME); tlState.lowQ = true; tlSettle(200);
    clearTimeout(tlState.nudgeT); tlState.nudgeT = setTimeout(buildTimeline, 250);
    return done();
  }
  if (k === 'PageDown' || k === 'ArrowRight') { tlSetT((+tlHeadT || 0) + step, { live: true }); return done(); }
  if (k === 'PageUp' || k === 'ArrowLeft') { tlSetT((+tlHeadT || 0) - step, { live: true }); return done(); }
  if (k === 'ArrowUp' || k === 'ArrowDown') return done();   // 타임라인 포커스일 땐 지도를 움직이지 않는다
  const lk = k.length === 1 ? k.toLowerCase() : k;
  if (lk === 'k' || lk === 'j') { const ts = tlVisibleTimes(), t = +tlHeadT || 0, h = 0.5 * f1; const v = lk === 'k' ? ts.find((x) => x > t + h) : ts.filter((x) => x < t - h).pop(); if (v != null) tlSetT(v); return done(); }
  if (lk === 'i' || lk === 'o') { const ls = sel(); if (ls.length) { const sp = tlSpanNow(ls[0].L); tlSetT(lk === 'i' ? sp[0] : sp[1]); } return done(); }
  if (k === '[' || k === ']') {
    // 고른 레이어가 타이밍 없음(점선)이면 [ ] 로 그 시각에 트랙을 만든다(점선 막대 끌기와 같음 — AE: 어느 레이어든 [ ] = 시작/끝을 재생헤드로)
    const bare = e.altKey ? [] : [...tlState.sel].map(tlRowById).filter((r) => r && !r.prop && !r.child && r.L.animatable && !r.L.gone && !tlSpanNow(r.L));
    if (!sel().length && !bare.length) { status('먼저 레이어를 고르세요 — [ ] 는 선택한 막대를 재생헤드에 맞춥니다', true); return done(); }
    const t = +tlHeadT || 0; pushUndo();
    for (const r of bare) tlEnsureTrack(r.L, t);
    const ls = sel();
    for (const r of ls) {
      const sp = tlSpanNow(r.L), len = sp[1] - sp[0];
      if (e.altKey) {   // 자르기(길이 변함)
        if (k === '[') { if (t < sp[1] - f1 * 0.5) tlSetSpan(r.L, tlQuant(t), sp[1]); }
        else if (t > sp[0] + f1 * 0.5) tlSetSpan(r.L, sp[0], tlQuant(t));
      } else { const a = tlQuant(Math.max(0, k === '[' ? t : t - len)); tlSetSpan(r.L, a, +(a + len).toFixed(4)); }
    }
    tlGrowDur(); buildTimeline(); tlRefreshPreview(); return done();
  }
  if (lk === 'b' || lk === 'n') {   // 작업 영역 시작/끝을 재생헤드로
    pushUndo('tl-work'); const w = A.work ? { a: +A.work.a, b: +A.work.b } : { a: 0, b: +A.dur }, t = tlQuant(+tlHeadT || 0);
    if (lk === 'b') w.a = Math.min(t, w.b - f1); else w.b = Math.max(t, w.a + f1);
    A.work = (w.a <= 1e-4 && w.b >= +A.dur - 1e-4) ? undefined : { a: +w.a.toFixed(4), b: +w.b.toFixed(4) };
    if (!A.work) delete A.work;
    tlInvalidate(TLD.RULER); return done();
  }
  if (k === 'Delete' || k === 'Backspace') {
    if (tlState.keySel.size) { pushUndo(); const arr = camKeys(); for (let i = arr.length - 1; i >= 0; i--) if (tlState.keySel.has(arr[i].id)) arr.splice(i, 1); const n = tlState.keySel.size; tlState.keySel.clear(); tlClosePopover(); buildTimeline(); tlRefreshPreview(); status(`카메라 키 ${n}개 지움 (되돌리기 Ctrl+Z)`); }
    else if (tlState.sel.size) status('레이어 타이밍 지우기는 [초기화]나 자동 구성으로 — 막대는 끌어서 옮기세요', true);
    return done();
  }
  if (k === '=' || k === '+') { tlZoomKey(120); return done(); }
  if (k === '-' || k === '_') { tlZoomKey(-120); return done(); }
  if (k === ';') { tlZoomKey(tlState.zoom > 500 ? -1000 : 1000); return done(); }
  if (lk === 'u') { const o = !(tlState.open.cam && tlState.open.typ); tlState.open = { cam: o, typ: o }; tlSaveUi(); buildTimeline(); return done(); }
  if (k === 'Escape') { tlState.sel.clear(); tlState.keySel.clear(); tlSelSync(); tlClosePopover(); return done(); }
  return false;
}
// 키로 줌 — 재생헤드 기준
function tlZoomKey(dz) { const t = +tlHeadT || 0, x = TL_PAD + t * tlState.pps - tlState.scrollX; tlZoomTo(tlState.zoom + dz, t, x); }

// ===================== 배선(런타임 — wire()가 부른다. 로드 때 실행 코드 없음) =====================
function tlWire() {
  tlLoadUi();
  const tl = $('#timeline'), lanes = $('#tlTracks'), names = $('#tlNames');
  // 패널 포커스(AE식 파란 테두리) — 타임라인을 누르면 키보드가 타임라인 것, 무대·사이드바·제목줄을 누르면 지도 것
  document.addEventListener('pointerdown', (e) => {
    if (!tlState.isOpen) return;
    const t = e.target;
    if (t.closest && (t.closest('#camKeyPop') || t.closest('#tossOv') || t.closest('#confirmOverlay'))) return;
    const inside = !!(t.closest && t.closest('#timeline'));
    if (inside !== tlState.focus) { tlState.focus = inside; tl.classList.toggle('focus', inside); }
  }, true);
  // 레인: 키·막대·빈 곳
  lanes.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const key = e.target.closest('.tlKey'); if (key) { tlStartKeyDrag(e, key); return; }
    const clip = e.target.closest('.tlClip'); if (clip) { tlStartBarDrag(e, clip, e.target.closest('.tlEdge')); return; }
    tlStartMarquee(e);
  });
  lanes.addEventListener('dblclick', (e) => {
    const key = e.target.closest('.tlKey'); if (!key) return;
    const k = camKeys().find((x) => x.id === key.dataset.k); if (!k) return;
    tlSetT(+k.t); tlState.keySel = new Set([k.id]); tlSelSync(); requestAnimationFrame(() => openCamKeyPopover(k.id));   // AE: 키 더블클릭 = 값 대화상자
  });
  // 이름 열
  names.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const tw = e.target.closest('[data-tw]');
    if (tw) { const w = tw.dataset.tw; if (e.altKey) { const o = !(tlState.open.cam && tlState.open.typ); tlState.open = { cam: o, typ: o }; } else tlState.open[w] = !tlState.open[w]; tlSaveUi(); buildTimeline(); e.preventDefault(); return; }
    const kn = e.target.closest('[data-kn]'); if (kn) { tlKnav(kn.dataset.kn); e.preventDefault(); return; }
    const wt = e.target.closest('[data-watch]'); if (wt) { tlWatch(wt.dataset.watch); e.preventDefault(); return; }
    const nm = e.target.closest('.tlName'); if (!nm) return;
    const row = tlRowById(nm.dataset.id); if (!row) return;
    const pf = e.target.closest('.tlV[data-prop] [data-f]'); if (pf && row.prop) { tlEditPropValue(e, row, pf.dataset.f); return; }
    const vin = e.target.closest('.tlV[data-in]'), vlen = e.target.closest('.tlV[data-len]');
    if ((vin || vlen) && tlSpanNow(row.L) && row.L.kind !== 'vfEnter' && (row.L.track || row.child)) { tlEditSpanCell(e, row, vin ? 'in' : 'len'); return; }
    // 이름 클릭 = 선택(Shift/Ctrl = 더하기). 카메라·속성 이름 = 키 전부 선택(AE)
    if (row.L.kind === 'camera' || row.prop) { tlState.keySel = new Set(camKeys().map((k) => k.id)); tlState.sel = new Set(['cam']); tlSelSync(); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (tlState.sel.has(row.id)) tlState.sel.delete(row.id); else tlState.sel.add(row.id); }
    else { tlState.sel = new Set([row.id]); tlState.keySel.clear(); }
    tlSelSync();
  });
  // 눈금자·CTI 머리 = 스크럽(Shift 스냅)
  $('#tlRuler').addEventListener('pointerdown', (e) => { if (e.button === 0) tlStartScrub(e); });
  $('#tlCtiHead').addEventListener('pointerdown', (e) => { if (e.button === 0) tlStartScrub(e); });
  $('#tlTimeBox').addEventListener('pointerdown', (e) => { if (e.button === 0 && !e.target.closest('input')) tlStartTimeBox(e); });
  // 내비게이터 — 가운데 끌기 = 이동, 양끝 = 확대/축소, 바깥 클릭 = 그 자리로
  $('#tlNav').addEventListener('pointerdown', (e) => {
    const nav = $('#tlNav'), win = $('#tlNavWin'); const nr = nav.getBoundingClientRect(), wr = win.getBoundingClientRect();
    const W = TL_PAD * 2 + Math.max(+anim().dur || 6, tlState.maxEnd) * tlState.pps, k = W / nr.width;
    if (e.clientX < wr.left - 4 || e.clientX > wr.right + 4) { tlScrollTo((e.clientX - nr.left) * k - tlState.viewW / 2); return; }
    const edge = e.clientX < wr.left + 5 ? 'l' : e.clientX > wr.right - 5 ? 'r' : 'm';
    const sx0 = tlState.scrollX, l0 = wr.left - nr.left, r0 = wr.right - nr.left, pps0 = tlState.pps;
    tlDragGesture(e, {
      move: (ev, dx) => {
        if (edge === 'm') { tlScrollTo(sx0 + dx * k); return; }
        let l = l0, r = r0; if (edge === 'l') l = Math.min(r0 - 10, l0 + dx); else r = Math.max(l0 + 10, r0 + dx);
        const t0 = (l * k - TL_PAD) / pps0, t1 = (r * k - TL_PAD) / pps0, span = Math.max(1 / tlFps(), t1 - t0);
        const dur = Math.max(0.5, +anim().dur || 6), fit = Math.max(4, (tlState.viewW - TL_PAD * 2) / dur), max = tlFps() * 48;
        const pps = Math.max(fit, Math.min(max, tlState.viewW / span));
        const z = max > fit ? 1000 * Math.log(pps / fit) / Math.log(max / fit) : 0;
        tlZoomTo(z, Math.max(0, t0), 0);
      },
    });
    e.preventDefault();
  });
  // 작업 영역 양끝
  $('#tlWork').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.h'); if (!h) return;
    const A = anim(), w0 = A.work ? { a: +A.work.a, b: +A.work.b } : { a: 0, b: +A.dur }, which = h.classList.contains('a') ? 'a' : 'b', f1 = tlFrameDur();
    tlDragGesture(e, {
      start: () => pushUndo('tl-work'),
      move: (ev, dx) => {
        const w = { a: w0.a, b: w0.b }; let v = tlQuant(Math.max(0, Math.min(+A.dur, w0[which] + dx / tlState.pps)));
        if (ev.shiftKey) { const s = tlSnapNear(v, tlSnapTargets(null, tlState.plan), 8 / tlState.pps); if (s != null) v = s; }
        if (which === 'a') w.a = Math.min(v, w.b - f1); else w.b = Math.max(v, w.a + f1);
        A.work = { a: +w.a.toFixed(4), b: +w.b.toFixed(4) };
        tlReadout(ev, `작업 영역 <b>${tlFmtShort(w.a)}</b> ~ <b>${tlFmtShort(w.b)}</b>`);
        tlInvalidate(TLD.RULER);
      },
      end: () => { tlReadoutHide(); if (A.work && A.work.a <= 1e-4 && A.work.b >= +A.dur - 1e-4) delete A.work; },
    });
    e.preventDefault(); e.stopPropagation();
  });
  // 휠: 세로 = 기본 스크롤, Shift = 좌우, Alt = 마우스 위치 기준 시간 줌
  $('#tlBody').addEventListener('wheel', (e) => {
    const gr = $('#tlGrid').getBoundingClientRect();
    if (e.altKey || e.ctrlKey) { e.preventDefault(); const mx = Math.max(0, e.clientX - gr.left), tm = (mx + tlState.scrollX - TL_PAD) / tlState.pps; tlZoomTo(tlState.zoom - e.deltaY * 0.6, tm, mx); return; }
    if (e.shiftKey) { e.preventDefault(); tlScrollTo(tlState.scrollX + (e.deltaY || e.deltaX)); return; }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); tlScrollTo(tlState.scrollX + e.deltaX); }
  }, { passive: false });
  $('#tlZoom').addEventListener('input', (e) => { const t = +tlHeadT || 0, x = TL_PAD + t * tlState.pps - tlState.scrollX; tlZoomTo(+e.target.value, t, Math.max(0, Math.min(tlState.viewW, x))); });
  $('#tlFit').onclick = () => { tlZoomTo(0); tlScrollTo(0); };
  $('#tlShy').onclick = () => { tlState.shy = !tlState.shy; tlSaveUi(); buildTimeline(); };
  // 이름 열 폭
  $('#tlNameEdge').addEventListener('pointerdown', (e) => {
    const w0 = tlState.nameW, ed = $('#tlNameEdge'); ed.classList.add('on');
    tlDragGesture(e, {
      move: (ev, dx) => { tlState.nameW = Math.round(Math.max(240, Math.min(520, w0 + dx))); tl.style.setProperty('--nameW', tlState.nameW + 'px'); },
      end: () => { ed.classList.remove('on'); tlSaveUi(); },
    });
    e.preventDefault();
  });
  // 높이 — 무대도 같이 줄었다 늘었다(sizeFit은 무대 ResizeObserver가)
  $('#tlGrip').addEventListener('pointerdown', (e) => {
    const y0 = e.clientY, h0 = tlH, gp = $('#tlGrip'); gp.classList.add('on');
    const mv = (ev) => { tlH = h0 - (ev.clientY - y0); tlApplyHeight(); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); gp.classList.remove('on'); tlSaveUi(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  // 폭이 바뀌면(창 크기·사이드바·이름 열) 배율·눈금·막대·헤드를 같이(B2) — 폭은 여기서만 읽는다
  if (window.ResizeObserver) {
    let roT = 0;
    const ro = new ResizeObserver(() => { if (roT) return; roT = requestAnimationFrame(() => { roT = 0; if (tlState.isOpen) tlMeasure(); }); });
    ro.observe($('#tlGrid')); ro.observe($('#tlTimeHdr'));
  }
  window.addEventListener('resize', () => { if (tlState.isOpen) tlApplyHeight(); });
  // 테마가 바뀌면 눈금자 색 다시
  if (window.MutationObserver) new MutationObserver(() => { tlState.colors = null; if (tlState.isOpen) tlInvalidate(TLD.RULER); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

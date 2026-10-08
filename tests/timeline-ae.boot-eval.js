// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/timeline-ae.boot.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱에서 AE식 타임라인을 열어 행·아이콘·막대를 보고, 조사 때 오류(B1·B3·B4·B5·B10·B18·B20)를 재현해 보고, AE 스펙이 타임라인 값을 그대로 쓰는지 본다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $q = (s) => document.querySelector(s);
for (let i = 0; i < 12; i++) { if ($q('#tourWrap.on') && $q('#tourClose')) $q('#tourClose').click(); const x = $q('#tossOv .tossX'); if (x) x.click(); await sleep(150); }
{ const so = $q('#startOverlay'); if (so && so.classList.contains('on')) so.classList.remove('on'); }
const caps = { ae: [] };
const realFetch = window.fetch.bind(window);
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, opts) => {
  const u = String(url);
  if (/\/ping(\?|$)/.test(u)) return json({ ok: true, ff: true, ver: 20261007 });
  if (u.includes('/api/frame')) return json({ ok: true });
  if (u.includes('/api/ae')) { caps.ae.push(JSON.parse(opts.body)); return json({ ok: true, ae: 'AE test' }); }
  return realFetch(url, opts);
};
const openWork = async (w) => {
  if ($q('#timeline').classList.contains('on')) $q('#tlClose').click();
  const f = new File([JSON.stringify(w)], 'tl-ae.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await sleep(1300);
  for (let i = 0; i < 6; i++) { const x = $q('#tossOv .tossX'); if (x) x.click(); await sleep(100); }
};
const COLS = ['#FFE7E3', '#FDB9B1', '#FA9A8C', '#FB7264', '#F9483A', '#FA2E1E', '#C81306', '#8A0A02'];
const LBL = { title: '', titleRatio: 0.75, divider: 1, txtCol: '#FFFFFF', stroke: '#FFFFFF', strokeW: 1.5, size: 40, w: 500, track: -1, padX: 20, padY: 12, radius: 0, fillOp: 1 };
const zones = (MAP.styles.sgg.zones || []).map((z) => z.id); const F = {}; zones.forEach((id, i) => { if (i % 3 !== 2) F[id] = COLS[i % 8]; });
const labels = []; for (let i = 0; i < 12; i++) labels.push(Object.assign({}, LBL, { id: 'l' + (100 + i), txt: String(10 + i * 5), x: 700 + (i % 4) * 220, y: 250 + Math.floor(i / 4) * 170, fill: COLS[(i * 3) % 8], style: 'plain' }));
const mtns = [{ id: 'm1', x: 1000, y: 380, size: 60, col: COLS[2], op: 100, txt: '설악산', txtSize: 22, txtCol: '#FFFFFF' }, { id: 'm2', x: 1120, y: 520, size: 54, col: COLS[5], op: 100, txt: '태백산', txtSize: 22, txtCol: '#FFFFFF' }];
const sgg = { res: '1920x1080', style: 'sgg', map: { x: 1160, y: 545, s: 1.02 }, fillsByStyle: { sgg: F }, labels, mtns, anim: { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] } };
const out = {};
const rowTops = () => [...tlState.els.values()].map((e) => [Math.round(e.nm.getBoundingClientRect().top), Math.round(e.ln.getBoundingClientRect().top)]);
const barLeft = (id) => { const e = tlState.els.get(id), g = $q('#tlGrid').getBoundingClientRect(); return +(e.clip.getBoundingClientRect().left - g.left).toFixed(1); };
const expectLeft = (L) => +(12 + tlSpanNow(L)[0] * tlState.pps - tlState.scrollX).toFixed(1);

// 1) 시군 — 열기·자동 구성·행·아이콘
await openWork(sgg);
$q('#tlToggle').click(); await sleep(700);
$q('#tlAuto').click(); await sleep(700);
{
  const plan = tlLayerPlan();
  out.sgg = {
    planN: plan.length, rows: tlState.rows.length, icons: [...document.querySelectorAll('#tlNames .tlName:not(.prop) .tlIcon svg')].length,
    old: document.querySelectorAll('.tlTypKey, .tlCamBar, .tlCamKey, .tlRow, .tlCamRow').length, keys: document.querySelectorAll('.tlKey').length,
    names: tlState.rows.map((r) => r.L.name).slice(0, 6), tracks: anim().tracks.length,
  };
  const cg = $q('#cg').getBoundingClientRect(), tl = $q('#timeline').getBoundingClientRect();
  out.B20 = { cgBottom: Math.round(cg.bottom), tlTop: Math.round(tl.top) };
  // B1 세로 스크롤 — 같은 스크롤 안 같은 높이 행
  const sc = $q('#tlScroll'); sc.scrollTop = 140; await sleep(300);
  const hd = $q('#tlHead').getBoundingClientRect(), sr = sc.getBoundingClientRect();
  out.B1 = { scrollTop: sc.scrollTop, aligned: rowTops().every(([a, b]) => a === b), headSpans: hd.top <= sr.top && hd.bottom >= sr.bottom - 1, hOverflow: sc.scrollWidth - sc.clientWidth };
  sc.scrollTop = 0; await sleep(200);
  // B3 되돌리기 뒤 막대 제자리
  const row = tlState.rows.find((r) => r.L.kind === 'fill' && r.L.track);
  const s0 = tlSpanNow(row.L)[0];
  pushUndo(); tlSetSpan(row.L, 3.0, 3.8); buildTimeline(); await sleep(200);
  const moved = barLeft(row.id);
  undo(); await sleep(400);
  const r2 = tlState.rows.find((r) => r.id === row.id);
  out.B3 = { s0, after: tlSpanNow(r2.L)[0], moved, left: barLeft(row.id), expect: expectLeft(r2.L) };
  // B10 막대를 누르고 안 움직이고 떼면 되돌리기 기록 없음
  const u0 = undoStack.length;
  const clip = tlState.els.get(row.id).clip, cr = clip.getBoundingClientRect();
  const pe = (type, x) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: cr.top + cr.height / 2, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true });
  clip.dispatchEvent(pe('pointerdown', cr.left + 10)); window.dispatchEvent(pe('pointerup', cr.left + 10)); await sleep(200);
  out.B10 = { u0, u1: undoStack.length, sel: [...tlState.sel] };
  // 막대 끌기(합성 포인터) — 되돌리기 1번, 프레임 경계, 재생헤드 그대로(B8)
  tlSetT(1.0); await sleep(300);
  const h0 = tlHeadT, c2 = tlState.els.get(row.id).clip.getBoundingClientRect();
  const pe2 = (type, x) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: c2.top + c2.height / 2, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true });
  tlState.els.get(row.id).clip.dispatchEvent(pe2('pointerdown', c2.left + 10));
  for (let i = 1; i <= 8; i++) { window.dispatchEvent(pe2('pointermove', c2.left + 10 + i * 12)); await sleep(20); }
  window.dispatchEvent(pe2('pointerup', c2.left + 10 + 96)); await sleep(400);
  const sd = tlSpanNow(tlState.rows.find((r) => r.id === row.id).L);
  out.drag = { undo: undoStack.length - u0, start: sd[0], frames: sd[0] * 29.97, head0: h0, head1: tlHeadT };
  // B18 타임라인 포커스면 → = 1프레임, 지도 그대로
  tlState.focus = true; $q('#timeline').classList.add('focus');
  const m0 = S.map.x, t0 = tlHeadT, un0 = undoStack.length;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true })); await sleep(300);
  out.B18 = { mapX0: m0, mapX1: S.map.x, dt: +(tlHeadT - t0).toFixed(4), undo: undoStack.length - un0 };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', bubbles: true, cancelable: true })); await sleep(300);
  out.B18.end = tlHeadT;
  // 포커스가 아니면 ← → 는 타임라인 것이 아님
  tlState.focus = false; out.B18.ownsWhenBlur = tlOwnsKeys();
  // AE 스펙 — 타임라인 값 그대로(트랙 없음 = 처음부터, 산마다 레이어, 컴프 = 타임라인 길이)
  const A = anim();
  const fl = A.tracks.find((t) => t.kind === 'fill'); fl.start = 2.5; fl.len = 1.3;
  const lb = A.tracks.find((t) => t.kind === 'label' && t.key === 'l100'); lb.start = 3.1; lb.len = 0.7;
  A.tracks = A.tracks.filter((t) => !(t.kind === 'label' && t.key === 'l101'));   // 이 라벨은 타이밍 없음
  const mt = A.tracks.find((t) => t.kind === 'mtn' && t.key === 'm2'); mt.start = 4; mt.len = 0.5;
  buildTimeline(); await sleep(200);
  const n0 = caps.ae.length; await $q('#aeSend').onclick(); await sleep(300);
  const spec = caps.ae[n0];
  const L = (name) => spec && spec.layers.find((l) => l.name === name);
  const li100 = labels.findIndex((b) => b.id === 'l100') + 1, li101 = labels.findIndex((b) => b.id === 'l101') + 1;
  out.ae = spec ? {
    fill: (L('색칠_' + fl.key.replace('#', '')) || {}).fade, lab100: (L('라벨_' + li100) || {}).fade, lab101: L('라벨_' + li101) ? L('라벨_' + li101).fade : 'missing',
    mtns: spec.layers.filter((l) => /^산_/.test(l.name)).map((l) => [l.name, l.fade]), mtnBase: !!L('산(바탕)'), dur: spec.comp.dur,
    order: spec.layers.map((l) => l.name), vfEnter: spec.vfEnter,
  } : null;
}
// 2) 태풍 + 카메라 — 아이콘, Alt 팬 = 자동 키(라벨 그대로, B4), 자동 저장 = 작업 뷰(B5), AE 카메라
{
  const P = []; for (let i = 0; i < 14; i++) P.push({ lon: 140 - i * 1.1, lat: 15 + i * 1.5, label: (20 + Math.floor(i / 2)) + '일 ' + (i % 2 ? '15' : '03') + '시', ws: 18 + i * 2, r15: 180 + i * 10, r25: i > 4 ? 60 + i * 5 : 0, r70: i > 6 ? 90 + i * 6 : 0, fcst: i > 6, tmef: '' });
  const labs = [3, 7, 10, 13].map((idx, k) => Object.assign({}, LBL, { id: 'tl' + (100 + k), idx, txt: P[idx].label, x: 700 + k * 260, y: 260 + k * 120, fill: '#0C295F' }));
  const ty = { res: '1920x1080', style: 'typhoon', map: { x: 1160, y: 545, s: 1.02 }, labels: [], typhoon: { name: 't', issues: [{ tmfc: '', label: 't', points: P }], sel: 0, places: [], nowIdx: 6, trackMode: 'full', lineWidth: 6, iconCol: '#E5231E', iconScale: 1, labels: labs },
    anim: { dur: 6, fps: 29.97, reveal: 'dissolve', tracks: [], cam: { keys: [{ id: 'c901', t: 0.4, x: 1160, y: 545, s: 1.02, rx: 0, ry: 0, rz: 0 }, { id: 'c902', t: 3.6, x: 1060, y: 600, s: 1.35, rx: 0, ry: 0, rz: 0 }] } } };
  await openWork(ty);
  $q('#tlToggle').click(); await sleep(700);
  $q('#tlAuto').click(); await sleep(700);
  const iconOf = (id) => { const e = tlState.els.get(id); const p0 = e && e.nm.querySelector('.tlIcon path'); return p0 ? p0.getAttribute('d') : ''; };
  out.typ = {
    rows: tlState.rows.map((r) => r.id), typIcon: iconOf('typ').startsWith('M12 7a5 5 0 110 10'), camIcon: iconOf('cam').startsWith('M9.2 4h5.6'),
    keyEls: document.querySelectorAll('.tlLane.prop .tlKey').length, ticks: document.querySelectorAll('.tlClip.cam .tlTick').length,
    pathEdges: document.querySelectorAll('.tlLane[data-id="typ:path"] .tlEdge').length, parentEdges: document.querySelectorAll('.tlLane[data-id="typ"] .tlEdge').length,
  };
  const work0 = JSON.stringify(stateForSave().map), lab0 = JSON.stringify(labelList().map((b) => [b.id, b.x, b.y]));
  tlSetT(2.0); await sleep(500);
  // Alt + 가운데 버튼 끌기(팬)
  const cg = $q('#cg').getBoundingClientRect(), x0 = cg.left + cg.width / 2, y0 = cg.top + cg.height / 2;
  const pp = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 1, buttons: type === 'pointerup' ? 0 : 4, altKey: true, pointerId: 2, isPrimary: true });
  svg.dispatchEvent(pp('pointerdown', x0, y0));
  for (let i = 1; i <= 6; i++) { window.dispatchEvent(pp('pointermove', x0 + i * 15, y0 + i * 5)); await sleep(30); }
  window.dispatchEvent(pp('pointerup', x0 + 90, y0 + 30)); await sleep(600);
  out.B4 = { keys: camKeys().map((k) => [k.t, k.x, k.y]), labelsKept: JSON.stringify(labelList().map((b) => [b.id, b.x, b.y])) === lab0, saved: JSON.stringify(stateForSave().map) === work0 };
  await sleep(1800);   // 자동 저장(1.5초) 한 번
  out.B5 = { savedMap: JSON.stringify((JSON.parse(localStorage.getItem('wcg_work') || '{}')).map), work0, live: JSON.stringify(S.map) };
  const n0 = caps.ae.length; await $q('#aeSend').onclick(); await sleep(300);
  const spec = caps.ae[n0], rig = spec && (spec.layers.find((l) => l.typhoonRig) || {}).typhoonRig;
  out.aeTyp = rig ? { camera: rig.camera, reveal: rig.reveal, labels: rig.labels.map((l) => [l.revStart, l.revLen]), dur: spec.comp.dur, map: JSON.stringify(S.map), animT } : null;
}
return out;

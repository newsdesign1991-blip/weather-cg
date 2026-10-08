// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/ae-timeline-spec.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱에서 타임라인을 열고 화면 행(시작·길이 칸 글자, 막대 left·width px, 점선 막대)과 'AE로 보내기'가 /api/ae로 보낸 스펙을 같이 뽑는다.
// 막대를 실제 포인터로 끌고(이동·오른쪽 끝 자르기) 다시 보내 본다(타임라인에서 고친 값이 그대로 AE로).
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
  const f = new File([JSON.stringify(w)], 'tl-spec.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await sleep(1300);
  for (let i = 0; i < 6; i++) { const x = $q('#tossOv .tossX'); if (x) x.click(); await sleep(100); }
  $q('#tlToggle').click(); await sleep(800);
};
const sendAE = async () => { const n0 = caps.ae.length; await $q('#aeSend').onclick(); await sleep(300); return caps.ae[n0]; };
const FPS = 29.97, q = (t) => +(Math.round(t * FPS) / FPS).toFixed(4);
const COLS = ['#FFE7E3', '#FDB9B1', '#FA9A8C', '#FB7264', '#F9483A', '#FA2E1E', '#C81306', '#8A0A02'];
const LBL = { title: '', titleRatio: 0.75, divider: 1, txtCol: '#FFFFFF', stroke: '#FFFFFF', strokeW: 1.5, size: 40, w: 500, track: -1, padX: 20, padY: 12, radius: 0, fillOp: 1 };

// 화면 행 → AE 레이어 이름(sendToAE가 짓는 이름) — 위→아래 행 순서 그대로
function rowNames(L, labIdx) {
  if (L.gone || L.kind === 'oldText' || L.kind === 'camera' || L.kind === 'vfEnter') return [];
  if (L.kind === 'static') {
    if (L.sub === 'bg') return isTyphoon() ? [] : ['배경·지도'];
    if (L.sub === 'lines') return ['경계선'];
    if (L.sub === 'mtnBase') return ['산(바탕)'];
    if (L.sub === 'vfbar') return ['VF_제목바'];
    if (L.sub === 'legend') return ['범례'];
    if (L.sub.startsWith('title:')) { const t = S.texts.find((x) => x.id === L.key); return ['제목_' + (t.txt || '').slice(0, 8)]; }
    return [];
  }
  if (L.kind === 'fill') return [L.wrnDef ? '특보_' + L.wrnDef.name : '색칠_' + L.key.replace('#', '')];
  if (L.kind === 'brush') return ['브러쉬_' + L.key.replace('#', '')];
  if (L.kind === 'mtn') return ['산_' + String(L.name || '').slice(0, 8)];
  if (L.kind === 'label') { const i = labIdx.get(L.id); const b = S.labels.find((x) => x.id === L.key); return (b && b.style === 'leader' ? ['지시선_' + i] : []).concat(['라벨_' + i]); }
  if (L.kind === 'typhoon') return ['태풍 리깅'];
  if (L.kind === 'typcmp') return [];
  return ['?'];
}
// 지금 화면 행·막대와 스펙을 한 장면으로
function scene(name, spec, extra) {
  const plan = tlState.plan;
  const labIdx = new Map(); plan.slice().reverse().filter((L) => L.kind === 'label' && !L.gone).forEach((L, i) => labIdx.set(L.id, i + 1));   // 라벨은 아래→위로 1번부터
  const rows = [], rowLayers = [];
  for (const r of tlState.rows) {
    if (r.prop || r.child) continue;
    const L = r.L, e = tlState.els.get(r.id), names = rowNames(L, labIdx);
    rowLayers.push(names);
    const ly = names.length ? spec.layers.find((l) => l.name === names[names.length - 1]) : null;
    const lead = names.length > 1 ? spec.layers.find((l) => l.name === names[0]) : null;
    rows.push({
      id: r.id, kind: L.kind, vin: e.vin ? e.vin.textContent : null, vlen: e.vlen ? e.vlen.textContent : null,
      left: parseFloat(e.clip.style.left), width: parseFloat(e.clip.style.width), none: e.clip.classList.contains('none'), pps: tlState.pps,
      ae: L.kind !== 'static' && ly ? { fade: ly.fade ? { start: ly.fade.start, len: ly.fade.len } : null } : null,
      leaderSame: lead ? JSON.stringify(lead.fade) === JSON.stringify(ly.fade ? { start: ly.fade.start, len: ly.fade.len } : null) : null,
    });
  }
  return Object.assign({ name, fps: FPS, dur: anim().dur, rows, rowLayers, specLayers: spec.layers.map((l) => l.name), spec }, extra || {});
}
const ptr = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true });
async function dragEl(target, dx) {
  const r = target.getBoundingClientRect(), x0 = r.left + Math.min(10, r.width / 2), y0 = r.top + r.height / 2;
  target.dispatchEvent(ptr('pointerdown', x0, y0));
  for (let i = 1; i <= 8; i++) { window.dispatchEvent(ptr('pointermove', x0 + dx * i / 8, y0)); await sleep(20); }
  window.dispatchEvent(ptr('pointerup', x0 + dx, y0)); await sleep(450);
}
const out = { scenes: [] };

// 1) 시군 — 칠·라벨(지시선 포함)·산, 막대 있는 것/없는 것 섞어서
const zones = (MAP.styles.sgg.zones || []).map((z) => z.id); const F = {}; zones.forEach((id, i) => { if (i % 3 !== 2) F[id] = COLS[i % 8]; });
const labels = []; for (let i = 0; i < 6; i++) labels.push(Object.assign({}, LBL, { id: 'l' + (100 + i), txt: String(10 + i * 5), x: 700 + (i % 3) * 260, y: 260 + Math.floor(i / 3) * 200, fill: COLS[(i * 3) % 8], style: i % 3 === 1 ? 'leader' : 'plain', ax: 1300, ay: 800 }));
const mtns = [{ id: 'm1', x: 1000, y: 380, size: 60, col: COLS[2], op: 100, txt: '설악산', txtSize: 22, txtCol: '#FFFFFF' }, { id: 'm2', x: 1120, y: 520, size: 54, col: COLS[5], op: 100, txt: '태백산', txtSize: 22, txtCol: '#FFFFFF' }];
const tracks = [];
COLS.slice(0, 5).forEach((c, i) => tracks.push({ id: 'f' + i, kind: 'fill', key: c, start: q(0.4 + i * 0.37), len: q(0.5 + (i % 3) * 0.41) }));
labels.slice(0, 4).forEach((b, i) => tracks.push({ id: 'b' + i, kind: 'label', key: b.id, start: q(1.1 + i * 0.53), len: q(0.6 + i * 0.2) }));
tracks.push({ id: 'mt1', kind: 'mtn', key: 'm1', start: q(2.2), len: q(0.9) });
const sggWork = (res) => ({ res, style: 'sgg', map: { x: 1160, y: 545, s: 1.02 }, fillsByStyle: { sgg: F }, labels, mtns,
  texts: [{ id: 'x1', txt: '내일 강수량', x: 128, y: 120, size: 60, col: '#FFFFFF', w: 700 }], legend: { on: 0 },
  anim: { dur: 6, fps: FPS, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: JSON.parse(JSON.stringify(tracks)), cam: { keys: [] } } });
await openWork(sggWork('1920x1080'));
out.scenes.push(scene('시군 1920', await sendAE()));
// 1-1) 실제 포인터로 막대 끌기(몸통 +10프레임쯤) · 라벨 오른쪽 끝 자르기 → 다시 보내기
{
  const fr = tlState.rows.find((r) => r.id === 'fill:' + COLS[1].toUpperCase()), lr = tlState.rows.find((r) => r.id === 'label:l101');
  const f0 = tlSpanNow(fr.L), l0 = tlSpanNow(lr.L);
  await dragEl(tlState.els.get(fr.id).clip, 10 / FPS * tlState.pps);
  await dragEl(tlState.els.get(lr.id).clip.querySelector('.tlEdge.r'), -7 / FPS * tlState.pps);
  const f1 = tlSpanNow(tlState.rows.find((r) => r.id === fr.id).L), l1 = tlSpanNow(tlState.rows.find((r) => r.id === lr.id).L);
  out.scenes.push(scene('시군 끌기 뒤', await sendAE(), { dragged: { fill: [f0, f1, fr.id], label: [l0, l1, lr.id] } }));
}
// 2) VF — 같은 작업(VF 진입·축소 배율), 일부 막대 없음
await openWork(sggWork('1920x1080-vf'));
out.scenes.push(scene('시군 VF', await sendAE()));
// 3) 단일 태풍 + 카메라(확대 바뀜) — 경로·라벨 막대, 카메라 키
{
  const P = []; for (let i = 0; i < 14; i++) P.push({ lon: 140 - i * 1.1, lat: 15 + i * 1.5, label: (20 + Math.floor(i / 2)) + '일 ' + (i % 2 ? '15' : '03') + '시', ws: 18 + i * 2, r15: 180 + i * 10, r25: i > 4 ? 60 + i * 5 : 0, r70: i > 6 ? 90 + i * 6 : 0, fcst: i > 6, tmef: '' });
  const labs = [3, 7, 10, 13].map((idx, k) => Object.assign({}, LBL, { id: 'tl' + (100 + k), idx, txt: P[idx].label, x: 700 + k * 260, y: 260 + k * 120, fill: '#0C295F' }));
  const ty = { res: '1920x1080', style: 'typhoon', map: { x: 1160, y: 545, s: 1.02 }, labels: [], texts: [{ id: 'x1', txt: '태풍 경로', x: 120, y: 120, size: 60, col: '#FFFFFF' }],
    typhoon: { name: 't', issues: [{ tmfc: '', label: 't', points: P }], sel: 0, places: [], nowIdx: 6, trackMode: 'full', lineWidth: 6, iconCol: '#E5231E', iconScale: 1, labels: labs },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', tracks: [{ id: 'k9', kind: 'typhoon', key: 'typhoon', start: 0.5, len: 4, ps: q(0.5), pe: q(2.7), lab: { tl100: { s: q(1.2), e: q(2.0) }, tl101: { s: q(2.4), e: q(3.3) } } }],
      cam: { keys: [{ id: 'c1', t: q(0.3), x: 1160, y: 545, s: 1.02, rx: 0, ry: 0, rz: 0 }, { id: 'c2', t: q(2.5), x: 1060, y: 600, s: 1.35, rx: 0, ry: 0, rz: 0 }, { id: 'c3', t: q(4.4), x: 1100, y: 580, s: 1.2, rx: 0, ry: 0, rz: 0 }] } } };
  await openWork(ty);
  const spec = await sendAE();
  const path = tlState.rows.find((r) => r.id === 'typ:path'), pe = tlState.els.get(path.id);
  const pos = tlState.els.get('cam:pos');
  out.scenes.push(scene('태풍+카메라', spec, { typ: {
    path: tlSpanNow(path.L), pathVin: pe.vin.textContent, pathLeft: parseFloat(pe.clip.style.left), pathWidth: parseFloat(pe.clip.style.width), pps: tlState.pps,
    labs: tlState.rows.filter((r) => r.L.kind === 'typLabel').map((r) => ({ idx: labs.find((b) => b.id === r.L.key).idx, span: tlSpanNow(r.L) })),
    camT: camKeys().slice().sort((a, b) => a.t - b.t).map((k) => +k.t), camKeyLefts: pos ? pos.keys.map((k) => [+k.k.t, parseFloat(k.el.style.left)]) : [],
    camDiff: (tlState.plan.find((L) => L.kind === 'camera') || { diff: [] }).diff,
  } }));
}
return out;

// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/ae-cluster-e.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 헬퍼 없이 fetch를 가로채 sendToAE·wnsRender가 실제로 만드는 스펙/프레임을 뽑는다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const caps = { ae: [], frames: [], finalize: [] };
const realFetch = window.fetch.bind(window);
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, opts) => {
  const u = String(url);
  if (/\/ping(\?|$)/.test(u)) return json({ ok: true, ff: true, ver: 20261007 });
  if (u.includes('/api/frame')) { const q = new URL(u).searchParams; caps.frames.push({ sid: q.get('sid'), index: +q.get('index'), body: opts && opts.body }); return json({ ok: true }); }
  if (u.includes('/api/finalize')) { caps.finalize.push(JSON.parse(opts.body)); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }
  if (u.includes('/api/ae')) { caps.ae.push(JSON.parse(opts.body)); return json({ ok: true, fontsOk: false, ae: 'AE test' }); }
  return realFetch(url, opts);
};
// 저장창 없이(테스트) — prepareOutput이 쓰는 저장 대화상자를 가짜로
window.showSaveFilePicker = async (o) => ({ name: (o && o.suggestedName) || 'out', createWritable: async () => ({ write: async () => {}, close: async () => {} }) });

const openWork = async (work) => {
  const f = new File([JSON.stringify(work)], 'cluster-e.json', { type: 'application/json' });
  const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await sleep(1200);
};
// 작업마다 타임라인 트랙이 없다 → AE는 '자동 구성' 타이밍으로 보낸다. 그 계획(같은 시각 값)을 같이 뽑아 스펙과 1:1로 맞춰 본다.
const sendAE = async () => {
  const n0 = caps.ae.length, f0 = caps.frames.length;
  const auto = (!anim().tracks.length && !camKeys().length) ? autoTrackPlan().tracks.map((t) => ({ kind: t.kind, key: t.key, start: t.start, len: t.len, ps: t.ps, pe: t.pe })) : null;
  await document.getElementById('aeSend').onclick();
  const spec = caps.ae[n0];
  return { spec, frames: caps.frames.slice(f0), status: (document.getElementById('status') || {}).textContent || '', auto };
};
// 업로드된 PNG 픽셀 하나(RGBA)
const pixel = async (blob, x, y) => {
  const bm = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  const cx = c.getContext('2d'); cx.drawImage(bm, 0, 0);
  return { w: bm.width, h: bm.height, px: Array.from(cx.getImageData(Math.round(x), Math.round(y), 1, 1).data) };
};
const fileBlob = (frames, file) => { const i = parseInt(String(file).replace(/\D/g, ''), 10); const f = frames.find((q) => q.index === i); return f && f.body; };

const zoneIds = [...document.querySelectorAll('#gMain .zone')].map((z) => z.dataset.id).filter(Boolean);
const LEG = { on: 1, auto: 0, horiz: 0, x: 150, y: 560, box: 34, radius: 6, rowGap: 16, size: 34, weight: 600, txtCol: '#FFFFFF', gap: 18, items: [{ col: '#FA2E1E', txt: '폭염특보' }, { col: '#FFC400', txt: '폭염주의보' }] };
const LBL = { title: '', titleRatio: 0.75, divider: 1, txtCol: '#FFFFFF', stroke: '#FFFFFF', strokeW: 1.5, size: 40, w: 500, track: -1, padX: 20, padY: 12, radius: 0, fillGrad: 0, fill2: '', strokeGrad: 0, stroke2: '', gradAngle: 90, fillOp: 1, glass: 0, glassBlur: 6 };
const normalWork = (res) => ({
  res, style: 'sgg', map: { x: 1160, y: 545, s: 1.02 },
  fillsByStyle: { sgg: { [zoneIds[10]]: '#FA2E1E', [zoneIds[40]]: '#FFC400' } },
  labels: [
    Object.assign({}, LBL, { id: 'l1', txt: '10', x: 900, y: 400, fill: '#2255FF', style: 'plain' }),
    Object.assign({}, LBL, { id: 'l2', txt: '20', x: 1300, y: 420, fill: '#00C853', style: 'leader', ax: 1500, ay: 760 }),
  ],
  legend: LEG,
  anim: { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] },
});
const out = { zoneCount: zoneIds.length };

// 1) 터치 해상도 일반 지도 — 좌표·크기·라벨 PNG·지시선 레이어
await openWork(normalWork('2158x1214'));
{
  const r = await sendAE(); const s = r.spec;
  const title = s.layers.find((l) => l.text && l.text.content === '내일~모레');
  const lab1 = s.layers.find((l) => l.name === '라벨_1'), lab2 = s.layers.find((l) => l.name === '라벨_2');
  const ldr = s.layers.findIndex((l) => l.name === '지시선_2'), lab2i = s.layers.findIndex((l) => l.name === '라벨_2');
  const base = s.layers[0];
  const kx = 2158 / 1920, ky = 1214 / 1080;
  const baseAnchor = await pixel(fileBlob(r.frames, base.file), 1500 * kx, 760 * ky);
  const ldrAnchor = ldr >= 0 ? await pixel(fileBlob(r.frames, s.layers[ldr].file), 1500 * kx, 760 * ky) : null;
  const ldrBox = ldr >= 0 ? await pixel(fileBlob(r.frames, s.layers[ldr].file), 1300 * kx, 420 * ky) : null;
  const lab1Png = await pixel(fileBlob(r.frames, lab1.labelComp.bg), 0, 0);
  const rect1 = document.querySelector('#L_labels > g[data-id="l1"] rect');
  out.touch = {
    comp: s.comp, status: r.status, title: title && title.text,
    lab1: lab1 && { x: lab1.labelComp.x, y: lab1.labelComp.y, w: lab1.labelComp.w, h: lab1.labelComp.h, t0: lab1.labelComp.texts[0], rise: lab1.fade.rise, png: [lab1Png.w, lab1Png.h], rectW: rect1 && +rect1.getAttribute('width'), rectH: rect1 && +rect1.getAttribute('height') },
    leader: ldr >= 0 ? { idx: ldr, lab2Idx: lab2i, fade: s.layers[ldr].fade, labFade: lab2 && lab2.fade, file: s.layers[ldr].file } : null,
    baseAnchor: baseAnchor.px, ldrAnchor: ldrAnchor && ldrAnchor.px, ldrBox: ldrBox && ldrBox.px,
    legend: (s.layers.find((l) => l.legendComp) || {}).legendComp,
    auto: r.auto, fades: s.layers.filter((l) => l.fade).map((l) => [l.name, l.fade]),
  };
}
// 2) 노말 1920 / VF — 배율 1(기존과 같음)
for (const res of ['1920x1080', '1920x1080-vf']) {
  await openWork(normalWork(res));
  const r = await sendAE(); const s = r.spec;
  const title = s.layers.find((l) => l.text && l.text.content === '내일~모레');
  const lab1 = s.layers.find((l) => l.name === '라벨_1');
  const lab1Png = await pixel(fileBlob(r.frames, lab1.labelComp.bg), 0, 0);
  out[res] = { comp: s.comp, title: title && title.text, lab1: { x: lab1.labelComp.x, y: lab1.labelComp.y, w: lab1.labelComp.w, h: lab1.labelComp.h, t0: lab1.labelComp.texts[0], rise: lab1.fade.rise, png: [lab1Png.w, lab1Png.h] }, legend: (s.layers.find((l) => l.legendComp) || {}).legendComp, names: s.layers.map((l) => l.name) };
}

// 3) 단일 태풍 — 라인/일반, 터치/노말
const tyPts = [
  { lon: 137.2, lat: 19.4, label: '28일 03시', ws: 19, r15: 180, r25: 0, r70: 0, fcst: false },
  { lon: 136.3, lat: 20.6, label: '28일 15시', ws: 21, r15: 200, r25: 0, r70: 60, fcst: false, noIcon: true },
  { lon: 135.0, lat: 22.3, label: '29일 03시', r15: 240, r25: 70, r70: 90, fcst: false },
  { lon: 133.4, lat: 24.2, label: '29일 15시', ws: 29, r15: 260, r25: 90, r70: 130, fcst: true, noIcon: true },
  { lon: 131.7, lat: 26.0, label: '30일 03시', ws: 30, r15: 280, r25: 100, r70: 170, fcst: true },
];
const tyWork = (res, trackMode) => ({
  res, style: 'typhoon', map: { x: 1160, y: 545, s: 1.02 }, labels: [], legend: Object.assign({}, LEG, { on: 0 }),
  typhoon: { name: '테스트', issues: [{ tmfc: '', label: 't', points: tyPts }], sel: 0, places: [], nowIdx: 2, trackMode, lineWidth: 6, lineColor: '#00AAFF', iconCol: '#E5231E', iconScale: 1,
    labels: [Object.assign({}, LBL, { id: 'tl1', idx: 1, txt: '28일 15시', x: 900, y: 300, fill: '#0C295F' })] },
  anim: { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] },
});
for (const [key, res, mode] of [['tyLineTouch', '2158x1214', 'line'], ['tyFullTouch', '2158x1214', 'full'], ['tyFull1920', '1920x1080', 'full']]) {
  await openWork(tyWork(res, mode));
  const r = await sendAE(); const rig = (r.spec.layers.find((l) => l.typhoonRig) || {}).typhoonRig;
  out[key] = { comp: r.spec.comp, rig: rig && Object.assign({}, rig, { bg: undefined }), auto: r.auto };
}
// 3-1) 태풍 리빌이 6초를 넘는 타임라인(경로 1→9초, 라벨 9.5→11초) — 컴프 길이가 잘리지 않아야
{
  const w = tyWork('1920x1080', 'full');
  w.anim.tracks = [{ id: 'ty', kind: 'typhoon', ps: 1, pe: 9, lab: { tl1: { s: 9.5, e: 11 } } }];
  await openWork(w);
  const r = await sendAE(); const rig = (r.spec.layers.find((l) => l.typhoonRig) || {}).typhoonRig;
  out.tyLong = { comp: r.spec.comp, reveal: rig && rig.reveal, labels: rig && rig.labels.map((l) => [l.revStart, l.revLen]), tracks: JSON.parse(localStorage.getItem('wcg_work') || '{}').anim };
}
// 4) 태풍 비교 — 터치/노말
const cmpWork = (res) => ({
  res, style: 'typhoonCompare', map: { x: 1160, y: 545, s: 1.02 }, labels: [], legend: Object.assign({}, LEG, { on: 0 }),
  typhoon: { name: '비교', issues: [{ tmfc: '', label: 't', points: tyPts }], sel: 0, places: [], labels: [],
    compare: [{ id: 'c1', name: 'JTWC', color: '#FF5A5A', show: 1, dotIcon: 1, iconScale: 1, lineW: 3, points: tyPts.map((p) => ({ lon: p.lon + 1, lat: p.lat, label: p.label })), labels: [{ idx: 2, txt: 'A', x: 1200, y: 500 }] }] },
  anim: { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] },
});
for (const [key, res] of [['cmpTouch', '2158x1214'], ['cmp1920', '1920x1080']]) {
  await openWork(cmpWork(res));
  const r = await sendAE(); const rig = (r.spec.layers.find((l) => l.compareRig) || {}).compareRig;
  out[key] = { comp: r.spec.comp, rig: rig && Object.assign({}, rig, { bg: undefined }), auto: r.auto };
}

// 5) MXF 렌더 — 타임라인 25fps·1초 → 29.97 기준 30프레임(0..29). 워커 풀(가짜 워커)·메인 폴백·1프레임.
const RealWorker = window.Worker;
const runMxf = async (work, workerMode) => {
  await openWork(work);
  const posted = [];
  if (workerMode === 'fake') {
    window.Worker = class { postMessage(m) { posted.push(m.index); setTimeout(() => this.onmessage && this.onmessage({ data: { index: m.index, ok: true } }), 2); } terminate() {} };
  } else if (workerMode === 'none') window.Worker = undefined;
  const f0 = caps.frames.length, z0 = caps.finalize.length;
  try { await document.getElementById('wnsMxf').onclick(); } finally { window.Worker = RealWorker; }
  const main = caps.frames.slice(f0).map((q) => q.index);
  return { main, posted, finalize: caps.finalize.length - z0, status: (document.getElementById('status') || {}).textContent || '', info: (document.getElementById('tlInfo') || {}).textContent || '' };
};
const mxfWork = (dur, fps) => Object.assign(tyWork('1920x1080', 'full'), { anim: { dur, fps, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] } });   // 태풍 지도 = 트랙 없어도 애니 있음
out.mxfPool = await runMxf(mxfWork(1, 25), 'fake');
out.mxfMain = await runMxf(mxfWork(1, 25), 'none');
out.mxfOne = await runMxf(mxfWork(0.02, 29.97), 'fake');
return out;

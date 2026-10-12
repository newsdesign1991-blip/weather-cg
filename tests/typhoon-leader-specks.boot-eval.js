// 태풍 날짜 라벨 지시선 — 선이 나오기 전(reveal 0)엔 지시선이 없고, 그려지는 중엔 대시 간격이 선보다 길다.
// (2026-10-13: 길이만큼 밀어 숨겨 둔 지시선 끝에 둥근 마개가 3px 흰 점으로 남아 3D 카메라 이동 중 깜빡였다)
// boot-check 일회용 프로필에서만 돈다(tests/typhoon-leader-specks.boot.test.cjs). 여기서 만든 자료만 쓴다.
const check = (v, m) => { if (!v) throw new Error(m); };
closeTossModal(); closeCgSetup();
const RF = 30000 / 1001;
const dashOf = (p) => {
  const da = p.getAttribute('stroke-dasharray'); if (!da) return null;
  const n = da.split(/[ ,]+/).map(Number), a = n[0], g = n.length > 1 ? n[1] : n[0], o = +(p.getAttribute('stroke-dashoffset') || 0);
  return { a, g, o, L: p.getTotalLength() };
};
// 두 번째 대시 시작(= a + g − o)이 선 안이면 선 끝·중간에 둥근 마개 점이 생긴다
const risky = (d) => !!d && d.a + d.g - d.o <= d.L + 0.5;

// ── 1) 단일 태풍: 카메라가 움직이며(기울기 39.6→29°) 라벨 두 개가 늦게 등장 ──
const base = JSON.parse(JSON.stringify(stateForSave()));
base.style = Object.keys(MAP.styles).find((k) => MAP.styles[k].typhoon && !MAP.styles[k].compare);
const pts = Array.from({ length: 6 }, (_, i) => ({ lon: 127 + i * 2.6, lat: 17 + i * 3.1, ws: 35, r15: 250, tmef: '202610' + String(10 + i) + '0300', fcst: i > 1 }));
base.typhoon = Object.assign({}, typhoonStyleDefaults(), { name: '지시선 점 검증', issues: [{ tmfc: '', label: 'test', points: pts }], sel: 0, nowIdx: 1, places: [], labels: [], compare: [], krShow: 0 });
base.anim = { dur: 5.5, fps: 29.97, tracks: [], cam: { keys: [] } };
loadProjectData(base, null); setTyphoonDefaultView();
const labs = [makeTyphoonLabel(3, pts[3], 'l'), makeTyphoonLabel(5, pts[5], 'r')];
const m0 = { x: S.map.x, y: S.map.y, s: S.map.s };
const work = JSON.parse(JSON.stringify(stateForSave()));
work.typhoon.labels = labs;
work.anim = {
  dur: 5.5, fps: 29.97,
  tracks: [{ id: 'ty', kind: 'typhoon', start: 1, len: 2.9, ps: 1, pe: 3, lab: { [labs[0].id]: { s: 2.4, e: 3.3 }, [labs[1].id]: { s: 3.0, e: 3.9 } } }],
  cam: { keys: [{ id: 'k1', t: 1, x: m0.x, y: m0.y, s: m0.s, rx: 39.6, ry: 0, rz: -0.5 }, { id: 'k2', t: 3.2, x: m0.x + 70, y: m0.y + 260, s: m0.s * 0.86, rx: 29, ry: 0, rz: 3.6 }] },
};
loadProjectData(work, null);
const LB = () => document.querySelector('#L_typhoonLabels');
const W = 1920, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
const cx = cv.getContext('2d', { alpha: false, willReadFrequently: true });
// 선 끝 자리 9×9 최대 밝기 − 둘레(반경 7) 중앙값 — 둥근 마개 점(Y≈208)이면 크게 뛴다
const bump = (x, y) => {
  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const d = cx.getImageData(Math.round(x) - 7, Math.round(y) - 7, 15, 15).data;
  let pk = 0; const ring = [];
  for (let yy = 0; yy < 15; yy++) for (let xx = 0; xx < 15; xx++) {
    const i = (yy * 15 + xx) * 4, r = Math.max(Math.abs(xx - 7), Math.abs(yy - 7));
    if (r <= 4) pk = Math.max(pk, lum(d, i)); else if (r === 7) ring.push(lum(d, i));
  }
  ring.sort((p, q) => p - q);
  return Math.round(pk - ring[ring.length >> 1]);
};
const main = { frames: 0, hiddenWithPath: 0, riskyDash: 0, partial: 0, hiddenChecked: 0, endBumpMax: 0, endBumps: [] };
_exportingFrames = true;
try {
  for (let f = 30; f <= 100; f++) {
    const t = f / RF;
    renderAnimFrame(t);
    main.frames++;
    const hidden = [];
    for (const b of labs) {
      const pr = typhoonLabelProg(b.id), path = LB().querySelector(`[data-leader-id="${b.id}"]`);
      if (pr.reveal <= 0) {
        if (path) main.hiddenWithPath++;
        // 지시선이 '있었다면' 끝날 자리(박스 끝) — 그림에서 그 자리에 점이 없어야 한다
        const sp = typhoonScreenPts(curTyphoonPoints()).find((p) => !p.head && p.idx === b.idx) || (() => { const [x, y] = typhoonXY(pts[b.idx].lon, pts[b.idx].lat); return { x, y }; })();
        const [prx, pry] = camProjectXY(sp.x, sp.y), [bx, by] = camProjectXY(b.x, b.y);
        const g = typhoonLeaderGeom(prx, pry, bx, by, b._w || 100, b._h || 60);
        hidden.push([g.ax, g.ay]);
      } else if (path) {
        const d = dashOf(path);
        if (d) main.partial++;
        if (risky(d)) main.riskyDash++;
      }
    }
    if (hidden.length && f % 3 === 0) {   // 그림 굽기는 3프레임마다(시간 절약) — 숨은 라벨 끝 자리 밝기
      await drawExportFrame(cx, W, H);
      for (const [x, y] of hidden) { const v = bump(x, y); main.hiddenChecked++; main.endBumpMax = Math.max(main.endBumpMax, v); if (v > 60) main.endBumps.push({ f, x: Math.round(x), y: Math.round(y), v }); }
    }
  }
  // 다 나온 뒤엔 두 라벨 모두 대시 없는 온전한 지시선
  renderAnimFrame(4.6);
  main.endLeaders = labs.map((b) => { const p = LB().querySelector(`[data-leader-id="${b.id}"]`); return p ? (p.getAttribute('stroke-dasharray') || 'full') : 'none'; });
} finally { animOff(); }
check(main.frames > 60, '프레임 수');

// ── 2) 비교 지도: 비교 예보 트랙(typcmp)으로 선이 자라며 수치라벨이 등장 ──
const cw = JSON.parse(JSON.stringify(stateForSave()));
cw.style = Object.keys(MAP.styles).find((k) => MAP.styles[k].compare);
cw.typhoon.compare = [{ id: 'c1', name: '검증 예보', color: '#FF8800', show: 1, points: pts.map((p) => ({ ...p, lon: p.lon + 1.5 })), labels: [{ idx: 3 }, { idx: 5 }] }];
cw.anim = { dur: 5.5, fps: 29.97, tracks: [{ id: 'tc', kind: 'typcmp', key: 'c1', start: 1, len: 3 }], cam: { keys: [] } };
loadProjectData(cw, null);
const cmp = { frames: 0, leadersAtStart: -1, riskyDash: 0, partial: 0, maxLeaders: 0 };
const cmpLeaders = () => [...LB().querySelectorAll(':scope > path')].filter((p) => p.getAttribute('stroke') === '#DCE8F7');
try {
  renderAnimFrame(0.5);
  cmp.leadersAtStart = cmpLeaders().length;
  for (let f = 30; f <= 135; f++) {
    renderAnimFrame(f / RF); cmp.frames++;
    const ls = cmpLeaders(); cmp.maxLeaders = Math.max(cmp.maxLeaders, ls.length);
    for (const p of ls) { const d = dashOf(p); if (d) cmp.partial++; if (risky(d)) cmp.riskyDash++; }
  }
  renderAnimFrame(5.0);
  cmp.endLeaders = cmpLeaders().map((p) => p.getAttribute('stroke-dasharray') || 'full');
} finally { animOff(); }
return { main, cmp };

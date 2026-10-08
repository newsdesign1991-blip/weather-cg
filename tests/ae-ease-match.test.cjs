// AE 키·표현식 = 화면 함수(헬퍼 20261008 — 타임라인에서 고친 것이 그대로 AE로).
//  1) 실제 sendToAE(vm, tests/tl-plan-ctx.cjs aeCtx — 태풍 투영은 앱 실제 함수 opt.real)가 스펙을 만들고
//  2) 헬퍼(desktop/wns/ae-jsx.js = helper.py)가 JSX를 만들면
//  3) AE 흉내(desktop/test/ae-model.cjs)에서 JSX를 그대로 실행해 프레임마다 키 보간(AE 시간 베지어)·표현식 값을 계산하고
//  4) 같은 시각의 앱 화면 값(앱 소스를 tools/app-source.cjs로 합쳐 잘라 쓴 실제 함수 — easeOut·easeVf·camAt·typhoonScreenPts·
//     typhoonBandInto·typhoonLabelProg·compareScreenPts·drawCompareLabels 창 식·typhoonLeaderGeom·블라인드 덮임 식)과 비교한다.
// 허용 오차: 이징 곡선(불투명·위치·카메라)은 근사가 아니라 같은 곡선 — 앱 cubicBezier 뉴턴 풀이 허용오차 수준(≤0.001%p·0.001px).
// 태풍 선두·선 끝은 앱이 경위도로 보간한 뒤 투영(메르카토르), AE는 화면 직선 보간 → ≤0.6px. 반경은 보내는 값이 반올림 px(옛날부터) → ≤0.6px.
// 블라인드는 덮이는 비율만(띠 위치는 AE 효과가 한쪽에서 연다 — 'AE 차이' 표시).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { aeCtx, fnSrc, constSrc, MAP_PROJ } = require('./tl-plan-ctx.cjs');
const { buildAeJsx } = require('../desktop/wns/ae-jsx.js');
const { mkModel } = require('../desktop/test/ae-model.cjs');

const FPS = 29.97;
const frames = (t0, t1) => { const o = []; for (let f = Math.floor(t0 * FPS) - 2; f <= Math.ceil(t1 * FPS) + 2; f++) if (f >= 0) o.push(f / FPS); return o; };
const R = {};   // 항목별 최대 오차(보고용)
const note = (k, v) => { R[k] = Math.max(R[k] || 0, v); };
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plen = (P) => { let L = 0; for (let i = 1; i < P.length; i++) L += hyp(P[i], P[i - 1]); return L; };

// ── 앱 화면 함수(실제 소스) ──
function screenCtx(S) {
  const ctx = { S, Math, Object, Array, console, MAP: { proj: MAP_PROJ }, typhoonProg: null, typhoonCmpProg: null, typhoonLabelAnim: null,
    camKeys: () => S.anim.cam.keys, _te: (tag, attr) => ({ tag, attr, kids: [], appendChild(c) { this.kids.push(c); } }) };
  vm.createContext(ctx);
  vm.runInContext(['clamp01', 'EASE_BEZIER', 'easeOut', 'EASE_VF', 'easeVf', 'easeCam', 'easeInOutC', 'easeInOutCInv', 'lerp', 'TYPHOON_R_EARTH', 'typhoonKmToUnit'].map(constSrc).join('\n')
    + '\n' + ['cubicBezier', 'projLL', 'typhoonXY', 'typhoonScreenPts', 'compareScreenPts', 'typhoonLeaderGeom', 'typhoonLabelProg', 'typhoonBandInto', 'camAt'].map(fnSrc).join('\n'), ctx);
  return ctx;
}
async function build(S, opt) {
  const { ctx, caps, send } = aeCtx(S, Object.assign({ real: true }, opt || {}));
  if (opt && opt.iconSet) ctx.compareIconIdxSet = opt.iconSet;
  const spec = await send();
  assert.ok(spec, '스펙 없음 ' + caps.status.join(' / '));
  const M = mkModel().run(buildAeJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\t'));
  assert.deepEqual(M.errors, [], 'AE 흉내 오류 없음');
  return { spec, M, ctx, caps };
}
const layerOf = (M, name) => { const l = M.comps.flatMap((c) => c.list).find((x) => x.name === name); assert.ok(l, '레이어 없음: ' + name); return l; };
const nodesOf = (M, l, match) => M.nodes(l).filter((n) => n.matchName === match || n.name === match);
const worldPt = (M, l, t, p) => M.apply(M.worldAt(l, t), p);

// ===================== D1 페이드·라벨 올라오기·지시선·VF·블라인드·일반 지도 카메라 =====================
const COLS = { a: '#FA9A8C', b: '#8A0A02', c: '#2E6FB0' };
function sggS(over) {
  return Object.assign({ style: 'sgg', res: '1920x1080', map: { x: 1160, y: 545, s: 1.02 }, legend: { on: 0 }, vfBar: { on: 0 }, texts: [],
    mtns: [{ id: 'm1', txt: '설악산', col: COLS.c, x: 980, y: 420 }],
    labels: [{ id: 'l1', txt: '10', x: 500, y: 300, fill: COLS.a, style: 'plain' }, { id: 'l2', txt: '20', x: 760, y: 340, fill: COLS.b, style: 'leader', ax: 610, ay: 620, stroke: '#FFFFFF' }],
    fillsByStyle: { sgg: { z1: COLS.a, z2: COLS.b } }, brushByStyle: { sgg: [{ col: COLS.c, dabs: [] }] },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', blindSize: 30, blindAngle: -45, tracks: [
      { id: 'k1', kind: 'fill', key: COLS.a, start: 1.0, len: 0.8 }, { id: 'k2', kind: 'fill', key: COLS.b, start: 1.4, len: 2.0 },
      { id: 'k3', kind: 'brush', key: COLS.c, start: 0.5, len: 0.5 }, { id: 'k4', kind: 'label', key: 'l1', start: 2.1, len: 1.0 },
      { id: 'k5', kind: 'label', key: 'l2', start: 2.5, len: 0.9 }, { id: 'k6', kind: 'mtn', key: 'm1', start: 3.0, len: 0.6 }], cam: { keys: [] } } }, over || {});
}
function checkFades(spec, M, scr, tagp) {
  const TG = spec.vfEnter ? M.comps.find((c) => c.name === 'VF_전체') : M.main;
  for (const l of spec.layers) {
    if (!l.fade || l.legacy || l.fade.blinds) continue;
    const al = TG.list.find((x) => x.name === l.name);
    const s = l.fade.start, L = l.fade.len;
    for (const t of frames(s - 0.2, s + L + 0.2)) {
      const app = 100 * scr.easeOut(scr.clamp01((t - s) / Math.max(L, 0.001)));   // renderAnimFrameBody: easeOut(trackProg)
      const ae = al.tf.opacity.valueAtTime(t);
      note(tagp + ' 페이드 불투명(%p)', Math.abs(ae - app));
      if (l.labelComp && l.fade.rise) {
        const y0 = l.labelComp.y, appY = y0 + (1 - scr.easeOut(scr.clamp01((t - s) / Math.max(L, 0.001)))) * l.fade.rise;
        note(tagp + ' 라벨 올라오기(px)', Math.abs(al.tf.position.valueAtTime(t)[1] - appY));
      }
    }
  }
}
test('D1 페이드 = 앱 easeOut(34/85) — 칠·브러쉬·산·라벨(26px 올라오기), 노말·터치', async () => {
  for (const res of ['1920x1080', '2158x1214']) {
    const S = sggS({ res }), scr = screenCtx(S);
    const { spec, M } = await build(S);
    checkFades(spec, M, scr, 'D1');
  }
  assert.ok(R['D1 페이드 불투명(%p)'] < 1e-3, 'D1 ' + R['D1 페이드 불투명(%p)']);
  assert.ok(R['D1 라벨 올라오기(px)'] < 1e-3, 'rise ' + R['D1 라벨 올라오기(px)']);
});
test('지시선 라벨 — AE 선 끝이 올라오는 박스를 따라간다(앱 typhoonLeaderGeom(앵커, 박스 x, 박스 y+dy))', async () => {
  for (const res of ['1920x1080', '2158x1214', '1920x1080-vf']) {
    const S = sggS({ res }), scr = screenCtx(S);
    const { spec, M, ctx } = await build(S);
    const b = S.labels[1], lc = spec.layers.find((l) => l.labelComp && l.labelComp.leader);
    const ln = layerOf(M, lc.name + '_지시선'), path = nodesOf(M, ln, 'ADBE Vector Shape')[0], s = lc.fade.start, L = lc.fade.len;
    const W = 121.5, H = 50.25;   // tl-plan-ctx 가짜 실측 박스(_w,_h)
    for (const t of frames(s - 0.2, s + L + 0.2)) {
      const e = scr.easeOut(scr.clamp01((t - s) / L)), dy = (1 - e) * 26;
      const g = scr.typhoonLeaderGeom(b.ax, b.ay, b.x, b.y + dy, W, H);   // 화면(앱 renderAnimFrameBody)
      const m = /^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)$/.exec(g.d).slice(1).map(Number);
      // 무릎·박스 쪽 끝은 d 문자열에 전체 자릿수, 시작점은 소수 1자리(화면 그리기용) — 시작점은 같은 식으로 다시 계산
      const kd = Math.hypot(m[2] - b.ax, m[3] - b.ay) || 1, gp = Math.min(16, kd * 0.9);
      const appPts = [[b.ax + (m[2] - b.ax) / kd * gp, b.ay + (m[3] - b.ay) / kd * gp], [m[2], m[3]], [m[4], m[5]]].map(([x, y]) => { const p = ctx.aePt(x, y); return [p.x, p.y]; });
      const aePts = path.valueAtTime(t).points.map((p) => worldPt(M, ln, t, p));
      // 터치(2158×1214)는 가로·세로 출력 배율이 0.01% 달라 화면의 45° 꺾임이 출력에선 아주 조금 기운다(AE는 출력 좌표에서 45°) — 따로 센다
      for (let i = 0; i < 3; i++) note(res === '2158x1214' ? '지시선 선 끝 터치(px)' : '지시선 선 끝(px)', hyp(aePts[i], appPts[i]));
      note('지시선 불투명(%p)', Math.abs(ln.tf.opacity.valueAtTime(t) - 100 * e));
    }
  }
  assert.ok(R['지시선 선 끝(px)'] < 1e-3, '지시선 ' + R['지시선 선 끝(px)']);
  assert.ok(R['지시선 선 끝 터치(px)'] < 0.05, '지시선 터치 ' + R['지시선 선 끝 터치(px)']);
  assert.ok(R['지시선 불투명(%p)'] < 1e-3);
});
test('노말 VF 진입 = 앱 easeVf(40/80) — 위치·불투명', async () => {
  const S = sggS({ res: '1920x1080-vf' }), scr = screenCtx(S);
  const { spec, M } = await build(S);
  const vfl = layerOf(M, 'VF_진입'), cx = 960, dx = spec.vfEnter.dx;
  for (const t of frames(0.8, 2.4)) {
    const e = scr.easeVf(scr.clamp01((t - 1.0) / 1.2));   // applyVfEnter
    note('VF 위치(px)', Math.abs(vfl.tf.position.valueAtTime(t)[0] - (cx + (1 - e) * dx)));
    note('VF 불투명(%p)', Math.abs(vfl.tf.opacity.valueAtTime(t) - 100 * e));
  }
  checkFades(spec, M, scr, 'VF');
  assert.ok(R['VF 위치(px)'] < 1e-3 && R['VF 불투명(%p)'] < 1e-3, JSON.stringify(R));
});
test('블라인드 = AE Venetian Blinds — 덮이는 비율이 프레임마다 앱 슬랫 식과 같다(칠·산, 산은 같은 색 칠 트랙 규칙)', async () => {
  const S = sggS({}); S.anim.reveal = 'blinds'; S.mtns.push({ id: 'm2', txt: '태백산', col: COLS.a, x: 1100, y: 500 });
  const scr = screenCtx(S);
  const { spec, M } = await build(S);
  const P = Math.max(8, S.anim.blindSize);
  let nb = 0;
  for (const l of spec.layers) {
    if (!l.fade || !l.fade.blinds) continue;
    nb++;
    const al = layerOf(M, l.name), vb = M.nodes(al).filter((n) => n.matchName === 'ADBE Venetian Blinds');
    assert.equal(vb.length, 1, '한 인스턴스(띠는 한쪽에서 열림 — V3 확인 전)');
    const s = l.fade.start, L = l.fade.len;
    for (const t of frames(s - 0.2, s + L + 0.2)) {
      const gp = scr.easeOut(scr.clamp01((t - s) / L));
      const app = gp <= 0 ? 0 : gp >= 0.999 ? 1 : Math.min(1, gp + 0.75 / P);   // paintBlindClip: 열린 높이 = gp·P + 0.75(gp>0)
      const ae = 1 - vb[0].property(1).valueAtTime(t) / 100;
      note('블라인드 덮임 비율(%p)', 100 * Math.abs(ae - app));
    }
    assert.equal(al.tf.opacity.keys.length, 0, '블라인드 레이어는 불투명 100%');
  }
  assert.equal(nb, 4, '칠 2 + 산 2');
  const m2 = spec.layers.find((l) => l.name === '산_태백산');
  assert.deepEqual([m2.fade.start, m2.fade.len], [1, 0.8], '같은 색(칠 #FA9A8C) 산 = 그 칠 트랙(F5)');
  assert.ok(R['블라인드 덮임 비율(%p)'] < 1e-3, R['블라인드 덮임 비율(%p)']);
});
// 카메라: 작업 뷰 화면점 q0(지도 위 점) → t 시각 화면 위치 = camAt(t)로 옮긴 지도의 같은 점, 방향(rz)은 프레임 가운데 기준 회전
function camAppPt(S, scr, ctx, q0, t) {
  const m0 = S.map, c = scr.camAt(t);
  const P = [(q0[0] - m0.x) / m0.s, (q0[1] - m0.y) / m0.s];
  const p = ctx.aePt(c.x + c.s * P[0], c.y + c.s * P[1]);
  const [W, H] = S.res === '2158x1214' ? [2158, 1214] : [1920, 1080];
  const a = (c.rz || 0) * Math.PI / 180, X = p.x - W / 2, Y = p.y - H / 2;
  return [W / 2 + X * Math.cos(a) - Y * Math.sin(a), H / 2 + X * Math.sin(a) + Y * Math.cos(a)];
}
test('일반 지도 카메라 = 앱 camAt — 키 3개(모든 키 같은 곡선·직선), 방향(rz), 노말·터치·VF, 지도에 붙은 산은 자리만', async () => {
  for (const res of ['1920x1080', '2158x1214', '1920x1080-vf']) {
    for (const rz of [false, true]) {
      const S = sggS({ res }); S.mtns[0].anchor = { x: 1, y: 2 };
      S.anim.cam.keys = [{ id: 'c1', t: 0.5, x: 1160, y: 545, s: 1.02, rz: 0 }, { id: 'c2', t: 2.0, x: 900, y: 600, s: 1.6, rz: rz ? 12 : 0 }, { id: 'c3', t: 3.5, x: 700, y: 500, s: 1.2, rz: rz ? -20 : 0 }];
      const scr = screenCtx(S);
      const { spec, M, ctx } = await build(S);
      const TG = spec.vfEnter ? M.comps.find((c) => c.name === 'VF_전체') : M.main;
      const map = TG.list.find((l) => l.name === '배경·지도'), pl = spec.layers.find((l) => l.name === '배경·지도').place || { x: 0, y: 0 };
      assert.equal(map.parent && map.parent.name, 'CAM');
      for (const q of [[1500, 300], [400, 900], [1160, 545]]) {
        const q0 = ctx.aePt(q[0], q[1]);
        // 지도 그림의 픽셀 = 작업 뷰 출력 좌표 − 블리드 자리(블리드 없으면 그대로)
        const px = [q0.x - pl.x, q0.y - pl.y];
        for (const t of frames(0, 4)) note('카메라 지도점(px)', hyp(worldPt(M, map, t, px), camAppPt(S, scr, ctx, q, t)));   // 앱 camAt도 뉴턴 풀이(허용오차 1e-6) — 큰 이동·확대에선 그만큼
      }
      // 지도에 붙은 산 — 자리만 카메라를 따라가고 크기는 그대로(앱 renderMtns), 회전이 있으면 같이 돈다
      const mt = TG.list.find((l) => l.name === '산_설악산');
      for (const t of frames(0, 4)) {
        const ae = mt.tf.position.valueAtTime(t), app = camAppPt(S, scr, ctx, [S.mtns[0].x, S.mtns[0].y], t);
        note('카메라 붙은 산(px)', hyp(ae, app));
        const sc = M.worldAt(mt, t); note('카메라 붙은 산 크기(%)', Math.abs(Math.hypot(sc[0], sc[1]) - 1) * 100);
      }
    }
  }
  assert.ok(R['카메라 지도점(px)'] < 5e-3, '카메라 ' + R['카메라 지도점(px)']);
  assert.ok(R['카메라 붙은 산(px)'] < 1e-3 && R['카메라 붙은 산 크기(%)'] < 1e-9);
});

// ===================== D2 단일 태풍 — 진행 곡선(지점 등분 + easeInOutC)·선두·반경·라벨 곡선 =====================
// 실제형 14점(과거 6시간 촘촘·예보 성김) — 설계 계산(calc.cjs)과 같은 경로
const REAL14 = [[133.0, 15.0, 0, 0, 0], [132.6, 15.6, 0, 0, 0], [132.1, 16.3, 0, 0, 0], [131.6, 17.0, 0, 0, 0], [131.0, 17.8, 0, 0, 0], [130.4, 18.7, 0, 160, 0], [129.6, 20.4, 1, 180, 60],
  [128.9, 22.3, 1, 200, 70], [128.4, 24.6, 1, 230, 0], [128.3, 27.4, 1, 250, 90], [128.9, 30.6, 1, 260, 80], [130.4, 34.5, 1, 240, 70], [132.8, 38.6, 1, 200, 0], [136.0, 42.0, 1, 150, 0]];
function tyS(over, o) {
  o = o || {};
  const pts = REAL14.map(([lon, lat, fc, r70, r25], i) => ({ lon, lat, fcst: !!fc, r70, r15: r70 ? r70 * 0.7 : 0, r25, ws: i < 4 ? 15 + i : i > 11 ? 20 - i : 25 + i * 2, ex: i === 13, label: i + '일', noIcon: i === 2 }));
  const labels = [{ id: 'b1', idx: 3, txt: '3일', x: 700, y: 300, size: 40 }, { id: 'b2', idx: 7, txt: '7일', x: 1300, y: 260, size: 40 }, { id: 'b3', idx: 11, txt: '11일', x: 1400, y: 500, size: 40 }];
  return Object.assign({ style: 'typhoon', res: '1920x1080', map: { x: 1160, y: 545, s: 1.02 }, labels: [], texts: [], legend: { on: 0 },
    typhoon: { iconCol: '#E5231E', issues: [{ points: pts }], labels, nowIdx: 5, trackMode: o.line ? 'line' : 'full', iconMode: 'image', places: [], compare: [], bands: { r70: { strokeW: 2 }, r15: { strokeW: 2 }, r25: { strokeW: 0 } } },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', tracks: [{ id: 'k1', kind: 'typhoon', key: 'typhoon', start: 1, len: 3.5, ps: 1, pe: 3, lab: { b1: { s: 1.3, e: 2.2 }, b2: { s: 2.0, e: 3.0 }, b3: { s: 2.6, e: 3.1 } } }], cam: { keys: o.cam || [] } } }, over || {});
}
// 화면 setTyphoonDefaultView처럼 지도 맞춤(경로가 화면에 크게)
function fitView(S) {
  const scr = screenCtx(S); const pts = S.typhoon.issues[0].points;
  let lo0 = 124, lo1 = 132, la0 = 33, la1 = 39; for (const p of pts) { lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); }
  const mlon = (lo1 - lo0) * 0.3 + 5, mlat = (la1 - la0) * 0.3 + 5; lo0 -= mlon; lo1 += mlon; la0 -= mlat; la1 += mlat;
  const box = [[lo0, la1], [lo1, la1], [lo0, la0], [lo1, la0]].map(([a, b]) => scr.projLL(a, b)); const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), s = Math.min(795 / w, 935 / h);
  S.map = { x: Math.round(445 + (795 - w * s) / 2 - Math.min(...xs) * s), y: Math.round(120 + (935 - h * s) / 2 - Math.min(...ys) * s), s: Math.round(s * 1000) / 1000 };
}
// 화면(앱) 태풍 상태 — renderAnimFrameBody + drawTyphoonTrack 규칙 그대로(typhoonScreenPts·typhoonBandInto·typhoonLabelProg는 실제 함수)
function appTyphoon(S, scr, t) {
  const pts = S.typhoon.issues[0].points, tr = S.anim.tracks[0], line = S.typhoon.trackMode === 'line', nowIdx = S.typhoon.nowIdx;
  const lo = 0, hi = line ? Math.min(pts.length - 1, nowIdx) : pts.length - 1, span = line ? Math.max(0, hi - lo) : Math.max(1, hi - lo);
  const k = scr.clamp01((t - tr.ps) / Math.max(0.001, tr.pe - tr.ps));
  if (S.anim.cam.keys.length) { const c = scr.camAt(t); scr.S.map = { x: c.x, y: c.y, s: c.s }; }
  scr.typhoonProg = k >= 1 ? null : lo + scr.easeInOutC(k) * span;
  const map = {}; for (const b of S.typhoon.labels) { const e = tr.lab[b.id]; const d = Math.max(0.05, e.e - e.s) * 1000; map[b.id] = { st: e.s * 1000, LINE: d * 0.6, SCALE: d * 0.7 }; }
  scr.typhoonLabelAnim = { at: t * 1000, map };
  let sp = scr.typhoonScreenPts(pts); scr.typhoonProg = null;
  if (line) sp = sp.filter((p) => p.idx <= nowIdx);
  const out = { sp, icons: new Set(), head: null, past: [], fut: [], bands: { r70: { circles: [], traps: 0, stroke: false }, r15: { circles: [], traps: 0, stroke: false }, r25: { circles: [], traps: 0, stroke: false } }, labels: {} };
  if (line) {
    const tip = sp[sp.length - 1];
    if (tip.head) { const td = tip.ex || tip.ws < 17; out.head = { x: tip.x, y: tip.y, kind: tip.ex ? 2 : td ? 1 : 0 }; } else out.icons.add(tip.idx);
    out.past = sp.map((p) => [p.x, p.y]);
  } else {
    for (const p of sp) {
      if (p.head) { const hws = p.ws == null ? 40 : p.ws, hEx = !!p.ex, htd = hEx || hws < 17; out.head = { x: p.x, y: p.y, kind: hEx ? 2 : htd ? 1 : 0 }; continue; }
      if (!p.noIcon) out.icons.add(p.idx);
    }
    out.past = sp.filter((p) => p.idx <= nowIdx).map((p) => [p.x, p.y]); out.fut = sp.filter((p) => p.idx >= nowIdx).map((p) => [p.x, p.y]);
    const active = sp.filter((p) => p.idx >= nowIdx);
    for (const key of ['r70', 'r15', 'r25']) {
      const par = scr._te('g', {}); scr.typhoonBandInto(par, active, key, { fillOp: 0.3, fill: '#888', strokeW: S.typhoon.bands[key].strokeW, stroke: '#FFF' });
      const fg = par.kids[0]; if (!fg) { out.bands[key] = { circles: [], traps: 0, stroke: false }; continue; }
      out.bands[key] = { circles: fg.kids.filter((e) => e.tag === 'circle').map((e) => [e.attr.cx, e.attr.cy, e.attr.r]), traps: fg.kids.filter((e) => e.tag === 'path').length, stroke: par.kids.length > 1 };
    }
  }
  for (const b of S.typhoon.labels) { const g = scr.typhoonLabelProg(b.id); out.labels[b.id] = { reveal: g.reveal, scale: g.scale, op: g.scale < 1 ? Math.max(0, Math.min(1, g.scale * 2)) : 1 }; }
  scr.typhoonLabelAnim = null;
  return out;
}
function aeTyphoon(M, spec, t) {
  const TG = spec.vfEnter ? M.comps.find((c) => c.name === 'VF_전체') : M.main;
  const rig = spec.layers[0].typhoonRig, n = rig.points.length, L = (nm) => TG.list.find((x) => x.name === nm);
  const out = { icons: new Set(), head: null, past: 0, fut: 0, bands: {}, labels: {} };
  rig.points.forEach((p, j) => { const ic = L('아이콘' + j); if (ic && ic.tf.opacity.valueAtTime(t) > 50) out.icons.add(p.idx); });
  for (const kind of [0, 1, 2]) { const hd = L('선두' + kind); if (hd && hd.tf.opacity.valueAtTime(t) > 50) { assert.equal(out.head, null, '선두는 한 종류만'); const w = worldPt(M, hd, t, hd.tf.anchor.valueAtTime(t)); out.head = { x: w[0], y: w[1], kind }; } }
  const drawn = (nm) => { const sl = L(nm); if (!sl) return 0; const path = nodesOf(M, sl, 'ADBE Vector Shape')[0].valueAtTime(t).points.map((p) => worldPt(M, sl, t, p)); return plen(path) * nodesOf(M, sl, 'ADBE Vector Trim End')[0].valueAtTime(t) / 100; };
  if (rig.trackMode === 'line') out.past = drawn('경로'); else { out.past = drawn('경로(지난)'); out.fut = drawn('경로(예상)'); }
  for (const key of ['r70', 'r15', 'r25']) {
    const sl = L('반경_' + key); if (!sl) { out.bands[key] = { circles: [], traps: 0, stroke: false }; continue; }
    const circles = [];
    const Wm = M.worldAt(sl, t), ws = Math.sqrt(Math.abs(Wm[0] * Wm[3] - Wm[1] * Wm[2]));   // CAM 확대만큼 반지름도
    for (const el of nodesOf(M, sl, 'ADBE Vector Shape - Ellipse')) { const sz = el.property('ADBE Vector Ellipse Size').valueAtTime(t); if (sz[0] > 1e-9) { const c = worldPt(M, sl, t, el.property('ADBE Vector Ellipse Position').valueAtTime(t)); circles.push([c[0], c[1], sz[0] / 2 * ws]); } }
    let traps = 0;
    for (const g of nodesOf(M, sl, 'ADBE Vector Shape - Group')) { const P = g.property('ADBE Vector Shape').valueAtTime(t).points; if (plen(P.concat([P[0]])) > 1e-6) traps++; }
    const st = L('반경선_' + key);
    out.bands[key] = { circles, traps, stroke: !!st && st.tf.opacity.valueAtTime(t) > 50 };
  }
  rig.labels.forEach((lb, i) => {
    const ln = L('지시선' + i), ll = L('라벨' + i);
    out.labels[i] = { reveal: nodesOf(M, ln, 'ADBE Vector Trim End')[0].valueAtTime(t) / 100, scale: ll.tf.scale.valueAtTime(t)[0] / 100, op: ll.tf.opacity.valueAtTime(t) / 100 };
  });
  return out;
}
async function checkTyphoon(S, tag) {
  fitView(S);
  const scr = screenCtx(JSON.parse(JSON.stringify(S)));
  const { spec, M } = await build(S);
  const rig = spec.layers[0].typhoonRig, k = 1, tr = S.anim.tracks[0];
  assert.ok(rig.prog && rig.labelCurve === (S.typhoon.trackMode === 'line' ? 0 : 1));
  let boundary = 0;
  for (const t of frames(0, 4)) {
    const a = appTyphoon(S, scr, t), e = aeTyphoon(M, spec, t);
    // 지점 아이콘 = 화면에 그려진 지점(첫 지점은 처음부터, 닿는 순간 바로) — 진행이 정수에 걸린 프레임만 부동소수 경계
    const same = a.icons.size === e.icons.size && [...a.icons].every((x) => e.icons.has(x));
    if (!same) { const kk = scr.clamp01((t - tr.ps) / (tr.pe - tr.ps)), p = scr.easeInOutC(kk) * (rig.points.length - 1); assert.ok(Math.abs(p - Math.round(p)) < 1e-6, `${tag} t=${t.toFixed(3)} 아이콘 ${[...a.icons]} vs ${[...e.icons]}`); boundary++; continue; }
    // 선두(종류·자리) — 앱은 경위도 보간 후 투영(메르카토르), AE는 화면 직선 보간
    assert.equal(!!e.head, !!a.head, `${tag} t=${t.toFixed(3)} 선두 있음`);
    if (a.head) { assert.equal(e.head.kind, a.head.kind, `${tag} t=${t.toFixed(3)} 선두 종류`); note(tag + ' 선두 자리(px)', hyp([e.head.x, e.head.y], [a.head.x * k, a.head.y * k])); }
    note(tag + ' 지난 선 길이(px)', Math.abs(e.past - plen(a.past) * k));
    note(tag + ' 예상 선 길이(px)', Math.abs(e.fut - (a.fut.length > 1 ? plen(a.fut) : 0) * k));
    for (const key of ['r70', 'r15', 'r25']) {
      const A = a.bands[key], B = e.bands[key];
      assert.equal(B.circles.length, A.circles.length, `${tag} t=${t.toFixed(3)} ${key} 원 수`);
      for (const c of A.circles) { const d = B.circles.reduce((m, q) => (hyp(q, c) < hyp(m, c) ? q : m), B.circles[0]); note(tag + ' 반경 원 중심(px)', hyp(d, c)); note(tag + ' 반경 반지름(px)', Math.abs(d[2] - c[2])); }
      assert.equal(B.traps, A.traps, `${tag} t=${t.toFixed(3)} ${key} 사다리꼴 수`);
      assert.equal(B.stroke, A.stroke, `${tag} t=${t.toFixed(3)} ${key} 외곽선`);
    }
    if (S.typhoon.trackMode !== 'line') S.typhoon.labels.forEach((b, i) => { const x = a.labels[b.id], y = e.labels[i]; note(tag + ' 라벨 곡선', Math.max(Math.abs(x.reveal - y.reveal), Math.abs(x.scale - y.scale), Math.abs(x.op - y.op))); });   // 라인 모드는 라벨 없음(화면·AE 둘 다)
  }
  assert.ok(boundary <= 2, '경계 프레임 ' + boundary);
}
test('D2 태풍 경로 = 화면(지점 등분 + easeInOutC) — 선 길이·지점 아이콘·선두(종류·자리)·반경(선두 따라 자라기)·라벨 곡선, 실제형 14점', async () => {
  await checkTyphoon(tyS(), '태풍');
  assert.ok(R['태풍 선두 자리(px)'] < 0.6, '선두 ' + R['태풍 선두 자리(px)']);
  assert.ok(R['태풍 지난 선 길이(px)'] < 0.6 && R['태풍 예상 선 길이(px)'] < 0.6, JSON.stringify(R));
  assert.ok(R['태풍 반경 원 중심(px)'] < 0.6, '반경 중심 ' + R['태풍 반경 원 중심(px)']);
  assert.ok(R['태풍 반경 반지름(px)'] < 0.6, '반경 반지름 ' + R['태풍 반경 반지름(px)']);   // 보내는 반지름이 반올림 px(옛날부터) + 선두 반지름 km 보간
  assert.ok(R['태풍 라벨 곡선'] < 1e-6, '라벨 ' + R['태풍 라벨 곡선']);
});
test('D2 라인 모드 — 현재 위치까지 단색선 + 선두 하나(멈추면 그 지점 아이콘)', async () => {
  await checkTyphoon(tyS({}, { line: true }), '라인');
  assert.ok(R['라인 선두 자리(px)'] < 0.6 && R['라인 지난 선 길이(px)'] < 0.6, JSON.stringify(R));
});
test('D2 + 카메라(키 3개·확대) — 태풍 리그가 CAM 아래에서 화면과 같이 움직인다', async () => {
  const S = tyS({}, { cam: [{ id: 'c1', t: 0.5, x: 0, y: 0, s: 0 }, { id: 'c2', t: 2.0, x: 0, y: 0, s: 0 }, { id: 'c3', t: 3.5, x: 0, y: 0, s: 0 }] });
  fitView(S);
  const m = S.map; S.anim.cam.keys = [{ id: 'c1', t: 0.5, x: m.x, y: m.y, s: m.s }, { id: 'c2', t: 2.0, x: m.x - 260, y: m.y + 55, s: m.s * 1.5 }, { id: 'c3', t: 3.5, x: m.x - 460, y: m.y - 45, s: m.s * 1.2 }];
  await checkTyphoon(S, '태풍+카메라');
  assert.ok(R['태풍+카메라 선두 자리(px)'] < 1.0, '선두 ' + R['태풍+카메라 선두 자리(px)']);   // 확대 1.5배 → 메르카토르 오차도 그만큼
  assert.ok(R['태풍+카메라 라벨 곡선'] < 1e-6);
});

// ===================== 비교 예보 — 예보마다 막대·곡선·선두·라벨 창 =====================
test('비교 예보 = 화면(호길이 비율 = easeInOutC, 예보마다 막대) — 선 진행·아이콘·선두·라벨 창(선이 닿는 순간 완성)', async () => {
  const P1 = REAL14.slice(0, 10).map(([lon, lat], i) => ({ lon, lat, label: i + '일', fcst: i > 4 }));
  const P2 = REAL14.slice(2, 14).map(([lon, lat], i) => ({ lon: lon + 1.5, lat: lat - 0.5, label: i + '일', fcst: true }));
  const S = { style: 'typhoonCompare', res: '1920x1080', map: { x: 1160, y: 545, s: 1.02 }, labels: [], texts: [], legend: { on: 0 },
    typhoon: { issues: [{ points: P1 }], labels: [], places: [], compare: [
      { id: 'A', name: 'KMA', color: '#FF5A5A', show: 1, points: P1, labels: [{ idx: 2, txt: 'a', x: 900, y: 400, _w: 130, _h: 60 }, { idx: 7, txt: 'b', x: 1300, y: 300, _w: 130, _h: 60 }] },
      { id: 'B', name: 'JTWC', color: '#5AC8FF', show: 1, points: P2, labels: [{ idx: 5, txt: 'c', x: 1400, y: 600, _w: 130, _h: 60 }] }] },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', tracks: [{ id: 'k1', kind: 'typhoon', key: 'typhoon', start: 1, len: 2, ps: 1, pe: 3 }, { id: 'kb', kind: 'typcmp', key: 'B', start: 2, len: 1.5 }], cam: { keys: [] } } };
  fitView(Object.assign(S, { typhoon: Object.assign(S.typhoon, { issues: [{ points: REAL14.map(([lon, lat]) => ({ lon, lat })) }] }) }));
  const scr = screenCtx(JSON.parse(JSON.stringify(S)));
  const iconSet = (c, cpts) => new Set(cpts.map((_, i) => i).filter((i) => i % 3 === 0 || i === cpts.length - 1));
  const { spec, M } = await build(S, { iconSet });
  const cr = spec.layers[0].compareRig, L = (nm) => M.main.list.find((x) => x.name === nm);
  const span = { A: [1, 3], B: [2, 3.5] };   // A = 트랙 없음 → 메인 경로 막대, B = 자기 막대
  for (const t of frames(0, 4)) {
    S.typhoon.compare.forEach((c, ti) => {
      const kk = scr.clamp01((t - span[c.id][0]) / (span[c.id][1] - span[c.id][0])), Pp = kk >= 1 ? null : scr.easeInOutC(kk);   // renderAnimFrameBody typhoonCmpProg
      const full = scr.compareScreenPts(c.points, null), sp = scr.compareScreenPts(c.points, Pp);
      // 선 진행(호길이 비율)
      const aeLine = L('비교선' + ti), trim = nodesOf(M, aeLine, 'ADBE Vector Trim End')[0].valueAtTime(t) / 100;
      note('비교 선 진행(비율)', Math.abs(trim - (Pp == null ? 1 : Pp)));
      // 아이콘 = 그려진 지점 중 아이콘 자리, 선두 = 그려진 끝
      const vis = new Set(sp.filter((p) => !p.head).map((p) => p.idx));
      for (const i of cr.typhoons[ti].iconAt) { const ic = L('아이콘' + ti + '_' + i); assert.equal(ic.tf.opacity.valueAtTime(t) > 50, vis.has(i), `비교 t=${t.toFixed(3)} ${c.id} 아이콘 ${i}`); }
      const head = sp.find((p) => p.head), hd = L('선두' + ti);
      assert.equal(hd.tf.opacity.valueAtTime(t) > 50, !!head, `비교 t=${t.toFixed(3)} 선두`);
      if (head) { const w = worldPt(M, hd, t, hd.tf.anchor.valueAtTime(t)); note('비교 선두 자리(px)', hyp(w, [head.x, head.y])); }
      // 라벨 창 — 지시선 = (P−fA+0.10)/0.10, 박스 = (P−fA+0.16)/0.16, 앵커 원 = 3×지시선(drawCompareLabels)
      const cum = [0]; for (let i = 1; i < full.length; i++) cum.push(cum[i - 1] + Math.hypot(full[i].x - full[i - 1].x, full[i].y - full[i - 1].y));
      c.labels.forEach((lb, li) => {
        const fA = cum[lb.idx] / cum[cum.length - 1];
        const rv = Pp == null ? 1 : scr.clamp01((Pp - fA + 0.10) / 0.10), sc = Pp == null ? 1 : scr.clamp01((Pp - fA + 0.16) / 0.16);
        const nid = ti + '_' + li, ln = L('지시선' + nid), ll = L('라벨' + nid), ac = L('앵커' + nid);
        note('비교 라벨 창', Math.abs(nodesOf(M, ln, 'ADBE Vector Trim End')[0].valueAtTime(t) / 100 - rv));
        note('비교 라벨 창', Math.abs(ll.tf.scale.valueAtTime(t)[0] / 100 - sc));
        note('비교 라벨 창', Math.abs(ll.tf.opacity.valueAtTime(t) / 100 - (sc < 1 ? scr.clamp01(sc * 2) : 1)));
        if (ac) note('비교 라벨 창', Math.abs(ac.tf.opacity.valueAtTime(t) / 100 - scr.clamp01(rv * 3)));
      });
      // 이름표 = 늘 보임
      assert.equal(L('이름' + ti).tf.opacity.valueAtTime(t), 100);
    });
  }
  assert.ok(R['비교 선 진행(비율)'] < 1e-9, '선 진행 ' + R['비교 선 진행(비율)']);
  assert.ok(R['비교 라벨 창'] < 0.01, '라벨 창 ' + R['비교 라벨 창']);   // 지점 널 좌표가 소수 1자리(리그 좌표) → 그 지점의 호길이 비율이 1e-4쯤 달라 창(폭 0.1)에서 ×10
  assert.ok(R['비교 선두 자리(px)'] < 0.08, '비교 선두 ' + R['비교 선두 자리(px)']);   // 리그 좌표 소수 1자리
});

test('오차 요약(보고용)', () => {
  const rows = Object.entries(R).sort().map(([k, v]) => `${k}: ${v < 1e-3 ? v.toExponential(2) : v.toFixed(4)}`);
  for (const r of rows) console.log('  ' + r);
  assert.ok(rows.length >= 15);
});

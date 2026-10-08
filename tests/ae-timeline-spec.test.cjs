// 타임라인 = AE 1:1 — 실제 sendToAE가 /api/ae로 보내는 스펙과, 그 스펙으로 헬퍼(desktop/wns/ae-jsx.js — helper.py와 바이트 동일)가 만드는
// AE 키프레임 시각이 타임라인 값(트랙 시작·길이, 태풍 경로·라벨 키, 비교 예보 막대, 카메라 키, 길이)과 같은지 본다.
//  - 앱 코드는 tools/app-source.cjs로 합쳐 읽어 vm에서 돌린다(tests/tl-plan-ctx.cjs aeCtx). PNG 굽기·화면 실측·태풍 투영만 가짜.
//  - 기대값은 S(저장 데이터)에서 직접 계산한다(계획 함수를 거치지 않음) + 타임라인 막대 자리(tlSpanNow — 화면이 막대를 놓는 값)와도 비교.
//  - AE 쪽은 JSX를 AE 흉내(desktop/test/ae-model.cjs)에서 그대로 실행해 레이어의 키·이징·부모·효과를 읽는다(정규식이 아니라 실행 결과).
//  - 무작위 작업(시드 고정) 수백 개: 시군·특보·VF·터치·블라인드·카메라(이동·확대·방향, 인셋·지도에 붙은 산), 단일 태풍(라인/일반·카메라),
//    태풍 비교(예보마다 막대·카메라), 트랙 없음(= 자동 구성 타이밍). 헬퍼 버전 두 가지(20261008 새 헬퍼 / 20261007 옛 헬퍼 — 블리드·'AE 차이'가 다르다).
//  - 실제 앱(Electron)에서 화면 막대·시작/길이 칸과 스펙을 맞춰 보는 점검은 맨 아래(WCG_BOOT_CHECK=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { aeCtx, fnSrc } = require('./tl-plan-ctx.cjs');
const { buildAeJsx } = require('../desktop/wns/ae-jsx.js');
const { mkModel, KIT } = require('../desktop/test/ae-model.cjs');

const FPS = 29.97, F1 = 1 / FPS, NEW = 20261008, OLD = 20261007;
const EZ = [34, 85];   // 앱 easeOut = cubic-bezier(0.34,0,0.15,1) → AE 영향 34/85
const r4 = (v) => +(+v).toFixed(4);
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), `${msg || ''} ${a} ≉ ${b}`);
const up = (s) => String(s || '').toUpperCase();
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickOf = (rng) => (arr) => arr[Math.floor(rng() * arr.length)];
// 시각: 60%는 프레임 경계(타임라인 끌기·입력 결과), 40%는 옛 소수 2자리 값
const tmOf = (rng) => (lo, hi) => (rng() < 0.6 ? r4(Math.round((lo + rng() * (hi - lo)) * FPS) / FPS) : +(lo + rng() * (hi - lo)).toFixed(2));
const lenOf = (rng) => () => (rng() < 0.6 ? r4(Math.max(1, Math.round((0.1 + rng() * 2) * FPS)) / FPS) : +(0.1 + rng() * 2).toFixed(2));
const hex2rgb = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const lum = (h) => { const [r, g, b] = hex2rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const PAL = ['#FFE7E3', '#FDB9B1', '#FA9A8C', '#FB7264', '#F9483A', '#C81306', '#8A0A02', '#2E6FB0', '#7FD0FF', '#3FB27F'];
const outK = (res) => { const [W, H] = res === '2158x1214' ? [2158, 1214] : [1920, 1080]; const kx = W / 1920, ky = H / 1080; return { W, H, kx, ky, kk: (kx + ky) / 2 }; };
const vfk = (res) => (res === '1920x1080-vf' ? 0.8 : 1);   // 가짜 VF 축소 80%(tl-plan-ctx)
const riseOf = (res) => 26 * vfk(res) * outK(res).kk;   // aeSz(26) — VF 축소(가짜 80%) × 출력 배율
// aePt — VF면 패널 우상단(1800,100) 기준 80% 축소(tl-plan-ctx 가짜 패널) 뒤 출력 배율
const aePtOf = (res) => (x, y) => { const k = outK(res), v = vfk(res), ax = 1800, ay = 100; return { x: (res === '1920x1080-vf' ? ax + (x - ax) * v : x) * k.kx, y: (res === '1920x1080-vf' ? ay + (y - ay) * v : y) * k.ky }; };
// 태풍·비교 리그 좌표(소수 1자리) — VF면 같은 축소(F7 고침)
const rigOf = (res) => { const p = aePtOf(res); return (x, y) => { const q = p(x, y); return { x: +q.x.toFixed(1), y: +q.y.toFixed(1) }; }; };

// ===================== 스펙 → 레이어 내용 표시 =====================
function tagOf(l, frames) {
  const file = (f) => frames[parseInt(String(f).replace(/\D/g, ''), 10)];
  if (l.file) return file(l.file);
  if (l.labelComp) return file(l.labelComp.bg);
  if (l.text) return 'title:' + l.text.content;
  if (l.legendComp) return 'legend';
  if (l.typhoonRig) return 'typhoonRig';
  if (l.compareRig) return 'compareRig';
  return '?';
}
const isTy = (S) => S.style === 'typhoon' || S.style === 'typhoonCompare';
// 계획 행 → AE 레이어 내용(아래→위로 쌓을 때의 순서). 카메라·VF 진입·사라진 대상·옛 텍스트는 레이어가 아니다.
// 카메라가 있으면 일반 지도는 '움직이는 부분'(@move)과 '고정 부분'(@fix…)을 나눠 굽는다 — 인셋에 그 색이 있을 때만 고정 레이어.
function planTags(L, S) {
  if (L.gone || L.kind === 'oldText' || L.kind === 'camera' || L.kind === 'vfEnter') return [];
  const cam = !isTy(S) && S.anim.cam.keys.length > 0, ins = S.insets || {};
  if (L.kind === 'static') {
    if (L.sub === 'bg') return isTy(S) ? [] : cam ? ['base@fix0', 'base@move'].concat(ins.any ? ['base@fix1'] : []) : ['base'];
    if (L.sub === 'place') return [];
    if (L.sub.startsWith('title:')) return ['title:' + S.texts.find((x) => x.id === L.key).txt];
    if (L.sub === 'lines') return cam ? ['lines@move'].concat(ins.lines ? ['lines@fix'] : []) : ['lines'];
    if (L.sub === 'mtnBase') {
      if (!cam) return ['mtnBase'];
      const ms = S.mtns.filter((m) => !m.off);
      return (ms.some((m) => !m.anchor) ? ['mtnBase@free'] : []).concat(ms.filter((m) => m.anchor).map((m) => 'mtnBase@' + m.id));
    }
    return [L.sub];
  }
  if (L.kind === 'fill') {
    if (L.wrnDef) return cam ? ['wrn:' + L.wrnDef.key + '@move'].concat(L.wrnDef.ids.some((id) => (ins.ids || []).includes(id)) ? ['wrn:' + L.wrnDef.key + '@fix'] : []) : ['wrn:' + L.wrnDef.key];
    return cam ? ['fill:' + L.key + '@move'].concat((ins.fills || []).map(up).includes(up(L.key)) ? ['fill:' + L.key + '@fix'] : []) : ['fill:' + L.key];
  }
  if (L.kind === 'brush') return cam ? ['brush:' + L.key + '@move'].concat((ins.brush || []).map(up).includes(up(L.key)) ? ['brush:' + L.key + '@fix'] : []) : ['brush:' + L.key];
  if (L.kind === 'mtn') return ['mtn:' + L.key];
  if (L.kind === 'label') return (S.labels.find((b) => b.id === L.key).style === 'leader' ? ['leader:' + L.key] : []).concat(['labelbg:' + L.key]);
  if (L.kind === 'typhoon') return ['typhoonRig'];
  if (L.kind === 'typcmp') return [];
  return ['?' + L.kind];
}

// ===================== AE 쪽(헬퍼 JSX를 AE 흉내로 실행) =====================
function aeOf(spec) {
  const jsx = buildAeJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\t');
  const M = mkModel().run(jsx);
  return { jsx, M };
}
const keyTimes = (nd) => nd.keys.map((k) => k.t);
// 두 키 이징 = 키1 나감·키2 들어옴 영향(속도 0)
function easeOfKeys(nd) {
  if (nd.keys.length !== 2) return null;
  const a = nd.keys[0], b = nd.keys[1];
  if (a.outI !== KIT.BEZIER || b.inI !== KIT.BEZIER || !a.outE || !b.inE) return 'linear';
  assert.ok(a.outE.every((e) => e.speed === 0) && b.inE.every((e) => e.speed === 0), '속도 0');
  return [a.outE[0].influence, b.inE[0].influence];
}
const effectOf = (l, nm) => { const fx = l.root.kids.find((k) => k.name === 'ADBE Effect Parade'); return fx && fx.kids.find((k) => k.name === nm || k.matchName === nm); };
// 레이어 등장 키(불투명도 또는 블라인드 진행 슬라이더) — {node, blinds}
function fadeNodeOf(l) {
  const pr = effectOf(l, 'PROG');
  if (pr) return { nd: pr.property(1), blinds: true, vb: l.root.kids.find((k) => k.name === 'ADBE Effect Parade').kids.filter((k) => k.name === 'ADBE Venetian Blinds') };
  return { nd: l.tf.opacity, blinds: false };
}

// 컴프 길이 규칙: 타임라인에 보이는 끝이 길이 안이면 = 길이, 넘치면 그 끝 + 0.6초(반 초 올림)까지 — 영상 추출과 같은 길이에서 내용이 잘리지 않게만
function checkDur(spec, durBase, ends, tag) {
  const end = Math.max(0, ...ends);
  if (end <= durBase + 1e-4) assert.equal(spec.comp.dur, durBase, tag + ' 컴프 = 타임라인 길이');
  else assert.equal(spec.comp.dur, Math.max(durBase, Math.ceil((end + 0.6) * 2) / 2), tag + ' 넘친 끝 + 여유');
}

// ===================== 무작위 작업 =====================
function shuffle(rng, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function genGeneral(seed) {
  const rng = rngOf(seed), pick = pickOf(rng), tm = tmOf(rng), ln = lenOf(rng);
  const res = pick(['1920x1080', '2158x1214', '1920x1080-vf']);
  const warn = rng() < 0.2;
  const cols = shuffle(rng, PAL).slice(0, 1 + Math.floor(rng() * 5));
  const F = {}; for (let z = 0; z < 14; z++) if (rng() < 0.8) F['z' + z] = pick(cols);
  if (!Object.keys(F).length) F.z0 = cols[0];
  const used = [...new Set(Object.values(F).map(up))];
  const labels = []; for (let k = 0, n = Math.floor(rng() * 6); k < n; k++) labels.push({ id: 'l' + k, txt: String(10 + k), x: 400 + k * 150, y: 300 + k * 40, fill: pick(cols), style: rng() < 0.35 ? 'leader' : 'plain', off: rng() < 0.15 ? 1 : 0, ax: 300 + k * 90, ay: 800 });
  const mtns = []; for (let k = 0, n = Math.floor(rng() * 4); k < n; k++) mtns.push({ id: 'm' + k, txt: '산' + k, col: rng() < 0.5 ? pick(cols) : pick(PAL), off: rng() < 0.15 ? 1 : 0, x: 900 + k * 70, y: 400 + k * 30, anchor: rng() < 0.4 ? { x: 1, y: 2 } : null });
  const strokes = []; for (let k = 0, n = Math.floor(rng() * 4); k < n; k++) strokes.push({ col: rng() < 0.6 ? pick(cols) : pick(PAL), erase: rng() < 0.15 ? 1 : 0, dabs: [] });
  const texts = []; for (let k = 0, n = Math.floor(rng() * 3); k < n; k++) texts.push({ id: 'x' + k, txt: '제목' + k, x: 100, y: 100 + k * 80, size: 60, col: '#FFFFFF', off: rng() < 0.2 ? 1 : 0 });
  const style = warn ? 'warn' : 'sgg';
  const warnDefs = warn ? used.map((c, i) => ({ key: 'w' + i, name: '특보' + i + '_주의보', col: c, rank: used.length - i, ids: ['z' + i] })) : [];
  const tracks = [];
  if (rng() >= 0.15) {   // 15%는 트랙 없음(= 타임라인 안 만듦)
    let id = 1;
    const tr = (kind, key) => tracks.push({ id: 'k' + id++, kind, key, start: tm(0, 5), len: ln() });
    for (const c of used) if (rng() < 0.65) tr('fill', rng() < 0.5 ? c : c.toLowerCase());
    for (const c of [...new Set(strokes.filter((s) => !s.erase).map((s) => up(s.col)))]) if (rng() < 0.5) tr('brush', c);
    for (const b of labels) if (rng() < 0.6) tr('label', b.id);
    for (const m of mtns) if (rng() < 0.6) tr('mtn', m.id);
    if (rng() < 0.3) tr('fill', '#123456');     // 지도에 없는 색
    if (rng() < 0.2) tr('label', 'ghost');       // 지운 라벨
    if (rng() < 0.1) tr('text', 'x0');           // 옛 텍스트 트랙
  }
  // 카메라 25% — 이동·확대(가끔 크게 축소 = 블리드)·방향(가끔)
  const cam = [];
  if (rng() < 0.25) {
    const rz = rng() < 0.3;
    for (let k = 0, n = 2 + Math.floor(rng() * 3); k < n; k++) cam.push({ id: 'c' + k, t: tm(0, 5), x: r4(1000 + rng() * 300), y: r4(480 + rng() * 120), s: rng() < 0.2 ? 0.4 : r4(0.7 + rng() * 0.8), rx: 0, ry: 0, rz: rz ? r4(-30 + rng() * 60) : 0 });
  }
  const insets = cam.length && rng() < 0.6 ? { any: 1, fills: used.filter(() => rng() < 0.4), ids: ['z0', 'z3'].filter(() => rng() < 0.5), brush: [...new Set(strokes.map((s) => up(s.col)))].filter(() => rng() < 0.4), lines: rng() < 0.5 ? 1 : 0 } : null;
  const S = { style, res, map: { x: 1160, y: 545, s: 1.02 }, legend: { on: rng() < 0.5 ? 1 : 0, auto: 0, items: [] }, vfBar: { on: rng() < 0.5 ? 1 : 0 }, vfClip: rng() < 0.7 ? 1 : 0, insets,
    texts, labels, mtns, fillsByStyle: { [style]: F }, brushByStyle: { [style]: strokes },
    anim: { dur: pick([2, 4, 6, 7.5, 10]), fps: FPS, reveal: pick(['dissolve', 'dissolve', 'blinds']), blindSize: pick([8, 30, 60]), blindAngle: pick([-45, 0, 30]), tracks, cam: { keys: cam } } };
  return { S, warnDefs };
}
const PTS = (n) => Array.from({ length: n }, (_, i) => ({ lon: 140 - i, lat: 15 + i, label: (20 + i) + '일', ws: 20 + i, r15: 100 + i * 10, fcst: i > 2 }));
function genTyphoon(seed, compare) {
  const rng = rngOf(seed), pick = pickOf(rng), tm = tmOf(rng), ln = lenOf(rng);
  const n = 5 + Math.floor(rng() * 6), pts = PTS(n);
  const labels = []; for (let k = 0; k < n; k++) if (rng() < 0.5) labels.push({ id: 'b' + k, idx: k, txt: k + '일', x: 600 + k * 40, y: 200 + k * 30, size: 40, off: rng() < 0.2 ? 1 : 0 });
  const tracks = [];
  if (rng() < 0.75) {
    const ps = tm(0, 2), pe = r4(ps + 0.6 + rng() * 2.5), lab = {};
    for (const b of labels) if (rng() < 0.6) { const s = tm(0, 5); lab[b.id] = { s, e: r4(s + ln()) }; }
    tracks.push({ id: 'k1', kind: 'typhoon', key: 'typhoon', start: ps, len: 3, ps, pe, lab });
  }
  const compareArr = [];
  if (compare) {
    for (let k = 0, m = 1 + Math.floor(rng() * 3); k < m; k++) {
      compareArr.push({ id: 'cf' + k, name: 'F' + k, color: pick(['#FF5A5A', '#5AC8FF', '#FFC400', '#3FB27F']), show: rng() < 0.85 ? 1 : 0, showIcons: rng() < 0.2 ? 0 : 1, showRadius: rng() < 0.2 ? 1 : 0,
        points: rng() < 0.5 ? pts : pts.map((p) => Object.assign({}, p, { fcst: true })), labels: [{ idx: 1, txt: 'A', x: 900, y: 400 }], labelPos: rng() < 0.5 ? { x: 950, y: 600 } : null });
      if (rng() < 0.6) tracks.push({ id: 'kc' + k, kind: 'typcmp', key: 'cf' + k, start: tm(0, 4), len: r4(0.6 + rng() * 2) });
    }
  }
  const keys = [];
  if (rng() < 0.6) for (let k = 0, m = 1 + Math.floor(rng() * 4); k < m; k++) keys.push({ id: 'c' + k, t: tm(0, 6), x: r4(1000 + rng() * 300), y: r4(480 + rng() * 120), s: rng() < 0.3 ? 1.02 : r4(0.9 + rng() * 0.6), rx: 0, ry: 0, rz: rng() < 0.15 ? r4(-20 + rng() * 40) : 0 });
  const S = { style: compare ? 'typhoonCompare' : 'typhoon', res: pick(['1920x1080', '2158x1214', '1920x1080-vf']), map: { x: 1160, y: 545, s: 1.02 }, labels: [], vfClip: rng() < 0.5 ? 1 : 0,
    texts: rng() < 0.6 ? [{ id: 'x1', txt: '태풍', x: 120, y: 120, size: 60, col: '#FFFFFF' }] : [], legend: { on: rng() < 0.4 ? 1 : 0 },
    typhoon: { iconCol: '#E5231E', issues: [{ points: pts }], labels, nowIdx: Math.floor(rng() * n), trackMode: !compare && rng() < 0.25 ? 'line' : 'full', iconMode: pick(['image', 'image', 'dot']), places: [], compare: compareArr },
    anim: { dur: pick([3, 6, 8]), fps: FPS, reveal: 'dissolve', tracks, cam: { keys } } };
  return { S };
}

// ===================== 기대값(저장 데이터에서 직접) =====================
// 블라인드 모드의 산 타이밍(앱 renderAnimFrameBody): 같은 색 칠 트랙 → 그 막대 / 그 색이 지도 칠에 있고 칠 트랙 없음 → 처음부터 / 아니면 같은 색 산 트랙 중 가장 늦게 끝나는 것
function blindMtnSpan(S, m, tracks) {
  const U = up(m.col); if (!U) return null;
  const ft = tracks.find((t) => t.kind === 'fill' && up(t.key) === U);
  if (ft) return [ft.start, ft.start + ft.len];
  if (Object.values(S.fillsByStyle[S.style]).some((c) => up(c) === U)) return null;
  let best = null;
  for (const o of S.mtns) { if (o.off || up(o.col) !== U) continue; const t = tracks.find((x) => x.kind === 'mtn' && x.key === o.id); if (t) { const sp = [t.start, t.start + t.len]; if (!best || sp[1] > best[1] || (sp[1] === best[1] && sp[0] > best[0])) best = sp; } }
  return best;
}
// 일반 지도 — 아래(뒤)→위(앞) 레이어와 페이드. 트랙 있음 = 그 시작·길이, 트랙 없음 = 처음부터(페이드 없음), 브러쉬만 앱 기본 구간.
function expectGeneral(S, warnDefs, tracks) {
  const find = (kind, key, ci) => tracks.find((t) => t.kind === kind && (ci ? up(t.key) === up(key) : t.key === key)) || null;
  const sp2fd = (sp) => (sp ? { start: r4(sp[0]), len: r4(Math.max(0.01, sp[1] - sp[0])), ease: EZ } : null);
  const fd = (tr) => (tr ? sp2fd([tr.start, tr.start + tr.len]) : null);
  const blinds = S.anim.reveal === 'blinds', P = Math.max(8, S.anim.blindSize || 60), k = outK(S.res).kk * vfk(S.res);
  const bl = (f, pitch) => (f && blinds ? Object.assign({}, f, { blinds: { w: r4(pitch * k), dir: S.anim.blindAngle, ov: +(0.75 / P).toFixed(6), two: 0 } }) : f);
  const cam = S.anim.cam.keys.length > 0, ins = S.insets || {};
  const out = [];
  const push = (tags, fade) => { for (const t of tags) out.push({ tag: t, fade }); };
  push(cam ? ['base@fix0', 'base@move'].concat(ins.any ? ['base@fix1'] : []) : ['base'], null);
  const fillTags = (base, inIns) => (cam ? [base + '@move'].concat(inIns ? [base + '@fix'] : []) : [base]);
  if (warnDefs.length) for (const d of warnDefs) push(fillTags('wrn:' + d.key, d.ids.some((id) => (ins.ids || []).includes(id))), bl(fd(find('fill', d.col, 1)), P * S.map.s));
  else for (const c of [...new Set(Object.values(S.fillsByStyle[S.style]).map(up))].sort((a, b) => lum(b) - lum(a))) push(fillTags('fill:' + c, (ins.fills || []).map(up).includes(c)), bl(fd(find('fill', c, 1)), P * S.map.s));
  const fillStarts = tracks.filter((t) => t.kind === 'fill').map((t) => +t.start);
  const firstFill = fillStarts.length ? Math.min(...fillStarts) : 0.8;
  for (const c of [...new Set(S.brushByStyle[S.style].filter((s) => !s.erase).map((s) => up(s.col)))]) {
    const tr = find('brush', c, 1);
    push(fillTags('brush:' + c, (ins.brush || []).map(up).includes(c)), tr ? fd(tr) : { start: 0, len: r4(Math.max(firstFill, 0.8)), ease: EZ });
  }
  push(cam ? ['lines@move'].concat(ins.lines ? ['lines@fix'] : []) : ['lines'], null);
  const mt = S.mtns.filter((m) => !m.off);
  if (mt.length) push(cam ? (mt.some((m) => !m.anchor) ? ['mtnBase@free'] : []).concat(mt.filter((m) => m.anchor).map((m) => 'mtnBase@' + m.id)) : ['mtnBase'], null);
  for (const m of mt) push(['mtn:' + m.id], blinds ? bl(sp2fd(blindMtnSpan(S, m, tracks)), P) : fd(find('mtn', m.id)));
  for (const b of S.labels.filter((x) => !x.off)) {
    const f = fd(find('label', b.id));
    if (b.style === 'leader') push(['leader:' + b.id], f);
    push(['labelbg:' + b.id], f && Object.assign({}, f, { rise: riseOf(S.res) }));
  }
  if (S.res === '1920x1080-vf' && S.vfBar.on) push(['vfbar'], null);
  for (const t of S.texts.filter((x) => !x.off)) push(['title:' + t.txt], null);
  if (S.legend.on) push(['legend'], null);
  return out;
}
// 카메라 블리드 기대(작업 뷰 SVG 좌표) — 키마다 프레임 모서리(회전이면 외접원)를 카메라 뷰 → 지도 → 작업 뷰로. 프레임 안이면 없음
function bleedOf(S, ks) {
  const vf = S.res === '1920x1080-vf', v = vfk(S.res), ax = 1800, ay = 100, m0 = S.map;
  const inv = (x, y) => (vf ? { x: ax + (x - ax) / v, y: ay + (y - ay) / v } : { x, y }), fwd = (x, y) => (vf ? { x: ax + (x - ax) * v, y: ay + (y - ay) * v } : { x, y });
  const rot = ks.some((k) => Math.abs(k.rz || 0) > 0.05), R = Math.hypot(960, 540);
  const oc = rot ? [[960 - R, 540 - R], [960 + R, 540 - R], [960 - R, 540 + R], [960 + R, 540 + R]] : [[0, 0], [1920, 0], [0, 1080], [1920, 1080]];
  let x0 = 0, y0 = 0, x1 = 1920, y1 = 1080;
  for (const k of ks) for (const [ox, oy] of oc) { const c = inv(ox, oy), q = fwd(m0.x + m0.s * (c.x - k.x) / k.s, m0.y + m0.s * (c.y - k.y) / k.s); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  if (Math.floor(x0) >= 0 && Math.floor(y0) >= 0 && Math.ceil(x1) <= 1920 && Math.ceil(y1) <= 1080) return null;
  return { x: Math.max(-1920, Math.floor(x0)), y: Math.max(-1080, Math.floor(y0)) };
}

async function runGeneral(seed, ver) {
  const { S, warnDefs } = genGeneral(seed);
  const A = S.anim, tag = `[일반 seed=${seed} ${S.style} ${S.res} ${A.reveal}${A.cam.keys.length ? ' 카메라' : ''} v${ver}]`;
  const { ctx, caps, send } = aeCtx(S, { warnDefs, ver });
  const auto = !A.tracks.length && !A.cam.keys.length ? ctx.autoTrackPlan() : null;
  const tracks = auto ? auto.tracks : A.tracks;
  const spec = await send();
  assert.ok(spec, tag + ' 스펙 없음 ' + caps.status.join(' / '));
  const k = outK(S.res), P = aePtOf(S.res);
  const cam = A.cam.keys.length > 0, ks = A.cam.keys.slice().sort((a, b) => a.t - b.t), rot = ks.some((q) => Math.abs(q.rz) > 0.05);
  // 1) 레이어 순서·페이드 = 저장 데이터의 트랙 값(+ 이징·블라인드)
  const exp = expectGeneral(S, warnDefs, tracks);
  const got = spec.layers.map((l) => ({ tag: tagOf(l, caps.frames), fade: l.fade || null, l }));
  assert.deepEqual(got.map((x) => x.tag), exp.map((x) => x.tag), tag + ' 레이어 순서');
  got.forEach((g, i) => {
    const e = exp[i].fade;
    if (!e) { assert.equal(g.fade, null, tag + ' ' + g.tag + ' 페이드 없음(처음부터 보임)'); return; }
    assert.ok(g.fade, tag + ' ' + g.tag + ' 페이드 있어야');
    close(g.fade.start, e.start, 1e-9, tag + ' ' + g.tag + ' 시작'); close(g.fade.len, e.len, 1e-9, tag + ' ' + g.tag + ' 길이');
    assert.deepEqual(g.fade.ease, EZ, tag + ' ' + g.tag + ' 이징 = 앱 easeOut');
    if (e.rise != null) close(g.fade.rise, e.rise, 1e-9, tag + ' ' + g.tag + ' rise'); else assert.equal(g.fade.rise, undefined);
    if (e.blinds) { assert.ok(g.fade.blinds, tag + ' ' + g.tag + ' 블라인드'); close(g.fade.blinds.w, e.blinds.w, 1e-3, tag + ' 블라인드 폭'); assert.equal(g.fade.blinds.dir, e.blinds.dir); close(g.fade.blinds.ov, e.blinds.ov, 1e-6); assert.equal(g.fade.blinds.two, 0); }
    else assert.equal(g.fade.blinds, undefined, tag + ' ' + g.tag + ' 블라인드 아님');
  });
  // 2) 카메라 — 지도 묶음(@move) = cam:1(+블리드는 새 헬퍼만), 고정(@fix·@free) = 회전 있을 때만 cam:2, 지도에 붙은 산 = camPt(자리만 따라감)
  const bb = cam ? bleedOf(S, ks) : null;
  for (const g of got) {
    const l = g.l;
    if (!cam) { assert.ok(l.cam == null && l.place == null && l.camPt == null, tag + ' 카메라 없으면 카메라 필드 없음'); continue; }
    if (/@move$/.test(g.tag)) {
      assert.equal(l.cam, 1, tag + ' ' + g.tag + ' cam:1');
      if (ver >= NEW && bb) { assert.ok(l.place, tag + ' ' + g.tag + ' 블리드(새 헬퍼)'); close(l.place.x, bb.x * k.kx, 1e-6); close(l.place.y, bb.y * k.ky, 1e-6); assert.equal(l.place.k, 1); }
      else assert.equal(l.place, undefined, tag + ' ' + g.tag + ' 블리드 없음(옛 헬퍼거나 프레임 안)');
    } else if (/@(fix0|fix1|fix|free)$/.test(g.tag)) assert.equal(l.cam, rot ? 2 : undefined, tag + ' ' + g.tag + ' 고정 부분');
    else if (/^mtn(Base)?[:@]m\d+$/.test(g.tag)) {
      const m = S.mtns.find((q) => q.id === g.tag.replace(/^mtn(Base)?[:@]/, ''));
      if (m.anchor) { const p = P(m.x, m.y); assert.deepEqual(l.camPt.map((v) => +v.toFixed(6)), [+p.x.toFixed(6), +p.y.toFixed(6)], tag + ' 붙은 산 camPt'); }
      else assert.equal(l.cam, rot ? 2 : undefined, tag + ' 자유 산');
    } else assert.ok(l.cam == null && l.place == null, tag + ' ' + g.tag + ' 화면 고정(라벨·제목·범례·VF 바)');
  }
  if (cam) {
    const a = P(1160, 545);
    assert.deepEqual(JSON.parse(JSON.stringify(spec.camera)), JSON.parse(JSON.stringify({ anchor: [a.x, a.y], sBaked: 1.02, keys: ks.map((q) => { const p = P(q.x, q.y); return { t: q.t, x: p.x, y: p.y, s: q.s, rz: q.rz }; }), ease: EZ, pivot: [k.W / 2, k.H / 2], ...(rot && S.res !== '1920x1080-vf' ? { voidCol: '#0e2a4e' } : {}) })), tag + ' spec.camera');
    assert.equal(!!spec.vfMask, ver >= NEW && S.res === '1920x1080-vf' && !!S.vfClip, tag + ' VF 패널 마스크(새 헬퍼·클립 있을 때)');
  } else { assert.equal(spec.camera, undefined); assert.equal(spec.vfMask, undefined); }
  // 3) 지시선 라벨 — 새 헬퍼용 셰이프 스펙 + 옛 PNG는 legacy
  for (const b of S.labels.filter((x) => !x.off && x.style === 'leader')) {
    const ld = got.find((g) => g.tag === 'leader:' + b.id).l, lb = got.find((g) => g.tag === 'labelbg:' + b.id).l;
    assert.equal(ld.legacy, 1, tag + ' 옛 지시선 PNG = legacy');
    const a = P(b.ax, b.ay), s = vfk(S.res) * k.kk;
    close(lb.labelComp.leader.ax, a.x, 1e-9); close(lb.labelComp.leader.ay, a.y, 1e-9); close(lb.labelComp.leader.w, 121.5 * s, 1e-9); close(lb.labelComp.leader.gap, 16 * s, 1e-9);
  }
  // 4) 타임라인 막대(화면이 막대를 놓는 값 tlSpanNow || implicit)와 레이어 쌓는 순서 = 계획의 역순
  const plan = [...ctx.tlLayerPlan({ tracks })];
  assert.deepEqual(plan.slice().reverse().flatMap((L) => planTags(L, S)), exp.map((x) => x.tag), tag + ' AE 쌓는 순서 = 타임라인 행의 역순');
  for (const L of plan) {
    const tags = planTags(L, S); if (!tags.length || L.kind === 'static') continue;
    if (L.kind === 'mtn' && A.reveal === 'blinds') continue;   // 블라인드 산은 화면 규칙(같은 색 칠 트랙) — 위 기대값에서 봄
    const bar = ctx.tlSpanNow(L) || L.implicit;
    for (const t of tags) {
      const g = got.find((x) => x.tag === t);
      if (!bar) { assert.equal(g.fade, null, tag + ' ' + t + ' 막대 없음 = 페이드 없음'); continue; }
      close(g.fade.start, bar[0], 1e-4, tag + ' ' + t + ' 막대 시작'); close(g.fade.start + g.fade.len, Math.max(bar[1], bar[0] + 0.01), 1e-4, tag + ' ' + t + ' 막대 끝');
    }
    // 'AE 차이' — 새 헬퍼: 블라인드는 띠 위치만, 옛 헬퍼: 페이드로 + 다시 실행 안내
    if (A.reveal === 'blinds' && (L.kind === 'fill' || L.kind === 'mtn')) assert.ok(L.diff.some((d) => (ver >= NEW ? /한쪽 끝에서 열립니다/ : /블라인드 대신 페이드.*새로 실행/).test(d)), tag + ' 블라인드 AE 차이');
    if (L.kind === 'label' && S.labels.find((b) => b.id === L.key).style === 'leader' && L.track) assert.equal(L.diff.length > 0, ver < NEW, tag + ' 지시선 AE 차이는 옛 헬퍼만');
  }
  const camRow = plan.find((L) => L.kind === 'camera');
  if (camRow) assert.equal(camRow.diff.some((d) => d.includes('안 들어갑니다(태풍 단일 지도만 지원)')), ver < NEW, tag + ' 일반 지도 카메라 = 새 헬퍼면 들어감');
  // 5) VF 진입·컴프
  assert.deepEqual(JSON.parse(JSON.stringify(spec.vfEnter)), S.res === '1920x1080-vf' ? { start: 1, len: 1.2, dx: 256, ease: [40, 80] } : null, tag + ' VF 진입(easeVf = 40/80)');
  assert.equal(spec.comp.w, k.W); assert.equal(spec.comp.h, k.H); assert.equal(spec.comp.fps, FPS);
  const durBase = auto ? Math.max(A.dur, auto.dur) : A.dur;
  checkDur(spec, durBase, exp.filter((x) => x.fade).map((x) => x.fade.start + x.fade.len).concat(S.res === '1920x1080-vf' ? [2.2] : []).concat(ks.map((q) => q.t)), tag);
  // 6) AE(헬퍼 JSX 실행) — 레이어마다 등장 키 = 막대 시작·끝, 이징 34/85, inPoint, 라벨 26px 위치 키, 블라인드 효과, 카메라 널·부모
  const { M } = aeOf(spec);
  assert.deepEqual(M.errors, [], tag + ' AE 흉내 오류 없음');
  close(M.main.duration, spec.comp.dur, 1e-6, tag + ' AE 컴프 길이');
  const TG = spec.vfEnter ? M.comps.find((c) => c.name === 'VF_전체') : M.main;
  const legacyN = spec.layers.filter((l) => l.legacy).length;
  const imgs = TG.list.filter((l) => l.kind === 'av' || l.kind === 'comp' || l.kind === 'text').slice().reverse();   // 아래→위
  assert.equal(imgs.length, spec.layers.length - legacyN, tag + ' AE 레이어 수(legacy 지시선 PNG는 새 헬퍼가 건너뜀)');
  const gcam = cam ? TG.list.find((l) => l.name === 'CAM') : null, grot = rot ? TG.list.find((l) => l.name === 'ROT') : null;
  spec.layers.filter((l) => !l.legacy).forEach((l, i) => {
    const al = imgs[i];
    assert.equal(al.name, l.name, tag + ' AE 레이어 이름·순서');
    if (l.text || l.legendComp) return;
    const f = fadeNodeOf(al);
    if (!l.fade) { assert.equal(f.nd.keys.length, 0, tag + ` ${l.name} 키 없음`); return; }
    assert.deepEqual(keyTimes(f.nd).map(r4), [r4(l.fade.start), r4(l.fade.start + l.fade.len)], tag + ` ${l.name} 등장 키`);
    assert.deepEqual(easeOfKeys(f.nd), EZ, tag + ` ${l.name} 이징 34/85`);
    assert.equal(f.blinds, !!l.fade.blinds, tag + ` ${l.name} 블라인드 효과`);
    if (f.blinds) { assert.equal(f.vb.length, 1); close(f.vb[0].property(3).value, l.fade.blinds.w, 1e-5); close(f.vb[0].property(2).value, l.fade.blinds.dir, 1e-5); assert.ok(f.vb[0].property(1).expression, '완료도 표현식'); assert.equal(al.tf.opacity.keys.length, 0); }
    if (l.fade.start > 0.001) close(al.inPoint, l.fade.start, 1e-5, tag + ' inPoint');
    if (l.labelComp && l.fade.rise) { const pk = al.tf.position.keys; close(pk[0].v[1] - pk[1].v[1], l.fade.rise, 1e-4, tag + ' rise 키'); assert.deepEqual(easeOfKeys(al.tf.position), EZ, tag + ' rise 이징'); }
    if (cam) {
      if (l.cam === 1) assert.equal(al.parent, gcam, tag + ` ${l.name} 부모 = CAM`);
      else if (l.cam === 2 && rot) assert.equal(al.parent, grot, tag + ` ${l.name} 부모 = ROT`);
      else assert.equal(al.parent, null, tag + ` ${l.name} 부모 없음(화면 고정)`);
      if (l.camPt) assert.match(al.tf.position.expression, /thisComp\.layer\("CAM"\)\.toComp/);
    }
  });
  if (cam) {
    // 같은 시각 키는 AE에서 하나(뒤 값) — 기대도 그렇게
    const ku = ks.filter((q, i) => !ks.slice(i + 1).some((o) => r4(o.t) === r4(q.t)));
    assert.deepEqual(keyTimes(gcam.tf.position).map(r4), ku.map((q) => r4(q.t)), tag + ' CAM 위치 키 시각');
    gcam.tf.scale.keys.forEach((q, i) => close(q.v[0], ku[i].s / 1.02 * 100, 1e-5, tag + ' CAM 확대'));
    for (const nd of [gcam.tf.position, gcam.tf.scale]) for (const q of nd.keys) { assert.equal(q.inE[0].influence, 85); assert.equal(q.outE[0].influence, 34); }   // 모든 키 앱 easeCam
    if (rot) { assert.equal(gcam.parent, grot); grot.tf.rotation.keys.forEach((q, i) => close(q.v, ku[i].rz, 1e-5, tag + ' ROT 방향 키')); }
  }
  if (spec.vfEnter) { const vfl = M.main.list.find((l) => l.name === 'VF_진입'); assert.deepEqual(keyTimes(vfl.tf.position).map(r4), [1, 2.2]); assert.deepEqual(easeOfKeys(vfl.tf.position), [40, 80]); assert.deepEqual(easeOfKeys(vfl.tf.opacity), [40, 80]); }
  return { auto: !!auto, n: spec.layers.length, cam };
}

async function runTyphoon(seed, compare, ver) {
  const { S } = genTyphoon(seed, compare);
  const A = S.anim, tag = `[${compare ? '비교' : '태풍'} seed=${seed} ${S.res} ${S.typhoon.trackMode} v${ver}]`;
  const { ctx, caps, send } = aeCtx(S, { ver });
  const auto = !A.tracks.length && !A.cam.keys.length ? ctx.autoTrackPlan() : null;
  const tracks = auto ? auto.tracks : A.tracks;
  const tt0 = tracks.find((x) => x.kind === 'typhoon') || null;
  const spec = await send();
  assert.ok(spec, tag + ' 스펙 없음 ' + caps.status.join(' / '));
  const tt = tt0 && (auto ? ctx.ensureTyphoonKeys(JSON.parse(JSON.stringify(tt0))) : tt0);   // 태풍 키는 계획이 채운 값(화면 하위 행과 같은 값)
  const k = outK(S.res), RP = rigOf(S.res), kk = k.kk * vfk(S.res);
  const titles = S.texts.map((t) => 'title:' + t.txt);
  const ends = S.res === '1920x1080-vf' ? [2.2] : [];
  const plan = [...ctx.tlLayerPlan({ tracks })];
  const ks = S.anim.cam.keys.slice().sort((a, b) => a.t - b.t), rot = ks.some((q) => Math.abs(q.rz) > 0.05);
  const camExp = ks.length ? { anchor: [RP(1160, 545).x, RP(1160, 545).y], sBaked: 1.02, keys: ks.map((q) => ({ t: q.t, x: RP(q.x, q.y).x, y: RP(q.x, q.y).y, s: q.s, rz: q.rz })), ease: EZ, pivot: [k.W / 2, k.H / 2], ...(rot && S.res !== '1920x1080-vf' ? { voidCol: '#0e2a4e' } : {}) } : undefined;
  const bb = ks.length && ver >= NEW ? bleedOf(S, ks) : null;
  const rigOfSpec = (r) => {   // 공통: 카메라·블리드·지시선 간격
    assert.deepEqual(JSON.parse(JSON.stringify(r.camera === undefined ? null : r.camera)), JSON.parse(JSON.stringify(camExp === undefined ? null : camExp)), tag + ' 카메라');
    if (bb) { close(r.bgPlace.x, bb.x * k.kx, 1e-6); close(r.bgPlace.y, bb.y * k.ky, 1e-6); } else assert.equal(r.bgPlace, undefined, tag + ' 블리드는 새 헬퍼만');
    close(r.leaderGap, 16 * kk, 1e-4, tag + ' 지시선 간격 = 출력 배율');
    for (const q of ks) ends.push(q.t);
  };
  const { M } = aeOf(spec);
  assert.deepEqual(M.errors, [], tag + ' AE 흉내 오류 없음');
  const TG = spec.vfEnter ? M.comps.find((c) => c.name === 'VF_전체') : M.main;
  const slider = (layer, nm) => { const l = TG.list.find((x) => x.name === layer); assert.ok(l, tag + ' 레이어 ' + layer); const e = effectOf(l, nm); assert.ok(e, tag + ' 슬라이더 ' + layer + '.' + nm); return e.property(1); };
  const progCheck = (nd, prog) => {
    if (prog.end <= prog.start) { assert.equal(nd.keys.length, 0); assert.equal(nd.value, 100, tag + ' 정적 = 100'); return; }
    assert.deepEqual(keyTimes(nd).map(r4), [r4(prog.start), r4(prog.end)], tag + ' 진행 슬라이더 키 = 막대 양끝');
    assert.deepEqual(nd.keys.map((q) => q.v), [0, 100]); assert.ok(nd.keys.every((q) => q.inI === KIT.LINEAR && q.outI === KIT.LINEAR), '선형');
  };
  if (!compare) {
    assert.deepEqual(spec.layers.map((l) => tagOf(l, caps.frames)), ['typhoonRig', ...titles, ...(S.legend.on ? ['legend'] : [])], tag + ' 레이어');
    const rig = spec.layers[0].typhoonRig;
    // 경로 = 경로 막대 [ps, pe] — 옛 필드(reveal)와 새 진행 곡선(prog: 화면 easeInOutC·지점 등분)
    if (tt) {
      close(rig.reveal.start, tt.ps, 1e-9, tag + ' 경로 시작'); close(rig.reveal.path, Math.max(F1, tt.pe - tt.ps), 1e-9, tag + ' 경로 길이');
      assert.deepEqual(rig.prog, { start: r4(tt.ps), end: r4(tt.ps + Math.max(0.001, tt.pe - tt.ps)), curve: 'ioc' }, tag + ' 진행 곡선');
    } else { assert.equal(rig.reveal.start, 0); close(rig.reveal.path, F1, 1e-12); assert.deepEqual(rig.prog, { start: 0, end: 0, curve: 'ioc' }, tag + ' 트랙 없음 = 정적'); }
    assert.equal(rig.labelCurve, S.typhoon.trackMode === 'line' ? 0 : 1);
    assert.equal(rig.headFile != null, S.typhoon.iconMode === 'dot', tag + " 선두 일러스트(아이콘 '작은 원'일 때만 따로)");
    rigOfSpec(rig);
    ends.push(rig.reveal.start + rig.reveal.path);
    // 라벨 = 라벨 막대 [s, e] (라인 모드는 라벨 없음)
    const vis = S.typhoon.trackMode === 'line' ? [] : S.typhoon.labels.filter((b) => !b.off);
    assert.deepEqual(rig.labels.map((l) => l.idx), vis.map((b) => b.idx), tag + ' 라벨 목록');
    rig.labels.forEach((l, i) => {
      const b = vis[i], e = tt && tt.lab[b.id];
      if (tt) { assert.ok(e, tag + ' 라벨 키 ' + b.id); close(l.revStart, e.s, 1e-9, tag + ' 라벨 시작'); close(l.revLen, Math.max(0.05, e.e - e.s), 1e-9, tag + ' 라벨 길이'); }
      else { assert.equal(l.revStart, 0); close(l.revLen, F1, 1e-12); }
      ends.push(l.revStart + l.revLen);
    });
    // 타임라인 하위 행(경로·라벨 막대) = 리그 값
    const typ = plan.find((L) => L.kind === 'typhoon');
    if (tt) {
      for (const c of typ.children) {
        const bar = ctx.tlSpanNow(c);
        if (c.kind === 'typPath') { close(rig.reveal.start, bar[0], 1e-9); close(rig.reveal.start + rig.reveal.path, Math.max(bar[1], bar[0] + F1), 1e-9); assert.equal(c.diff.length > 0, ver < NEW, tag + ' 경로 AE 차이는 옛 헬퍼만'); }
        else { const l = rig.labels[vis.findIndex((b) => b.id === c.key)]; close(l.revStart, bar[0], 1e-9, tag + ' 라벨 막대'); close(l.revStart + l.revLen, Math.max(bar[1], bar[0] + 0.05), 1e-9); }
      }
    } else assert.equal(ctx.tlSpanNow(typ), null, tag + ' 트랙 없음 = 막대 없음(처음부터 보임)');
    // AE: 진행 슬라이더 = 경로 막대 양끝(선형), 라벨 슬라이더 = 라벨 막대 양끝(경로 정적이면 정적), 카메라 키
    if (rig.points.length >= 1) progCheck(slider('TPROG', 'PROG'), rig.prog);
    rig.labels.forEach((l, i) => progCheck(slider('TPROG', 'L' + i), rig.prog.end <= rig.prog.start ? rig.prog : { start: l.revStart, end: l.revStart + l.revLen }));
  } else {
    assert.deepEqual(spec.layers.map((l) => tagOf(l, caps.frames)), ['compareRig', ...titles, ...(S.legend.on ? ['legend'] : [])], tag + ' 레이어');
    const cr = spec.layers[0].compareRig;
    assert.equal(cr.labelCurve, 1);
    rigOfSpec(cr);
    // 예보마다 진행 곡선 — 비교 막대 → 없으면 메인 경로 막대 → 없으면 정적(화면 renderAnimFrameBody)
    const shown = S.typhoon.compare.filter((c) => c.show);
    assert.equal(cr.typhoons.length, shown.length);
    cr.typhoons.forEach((ty, i) => {
      const c = shown[i], tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id);
      const sp = tr ? [tr.start, tr.start + Math.max(0.001, tr.len)] : tt ? [tt.ps, tt.ps + Math.max(0.001, tt.pe - tt.ps)] : [0, 0];
      assert.deepEqual(ty.prog, { start: r4(sp[0]), end: r4(sp[1]), curve: 'ioc' }, tag + ' 비교 진행 ' + c.id);
      assert.equal(ty.head, c.showIcons !== 0 ? 1 : 0); close(ty.headK, 10 / 6, 1e-12);
      assert.equal(ty.nameLabel.always, 1, tag + ' 이름표 늘 보임');
      // 옮기지 않은 이름표 = 마지막 지점 + (13, −4)(화면 drawCompareTracks — 카메라를 따라감) → follow(출력 px, VF 축소 포함). 옮긴 이름표는 고정
      if (c.labelPos) assert.equal(ty.nameLabel.follow, undefined, tag + ' 옮긴 이름표는 고정');
      else assert.deepEqual(ty.nameLabel.follow, [r4(13 * vfk(S.res) * k.kx), r4(-4 * vfk(S.res) * k.ky)], tag + ' 옮기지 않은 이름표는 마지막 지점을 따라감');
      ends.push(ty.prog.end);
      progCheck(slider('CPROG' + i, 'PROG'), ty.prog);
    });
    // 옛 헬퍼용 리그 하나 타이밍(가장 이른 시작~가장 늦은 끝)도 그대로
    const spans = shown.map((c) => { const tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id); return tr ? [tr.start, tr.start + tr.len] : tt ? [tt.ps, tt.pe] : null; }).filter(Boolean);
    if (spans.length) { const a = Math.min(...spans.map((s) => s[0])), p = Math.max(F1, Math.max(...spans.map((s) => s[1])) - a); close(cr.reveal.start, a, 1e-9); close(cr.reveal.path, p, 1e-9); }
    else { assert.equal(cr.reveal.start, 0); close(cr.reveal.path, F1, 1e-12); }
    ends.push(cr.reveal.start + cr.reveal.path + cr.reveal.labelLen);
    // 'AE 차이' — 새 헬퍼: 타이밍 차이는 없고 실선 하나·반경만, 옛 헬퍼: 막대가 다르면 한 타이밍 안내
    const all = shown.map((c) => { const tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id); return tr ? [tr.start, tr.start + tr.len] : tt ? [tt.ps, tt.pe] : null; });
    const differ = all.some((s) => !s) || all.some((s) => Math.abs(s[0] - all[0][0]) > 0.01 || Math.abs(s[1] - all[0][1]) > 0.01);
    for (const L of plan.filter((x) => x.kind === 'typcmp' && !x.dim)) {
      const c = S.typhoon.compare.find((q) => q.id === L.key);
      assert.equal(L.diff.some((d) => d.includes('한 타이밍')), ver < NEW && all.some(Boolean) && differ, tag + ' 비교 타이밍 차이 안내(옛 헬퍼만)');
      if (ver >= NEW) { assert.equal(L.diff.some((d) => d.includes('실선 하나')), c.points.some((p, j) => j > 0 && p.fcst) || c.points.every((p) => p.fcst), tag + ' 실선 안내'); assert.equal(L.diff.some((d) => d.includes('반경')), !!c.showRadius); }
    }
    assert.ok(!plan.some((L) => L.kind === 'typhoon'), tag + ' 비교 지도엔 태풍 경로 행 없음');
  }
  // 카메라 — AE CAM 널 키(부모 연결 뒤), 모든 키 앱 easeCam(34/85)
  if (ks.length) {
    const C = TG.list.find((l) => l.name === 'CAM');
    assert.deepEqual(keyTimes(C.tf.position).map(r4), [...new Set(ks.map((q) => r4(q.t)))], tag + ' AE 카메라 키 시각(같은 시각 키는 AE에서 하나)');
    for (const q of C.tf.position.keys) { assert.equal(q.inE[0].influence, 85); assert.equal(q.outE[0].influence, 34); }
    const camRow = plan.find((L) => L.kind === 'camera');
    if (compare && ver < NEW) assert.ok(camRow.diff.some((d) => d.includes('안 들어갑니다(태풍 단일 지도만 지원)')), tag + ' 옛 헬퍼 비교 지도 카메라 안내');
    else assert.equal(camRow.diff.some((d) => d.includes('확대한 만큼')), ks.some((q) => Math.abs(q.s / 1.02 - 1) > 0.01), tag + ' 확대 차이 안내');
    assert.equal(camRow.diff.some((d) => /3번째 키부터/.test(d)), ver < NEW && !compare && ks.length > 2, tag + ' 3번째 키 이징 안내는 옛 헬퍼만');
  }
  const durBase = auto ? Math.max(A.dur, auto.dur) : A.dur;
  checkDur(spec, durBase, ends, tag);
  close(M.main.duration, spec.comp.dur, 1e-6);
  assert.deepEqual(JSON.parse(JSON.stringify(spec.vfEnter)), S.res === '1920x1080-vf' ? { start: 1, len: 1.2, dx: 256, ease: [40, 80] } : null);
  assert.equal(!!spec.vfMask, ver >= NEW && ks.length > 0 && S.res === '1920x1080-vf' && !!S.vfClip, tag + ' VF 패널 마스크');
  return { auto: !!auto };
}

// ===================== 테스트 =====================
test('팔레트 색 밝기가 서로 다르다(칠 레이어 순서 기대값이 모호하지 않게)', () => {
  assert.equal(new Set(PAL.map((c) => lum(c).toFixed(3))).size, PAL.length);
});
test('손으로 만든 예 — 칠 2.5초/1.3초 막대 → AE 불투명도 키 2.5→3.8초(이징 34/85), 라벨 3.1/0.7 → 키 3.1→3.8·26px 위치 키, 막대 없는 라벨은 키 없음', async () => {
  const S = { style: 'sgg', res: '1920x1080', map: { x: 1160, y: 545, s: 1.02 }, legend: { on: 0 }, vfBar: { on: 0 }, texts: [], mtns: [],
    labels: [{ id: 'a', txt: '10', x: 500, y: 300, fill: '#FA9A8C', style: 'plain' }, { id: 'b', txt: '20', x: 700, y: 300, fill: '#FA9A8C', style: 'leader', ax: 650, ay: 480 }],
    fillsByStyle: { sgg: { z1: '#FA9A8C', z2: '#8A0A02' } }, brushByStyle: { sgg: [] },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', tracks: [{ id: 'k1', kind: 'fill', key: '#FA9A8C', start: 2.5, len: 1.3 }, { id: 'k2', kind: 'label', key: 'a', start: 3.1, len: 0.7 }], cam: { keys: [] } } };
  const { caps, send } = aeCtx(S);
  const spec = await send();
  const by = (t) => spec.layers.findIndex((l) => tagOf(l, caps.frames) === t);
  assert.deepEqual(spec.layers.map((l) => tagOf(l, caps.frames)), ['base', 'fill:#FA9A8C', 'fill:#8A0A02', 'lines', 'labelbg:a', 'leader:b', 'labelbg:b']);
  assert.deepEqual(spec.layers[by('fill:#FA9A8C')].fade, { start: 2.5, len: 1.3, ease: EZ });
  assert.equal(spec.layers[by('fill:#8A0A02')].fade, null, '막대 없는 색 = 처음부터');
  assert.deepEqual(spec.layers[by('labelbg:a')].fade, { start: 3.1, len: 0.7, ease: EZ, rise: 26 });
  assert.equal(spec.layers[by('labelbg:b')].fade, null);
  assert.equal(spec.layers[by('leader:b')].legacy, 1, '옛 지시선 PNG = legacy');
  assert.equal(spec.comp.dur, 6);
  const { jsx, M } = aeOf(spec);
  assert.ok(jsx.includes(`fadeE(L${by('fill:#FA9A8C')},2.500000,3.800000,34.000000,85.000000);`), 'AE 칠 키 + 이징');
  assert.ok(jsx.includes(`fadeE(L${by('labelbg:a')},3.100000,3.800000,34.000000,85.000000);`), 'AE 라벨 키');
  assert.ok(jsx.includes(`p.setValueAtTime(3.100000,[500.000000,326.000000]);p.setValueAtTime(3.800000,[500.000000,300.000000]);ezE(p,34.000000,85.000000);`), 'AE 라벨 올라오기');
  assert.ok(!jsx.includes(`fadeL(L${by('fill:#8A0A02')},`) && !jsx.includes(`fadeE(L${by('fill:#8A0A02')},`));
  assert.ok(jsx.includes('addComp("WeatherCG_T",1920,1080,1.0,6.000000,29.970000)'));
  assert.ok(!jsx.includes('"\\uc9c0\\uc2dc\\uc120_2"'), '새 헬퍼는 옛 지시선 PNG를 안 얹는다');
  // 지시선 셰이프 = 라벨 바로 아래, 앵커 원 = 라벨 위(화면 순서)
  const names = M.main.list.map((l) => l.name);
  const iL = names.indexOf('라벨_2');
  assert.equal(names[iL + 1], '라벨_2_지시선'); assert.equal(names[iL - 1], '라벨_2_앵커');
});
for (const ver of [NEW, OLD]) {
  test(`무작위 일반 지도 200개(시군·특보·VF·터치·블라인드·카메라, 트랙 섞임·없음·사라진 대상) — 스펙·AE 키 = 타임라인 값 (헬퍼 ${ver})`, async () => {
    let autoN = 0, n = 0, camN = 0;
    for (let seed = 1; seed <= 200; seed++) { const r = await runGeneral(seed, ver); autoN += r.auto ? 1 : 0; n += r.n; camN += r.cam ? 1 : 0; }
    assert.ok(autoN > 8 && autoN < 70, '트랙 없음(자동 구성 타이밍) 경우도 섞여야: ' + autoN);
    assert.ok(n > 1300, '레이어 수 ' + n);
    assert.ok(camN > 20, '카메라 경우 ' + camN);
  });
  test(`무작위 단일 태풍 150개(라인/일반·카메라 0~4키·방향·트랙 없음) — 경로·라벨·카메라 키 = 타임라인 값 (헬퍼 ${ver})`, async () => {
    let autoN = 0;
    for (let seed = 1001; seed <= 1150; seed++) autoN += (await runTyphoon(seed, false, ver)).auto ? 1 : 0;
    assert.ok(autoN > 3, '자동 구성 경우 ' + autoN);
  });
  test(`무작위 태풍 비교 100개 — 예보마다 진행 곡선 = 그 예보 막대(없으면 메인 경로), 카메라 (헬퍼 ${ver})`, async () => {
    for (let seed = 2001; seed <= 2100; seed++) await runTyphoon(seed, true, ver);
  });
}
test('비교 지도는 메인 경로 트랙 없이 비교 예보 트랙만 있어도 그 막대대로 재생된다(화면 = 막대 = AE)', () => {
  const body = fnSrc('renderAnimFrameBody');
  assert.match(body, /const cmpOnly = !_tt && isTyphoonCompare\(\) && anim\(\)\.tracks\.some\(\(x\) => x\.kind === 'typcmp'\);/);
  assert.match(body, /if \(!_tt && !cmpOnly\) \{ typhoonProg = null; typhoonCmpProg = null; typhoonLabelAnim = null;/);
  assert.match(body, /const pathK = _tt \? clamp01\(\(t - ps\) \/ Math\.max\(0\.001, pe - ps\)\) : 1;/);
  assert.match(body, /const ck = tr \? clamp01\(\(t - tr\.start\) \/ Math\.max\(tr\.len, 0\.001\)\) : pathK;/);
});

// ===================== 실제 앱(Electron) — 화면 막대·시작/길이 칸 = 스펙 =====================
test('부팅 점검: 실제 앱 타임라인 막대·시작/길이 칸·행 순서 = /api/ae 스펙 = AE 키', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const root = path.join(__dirname, '..');
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), '--wait=7000', '--size=1600x1000', '--eval=' + path.join(__dirname, 'ae-timeline-spec.boot-eval.js')], { encoding: 'utf8', timeout: 400000, maxBuffer: 64 << 20 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  for (const sc of o.scenes) {
    const tag = '[' + sc.name + ']', fps = sc.fps;
    assert.ok(sc.rows.length >= 3, tag + ' 행');
    const frameOf = (txt) => { const m = /^(\d+):(\d+)f$/.exec(txt); return m ? +m[1] * Math.round(fps) + +m[2] : null; };
    for (const r of sc.rows) {
      const rt = tag + ' ' + r.id;
      if (!r.ae || r.kind === 'typhoon') continue;   // 정적·카메라 / 태풍 경로는 아래 sc.typ(하위 행)로
      if (r.ae.fade === null) { assert.ok(r.none, rt + ' 페이드 없음 = 점선 막대(타이밍 없음)'); assert.equal(r.vin, '—'); continue; }
      // 시작·길이 칸(초:프레임) = AE 키 시각(프레임)
      assert.equal(frameOf(r.vin), Math.round(r.ae.fade.start * fps + 1e-6), rt + ' 시작 칸 ' + r.vin + ' vs ' + r.ae.fade.start);
      assert.equal(frameOf(r.vlen), Math.round(r.ae.fade.len * fps + 1e-6), rt + ' 길이 칸 ' + r.vlen + ' vs ' + r.ae.fade.len);
      // 막대 위치·폭(px) = 시작·길이 × 1초당 px
      close(r.left, 12 + r.ae.fade.start * r.pps, 0.6, rt + ' 막대 left');
      close(r.width, Math.max(3, r.ae.fade.len * r.pps), 0.6, rt + ' 막대 폭');
      if (r.leaderSame != null) { assert.equal(r.leaderSame, true, rt + ' 지시선 레이어 = 라벨 막대 타이밍'); assert.equal(r.leaderLegacy, true, rt + ' 옛 지시선 PNG = legacy'); assert.equal(r.leaderSpec, true, rt + ' 새 지시선 셰이프 스펙'); }
    }
    assert.ok(sc.rows.some((r) => r.ae && r.ae.fade) && sc.rows.some((r) => r.ae && r.ae.fade === null) || sc.typ, tag + ' 막대 있는 행·없는 행이 섞여야');
    // 실제 포인터로 끈 막대 — 바뀐 값이 그대로 AE로
    if (sc.dragged) {
      for (const [k, [b0, b1, id]] of Object.entries(sc.dragged)) {
        assert.ok(Math.abs(b1[0] - b0[0]) > 1e-3 || Math.abs(b1[1] - b0[1]) > 1e-3, tag + ' ' + k + ' 끌기로 바뀌어야 ' + JSON.stringify([b0, b1]));
        close(b1[0] * fps, Math.round(b1[0] * fps), 2e-3, tag + ' 끈 값은 프레임 경계'); close(b1[1] * fps, Math.round(b1[1] * fps), 2e-3);
        const r = sc.rows.find((x) => x.id === id);
        close(r.ae.fade.start, b1[0], 1e-4, tag + ' ' + k + ' AE 시작 = 끈 막대'); close(r.ae.fade.start + r.ae.fade.len, b1[1], 1e-4, tag + ' ' + k + ' AE 끝 = 끈 막대');
      }
      close(sc.dragged.fill[1][0] - sc.dragged.fill[0][0], 10 / fps, 1.5 / fps, tag + ' 몸통 끌기 ≈ 10프레임');
      close(sc.dragged.fill[1][1] - sc.dragged.fill[1][0], sc.dragged.fill[0][1] - sc.dragged.fill[0][0], 1e-3, tag + ' 몸통 끌기는 길이 그대로');
      close(sc.dragged.label[1][0], sc.dragged.label[0][0], 1e-9, tag + ' 오른쪽 끝 자르기는 시작 그대로');
    }
    // AE 쌓는 순서 = 화면 행 순서의 역
    const rowNm = sc.rowLayers.slice().reverse().flat();
    assert.deepEqual(rowNm.filter((n) => !sc.specLayers.includes(n)).filter((n) => n !== '범례'), [], tag + ' 행마다 AE 레이어가 있다(태풍 범례만 측정 실패 시 생략)');
    assert.deepEqual(rowNm.filter((n) => sc.specLayers.includes(n)), sc.specLayers.filter((n) => rowNm.includes(n)), tag + ' 순서');
    assert.deepEqual(sc.specLayers.filter((n) => !rowNm.includes(n)), [], tag + ' AE에만 있는 레이어 없음');
    assert.equal(sc.spec.comp.dur, sc.dur, tag + ' 컴프 길이 = 타임라인 길이');
    // AE 키(헬퍼 JSX를 AE 흉내로 실행)
    const { M } = aeOf(sc.spec);
    assert.deepEqual(M.errors, [], tag + ' AE 흉내 오류 없음');
    const TG = sc.spec.vfEnter ? M.comps.find((c) => c.name === 'VF_전체') : M.main;
    for (const l of sc.spec.layers) {
      if (l.legacy || l.text || l.legendComp || l.typhoonRig || l.compareRig) continue;
      const al = TG.list.find((x) => x.name === l.name), f = fadeNodeOf(al);
      if (l.fade) { assert.deepEqual(keyTimes(f.nd).map(r4), [r4(l.fade.start), r4(l.fade.start + l.fade.len)], tag + ' ' + l.name); assert.deepEqual(easeOfKeys(f.nd), EZ); } else assert.equal(f.nd.keys.length, 0);
    }
    if (sc.typ) {
      const rig = sc.spec.layers.find((l) => l.typhoonRig).typhoonRig;
      close(rig.reveal.start, sc.typ.path[0], 1e-9); close(rig.reveal.start + rig.reveal.path, sc.typ.path[1], 1e-9);
      assert.deepEqual(rig.prog, { start: r4(sc.typ.path[0]), end: r4(sc.typ.path[1]), curve: 'ioc' }, tag + ' 진행 곡선 = 경로 막대');
      assert.equal(frameOf(sc.typ.pathVin), Math.round(rig.reveal.start * fps + 1e-6));
      close(sc.typ.pathLeft, 12 + rig.reveal.start * sc.typ.pps, 0.6, tag + ' 경로 막대 left'); close(sc.typ.pathWidth, Math.max(3, rig.reveal.path * sc.typ.pps), 0.6, tag + ' 경로 막대 폭');
      assert.ok(sc.typ.camKeyLefts.length === sc.typ.camT.length);
      for (const [t, left] of sc.typ.camKeyLefts) close(left, 12 + t * sc.typ.pps, 0.6, tag + ' 카메라 키 자리');
      for (const lb of sc.typ.labs) { const l = rig.labels.find((q) => q.idx === lb.idx); close(l.revStart, lb.span[0], 1e-9); close(l.revStart + l.revLen, lb.span[1], 1e-9); }
      assert.deepEqual(rig.camera.keys.map((q) => q.t), sc.typ.camT);
      const C = TG.list.find((l) => l.name === 'CAM');
      assert.deepEqual(keyTimes(C.tf.position).map((v) => +v.toFixed(4)), sc.typ.camT.map((v) => +v.toFixed(4)), tag + ' AE 카메라 키 시각');
      const P = effectOf(TG.list.find((l) => l.name === 'TPROG'), 'PROG').property(1);
      assert.deepEqual(keyTimes(P).map(r4), [r4(sc.typ.path[0]), r4(sc.typ.path[1])], tag + ' AE 진행 슬라이더 = 경로 막대');
      assert.ok(sc.typ.camDiff.some((d) => d.includes('확대한 만큼')), tag + ' 카메라 확대 차이 안내');
      assert.ok(!sc.typ.camDiff.some((d) => /3번째 키부터|방향·기울기는/.test(d)), tag + ' 새 헬퍼: 3키 이징·방향은 AE 차이 아님');
    }
  }
});

// 타임라인 = AE 1:1 — 실제 sendToAE가 /api/ae로 보내는 스펙과, 그 스펙으로 헬퍼(desktop/wns/ae-jsx.js — helper.py와 바이트 동일)가 만드는
// AE 키프레임 시각이 타임라인 값(트랙 시작·길이, 태풍 경로·라벨 키, 비교 예보 막대, 카메라 키, 길이)과 같은지 본다.
//  - 앱 코드는 tools/app-source.cjs로 합쳐 읽어 vm에서 돌린다(tests/tl-plan-ctx.cjs aeCtx). PNG 굽기·화면 실측·태풍 투영만 가짜.
//  - 기대값은 S(저장 데이터)에서 직접 계산한다(계획 함수를 거치지 않음) + 타임라인 막대 자리(tlSpanNow — 화면이 막대를 놓는 값)와도 비교.
//  - 무작위 작업(시드 고정) 수백 개: 시군·특보·VF·터치, 단일 태풍(라인/일반·카메라), 태풍 비교, 트랙 없음(= 자동 구성 타이밍).
//  - 실제 앱(Electron)에서 화면 막대·시작/길이 칸과 스펙을 맞춰 보는 점검은 맨 아래(WCG_BOOT_CHECK=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { aeCtx, fnSrc } = require('./tl-plan-ctx.cjs');
const { buildAeJsx } = require('../desktop/wns/ae-jsx.js');

const FPS = 29.97, F1 = 1 / FPS;
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
const riseOf = (res) => 26 * (res === '1920x1080-vf' ? 0.8 : 1) * outK(res).kk;   // aeSz(26) — VF 축소(가짜 80%) × 출력 배율

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
// 계획 행 → AE 레이어 내용(아래→위로 쌓을 때의 순서). 카메라·VF 진입·사라진 대상·옛 텍스트는 레이어가 아니다.
function planTags(L, S) {
  if (L.gone || L.kind === 'oldText' || L.kind === 'camera' || L.kind === 'vfEnter') return [];
  if (L.kind === 'static') {
    if (L.sub === 'bg') return isTy(S) ? [] : ['base'];
    if (L.sub === 'place') return [];
    if (L.sub.startsWith('title:')) return ['title:' + S.texts.find((x) => x.id === L.key).txt];
    return [L.sub === 'mtnBase' ? 'mtnBase' : L.sub];
  }
  if (L.kind === 'fill') return [L.wrnDef ? 'wrn:' + L.wrnDef.key : 'fill:' + L.key];
  if (L.kind === 'brush') return ['brush:' + L.key];
  if (L.kind === 'mtn') return ['mtn:' + L.key];
  if (L.kind === 'label') return (S.labels.find((b) => b.id === L.key).style === 'leader' ? ['leader:' + L.key] : []).concat(['labelbg:' + L.key]);
  if (L.kind === 'typhoon') return ['typhoonRig'];
  if (L.kind === 'typcmp') return [];
  return ['?' + L.kind];
}
const isTy = (S) => S.style === 'typhoon' || S.style === 'typhoonCompare';

// ===================== AE 키프레임(헬퍼 JSX) 읽기 =====================
const NUM = '(-?[\\d.]+)';
function jsxOf(spec) { return buildAeJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\t'); }
function jsxComp(jsx) { const m = new RegExp(`var comp=proj\\.items\\.addComp\\("[^"]*",(\\d+),(\\d+),1\\.0,${NUM},${NUM}\\);`).exec(jsx); return m && { w: +m[1], h: +m[2], dur: +m[3], fps: +m[4] }; }
function jsxFade(jsx, i) { const m = new RegExp(`fadeL\\(L${i},${NUM},${NUM}\\);`).exec(jsx); return m && [+m[1], +m[2]]; }
function jsxRise(jsx, i) { const m = new RegExp(`var p=L${i}\\.property\\("Position"\\);p\\.setValueAtTime\\(${NUM},\\[${NUM},${NUM}\\]\\);p\\.setValueAtTime\\(${NUM},\\[${NUM},${NUM}\\]\\);`).exec(jsx); return m && { s: +m[1], y0: +m[3], e: +m[4], y1: +m[6] }; }
function jsxInPoint(jsx, i) { const m = new RegExp(`L${i}\\.inPoint=${NUM};`).exec(jsx); return m ? +m[1] : null; }
// 경로선(Trim End 0→100, ezR 없음) — name 접두가 같은 줄들
function jsxTrims(jsx, namePrefix) {
  const out = [];
  for (const line of jsx.split('\n')) {
    if (!line.includes(`.name="${namePrefix}`)) continue;
    const m = new RegExp(`en\\.setValueAtTime\\(${NUM},0\\);en\\.setValueAtTime\\(${NUM},100\\);`).exec(line);
    if (m) out.push([+m[1], +m[2]]);
  }
  return out;
}
const CAMP = new RegExp(`CAM\\.property\\("Position"\\)\\.setValueAtTime\\(${NUM},\\[${NUM},${NUM}\\]\\);`, 'g');
const CAMS = new RegExp(`CAM\\.property\\("Scale"\\)\\.setValueAtTime\\(${NUM},\\[${NUM},${NUM}\\]\\);`, 'g');

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
  const labels = []; for (let k = 0, n = Math.floor(rng() * 6); k < n; k++) labels.push({ id: 'l' + k, txt: String(10 + k), x: 400 + k * 150, y: 300 + k * 40, fill: pick(cols), style: rng() < 0.35 ? 'leader' : 'plain', off: rng() < 0.15 ? 1 : 0 });
  const mtns = []; for (let k = 0, n = Math.floor(rng() * 4); k < n; k++) mtns.push({ id: 'm' + k, txt: '산' + k, col: pick(cols), off: rng() < 0.15 ? 1 : 0 });
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
  const cam = rng() < 0.2 ? [{ id: 'c1', t: 0.5, x: 1000, y: 500, s: 1.02 }, { id: 'c2', t: 3, x: 1100, y: 520, s: 1.3 }] : [];
  const S = { style, res, map: { x: 1160, y: 545, s: 1.02 }, legend: { on: rng() < 0.5 ? 1 : 0, auto: 0, items: [] }, vfBar: { on: rng() < 0.5 ? 1 : 0 },
    texts, labels, mtns, fillsByStyle: { [style]: F }, brushByStyle: { [style]: strokes },
    anim: { dur: pick([2, 4, 6, 7.5, 10]), fps: FPS, reveal: pick(['dissolve', 'blinds']), blindSize: 8, blindAngle: -45, tracks, cam: { keys: cam } } };
  return { S, warnDefs };
}
const PTS = (n) => Array.from({ length: n }, (_, i) => ({ lon: 140 - i, lat: 15 + i, label: (20 + i) + '일', ws: 20 + i, r15: 100 + i * 10 }));
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
      compareArr.push({ id: 'cf' + k, name: 'F' + k, color: pick(['#FF5A5A', '#5AC8FF', '#FFC400', '#3FB27F']), show: rng() < 0.85 ? 1 : 0, labels: [{ idx: 1, txt: 'A', x: 900, y: 400 }] });
      if (rng() < 0.6) tracks.push({ id: 'kc' + k, kind: 'typcmp', key: 'cf' + k, start: tm(0, 4), len: r4(0.6 + rng() * 2) });
    }
  }
  const keys = [];
  if (!compare && rng() < 0.6) for (let k = 0, m = 1 + Math.floor(rng() * 4); k < m; k++) keys.push({ id: 'c' + k, t: tm(0, 6), x: r4(1000 + rng() * 300), y: r4(480 + rng() * 120), s: rng() < 0.3 ? 1.02 : r4(0.9 + rng() * 0.6), rx: 0, ry: 0, rz: 0 });
  const S = { style: compare ? 'typhoonCompare' : 'typhoon', res: pick(['1920x1080', '2158x1214', '1920x1080-vf']), map: { x: 1160, y: 545, s: 1.02 }, labels: [],
    texts: rng() < 0.6 ? [{ id: 'x1', txt: '태풍', x: 120, y: 120, size: 60, col: '#FFFFFF' }] : [], legend: { on: rng() < 0.4 ? 1 : 0 },
    typhoon: { iconCol: '#E5231E', issues: [{ points: pts }], labels, nowIdx: Math.floor(rng() * n), trackMode: !compare && rng() < 0.25 ? 'line' : 'full', places: [], compare: compareArr },
    anim: { dur: pick([3, 6, 8]), fps: FPS, reveal: 'dissolve', tracks, cam: { keys } } };
  return { S };
}

// ===================== 기대값(저장 데이터에서 직접) =====================
// 일반 지도 — 아래(뒤)→위(앞) 레이어와 페이드. 트랙 있음 = 그 시작·길이, 트랙 없음 = 처음부터(페이드 없음), 브러쉬만 앱 기본 구간.
function expectGeneral(S, warnDefs, tracks) {
  const find = (kind, key, ci) => tracks.find((t) => t.kind === kind && (ci ? up(t.key) === up(key) : t.key === key)) || null;
  const fd = (tr) => (tr ? { start: r4(tr.start), len: r4(Math.max(0.01, tr.len)) } : null);
  const out = [{ tag: 'base', fade: null }];
  if (warnDefs.length) for (const d of warnDefs) out.push({ tag: 'wrn:' + d.key, fade: fd(find('fill', d.col, 1)) });
  else for (const c of [...new Set(Object.values(S.fillsByStyle[S.style]).map(up))].sort((a, b) => lum(b) - lum(a))) out.push({ tag: 'fill:' + c, fade: fd(find('fill', c, 1)) });
  const fillStarts = tracks.filter((t) => t.kind === 'fill').map((t) => +t.start);
  const firstFill = fillStarts.length ? Math.min(...fillStarts) : 0.8;
  for (const c of [...new Set(S.brushByStyle[S.style].filter((s) => !s.erase).map((s) => up(s.col)))]) {
    const tr = find('brush', c, 1);
    out.push({ tag: 'brush:' + c, fade: tr ? fd(tr) : { start: 0, len: r4(Math.max(firstFill, 0.8)) } });
  }
  out.push({ tag: 'lines', fade: null });
  const mt = S.mtns.filter((m) => !m.off);
  if (mt.length) out.push({ tag: 'mtnBase', fade: null });
  for (const m of mt) out.push({ tag: 'mtn:' + m.id, fade: fd(find('mtn', m.id)) });
  for (const b of S.labels.filter((x) => !x.off)) {
    const f = fd(find('label', b.id));
    if (b.style === 'leader') out.push({ tag: 'leader:' + b.id, fade: f });
    out.push({ tag: 'labelbg:' + b.id, fade: f && Object.assign({}, f, { rise: riseOf(S.res) }) });
  }
  if (S.res === '1920x1080-vf' && S.vfBar.on) out.push({ tag: 'vfbar', fade: null });
  for (const t of S.texts.filter((x) => !x.off)) out.push({ tag: 'title:' + t.txt, fade: null });
  if (S.legend.on) out.push({ tag: 'legend', fade: null });
  return out;
}

async function runGeneral(seed) {
  const { S, warnDefs } = genGeneral(seed);
  const A = S.anim, tag = `[일반 seed=${seed} ${S.style} ${S.res}]`;
  const { ctx, caps, send } = aeCtx(S, { warnDefs });
  const auto = !A.tracks.length && !A.cam.keys.length ? ctx.autoTrackPlan() : null;
  const tracks = auto ? auto.tracks : A.tracks;
  const spec = await send();
  assert.ok(spec, tag + ' 스펙 없음 ' + caps.status.join(' / '));
  // 1) 레이어 순서·페이드 = 저장 데이터의 트랙 값
  const exp = expectGeneral(S, warnDefs, tracks);
  const got = spec.layers.map((l) => ({ tag: tagOf(l, caps.frames), fade: l.fade || null }));
  assert.deepEqual(got.map((x) => x.tag), exp.map((x) => x.tag), tag + ' 레이어 순서');
  got.forEach((g, i) => {
    const e = exp[i].fade;
    if (!e) { assert.equal(g.fade, null, tag + ' ' + g.tag + ' 페이드 없음(처음부터 보임)'); return; }
    assert.ok(g.fade, tag + ' ' + g.tag + ' 페이드 있어야');
    close(g.fade.start, e.start, 1e-9, tag + ' ' + g.tag + ' 시작'); close(g.fade.len, e.len, 1e-9, tag + ' ' + g.tag + ' 길이');
    if (e.rise != null) close(g.fade.rise, e.rise, 1e-9, tag + ' ' + g.tag + ' rise'); else assert.equal(g.fade.rise, undefined);
  });
  // 2) 타임라인 막대(화면이 막대를 놓는 값 tlSpanNow || implicit)와 레이어 쌓는 순서 = 계획의 역순
  const plan = [...ctx.tlLayerPlan({ tracks })];
  assert.deepEqual(plan.slice().reverse().flatMap((L) => planTags(L, S)), exp.map((x) => x.tag), tag + ' AE 쌓는 순서 = 타임라인 행의 역순');
  for (const L of plan) {
    const tags = planTags(L, S); if (!tags.length || L.kind === 'static') continue;
    const bar = ctx.tlSpanNow(L) || L.implicit;
    for (const t of tags) {
      const g = got.find((x) => x.tag === t);
      if (!bar) { assert.equal(g.fade, null, tag + ' ' + t + ' 막대 없음 = 페이드 없음'); continue; }
      close(g.fade.start, bar[0], 1e-4, tag + ' ' + t + ' 막대 시작'); close(g.fade.start + g.fade.len, Math.max(bar[1], bar[0] + 0.01), 1e-4, tag + ' ' + t + ' 막대 끝');
    }
  }
  // 3) VF 진입·컴프
  assert.deepEqual(spec.vfEnter, S.res === '1920x1080-vf' ? { start: 1, len: 1.2, dx: 256 } : null, tag + ' VF 진입');
  const k = outK(S.res);
  assert.equal(spec.comp.w, k.W); assert.equal(spec.comp.h, k.H); assert.equal(spec.comp.fps, FPS);
  const durBase = auto ? Math.max(A.dur, auto.dur) : A.dur;
  checkDur(spec, durBase, exp.filter((x) => x.fade).map((x) => x.fade.start + x.fade.len).concat(S.res === '1920x1080-vf' ? [2.2] : []), tag);
  assert.ok(!spec.layers.some((l) => l.typhoonRig || l.camera), tag + ' 일반 지도 카메라는 안 보냄(행에 AE 차이)');
  // 4) AE 키프레임(헬퍼 JSX) — 레이어마다 불투명도 키 = 막대 시작·끝, 라벨 위치 키 = 26px 아래 → 제자리, inPoint = 시작
  const jsx = jsxOf(spec);
  close(jsxComp(jsx).dur, spec.comp.dur, 1e-6, tag + ' JSX 컴프 길이');
  spec.layers.forEach((l, i) => {
    const f = jsxFade(jsx, i);
    if (!l.fade) { assert.equal(f, null, tag + ` L${i} 키 없음`); return; }
    close(f[0], l.fade.start, 1e-6, tag + ` L${i} 키1`); close(f[1], l.fade.start + l.fade.len, 1e-6, tag + ` L${i} 키2`);
    const ip = jsxInPoint(jsx, i); if (l.fade.start > 0.001) close(ip, l.fade.start, 1e-6, tag + ` L${i} inPoint`); else assert.equal(ip, null);
    if (l.labelComp) { const r = jsxRise(jsx, i); close(r.s, l.fade.start, 1e-6); close(r.e, l.fade.start + l.fade.len, 1e-6); close(r.y0 - r.y1, l.fade.rise, 1e-5, tag + ' rise 키'); }
  });
  if (spec.vfEnter) { const m = /pp\.setValueAtTime\((-?[\d.]+),\[cc\[0\]\+(-?[\d.]+),cc\[1\]\]\);pp\.setValueAtTime\((-?[\d.]+),cc\);/.exec(jsx); close(+m[1], 1, 1e-6); close(+m[3], 2.2, 1e-6); }
  return { auto: !!auto, n: spec.layers.length };
}

async function runTyphoon(seed, compare) {
  const { S } = genTyphoon(seed, compare);
  const A = S.anim, tag = `[${compare ? '비교' : '태풍'} seed=${seed} ${S.res} ${S.typhoon.trackMode}]`;
  const { ctx, caps, send } = aeCtx(S);
  const auto = !A.tracks.length && !A.cam.keys.length ? ctx.autoTrackPlan() : null;
  const tracks = auto ? auto.tracks : A.tracks;
  const tt0 = tracks.find((x) => x.kind === 'typhoon') || null;
  const spec = await send();
  assert.ok(spec, tag + ' 스펙 없음 ' + caps.status.join(' / '));
  const tt = tt0 && (auto ? ctx.ensureTyphoonKeys(JSON.parse(JSON.stringify(tt0))) : tt0);   // 태풍 키는 계획이 채운 값(화면 하위 행과 같은 값)
  const k = outK(S.res), SX = (v) => +(v * k.kx).toFixed(1), SY = (v) => +(v * k.ky).toFixed(1);
  const titles = S.texts.map((t) => 'title:' + t.txt);
  const ends = S.res === '1920x1080-vf' ? [2.2] : [];
  const jsx = jsxOf(spec);
  const plan = [...ctx.tlLayerPlan({ tracks })];
  if (!compare) {
    assert.deepEqual(spec.layers.map((l) => tagOf(l, caps.frames)), ['typhoonRig', ...titles, ...(S.legend.on ? ['legend'] : [])], tag + ' 레이어');
    const rig = spec.layers[0].typhoonRig;
    // 경로 = 경로 막대 [ps, pe]
    if (tt) { close(rig.reveal.start, tt.ps, 1e-9, tag + ' 경로 시작'); close(rig.reveal.path, Math.max(F1, tt.pe - tt.ps), 1e-9, tag + ' 경로 길이'); }
    else { assert.equal(rig.reveal.start, 0); close(rig.reveal.path, F1, 1e-12); }
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
        if (c.kind === 'typPath') { close(rig.reveal.start, bar[0], 1e-9); close(rig.reveal.start + rig.reveal.path, Math.max(bar[1], bar[0] + F1), 1e-9); }
        else { const l = rig.labels[vis.findIndex((b) => b.id === c.key)]; close(l.revStart, bar[0], 1e-9, tag + ' 라벨 막대'); close(l.revStart + l.revLen, Math.max(bar[1], bar[0] + 0.05), 1e-9); }
      }
    } else assert.equal(ctx.tlSpanNow(typ), null, tag + ' 트랙 없음 = 막대 없음(처음부터 보임)');
    // 카메라 = 카메라 키(시각 순, 출력 배율), 기준 = 작업 뷰
    const ks = S.anim.cam.keys.slice().sort((a, b) => a.t - b.t);
    if (ks.length) {
      assert.deepEqual(rig.camera, { anchor: [SX(1160), SY(545)], sBaked: 1.02, keys: ks.map((q) => ({ t: q.t, x: SX(q.x), y: SY(q.y), s: q.s })) }, tag + ' 카메라');
      for (const q of ks) ends.push(q.t);
      const P = [...jsx.matchAll(CAMP)].map((m) => [+m[1], +m[2], +m[3]]), Sc = [...jsx.matchAll(CAMS)].map((m) => [+m[1], +m[2]]);
      assert.equal(P.length, ks.length); assert.equal(Sc.length, ks.length);
      ks.forEach((q, i) => { close(P[i][0], q.t); close(P[i][1], SX(q.x), 1e-6); close(P[i][2], SY(q.y), 1e-6); close(Sc[i][0], q.t); close(Sc[i][1], q.s / 1.02 * 100, 1e-6); });
      // AE 차이 표시: 확대가 작업 뷰와 다르면 카메라 행에 안내
      const camRow = plan.find((L) => L.kind === 'camera');
      assert.equal(camRow.diff.some((d) => d.includes('확대한 만큼')), ks.some((q) => Math.abs(q.s / 1.02 - 1) > 0.01), tag + ' 확대 차이 안내');
    } else { assert.equal(rig.camera, undefined); assert.ok(!/CAM\.property/.test(jsx)); }
    // AE 키프레임: 경로선 Trim = [경로 시작, 끝], 라벨 지시선 Trim 시작 = 라벨 시작
    const trims = jsxTrims(jsx, '\\uacbd\\ub85c');
    if (trims.length && tt) { close(Math.min(...trims.map((t) => t[0])), rig.reveal.start, 1e-6, tag + ' 경로선 키1'); close(Math.max(...trims.map((t) => t[1])), rig.reveal.start + rig.reveal.path, 1e-6, tag + ' 경로선 키2'); }
    else if (trims.length) assert.ok(trims.every((t) => t[0] <= F1 + 1e-6 && t[1] <= t[0] + 0.3 + 1e-6), tag + ' 트랙 없음 = 처음부터(헬퍼 최소 길이 0.3초 안에 다 그림)');
    const lt = jsxTrims(jsx, '\\uc9c0\\uc2dc\\uc120');
    assert.equal(lt.length, rig.labels.length);
    rig.labels.forEach((l, i) => { close(lt[i][0], l.revStart, 1e-6, tag + ' 라벨 지시선 키1'); close(lt[i][1], l.revStart + l.revLen * 0.66, 1e-6); });
  } else {
    assert.deepEqual(spec.layers.map((l) => tagOf(l, caps.frames)), ['compareRig', ...titles, ...(S.legend.on ? ['legend'] : [])], tag + ' 레이어');
    const cr = spec.layers[0].compareRig;
    // 비교 예보 막대 — 트랙 있음 = 그 막대, 없음 = 메인 경로 막대, 그것도 없으면 처음부터
    const spans = S.typhoon.compare.filter((c) => c.show).map((c) => { const tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id); return tr ? [tr.start, tr.start + tr.len] : tt ? [tt.ps, tt.pe] : null; }).filter(Boolean);
    if (spans.length) {
      const a = Math.min(...spans.map((s) => s[0])), p = Math.max(F1, Math.max(...spans.map((s) => s[1])) - a);
      close(cr.reveal.start, a, 1e-9, tag + ' 비교 시작'); close(cr.reveal.path, p, 1e-9, tag + ' 비교 길이'); close(cr.reveal.labelLen, r4(Math.min(1, Math.max(0.2, p * 0.2))), 1e-9);
      // 막대가 서로 다르거나(0.01초 넘게) 타이밍 없는 예보가 섞이면 AE에선 한 타이밍 → 행마다 AE 차이 안내
      const all = S.typhoon.compare.filter((c) => c.show).map((c) => { const tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id); return tr ? [tr.start, tr.start + tr.len] : tt ? [tt.ps, tt.pe] : null; });
      const differ = all.some((s) => !s) || all.some((s) => Math.abs(s[0] - all[0][0]) > 0.01 || Math.abs(s[1] - all[0][1]) > 0.01);
      for (const L of plan.filter((x) => x.kind === 'typcmp' && !x.dim)) assert.equal(L.diff.length > 0, differ, tag + ' 비교 타이밍 차이 안내');
    } else { assert.equal(cr.reveal.start, 0); close(cr.reveal.path, F1, 1e-12); }
    ends.push(cr.reveal.start + cr.reveal.path + cr.reveal.labelLen);
    // 타임라인 비교 행 막대 = 위 spans
    for (const L of plan.filter((x) => x.kind === 'typcmp')) {
      const c = S.typhoon.compare.find((q) => q.id === L.key), tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id);
      const bar = ctx.tlSpanNow(L) || L.implicit, want = tr ? [tr.start, tr.start + tr.len] : tt ? [tt.ps, tt.pe] : null;
      if (!want) assert.equal(bar, null); else { close(bar[0], want[0], 1e-9); close(bar[1], want[1], 1e-9); }
    }
    assert.ok(!plan.some((L) => L.kind === 'typhoon'), tag + ' 비교 지도엔 태풍 경로 행 없음');
    // AE 키프레임: 비교선 Trim = [시작, 시작+길이]
    for (const t of jsxTrims(jsx, '\\ube44\\uad50\\uc120')) { close(t[0], cr.reveal.start, 1e-6, tag + ' 비교선 키1'); close(t[1], cr.reveal.start + cr.reveal.path, 1e-6, tag + ' 비교선 키2'); }
  }
  const durBase = auto ? Math.max(A.dur, auto.dur) : A.dur;
  checkDur(spec, durBase, ends, tag);
  close(jsxComp(jsx).dur, spec.comp.dur, 1e-6);
  assert.deepEqual(spec.vfEnter, S.res === '1920x1080-vf' ? { start: 1, len: 1.2, dx: 256 } : null);
  return { auto: !!auto };
}

// ===================== 테스트 =====================
test('팔레트 색 밝기가 서로 다르다(칠 레이어 순서 기대값이 모호하지 않게)', () => {
  assert.equal(new Set(PAL.map((c) => lum(c).toFixed(3))).size, PAL.length);
});
test('손으로 만든 예 — 칠 2.5초/1.3초 막대 → AE 불투명도 키 2.5→3.8초, 라벨 3.1/0.7 → 키 3.1→3.8·26px 위치 키, 막대 없는 라벨은 키 없음', async () => {
  const S = { style: 'sgg', res: '1920x1080', map: { x: 1160, y: 545, s: 1.02 }, legend: { on: 0 }, vfBar: { on: 0 }, texts: [], mtns: [],
    labels: [{ id: 'a', txt: '10', x: 500, y: 300, fill: '#FA9A8C', style: 'plain' }, { id: 'b', txt: '20', x: 700, y: 300, fill: '#FA9A8C', style: 'leader' }],
    fillsByStyle: { sgg: { z1: '#FA9A8C', z2: '#8A0A02' } }, brushByStyle: { sgg: [] },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', tracks: [{ id: 'k1', kind: 'fill', key: '#FA9A8C', start: 2.5, len: 1.3 }, { id: 'k2', kind: 'label', key: 'a', start: 3.1, len: 0.7 }], cam: { keys: [] } } };
  const { caps, send } = aeCtx(S);
  const spec = await send();
  const by = (t) => spec.layers.findIndex((l) => tagOf(l, caps.frames) === t);
  assert.deepEqual(spec.layers.map((l) => tagOf(l, caps.frames)), ['base', 'fill:#FA9A8C', 'fill:#8A0A02', 'lines', 'labelbg:a', 'leader:b', 'labelbg:b']);
  assert.deepEqual(spec.layers[by('fill:#FA9A8C')].fade, { start: 2.5, len: 1.3 });
  assert.equal(spec.layers[by('fill:#8A0A02')].fade, null, '막대 없는 색 = 처음부터');
  assert.deepEqual(spec.layers[by('labelbg:a')].fade, { start: 3.1, len: 0.7, rise: 26 });
  assert.equal(spec.layers[by('labelbg:b')].fade, null);
  assert.equal(spec.comp.dur, 6);
  const jsx = jsxOf(spec);
  assert.ok(jsx.includes(`fadeL(L${by('fill:#FA9A8C')},2.500000,3.800000);`), 'AE 칠 키');
  assert.ok(jsx.includes(`fadeL(L${by('labelbg:a')},3.100000,3.800000);`), 'AE 라벨 키');
  assert.ok(jsx.includes(`p.setValueAtTime(3.100000,[500.000000,326.000000]);p.setValueAtTime(3.800000,[500.000000,300.000000]);`), 'AE 라벨 올라오기');
  assert.ok(!jsx.includes(`fadeL(L${by('fill:#8A0A02')},`));
  assert.ok(jsx.includes('addComp("WeatherCG_T",1920,1080,1.0,6.000000,29.970000)'));
});
test('무작위 일반 지도 200개(시군·특보·VF·터치, 트랙 섞임·없음·사라진 대상) — 스펙·AE 키 = 타임라인 값', async () => {
  let autoN = 0, n = 0;
  for (let seed = 1; seed <= 200; seed++) { const r = await runGeneral(seed); autoN += r.auto ? 1 : 0; n += r.n; }
  assert.ok(autoN > 8 && autoN < 70, '트랙 없음(자동 구성 타이밍) 경우도 섞여야: ' + autoN);
  assert.ok(n > 1300, '레이어 수 ' + n);
});
test('무작위 단일 태풍 150개(라인/일반·카메라 0~4키·트랙 없음) — 경로·라벨·카메라 키 = 타임라인 값', async () => {
  let autoN = 0;
  for (let seed = 1001; seed <= 1150; seed++) autoN += (await runTyphoon(seed, false)).auto ? 1 : 0;
  assert.ok(autoN > 3, '자동 구성 경우 ' + autoN);
});
test('무작위 태풍 비교 100개 — 비교 리그 타이밍 = 비교 예보 막대(가장 이른 시작~가장 늦은 끝), 다르면 행에 AE 차이', async () => {
  for (let seed = 2001; seed <= 2100; seed++) await runTyphoon(seed, true);
});
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
      if (r.leaderSame != null) assert.equal(r.leaderSame, true, rt + ' 지시선 레이어 = 라벨 막대 타이밍');
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
    // AE 키(헬퍼 JSX)
    const jsx = jsxOf(sc.spec);
    sc.spec.layers.forEach((l, i) => { const f = jsxFade(jsx, i); if (l.fade) { close(f[0], l.fade.start); close(f[1], l.fade.start + l.fade.len); } else assert.equal(f, null); });
    if (sc.typ) {
      const rig = sc.spec.layers.find((l) => l.typhoonRig).typhoonRig;
      close(rig.reveal.start, sc.typ.path[0], 1e-9); close(rig.reveal.start + rig.reveal.path, sc.typ.path[1], 1e-9);
      assert.equal(frameOf(sc.typ.pathVin), Math.round(rig.reveal.start * fps + 1e-6));
      close(sc.typ.pathLeft, 12 + rig.reveal.start * sc.typ.pps, 0.6, tag + ' 경로 막대 left'); close(sc.typ.pathWidth, Math.max(3, rig.reveal.path * sc.typ.pps), 0.6, tag + ' 경로 막대 폭');
      assert.ok(sc.typ.camKeyLefts.length === sc.typ.camT.length);
      for (const [t, left] of sc.typ.camKeyLefts) close(left, 12 + t * sc.typ.pps, 0.6, tag + ' 카메라 키 자리');
      for (const lb of sc.typ.labs) { const l = rig.labels.find((q) => q.idx === lb.idx); close(l.revStart, lb.span[0], 1e-9); close(l.revStart + l.revLen, lb.span[1], 1e-9); }
      assert.deepEqual(rig.camera.keys.map((q) => q.t), sc.typ.camT);
      const P = [...jsx.matchAll(CAMP)].map((m) => +m[1]);
      assert.deepEqual(P.map((v) => +v.toFixed(4)), sc.typ.camT.map((v) => +v.toFixed(4)), tag + ' AE 카메라 키 시각');
      assert.ok(sc.typ.camDiff.some((d) => d.includes('확대한 만큼')), tag + ' 카메라 확대 차이 안내');
    }
  }
});

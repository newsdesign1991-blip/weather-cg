// AE식 타임라인 — 레이어 계획(화면·AE 공용)·시간 도우미(프레임·타임코드·입력)·끌기 계산·저장 안전·자동 구성 확인·AE 스펙 계약.
// 실제 앱 소스를 tools/app-source.cjs로 합쳐 함수를 잘라 vm에서 돌린다(tests/tl-plan-ctx.cjs). 실제 앱 조작은 timeline-ae.boot.test.cjs(WCG_BOOT_CHECK=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const { planCtx, html, fnSrc } = require('./tl-plan-ctx.cjs');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const arr = (x) => [...x];   // vm(다른 realm) 배열 → 이 realm 배열(deepEqual용)
const COLS = { dark: '#8A0A02', mid: '#FA2E1E', light: '#FFE7E3' };
const sggS = (over = {}) => Object.assign({
  style: 'sgg', res: '1920x1080', legend: { on: 1, auto: 0, items: [{ col: COLS.mid, txt: '80~100' }] },
  texts: [{ id: 'x1', txt: '내일~모레' }], labels: [{ id: 'l1', txt: '10', fill: COLS.light }, { id: 'l2', txt: '20', fill: COLS.mid, style: 'leader' }],
  mtns: [{ id: 'm1', txt: '설악산', col: '#8E6A8E' }], fillsByStyle: { sgg: { z1: COLS.dark, z2: COLS.mid, z3: COLS.light } },
  anim: { dur: 6, fps: 29.97, reveal: 'dissolve', tracks: [] },
}, over);

// ===================== 시간 도우미 =====================
test('프레임 양자화 — 29.97·25·59.94·23.976, 소수 4자리', () => {
  for (const fps of [29.97, 25, 59.94, 23.976, 30]) {
    const c = planCtx(sggS({ anim: { dur: 6, fps, tracks: [] } }));
    for (const t of [0, 0.4, 1.5, 2.3333, 5.99]) {
      const q = c.tlQuant(t);
      close(q * fps, Math.round(q * fps), 2e-3);       // 프레임 경계
      assert.ok(Math.abs(q - t) <= 0.5 / fps + 1e-4);  // 가장 가까운 프레임
      assert.equal(String(q).split('.')[1] ? String(q).split('.')[1].length <= 4 : true, true);
    }
    assert.equal(c.tlQuant(-1), 0);
  }
});
test('타임코드 — 29.97은 드롭 프레임(;), 25는 :, 짧은 표기 초:프레임f', () => {
  const c = planCtx(sggS());
  assert.equal(c.tlFmtTC(45 / 29.97), '0;00;01;15');
  assert.equal(c.tlFramesToTC(1799), '0;00;59;29');
  assert.equal(c.tlFramesToTC(1800), '0;01;00;02');   // 1분에 00·01 두 번호를 건너뛴다(AE와 같음)
  assert.equal(c.tlFramesToTC(17982), '0;10;00;00');  // 10분마다는 건너뛰지 않는다
  assert.equal(c.tlFmtShort(45 / 29.97), '01:15f');
  const p = planCtx(sggS({ anim: { dur: 6, fps: 25, tracks: [] } }));
  assert.equal(p.tlFmtTC(37 / 25), '0:00:01:12');
  assert.equal(p.tlFmtShort(37 / 25), '01:12f');
});
test('시각 입력 — 1.5·1.5s·1:15·45f·+10·-5f·타임코드·프레임 모드, 못 읽으면 null', () => {
  const c = planCtx(sggS());
  close(c.tlParseTime('1.5'), 1.5);
  close(c.tlParseTime('1.5s'), 1.5);
  close(c.tlParseTime('1.5초'), 1.5);
  close(c.tlParseTime('1:15'), 45 / 29.97);
  close(c.tlParseTime('45f'), 45 / 29.97);
  close(c.tlParseTime('+10', 1), 1 + 10 / 29.97);       // AE: +10 = 10프레임 뒤
  close(c.tlParseTime('-5f', 1), 1 - 5 / 29.97);
  close(c.tlParseTime('+0.5s', 1), 1.5);
  close(c.tlParseTime('0;00;01;15'), 45 / 29.97);
  close(c.tlParseTime('0;01;00;02'), 1800 / 29.97);     // 드롭 프레임 역변환
  close(c.tlParseTime('45', 0, true), 45 / 29.97);       // 프레임 표기 모드면 맨 정수 = 프레임
  close(c.tlParseTime('2'), 2);
  assert.equal(c.tlParseTime('abc'), null);
  assert.equal(c.tlParseTime(''), null);
});

// ===================== 막대 끌기 계산 =====================
test('막대 끌기 — 이동(길이 유지·0 밑 금지)·왼쪽 끝(시작 자르기·끝 고정)·오른쪽 끝(길이), 모두 프레임 경계·최소 1프레임', () => {
  const c = planCtx(sggS()), f1 = 1 / 29.97;
  let [a, b] = arr(c.tlDragCalc('move', [1, 1.8], 0.5)); close(a, c.tlQuant(1.5)); close(b - a, 0.8, 1e-4);
  [a, b] = arr(c.tlDragCalc('move', [1, 1.8], -5)); assert.equal(a, 0); close(b, 0.8, 1e-4);
  [a, b] = arr(c.tlDragCalc('l', [1, 1.8], 0.3)); close(a, c.tlQuant(1.3)); assert.equal(b, 1.8);
  [a, b] = arr(c.tlDragCalc('l', [1, 1.8], 5)); close(a, 1.8 - f1, 1e-3); assert.equal(b, 1.8);   // 최소 1프레임
  [a, b] = arr(c.tlDragCalc('r', [1, 1.8], -5)); assert.equal(a, 1); close(b, 1 + f1, 1e-3);
  [a, b] = arr(c.tlDragCalc('r', [1, 1.8], 0.2)); close(b, c.tlQuant(2.0));
});

// ===================== 레이어 계획 =====================
test('계획 순서 = AE 순서(위=앞): 범례·제목 → 라벨(뒤→앞) → 산 → 산(바탕) → 경계선 → 브러쉬 → 칠(어두운→밝은) → 배경', () => {
  const S = sggS({ brushByStyle: { sgg: [{ col: '#2E6FB0', dabs: [] }, { col: COLS.mid, dabs: [] }] } });
  const c = planCtx(S);
  const ids = arr(c.tlLayerPlan()).map((L) => L.id);
  assert.deepEqual(ids, ['st:legend', 'st:title:x1', 'label:l2', 'label:l1', 'mtn:m1', 'st:mtnBase', 'st:lines',
    'brush:' + COLS.mid, 'brush:#2E6FB0', 'fill:' + COLS.dark, 'fill:' + COLS.mid, 'fill:' + COLS.light, 'st:bg']);
  const P = arr(c.tlLayerPlan()), by = (id) => P.find((L) => L.id === id);
  assert.equal(by('fill:' + COLS.mid).name, '80~100', '칠 이름 = 범례 글자');
  assert.equal(by('fill:' + COLS.mid).note, COLS.mid, 'hex는 보조 글자');
  assert.equal(by('fill:' + COLS.dark).name, COLS.dark, '범례에 없으면 hex');
  assert.equal(by('label:l2').note, '지시선');
  // 트랙이 없으면 track:null(처음부터 보임)·끌어서 만들 수 있음, 브러쉬는 앱 기본 페이드 구간(0~첫 칠)
  assert.equal(by('label:l1').track, null); assert.equal(by('label:l1').animatable, true);
  assert.deepEqual(arr(by('brush:#2E6FB0').implicit), [0, 0.8]);
  for (const L of P.filter((x) => x.kind === 'static')) assert.equal(L.animatable, false);
});
test('계획 — 트랙 있음은 span, 지도에서 사라진 색·지운 라벨의 트랙은 흐린 행(지우지 않음), 옛 text 트랙은 자물쇠 행', () => {
  const S = sggS();
  S.anim.tracks = [
    { id: 'k1', kind: 'fill', key: COLS.mid, start: 1.2, len: 0.8 },
    { id: 'k2', kind: 'fill', key: '#123456', start: 1, len: 0.8 },        // 지도에 없는 색
    { id: 'k3', kind: 'label', key: 'gone', start: 2, len: 1 },            // 지운 라벨
    { id: 'k4', kind: 'text', key: 'x1', start: 0, len: 1 },               // 옛 데이터
  ];
  const P = arr(planCtx(S).tlLayerPlan()), by = (id) => P.find((L) => L.id === id);
  assert.deepEqual(arr(by('fill:' + COLS.mid).span), [1.2, 2.0]);
  assert.equal(by('gone:fill:#123456').gone, true);
  assert.equal(by('gone:label:gone').gone, true);
  assert.equal(by('text:x1').kind, 'oldText');
  assert.equal(P[P.length - 1].id, 'st:bg', '배경이 맨 아래');
});
test('계획 — 특보 지도는 특보 정의 순서(우선순위 높은 것이 위), 같은 색 특보는 같은 트랙', () => {
  const defs = [{ key: 'a', name: '건조_주의보', col: '#FFD24A', rank: 5 }, { key: 'b', name: '호우_경보', col: '#C81306', rank: 1 }];
  const S = sggS({ style: 'warn', fillsByStyle: { warn: { z1: '#C81306' } } });
  S.anim.tracks = [{ id: 'k1', kind: 'fill', key: '#C81306', start: 1.5, len: 1 }];
  const P = arr(planCtx(S, { warnDefs: defs }).tlLayerPlan()).filter((L) => L.kind === 'fill');
  assert.deepEqual(P.map((L) => L.name), ['호우 경보', '건조 주의보']);   // defs는 아래→위 순 — 계획은 위→아래
  assert.deepEqual(arr(P[0].span), [1.5, 2.5]);
  assert.equal(P[1].track, null);
  assert.match(fnSrc('tlLayerPlan'), /const defs = warn \? aeWarningFillDefs\(\) : \[\]/);
});
const PTS = Array.from({ length: 8 }, (_, i) => ({ lon: 130 + i, lat: 20 + i, label: i + '일' }));
const tyS = (over = {}) => Object.assign({
  style: 'typhoon', res: '1920x1080', labels: [], texts: [{ id: 'x1', txt: '태풍' }], legend: { on: 1 },
  typhoon: { iconCol: '#E5231E', issues: [{ points: PTS }], labels: [{ id: 'b1', idx: 2, txt: '2일' }, { id: 'b2', idx: 5, txt: '5일' }, { id: 'b3', idx: 3, txt: '3일', off: 1 }], places: [{ id: 'p1' }] },
  anim: { dur: 6, fps: 29.97, tracks: [{ id: 'k1', kind: 'typhoon', key: 'typhoon', start: 1, len: 3, ps: 1, pe: 3 }], cam: { keys: [] } },
}, over);
test('태풍 — 카메라(키 있을 때) · 범례 · 제목 · 태풍 경로(하위: 경로 + 보이는 라벨, 지점 순) · 지명표시 · 배경', () => {
  const S = tyS({ map: { x: 1160, y: 545, s: 1.02 } }); S.anim.cam.keys = [{ id: 'c1', t: 0.4, x: 1, y: 1, s: 1.02 }, { id: 'c2', t: 3, x: 2, y: 2, s: 1.02 }];
  const P = arr(planCtx(S).tlLayerPlan());
  assert.deepEqual(P.map((L) => L.id), ['cam', 'st:legend', 'st:title:x1', 'typ', 'st:place', 'st:bg']);
  const typ = P[3];
  assert.equal(typ.icon, 'typhoon'); assert.equal(P[0].icon, 'camera');
  assert.deepEqual(arr(typ.children).map((c) => c.id), ['typ:path', 'typ:lab:b1', 'typ:lab:b2']);   // 숨긴 b3 없음
  assert.deepEqual(arr(typ.children[0].span), [1, 3]);
  assert.equal(P[0].diff.length, 0, '태풍 단일 + 이동만(확대 = 작업 뷰) = AE 그대로');
});
test('카메라 AE 차이 — 확대가 작업 뷰와 다르면(AE는 구운 PNG·리그를 통째 확대), 키 3개+, 방향·기울기, 일반·비교 지도', () => {
  const S = tyS({ map: { x: 1160, y: 545, s: 1.02 } }); S.anim.cam.keys = [{ id: 'c1', t: 0.4, x: 1, y: 1, s: 1.02 }, { id: 'c2', t: 3, x: 2, y: 2, s: 1.35 }];
  let cam = arr(planCtx(S).tlLayerPlan())[0];
  assert.deepEqual(arr(cam.diff), ['AE에선 확대한 만큼 지도 그림(PNG)이 흐려지고 태풍 아이콘·선 굵기·지명표시도 같이 커집니다(화면은 크기 그대로)']);
  // 미리보기 중(S.map = 카메라 보간 뷰)이어도 기준은 작업 뷰(stateForSave)
  S.anim.cam.keys[0].s = 1.35; S.map.s = 1.35;   // 키가 모두 1.35 — 작업 뷰도 1.35면 차이 없음
  assert.equal(arr(planCtx(S).tlLayerPlan())[0].diff.length, 0);
  const c = planCtx(S); c._camSavedMap = { x: 1160, y: 545, s: 1.02, m3: null };   // 미리보기 중: S.map은 카메라 뷰(1.35), 작업 뷰는 1.02
  assert.equal(arr(c.tlLayerPlan())[0].diff.length, 1);
  S.map.s = 1.02; S.anim.cam.keys[0].s = 1.02;
  S.anim.cam.keys.push({ id: 'c3', t: 4, x: 3, y: 3, s: 1.02, rz: 12 });
  cam = arr(planCtx(S).tlLayerPlan())[0];
  assert.equal(cam.diff.length, 3);
  assert.ok(cam.diff.some((d) => d.includes('방향·기울기')) && cam.diff.some((d) => d.includes('3번째 키부터')));
  const g = sggS(); g.anim.cam = { keys: [{ id: 'c1', t: 1, x: 0, y: 0, s: 1 }] };
  assert.match(arr(planCtx(g).tlLayerPlan())[0].diff[0], /태풍 단일 지도만/);
});
test('지시선 라벨 — 막대가 있으면 AE 차이(지시선은 박스를 따라 올라오지 않음), 막대 없으면(처음부터 보임) 차이 없음', () => {
  const S = sggS(); S.anim.tracks = [{ id: 'k1', kind: 'label', key: 'l2', start: 1, len: 1 }, { id: 'k2', kind: 'label', key: 'l1', start: 1, len: 1 }];
  const P = arr(planCtx(S).tlLayerPlan());
  assert.match(P.find((L) => L.id === 'label:l2').diff[0], /지시선/);
  assert.equal(P.find((L) => L.id === 'label:l1').diff.length, 0, '일반 라벨은 AE와 같음');
  S.anim.tracks = [];
  assert.equal(arr(planCtx(S).tlLayerPlan()).find((L) => L.id === 'label:l2').diff.length, 0);
});
test('태풍 부모 끌기 = 경로·라벨 모두 같은 Δ, 라벨 하위 = 그 라벨 키만, 숨긴 라벨 키는 길이에서 빠지고 보존(B16)', () => {
  const S = tyS(); const c = planCtx(S);
  const typ = arr(c.tlLayerPlan()).find((L) => L.kind === 'typhoon');
  const tr = S.anim.tracks[0];
  tr.lab.b3 = { s: 9, e: 10 };   // 숨긴 라벨에 손본 키
  c.syncTyphoonSpan(tr);
  assert.ok(tr.start + tr.len < 9, '숨긴 라벨 키는 트랙 길이에 안 들어간다');
  const s0 = arr(c.tlSpanNow(typ)), lab0 = JSON.parse(JSON.stringify(tr.lab));
  c.tlSetSpan(typ, s0[0] + 0.5, s0[1] + 0.5);
  close(tr.ps, 1.5); close(tr.pe, 3.5);
  for (const id of Object.keys(lab0)) { close(tr.lab[id].s, lab0[id].s + 0.5); close(tr.lab[id].e, lab0[id].e + 0.5); }
  const lab = typ.children.find((k) => k.key === 'b2');
  c.tlSetSpan(lab, 4, 4.9);
  assert.deepEqual({ ...tr.lab.b2 }, { s: 4, e: 4.9 });
  // 숨김 → 다시 켜기: 키 그대로(지운 라벨만 정리)
  c.ensureTyphoonKeys(tr);
  assert.deepEqual({ ...tr.lab.b3 }, { s: 9.5, e: 10.5 });
  S.typhoon.labels = S.typhoon.labels.filter((b) => b.id !== 'b3');
  c.ensureTyphoonKeys(tr);
  assert.equal(tr.lab.b3, undefined, '지운 라벨 키는 정리');
});
test('비교 지도 — 효과 없는 \'태풍 경로\' 행 없음(B19), 트랙 없는 예보는 메인 경로 타이밍(implicit), 서로 다르면 AE 차이 표시', () => {
  const S = { style: 'typhoonCompare', res: '1920x1080', labels: [], texts: [], legend: { on: 0 },
    typhoon: { issues: [{ points: PTS }], labels: [], compare: [{ id: 'c1', name: 'KMA', color: '#FF5A5A', show: 1 }, { id: 'c2', name: 'JTWC', color: '#5AC8FF', show: 1 }] },
    anim: { dur: 6, fps: 29.97, tracks: [{ id: 'k1', kind: 'typhoon', key: 'typhoon', start: 1, len: 2, ps: 1, pe: 3 }, { id: 'k2', kind: 'typcmp', key: 'c1', start: 2, len: 1.5 }], cam: { keys: [] } } };
  const P = arr(planCtx(S).tlLayerPlan());
  assert.ok(!P.some((L) => L.kind === 'typhoon'));
  const c1 = P.find((L) => L.id === 'cmp:c1'), c2 = P.find((L) => L.id === 'cmp:c2');
  assert.deepEqual(arr(c1.span), [2, 3.5]); assert.equal(c2.track, null); assert.deepEqual(arr(c2.implicit), [1, 3]);
  assert.equal(c1.icon, 'typhoon2');
  assert.ok(c1.diff.length && c2.diff.length);
});
test('라인 모드 — 태풍 경로 하위에 라벨 행 없음', () => {
  const S = tyS(); S.typhoon.trackMode = 'line';
  const typ = arr(planCtx(S).tlLayerPlan()).find((L) => L.kind === 'typhoon');
  assert.deepEqual(arr(typ.children).map((c) => c.kind), ['typPath']);
});
test('트랙 없는 레이어를 끌면 그 시각에 기본 길이 트랙이 생긴다(B12) — 브러쉬는 앱 기본 구간, 비교 예보는 메인 경로 트랙도', () => {
  const S = sggS({ brushByStyle: { sgg: [{ col: '#2E6FB0', dabs: [] }] } });
  const c = planCtx(S); const P = arr(c.tlLayerPlan());
  const lab = P.find((L) => L.id === 'label:l1');
  const tr = c.tlEnsureTrack(lab, 2.017);
  // 시작·끝 모두 프레임 경계(기본 길이 1초 → 끝을 프레임에 맞춘 길이)
  close(tr.start, c.tlQuant(2.017)); close(tr.start + tr.len, c.tlQuant(tr.start + 1.0), 1e-4); assert.equal(tr.kind, 'label'); assert.equal(tr.key, 'l1');
  const br = c.tlEnsureTrack(P.find((L) => L.kind === 'brush'), 3);
  assert.equal(br.start, 0); close(br.len, c.tlQuant(0.8), 1e-4);
  // 자동 구성도 프레임 경계 — 시작·끝이 정수 프레임(AE 키프레임이 프레임 사이에 걸치지 않음)
  const onFrame = (t) => Math.abs(t * 29.97 - Math.round(t * 29.97)) < 0.01;
  for (const t of c.autoTrackPlan().tracks) assert.ok(onFrame(t.start) && onFrame(t.start + t.len), `${t.kind}:${t.key} ${t.start}+${t.len}`);
  const cmpS = { style: 'typhoonCompare', res: '1920x1080', labels: [], texts: [], legend: {}, typhoon: { issues: [{ points: PTS }], labels: [], compare: [{ id: 'c1', name: 'A', color: '#f00', show: 1 }] }, anim: { dur: 6, fps: 29.97, tracks: [], cam: { keys: [] } } };
  const cc = planCtx(cmpS); const row = arr(cc.tlLayerPlan()).find((L) => L.kind === 'typcmp');
  cc.tlEnsureTrack(row, 1);
  assert.deepEqual(cmpS.anim.tracks.map((t) => t.kind).sort(), ['typcmp', 'typhoon']);
});
test('Shift 스냅 대상 — 0·길이 끝·CTI·다른 막대 끝·카메라 키(끄는 것은 뺌), 문턱 안의 가장 가까운 값', () => {
  const S = sggS(); S.anim.tracks = [{ id: 'k1', kind: 'fill', key: COLS.mid, start: 1.2, len: 0.8 }, { id: 'k2', kind: 'label', key: 'l1', start: 2.5, len: 1 }];
  S.anim.cam = { keys: [{ id: 'c1', t: 4.2, x: 0, y: 0, s: 1 }] };
  const c = planCtx(S); c.tlHeadT = 3.3;
  const T = arr(c.tlSnapTargets(new Set(['label:l1'])));
  for (const v of [0, 6, 3.3, 1.2, 2.0, 4.2]) assert.ok(T.some((x) => Math.abs(x - v) < 1e-9), 'missing ' + v);
  assert.ok(!T.includes(2.5), '끄는 레이어 자신은 빼기');
  assert.equal(c.tlSnapNear(3.27, T, 0.05), 3.3);
  assert.equal(c.tlSnapNear(3.0, T, 0.05), null);
});

// ===================== 저장 안전·자동 구성 =====================
test('카메라 미리보기 중 저장·되돌리기 스냅샷 = 작업 뷰(B5), 평소엔 S 그대로', () => {
  const S = sggS({ map: { x: 1062, y: 599, s: 1.34 }, map3d: { on: 1, rx: 10, ry: 0, rz: 3 } });
  const c = planCtx(S);
  assert.equal(c.stateForSave(), S);
  c._camSavedMap = { x: 1160, y: 545, s: 1.02, m3: null };
  const o = c.stateForSave();
  assert.deepEqual({ ...o.map }, { x: 1160, y: 545, s: 1.02 });
  assert.equal(o.map3d.on, 0);
  assert.equal(S.map.x, 1062, 'S 자체는 안 바뀐다');
  assert.equal(o.labels, S.labels);
  assert.match(html, /const snap = \(\) => JSON\.parse\(JSON\.stringify\(typeof stateForSave === 'function' \? stateForSave\(\) : S\)\)/);
  assert.match(fnSrc('saveWork'), /JSON\.stringify\(stateForSave\(\)\)/);
  assert.match(fnSrc('saveProject'), /JSON\.parse\(JSON\.stringify\(stateForSave\(\)\)\)/);
});
test('자동 구성 다시 — 손본 트랙 수를 센다(B13): 계획과 같으면 0, 시작·길이·태풍 키가 다르면 센다', () => {
  const S = sggS(); const c = planCtx(S);
  const plan = c.autoTrackPlan();
  S.anim.tracks = JSON.parse(JSON.stringify(plan.tracks));
  assert.equal(c.animTouchedCount(plan), 0);
  S.anim.tracks[0].start += 0.5;
  assert.equal(c.animTouchedCount(plan), 1);
  const T = tyS(); const ct = planCtx(T); const tp = ct.autoTrackPlan();
  T.anim.tracks = JSON.parse(JSON.stringify(tp.tracks)); ct.ensureTyphoonKeys(T.anim.tracks[0]);
  assert.equal(ct.animTouchedCount(tp), 0);
  T.anim.tracks[0].lab.b1.s += 1;
  assert.equal(ct.animTouchedCount(tp), 1);
  assert.match(fnSrc('autoTracks'), /tossModal\(/);
  assert.match(fnSrc('applyAutoTrackPlan'), /mode === 'add'/);
});

// ===================== AE 스펙 = 화면 =====================
test('AE 보내기는 타임라인 계획을 그대로 쓴다 — 색 순서 재계산·1초 고정 없음, 트랙 없음 = 처음부터, 산마다 레이어, VF 1.2초, 태풍 카메라', () => {
  const send = html.slice(html.indexOf('async function sendToAE()'), html.indexOf('// 폴더를 물어보고'));
  assert.match(send, /const plan = tlLayerPlan\(\{ tracks \}\)/);
  assert.match(send, /const fadeOf = \(L\) => \{ const sp = L\.track \? \[\+L\.track\.start \|\| 0, \(\+L\.track\.start \|\| 0\) \+ \(\+L\.track\.len \|\| 0\)\] : L\.implicit; return sp \?/);
  assert.doesNotMatch(send, /AE_LEN|start0 \+ i \* step|startForFill|lumOf/, '옛 색 순서·1초 고정 계산이 남아 있으면 안 된다');
  assert.match(send, /for \(const L of plan\.slice\(\)\.reverse\(\)\)/);
  assert.match(send, /addImg\('산_' \+ String\(L\.name \|\| ''\)\.slice\(0, 8\), await aeMtnBlob\(false, L\.key\), fade\)/);
  assert.match(send, /vfEnter: \(S\.res === '1920x1080-vf'\) \? \{ start: ANIM_START, len: ANIM_VF_ENTER_LEN/);
  assert.match(send, /rig\.camera = \{ anchor: \[SX\(S\.map\.x\), SY\(S\.map\.y\)\], sBaked: \+S\.map\.s \|\| 1, keys: cks\.map/);
  assert.match(send, /const auto = \(!A\.tracks\.length && !camKeys\(\)\.length\) \? autoTrackPlan\(\) : null/);
  assert.match(send, /if \(wasPreview \|\| animPlaying\) \{ animStop\(\); animOff\(\); \}/, '미리보기 중이면 최종 모습·작업 뷰로 굽는다');
  assert.match(fnSource('async function aeMtnBlob('), /if \(id != null\) c\.querySelectorAll\('#L_mtn > g'\)/);
});
function fnSource(head) { const i = html.indexOf(head); return html.slice(i, html.indexOf('\n}', i) + 2); }

// ===================== 구조 =====================
test('타임라인 UI — 양끝 다이아·연결 바 없음, 아이콘은 SVG(이모지 없음), 키는 카메라 속성 줄에만(모래시계)', () => {
  const ui = html.slice(html.indexOf('const TL_ICONS = {'), html.indexOf('function tlWire('));   // timeline-ui.js ~ timeline-input.js
  assert.doesNotMatch(ui, /tlTypKey|tlCamBar|tlTypBar|tlCamRow/);
  assert.match(ui, /const TL_KEY_SVG = '<svg viewBox="0 0 12 12"/);
  for (const k of ['typhoon', 'typhoon2', 'camera', 'fill', 'brush', 'tag', 'mtn', 'path', 'title', 'legend', 'image', 'lines', 'pin', 'vf']) assert.match(ui, new RegExp(`\\n  ${k}: '<`), 'icon ' + k);
  // 버튼 라벨에 이모지 없음(타임라인 마크업·모듈)
  const tl = html.slice(html.indexOf('<div id="timeline"'), html.indexOf('<div class="camGuide"'));
  assert.doesNotMatch(tl + ui, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.doesNotMatch(tl, /✕/);
});
test('키보드는 새 리스너 없이 pointer-drag의 keydown이 맡긴다(브러쉬 [ ] 앞) — 포커스일 때만 ←/→가 타임라인 것(B18)', () => {
  const kd = html.slice(html.indexOf("if (cgSetupIsOpen()) return;   // CG 구성 창"), html.indexOf('// 브러쉬 크기: [ 줄이기'));
  assert.match(kd, /if \(\$\('#timeline'\)\?\.classList\.contains\('on'\) && tlKeydown\(e\)\) return;/);
  const k = fnSrc('tlKeydown');
  assert.match(k, /if \(!tlOwnsKeys\(\)\) return false;/);
  assert.ok(k.indexOf("code === 'Space'") < k.indexOf('if (!tlOwnsKeys()) return false;'), 'Space·Numpad0은 포커스와 무관');
  for (const key of ["'Home'", "'End'", "'PageDown'", "'ArrowRight'", "lk === 'k'", "k === '['", "lk === 'b'", "'Delete'", "k === ';'"]) assert.ok(k.includes(key), key);
});
test('되돌리기 기록은 끌기 첫 움직임에서 한 번(B10), 끌기 중 재생 멈춤(B9)·재생헤드 고정(B8)', () => {
  const g = fnSrc('tlDragGesture');
  assert.match(g, /if \(Math\.abs\(ev\.clientX - x0\) < 3 && Math\.abs\(ev\.clientY - y0\) < 3\) return; moved = true;/);
  const bar = fnSrc('tlStartBarDrag');
  assert.match(bar, /start: \(\) => \{\n\s*if \(tlState\.playing\) animStop\(\);[^\n]*\n\s*tlClosePopover\(\);\n\s*pushUndo\(\);/);
  assert.doesNotMatch(bar, /tlSetT\(|animSeek\(/, '막대 끌기는 재생헤드를 옮기지 않는다');
  assert.match(fnSrc('applyState'), /tlAfterStateApplied\(\)/);   // B3
});

// AE식 타임라인 — 실제 앱 점검(숨김 Electron). WCG_BOOT_CHECK=1 일 때만:  WCG_BOOT_CHECK=1 node --test tests/timeline-ae.boot.test.cjs
// 열기·자동 구성·행/아이콘, 조사 오류 재현(B1·B3·B4·B5·B8·B10·B18·B20), AE 스펙이 타임라인 값을 그대로 쓰는지.
// (CDP 실제 마우스·키 입력으로 B1~B20 전부를 다시 보는 도구는 desktop/test/tlperf/tlbugs.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('부팅 점검: AE식 타임라인 — 행·아이콘·오류 재현·AE 스펙', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), '--wait=7000', '--size=1600x1000', '--eval=' + path.join(__dirname, 'timeline-ae.boot-eval.js')], { encoding: 'utf8', timeout: 400000 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  // 행·아이콘 — 계획 행 = 화면 행, 레이어마다 SVG 아이콘, 옛 다이아·연결 바 없음
  assert.equal(o.sgg.rows, o.sgg.planN);
  assert.equal(o.sgg.icons, o.sgg.rows);
  assert.equal(o.sgg.old, 0);
  assert.equal(o.sgg.keys, 0, '카메라 키가 없으면 키 모양도 없다');
  assert.equal(o.sgg.names[0], '제목', '맨 위 = 제목(범례가 꺼져 있으면) — AE 쌓는 순서의 역');
  assert.ok(o.B20.cgBottom <= o.B20.tlTop, 'B20 무대가 타임라인 위에서 끝난다');
  assert.ok(o.B1.scrollTop > 0 && o.B1.aligned && o.B1.headSpans && o.B1.hOverflow <= 0, 'B1 ' + JSON.stringify(o.B1));
  close(o.B3.after, o.B3.s0); close(o.B3.left, o.B3.expect, 1.5); assert.ok(Math.abs(o.B3.moved - o.B3.left) > 20, 'B3 ' + JSON.stringify(o.B3));
  assert.equal(o.B10.u1, o.B10.u0, 'B10 클릭만으론 되돌리기 기록 없음');
  assert.equal(o.drag.undo, 1, '끌기 1번 = 되돌리기 1번');
  close(o.drag.frames, Math.round(o.drag.frames), 2e-3);
  close(o.drag.head1, o.drag.head0, 1e-9);   // B8
  assert.equal(o.B18.mapX1, o.B18.mapX0); close(o.B18.dt, 1 / 29.97, 1e-3); assert.equal(o.B18.undo, 0); close(o.B18.end, 6, 1e-6);
  assert.equal(o.B18.ownsWhenBlur, false);
  // AE = 화면
  assert.deepEqual(o.ae.fill, { start: 2.5, len: 1.3 });
  assert.deepEqual(o.ae.lab100, { start: 3.1, len: 0.7, rise: 26 });
  assert.equal(o.ae.lab101, null, '타이밍 없는 라벨 = 처음부터(페이드 없음)');
  assert.equal(o.ae.mtns.length, 2, '산마다 레이어');
  assert.ok(o.ae.mtns.some(([, f]) => f && f.start === 4 && f.len === 0.5));
  assert.ok(o.ae.mtnBase);
  assert.equal(o.ae.dur, 6);
  assert.equal(o.ae.order[0], '배경·지도');
  // 태풍 + 카메라
  assert.ok(o.typ.typIcon && o.typ.camIcon, '태풍 경로 = 태풍 아이콘, 카메라 = 카메라 아이콘');
  assert.deepEqual(o.typ.rows.slice(0, 5), ['cam', 'cam:pos', 'cam:s', 'cam:rz', 'cam:rx']);
  assert.equal(o.typ.keyEls, 8, '키 2개 × 속성 줄 4');
  assert.equal(o.typ.ticks, 2);
  assert.equal(o.typ.pathEdges, 2); assert.equal(o.typ.parentEdges, 0, '부모 막대는 몸통 끌기만(양끝 손잡이 없음)');
  assert.ok(o.B4.labelsKept && o.B4.saved, 'B4 Alt 팬은 라벨·작업 뷰를 안 옮긴다');
  assert.equal(o.B4.keys.length, 3, 'B4 그 시각에 카메라 키가 생긴다');
  assert.ok(o.B4.keys.some(([t]) => Math.abs(t - 2.002) < 0.01));
  assert.equal(o.B5.savedMap, o.B5.work0, 'B5 미리보기 중 자동 저장 = 작업 뷰');
  assert.ok(o.aeTyp.camera && o.aeTyp.camera.keys.length === 3, 'AE 태풍 리그에 카메라 키');
  assert.deepEqual(o.aeTyp.camera.anchor, [1160, 545]);
  assert.equal(o.aeTyp.camera.sBaked, 1.02);
});

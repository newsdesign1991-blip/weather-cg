// '이미지로 추출' 렌더 정확도 — 실제 앱(숨김 Electron)에서 항목마다 픽셀로 잰다. WCG_BOOT_CHECK=1 일 때만(일렉트론 필요·느림 약 8~12분).
//   WCG_BOOT_CHECK=1 node --test tests/export-render.test.cjs
// 본문은 tests/export-render.boot-eval.js(숫자만 돌려준다). 실패하면 그림은 개발용으로 window.__XR_DUMP=true 를 켜 받아 본다.
//  R1 편집용 레이어 다시 쌓기 = 전체 화면 · R2 항목 vs 화이트리스트 기준(섞인 것 0) · R3 색칠만 이음새 · R4 미리보기 상태 · R5 3D 기울기 ·
//  R6 태풍 · R7 크기·가장자리 · R8 저장 흐름 · R9 팝업
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const SKIP = process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)';
let R = null;
function run() {
  if (R) return R;
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=9000', '--size=1600x1000', '--keepalive', '--eval=' + path.join(__dirname, 'export-render.boot-eval.js')], { encoding: 'utf8', timeout: 1800000, maxBuffer: 1 << 26 });
  } catch (e) { raw = e.stdout || ''; }
  const j = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  assert.ok(j.evalResult && !j.evalResult.error, j.evalResult && j.evalResult.error);
  R = j.evalResult;
  return R;
}
const SCN = ['n_sgg', 'n_warnsea', 'n_seoul', 'n_typhoon', 't_sgg', 'v_warn', 'n_sgg_light'];
const EXACT = new Set(['bg', 'bgtext', 'sidoline', 'mtn', 'legend', 'title', 'vfbar', 'typhoon']);   // 기준과 픽셀까지 같아야 하는 항목(+ 수치 라벨)

test('R2·R7 항목마다 딱 그것만 — 기준에 없는 픽셀 0(칠 계열은 가장자리 안티에일리어싱만), 섞인 색 0, 크기', { skip: SKIP }, () => {
  const r = run();
  for (const id of SCN) {
    const s = r.scn[id]; assert.ok(s, id);
    for (const [k, v] of Object.entries(s.items)) {
      const at = `${id}/${k}`, c = v.cmp;
      assert.equal(v.size, true, `${at} 크기`);
      if (!c) continue;   // 전체 화면은 기준 = 자기 자신(영상 프레임과 같은 경로 — R5)
      assert.ok(c.tNZ > 0, `${at} 빈 그림`);
      if (k === 'fills') {   // 칠한 조각 합집합 '한 path' 마스크 — 래스터 방식 차이로 가장자리 한 겹이 옅게 다를 뿐(같은 색)
        assert.ok(c.out <= c.tNZ * 0.01 && c.outMax <= 80, `${at} 칠 바깥: ${JSON.stringify(c)}`);
        if (v.foreign) assert.ok(v.foreign.N <= 5, `${at} 칠한 색이 아닌 픽셀(선 등): ${JSON.stringify(v.foreign)}`);
      } else if (k === 'base' || k === 'map') {
        assert.ok(c.out <= 60 && c.outMax <= 64, `${at} 바깥: ${JSON.stringify(c)}`);
        assert.equal(v.paintLeak, 0, `${at} 칠한 색이 섞임`);
        assert.ok(c.colBig === 0, `${at} 색 다름: ${JSON.stringify(c)}`);
      } else {
        assert.equal(c.out, 0, `${at} 기준 밖 픽셀: ${JSON.stringify(c)}`);
        if (v.foreign) assert.ok(v.foreign.N <= 5, `${at} 선 색이 아닌 픽셀: ${JSON.stringify(v.foreign)}`);
      }
      if (EXACT.has(k) || k.startsWith('수치 라벨')) assert.deepEqual([c.extra, c.miss, c.col], [0, 0, 0], `${at} 기준과 다름: ${JSON.stringify(c)}`);
      // 투명 레이어 가장자리 — 글자·선·칠은 프레임 끝에 닿지 않는다
      if (EXACT.has(k) && !['bg', 'bgtext', 'vfbar'].includes(k) || k.startsWith('수치 라벨')) assert.equal(v.edge.nz, 0, `${at} 가장자리 알파`);   // 바다 구역·실루엣은 프레임 끝까지 갈 수 있다
    }
  }
});

test('R1 편집용 레이어를 쌓은 순서대로 합치면 전체 화면과 같다(글자 자리 밖)', { skip: SKIP }, () => {
  const r = run();
  for (const id of SCN) {
    const c = r.scn[id].recompose, at = id;
    assert.deepEqual([c.out, c.extra, c.miss], [0, 0, 0], `${at} 알파 다름: ${JSON.stringify(c)}`);
    // 남는 것은 칠 경계의 안티에일리어싱 한 겹(화면은 칠 사이 틈으로 배경이 비치고, 레이어는 틈이 없다) — 첫 측정 최대 0.51%(노말 VF, 지도가 작아 경계 비율이 큼)
    assert.ok(c.col <= c.rNZ * 0.01, `${at} 색 다른 픽셀: ${JSON.stringify(c)}`);
    assert.ok(c.colBig <= 400, `${at} 크게 다른 픽셀: ${JSON.stringify(c)}`);
  }
  assert.deepEqual(r.scn.n_sgg.recompose.keys, ['bg', 'base', 'fills', 'lines', 'mtn', 'labels', 'title', 'legend']);
  assert.deepEqual(r.scn.v_warn.recompose.keys, ['bg', 'base', 'fills', 'lines', 'mtn', 'vfbar', 'labels', 'title', 'legend']);
  assert.deepEqual(r.scn.n_typhoon.recompose.keys, ['bg', 'typhoon', 'title', 'legend']);
});

test('R3 색칠만 — 칠한 구역끼리 맞닿은 곳의 투명 이음새가 같은 색 한 path 수준', { skip: SKIP }, () => {
  const s = run().seams;
  assert.ok(s.n_sgg_mono.fills <= s.n_sgg_mono.merged * 1.15, JSON.stringify(s.n_sgg_mono));
  for (const k of ['n_sgg_mono', 'n_sgg_tri', 'v_warn_tri']) assert.ok(s[k].fills <= s[k].noEdge * 0.15, `${k}: ${JSON.stringify(s[k])}`);
  assert.ok(s.n_sgg_tri.fills < s.n_sgg_tri.merged * 0.2, '여러 색이 맞닿아도 틈이 없다');
});

test('R4 타임라인 미리보기(블라인드 끝·중간, 번짐 중간)에서 뽑아도 정지 화면과 같고, 끝나면 미리보기가 그대로', { skip: SKIP }, () => {
  const a = run().anim;
  for (const [nm, st] of Object.entries(a)) {
    for (const [f, d] of Object.entries(st.diff)) assert.equal(d, 0, `${nm}/${f} 정지 화면과 다름`);
    assert.equal(st.after.animT, st.before.animT, `${nm} 미리보기 시각`);
    assert.equal(st.after.mapBase, st.before.mapBase, `${nm} 블라인드 미리보기 복원`);
  }
  assert.equal(a.blindsEnd.before.mapBase, true, '블라인드 베이스 지도가 있는 상태에서 점검');
  assert.equal(a.blindsEnd.rawFillsOut, 0, '정지 화면으로 안 돌려도 복제본 안전망이 베이스 지도를 뺀다');
});

test('R5 3D 기울기 — 전체 화면 = 영상 한 프레임, 색칠만도 기울어 나온다, 라벨은 평평', { skip: SKIP }, () => {
  const t = run().tilt;
  assert.equal(t.active, true);
  assert.equal(t.fullVsFrame, 0);
  // 기울인 '색칠만'의 칠한 픽셀이 기울인 전체 화면에서도 같은 색인 비율 — 나머지는 그 위에 얹힌 시도 경계·라벨·산(전체 화면에만 있음)
  assert.ok(t.tiltFillsAgree >= 0.75, JSON.stringify(t));
  assert.ok(t.flatFillsAgree < 0.4, '평평한 색칠만은 기울인 전체 화면과 어긋나야(점검이 의미 있게): ' + JSON.stringify(t));
  assert.ok(t.fillsVsRefOut <= t.fillsNZ * 0.01, '기울여도 칠한 것만: ' + JSON.stringify(t));
  assert.equal(t.labelsFlat, 0);
});

test('R6 태풍 — 없는 항목 0장(빈 PNG 없음), 배경 불투명, 태풍 경로는 그것만', { skip: SKIP }, () => {
  const s = run().scn.n_typhoon;
  for (const k of ['map', 'base', 'fills', 'lines', 'sidoline', 'labels', 'mtn']) { assert.equal(s.count[k], 0, k); assert.ok(s.why[k], k); }
  assert.equal(s.count.typhoon, 1);
  for (const k of ['bg', 'bgtext', 'full']) assert.ok(s.items[k].opaque >= 0.99, `${k} 불투명 ${s.items[k].opaque}`);
  assert.equal(s.items.typhoon.cmp.out, 0);
});

test('R7 터치(2158×1214) 맨 위·아래 줄 알파 255 — 이미지와 영상 프레임 모두', { skip: SKIP }, () => {
  const s = run().scn.t_sgg;
  for (const k of ['full', 'bg', 'bgtext']) assert.deepEqual([s.items[k].edge.rowTopMin, s.items[k].edge.rowBotMin], [255, 255], k);
  assert.deepEqual([s.videoEdge.rowTopMin, s.videoEdge.rowBotMin], [255, 255]);
});

test('R8 저장 — 폴더 고르기 → 오늘날짜_날씨CG메이커 폴더 하나 → 카드 이름 그대로, 겹침(덮어쓰기·번호·취소), 취소·ZIP·영상 중', { skip: SKIP }, () => {
  const s = run().save, folder = s.folder;
  assert.match(folder, /^\d{8}_날씨CG메이커$/);
  assert.deepEqual(s.plan, ['전체 화면.png', '색칠만.png', '수치 라벨 - 120.png', '수치 라벨 - 강원 80~100.png', '수치 라벨 - 120 (2).png']);
  assert.deepEqual(s.first.pickerOpt, { id: 'wcgImgOut', mode: 'readwrite', startIn: false });
  assert.deepEqual(s.first.getDir, [[folder, true]], '하위 폴더 하나만 만든다');
  assert.deepEqual(s.first.files, s.plan);
  assert.equal(s.first.nfc, true);
  assert.deepEqual(s.first.fillsSize, [1920, 1080]);
  assert.match(s.first.summary, new RegExp(`저장했어요 · Upload › ${folder} · 5장`));
  assert.equal(s.over.startInIsFirst, true, '두 번째엔 지난번 폴더에서 시작');
  assert.match(s.over.msg, /‘전체 화면\.png’ 외 4개 파일이/);
  assert.deepEqual([s.over.files, s.over.newWrites], [5, 5], '덮어쓰기 = 같은 이름에 다시 쓰기');
  assert.equal(s.num.newWrites, 5);
  assert.deepEqual(s.num.files, ['색칠만 (2).png', '색칠만.png', '수치 라벨 - 120 (2) (2).png', '수치 라벨 - 120 (2).png', '수치 라벨 - 120 (3).png', '수치 라벨 - 120.png', '수치 라벨 - 강원 80~100 (2).png', '수치 라벨 - 강원 80~100.png', '전체 화면 (2).png', '전체 화면.png'].sort());
  assert.equal(s.cancel.newWrites, 0);
  // 같은 이름 '폴더'가 있으면 그 장만 번호(덮어쓰기를 골라도 실패하지 않는다)
  assert.deepEqual(s.dirClash.written, ['색칠만 (3).png', '수치 라벨 - 120 (2).png', '수치 라벨 - 120.png', '수치 라벨 - 강원 80~100.png', '전체 화면.png']);
  assert.match(s.dirClash.summary, /저장했어요/);
  // 권한 거절 — 폴더 창은 한 번만, 쓴 것·내려받은 것 없음, 까닭 + ZIP 버튼
  assert.deepEqual([s.denied.pickerCalls, s.denied.newWrites, s.denied.downloads, s.denied.zipBtn], [1, 0, 0, true]);
  assert.match(s.denied.toast, /폴더를 열지 못했어요\(이 폴더에 쓸 권한이 없어요\)/);
  assert.equal(s.abort.newWrites, 0);
  assert.equal(s.abort.zipBtn, true);
  assert.match(s.abort.toast, /바탕화면·다운로드는 그 안의 폴더를 골라 주세요/);
  assert.equal(s.zip.length, 2, 'ZIP으로 받기 버튼 + 폴더 고르기 없는 브라우저');
  for (const z of s.zip) {
    assert.equal(z.filename, `${folder}.zip`);
    assert.deepEqual(z.entries.map((e) => e.name), s.plan.map((f) => `${folder}/${f}`));
    assert.ok(z.entries.every((e) => e.utf8 && e.date !== 0 && e.size > 1000));
  }
  assert.equal(s.videoBusy.pickerCalls, 0);
  assert.match(s.videoBusy.toast, /영상 추출이 끝난 뒤에/);
});

test('R9 팝업 — 열기·흐린 카드·고르기·빠른 선택·묶음 알약·기억·Esc·바깥 클릭·굽는 중 Esc = 중지', { skip: SKIP }, () => {
  const p = run().popup;
  assert.deepEqual(p.open, { on: true, focusIn: true, drop: false });
  assert.equal(p.none.renderDisabled, true); assert.match(p.none.summary, /뽑을 것을 골라 주세요/);
  assert.deepEqual(p.disabledClick, { pressed: 'false', ariaDisabled: 'true', sub: '태풍 지도에서만 있어요' });
  assert.deepEqual(p.pick, { fills: 'true', renderDisabled: false });
  assert.deepEqual(p.layers, ['bg', 'base', 'fills', 'lines', 'labels', 'mtn', 'legend', 'title']);
  assert.deepEqual(p.paneToggle, [], '묶음을 모두 골랐으면 알약이 모두 푼다');
  assert.deepEqual(p.counts, { labelsBadge: '3장', labelsBadgeShown: true });
  assert.deepEqual(p.esc, { on: false, focusBack: 'exportBtn' });
  assert.deepEqual([p.remember.full, p.remember.fills], ['true', 'true']);
  assert.deepEqual(JSON.parse(p.remember.stored), ['full', 'fills']);
  assert.equal(p.outside.on, false);
  assert.deepEqual(p.busy, { renderLabel: '중지', ring: 'block', tbBusy: true });
  assert.equal(p.stop.on, true, '굽는 중 Esc 는 닫지 않고 중지');
  assert.match(p.stop.summary, /^중지/);
  assert.equal(p.stop.tbBusyAfter, false);
});

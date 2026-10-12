// 태풍 라벨 지시선 끝 '흰 점' — 실제 앱 점검(숨김 Electron, 영상 추출과 같은 renderAnimFrame → drawExportFrame).
// WCG_BOOT_CHECK=1 일 때만:  WCG_BOOT_CHECK=1 node --test tests/typhoon-leader-specks.boot.test.cjs   (vm 단위 검사는 tests/typhoon-leader-specks.test.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

test('부팅 점검: 나오기 전 라벨엔 지시선이 없고, 그려지는 중 대시가 선 끝에 점을 남기지 않는다(단일·비교 지도)', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root,'--wait=8000', '--keepalive', '--eval=' + path.join(__dirname, 'typhoon-leader-specks.boot-eval.js')], { encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  const { main, cmp } = o;
  assert.equal(main.hiddenWithPath, 0, '선이 나오기 전 라벨에 지시선 path가 남아 있다 ' + JSON.stringify(main));
  assert.ok(main.partial > 10, '그려지는 중(대시) 프레임을 지나야 의미 있는 점검 ' + JSON.stringify(main));
  assert.equal(main.riskyDash, 0, '두 번째 대시가 선 안에서 시작 → 선 끝 점 ' + JSON.stringify(main));
  assert.ok(main.hiddenChecked > 10, JSON.stringify(main));
  assert.deepEqual(main.endBumps, [], '숨은 라벨 끝 자리에 밝은 점 ' + JSON.stringify(main));
  assert.deepEqual(main.endLeaders, ['full', 'full'], '다 나온 뒤엔 두 라벨 모두 온전한 지시선 ' + JSON.stringify(main));
  assert.equal(cmp.leadersAtStart, 0, '비교 지도: 선이 나오기 전엔 지시선 없음 ' + JSON.stringify(cmp));
  assert.ok(cmp.partial > 3, JSON.stringify(cmp));
  assert.equal(cmp.riskyDash, 0, '비교 지도: 대시가 선 끝에 점을 남김 ' + JSON.stringify(cmp));
  assert.deepEqual(cmp.endLeaders, ['full', 'full'], '비교 지도: 다 나온 뒤 온전한 지시선 두 개 ' + JSON.stringify(cmp));
});

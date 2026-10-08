// 틸트 미리보기 WebGL·예열·게이트·재생 중 다시 굽기·컨텍스트 폴백·추출 GL — 실제 앱 점검(숨김 Electron).
// WCG_BOOT_CHECK=1 일 때만:  WCG_BOOT_CHECK=1 node --test tests/tilt-gl.boot.test.cjs   (vm 단위 검사는 tests/tilt-gl.test.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

test('부팅 점검: 틸트 미리보기 GL(밉맵)·예열·진입 게이트·회전만이면 안 굽기·폴백·추출', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), '--wait=7000', '--size=1600x1000', '--keepalive', '--eval=' + path.join(__dirname, 'tilt-gl.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  assert.equal(o.pre.gl, true, 'WebGL2 렌더러 ' + JSON.stringify(o.pre));
  assert.ok(o.pre.tex && o.pre.q === 1 && !o.pre.mapTilt, '타임라인을 열면 평면인 채 틸트 그림을 미리 굽는다 ' + JSON.stringify(o.pre));
  assert.ok(o.play.tiltFrames > 20, JSON.stringify(o.play));
  assert.equal(o.play.flatWhileTilted, 0, '예열한 그림이 있으면 진입 첫 프레임부터 기울인 지도 ' + JSON.stringify(o.play));
  assert.equal(o.play.glFrames, o.play.tiltFrames, '기울인 동안은 GL 캔버스로만 ' + JSON.stringify(o.play));
  assert.equal(o.play.rasters, 0, '회전만 바뀌는 재생은 다시 굽지 않는다 ' + JSON.stringify(o.play));
  assert.ok(o.settle.q === 1 && o.settle.tilt, JSON.stringify(o.settle));
  if (o.lost.ext) {
    assert.ok(!o.lost.gl && o.lost.cv && o.lost.css && o.lost.tilt, '잃으면 그림 버퍼를 CSS 3D로 ' + JSON.stringify(o.lost));
    assert.ok(o.lost.gl2 && !o.lost.cv2 && o.lost.has2, '되찾으면 다시 GL ' + JSON.stringify(o.lost));
  }
  assert.equal(o.export.gl, true, '영상 프레임도 같은 GL 렌더러');
  assert.ok(o.export.px[3] === 255 && o.export.px.slice(0, 3).some((v) => v > 20), '기울인 지도가 그려졌다 ' + JSON.stringify(o.export));
});

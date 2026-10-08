// 옛 앱 스펙은 헬퍼 20261008에서도 출력이 안 바뀐다 — 확장 전 골든 137개의 sha256(golden-legacy.sha256.json)과 지금 골든을 비교.
// 새 JSX 도우미(ezE·ezAll·linK·fadeE·slid)는 쓰일 때만 프롤로그에 끼워 넣고, 새 필드가 없으면 옛 문자열을 그대로 쓰기 때문.
// 예외 6개(F1 — 의도한 버그 수정): 태풍 리그 카메라 키를 '자식 부모 연결 뒤'로 옮기고 CAM을 항등(Position = Anchor)으로 만든다.
// AE의 parent 대입은 지금 시각(0)의 부모 변환으로 보정하므로, 예전처럼 키를 먼저 넣으면 첫 카메라 키 ≠ 작업 뷰일 때 지도 전체가 어긋났다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GOLD = path.join(__dirname, 'golden');
const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden-legacy.sha256.json'), 'utf8')).files;
const F1_CHANGED = ['typhoon-camera.jsx', 'typhoon-camera-defaults.jsx', 'typhoon-line-mode-ignores-bands-labels.jsx', 'typhoon-line-widths.jsx', 'typhoon-line-widths-huge-int.jsx', 'typhoon-noicon.jsx'];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('옛 골든 137개 — F1 6개 말고는 지금 골든과 바이트까지 같다', () => {
  const names = Object.keys(LEGACY);
  assert.equal(names.length, 137);
  const changed = [];
  for (const f of names) {
    const p = path.join(GOLD, f);
    assert.ok(fs.existsSync(p), '골든이 사라짐: ' + f);
    if (sha(p) !== LEGACY[f]) changed.push(f);
  }
  assert.deepEqual(changed.sort(), F1_CHANGED.slice().sort(), '바뀐 골든은 F1(카메라) 6개뿐이어야');
});

test('F1 — 바뀐 6개는 카메라 줄 위치·CAM 항등 위치만 달라졌다(같은 줄들의 순서만 바뀜 + Position 한 줄)', () => {
  for (const f of F1_CHANGED) {
    const now = fs.readFileSync(path.join(GOLD, f), 'utf8').split('\n');
    const camKeys = now.filter((l) => /^CAM\.property\("(Position|Scale)"\)\.setValueAtTime\(/.test(l) || l === 'try{ezR(CAM.property("Position"));ezR(CAM.property("Scale"));}catch(e){}');
    assert.ok(camKeys.length >= 1, f + ' 카메라 키 줄');
    const iEnd = now.lastIndexOf('})();'), iFirstKey = now.indexOf(camKeys[0]);
    assert.ok(now.slice(iFirstKey, iEnd).every((l) => camKeys.includes(l)), f + ' 카메라 키는 리그 맨 끝(부모 연결 뒤)');
    const iParent = now.findIndex((l) => l.includes('.parent=CAM') || l.includes('if(CAM){'));
    assert.ok(iParent >= 0 && iParent < iFirstKey, f + ' 부모 연결이 키보다 먼저');
    assert.ok(now.some((l) => /^CAM=TG\.layers\.addNull\(\);.*CAM\.property\("Anchor Point"\)\.setValue\(\[([^\]]*)\]\);CAM\.property\("Position"\)\.setValue\(\[\1\]\);$/.test(l)), f + ' CAM 항등(Position = Anchor)');
  }
});

test('새 필드 스펙 코퍼스 — 확장 골든이 충분히 있다(필드 있음·없음·경계값)', () => {
  const specs = fs.readdirSync(path.join(__dirname, 'ae-specs')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  const fresh = specs.filter((s) => !(s + '.jsx' in LEGACY) && !(s + '.error.txt' in LEGACY));
  assert.ok(fresh.length >= 40, '새 스펙 ' + fresh.length);
  for (const k of ['ease-fade', 'ease-fade-bounds', 'ease-vf', 'blinds-one', 'blinds-two', 'blinds-bad', 'typhoon-prog', 'typhoon-prog-line', 'typhoon-prog-static', 'typhoon-prog-bad',
    'typhoon-prog-bands-gap', 'typhoon-prog-cam', 'typhoon-labels-curve', 'typhoon-cam-ease', 'cam-ease-bad', 'compare-prog-each', 'compare-prog-mixed', 'compare-name-always', 'compare-head',
    'compare-cam', 'compare-cam-rot', 'cam-map', 'cam-map-place', 'cam-map-vf', 'cam-map-rot', 'cam-map-bad', 'cam-map-mtn', 'labelcomp-leader', 'labelcomp-leader-bad', 'vf-mask', 'vf-mask-bad']) assert.ok(fresh.includes(k), '새 스펙 없음: ' + k);
});

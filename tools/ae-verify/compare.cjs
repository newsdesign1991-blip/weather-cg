// AE 실기 대조 — 2단계: AE가 써 낸 덤프(<스펙>.dump.json)를 같은 JSX를 AE 흉내(desktop/test/ae-model.cjs)로 계산한 값과 비교한다.
// AE 흉내는 테스트(tests/ae-ease-match.test.cjs — 앱 화면 함수와 비교)의 기준이므로, 여기서 같으면 'AE = 흉내 = 앱 화면'이 이어진다.
// 사용: node tools/ae-verify/compare.cjs [make.cjs 출력 폴더]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildAeJsx } = require('../../desktop/wns/ae-jsx.js');
const { mkModel } = require('../../desktop/test/ae-model.cjs');

const dir = process.argv[2] || path.join(os.tmpdir(), 'wcg-ae-verify');
const SPEC_DIR = path.join(__dirname, '..', '..', 'desktop', 'test', 'ae-specs');
const TF = { 'ADBE Anchor Point': 'anchor', 'ADBE Position': 'position', 'ADBE Scale': 'scale', 'ADBE Rotate Z': 'rotation', 'ADBE Opacity': 'opacity' };

// 덤프 경로("/ADBE Transform Group#1/ADBE Opacity#1" …) → AE 흉내 속성
function nodeOf(layer, pth) {
  const segs = pth.split('/').filter(Boolean).map((s) => { const i = s.lastIndexOf('#'); return [s.slice(0, i), +s.slice(i + 1)]; });
  if (segs[0][0] === 'ADBE Transform Group') return layer.tf[TF[segs[1][0]]] || null;
  let n = layer.root, effect = false;
  for (const [mn, k] of segs) {
    if (!n) return null;
    if (effect && /-(\d{4})$/.test(mn)) { n = n.kids[+/-(\d{4})$/.exec(mn)[1] - 1]; continue; }   // 효과 속성은 순번(ADBE Slider Control-0001)
    const same = n.kids.filter((x) => x && x.matchName === mn);
    n = same[k - 1] || null;
    effect = !!n && n.layer && n !== layer.root && /^ADBE (Slider Control|Venetian Blinds|Drop Shadow)$/.test(mn);
  }
  return n;
}
const diff = (a, b) => {
  if (a == null || b == null) return a == null && b == null ? 0 : Infinity;
  if (typeof a === 'number') return Math.abs(a - (Array.isArray(b) ? b[0] : b));
  if (Array.isArray(a)) { let m = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) m = Math.max(m, diff(a[i], b[i])); return m; }
  if (a.v) return diff(a.v, b.points || b.v);
  return Infinity;
};
const kindOf = (pth) => (/Transform Group/.test(pth) ? pth.split('/')[2].replace(/#\d+$/, '').replace('ADBE ', '') : pth.split('/').pop().replace(/#\d+$/, '').replace('ADBE ', ''));

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.dump.json')) : [];
if (!files.length) { console.log('덤프가 없습니다 — make.cjs로 만든 .verify.jsx를 AE에서 먼저 실행하세요: ' + dir); process.exit(1); }
const total = {};
for (const f of files) {
  const nm = f.replace(/\.dump\.json$/, '');
  const dump = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, nm + '.json'), 'utf8'));
  const M = mkModel().run(buildAeJsx(spec, path.join(dir, 'frames')));
  const by = {}, miss = [], parents = [];
  for (const it of dump.items) {
    const comp = M.comps.find((c) => c.name === it.comp), layer = comp && comp.list[it.li - 1];
    if (!layer) { miss.push(it.comp + ' / ' + it.layer); continue; }
    if (it.parent != null) { const p = layer.parent ? layer.parent.name : ''; if (p !== it.parent) parents.push(`${it.layer}: AE 부모 '${it.parent}' / 흉내 '${p}'`); continue; }
    const nd = nodeOf(layer, it.path);
    if (!nd) { miss.push(it.layer + ' ' + it.path); continue; }
    const fr = comp.frameRate, k = kindOf(it.path);
    let m = 0;
    it.v.forEach((v, i) => { let e; try { e = nd.valueAtTime(i / fr); } catch (err) { e = null; } m = Math.max(m, diff(v, e)); });
    const key = k + (it.expr ? '(표현식)' : '(키)');
    by[key] = Math.max(by[key] || 0, m); total[key] = Math.max(total[key] || 0, m);
    if (it.exprErr) miss.push('AE 표현식 오류 ' + it.layer + ' ' + it.path + ': ' + it.exprErr);
  }
  console.log(`\n[${nm}] 속성별 AE − 흉내 최대 차이(프레임마다)`);
  for (const [k, v] of Object.entries(by).sort()) console.log(`  ${k}: ${v === Infinity ? '값 없음/형식 다름' : v.toPrecision(3)}`);
  if (parents.length) console.log('  부모 다름: ' + parents.join(' · '));
  if (miss.length) console.log('  못 찾음/오류: ' + miss.slice(0, 12).join(' · '));
  if ((dump.errors || []).filter(Boolean).length) console.log('  AE 덤프 오류: ' + dump.errors.filter(Boolean).slice(0, 6).join(' · '));
}
const ok = (k, eps) => (total[k] == null ? '— (해당 덤프 없음)' : total[k] <= eps ? `통과(${total[k].toPrecision(2)})` : `다름(${total[k].toPrecision(3)}) — 설계 3.5의 대안으로`);
console.log('\n설계 3.5 확인 항목');
console.log('  V1 영향 합 >100%(34/85)를 AE가 그대로 쓴다 — 불투명(키):', ok('Opacity(키)', 0.01));
console.log('  V2·V9 카메라 위치 이징·부모 연결 보정 — 위치(키):', ok('Position(키)', 0.01));
console.log('  V5 표현식이 진행 슬라이더를 읽는다 — Trim End(표현식):', ok('Vector Trim End(표현식)', 0.01));
console.log('  V6·V10 toComp·한글 레이어 이름 표현식 — 셰이프 경로(표현식):', ok('Vector Shape(표현식)', 0.01));
console.log('  (V3 블라인드 띠·V4 Trim 그리기·V7·V11 기울기는 AE 화면으로 확인)');

// 전/후 결과 폴더 두 개를 같은 표로 — node compare.cjs <전 폴더> <후 폴더> [태그...] [--sc=strokeShort,strokeLong]
const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2);
const [A, B] = args.filter((a) => !a.startsWith('--')).slice(0, 2).map((p) => path.resolve(p));
const tagsArg = args.filter((a) => !a.startsWith('--')).slice(2);
const scArg = (args.find((a) => a.startsWith('--sc=')) || '').slice(5);
const SC = scArg ? scArg.split(',') : ['modeEnter', 'select', 'strokeShort', 'strokeLong', 'erase', 'softBig', 'undo'];
const f1 = (x) => (x == null || Number.isNaN(x) ? '-' : (Math.round(x * 10) / 10).toString());
const load = (dir, tag) => { const p = path.join(dir, tag + '.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const row = (r) => {
  if (!r) return null;
  const ev = r.events || {};
  const et = (n) => { const e = (r.eventTiming || []).filter((x) => x.name === n); return e.length ? Math.max(...e.map((x) => x.dur)) : null; };
  const img = r.extra && r.extra.imgMs != null ? r.extra.imgMs : (r.upToImg && r.upToImg.length ? Math.max(...r.upToImg.map((x) => (x == null ? NaN : x))) : null);
  return { down: ev.pointerdown && ev.pointerdown.max, up: ev.pointerup ? ev.pointerup.max : (r.extra && r.extra.syncMs), etDown: et('pointerdown'), etUp: et('pointerup'),
    moves: ev.pointermove && ev.pointermove.n, fMean: r.frames.mean, fP95: r.frames.p95, f33: r.frames.over33, fN: r.frames.n, lt: r.longTasks.total, img };
};
const tags = tagsArg.length ? tagsArg : fs.readdirSync(B).filter((f) => f.endsWith('.json') && !/_bench|_proto|_prof|_tr|^equiv/.test(f)).map((f) => f.replace(/\.json$/, '')).sort();
console.log('| 설정 | 시나리오 | 누름 처리 ms | 뗌 처리 ms | 누름→화면 ms | 뗌→화면 ms | 뗌→최종 이미지 ms | 프레임 평균/p95 ms | 33ms↑ 프레임 | 긴 작업 합 ms | 처리한 이동 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const ab = (a, b, k) => `${f1(a && a[k])} → **${f1(b && b[k])}**`;
for (const tag of tags) {
  const da = load(A, tag), db = load(B, tag);
  if (!db) continue;
  for (const sc of SC) {
    const a = row(da && da.results.find((x) => x.name === sc)), b = row(db.results.find((x) => x.name === sc));
    if (!b) continue;
    console.log(`| ${tag} | ${sc} | ${ab(a, b, 'down')} | ${ab(a, b, 'up')} | ${ab(a, b, 'etDown')} | ${ab(a, b, 'etUp')} | ${ab(a, b, 'img')} | ${f1(a && a.fMean)}/${f1(a && a.fP95)} → **${f1(b.fMean)}/${f1(b.fP95)}** | ${a ? a.f33 + '/' + a.fN : '-'} → **${b.f33}/${b.fN}** | ${ab(a, b, 'lt')} | ${ab(a, b, 'moves')} |`);
  }
}
// 부팅(새로고침) 때 처음부터 굽기 — 브러쉬 그림이 다 들어온 시각, 부팅 중 긴 작업 합/최대
console.log('\n| 설정 | 부팅 후 브러쉬 그림 완료 ms | 부팅 긴 작업 합 ms | 부팅 긴 작업 최대 ms |');
console.log('|---|---|---|---|');
for (const tag of tags) {
  const da = load(A, tag), db = load(B, tag);
  if (!db || !db.info.boot || !db.info.strokes) continue;
  const a = (da && da.info.boot) || {}, b = db.info.boot;
  console.log(`| ${tag} | ${f1(a.brushReadyMs)} → **${f1(b.brushReadyMs)}** | ${f1(a.longTaskMs)} → **${f1(b.longTaskMs)}** | ${f1(a.longTaskMax)} → **${f1(b.longTaskMax)}** |`);
}

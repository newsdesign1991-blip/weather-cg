// out/*.json(시나리오 측정) → 마크다운 표
const fs = require('fs'); const path = require('path');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const dir = outArg ? path.resolve(outArg.slice(6)) : path.join(require('os').tmpdir(), 'wcg-brushperf');
const tags = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const files = (tags.length ? tags.map((t) => t + '.json') : fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !/_bench|_proto|^t0/.test(f)));
const f1 = (x) => (x == null ? '-' : (Math.round(x * 10) / 10).toString());
const rows = [];
for (const f of files) {
  const p = path.join(dir, f); if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of d.results) {
    const ev = r.events || {};
    const api = Object.fromEntries((r.api || []).map((a) => [a.name, a]));
    const cb = Object.fromEntries((r.callbacks || []).map((a) => [a.name, a]));
    const td = api['canvas.toDataURL(>1MP)'] || api['canvas.toDataURL(<=1MP)'];
    const et = (n) => { const e = (r.eventTiming || []).filter((x) => x.name === n); return e.length ? Math.max(...e.map((x) => x.dur)) : null; };
    rows.push({ cfg: d.info.tag, sc: r.name,
      down: ev.pointerdown && ev.pointerdown.max, move: ev.pointermove && ev.pointermove.mean, moveP95: ev.pointermove && ev.pointermove.p95, moves: ev.pointermove && ev.pointermove.n,
      up: ev.pointerup && ev.pointerup.max, etDown: et('pointerdown'), etUp: et('pointerup'),
      fMean: r.frames.mean, fP95: r.frames.p95, fMax: r.frames.max, f33: r.frames.over33, fN: r.frames.n,
      lt: r.longTasks.n, ltT: r.longTasks.total,
      td: td ? `${td.n}×${f1(td.avg)}` : '-', flush: cb['rAF brushFlush'] ? f1(cb['rAF brushFlush'].max) : '-' });
  }
}
const H = ['설정', '시나리오', 'down 처리', 'move 평균/p95 (개수)', 'up 처리', 'down→화면', 'up→화면', '프레임 평균/p95/최대', '33ms 넘은 프레임', '긴 작업(개/합)', 'toDataURL 횟수×평균', 'brushFlush 최대'];
console.log('| ' + H.join(' | ') + ' |'); console.log('|' + H.map(() => '---').join('|') + '|');
for (const r of rows) console.log(`| ${r.cfg} | ${r.sc} | ${f1(r.down)} | ${r.move == null ? '-' : f1(r.move) + '/' + f1(r.moveP95) + ' (' + r.moves + ')'} | ${f1(r.up)} | ${f1(r.etDown)} | ${f1(r.etUp)} | ${f1(r.fMean)}/${f1(r.fP95)}/${f1(r.fMax)} | ${r.f33}/${r.fN} | ${r.lt}/${f1(r.ltT)} | ${r.td} | ${r.flush} |`);

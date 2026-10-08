const f = process.argv[2], names = (process.argv[3] || '').split(',').filter(Boolean);
const d = require(require('path').resolve(f));
for (const r of d.results) {
  if (names.length && !names.includes(r.name)) continue;
  console.log('=== ' + r.name, 'wall', r.wallMs, JSON.stringify(r.frames));
  console.log('  loaf', JSON.stringify({ n: r.loaf.n, total: r.loaf.total, max: r.loaf.max, render: r.loaf.renderTotal, sl: r.loaf.styleLayoutTotal }), 'lt', JSON.stringify(r.longTasks));
  console.log('  events', JSON.stringify(r.events));
  console.log('  et', JSON.stringify(r.eventTiming.filter((e) => /pointerdown|pointerup|click/.test(e.name))));
  console.log('  api'); for (const a of r.api.slice(0, 16)) console.log('    ', a.name, a.n, a.t, a.avg, a.max);
  console.log('  cbs'); for (const a of r.callbacks.slice(0, 6)) console.log('    ', a.name.slice(0, 90), a.n, a.t, a.avg, a.max);
  console.log('  lis'); for (const a of r.listeners.slice(0, 6)) console.log('    ', a.name.slice(0, 100), a.n, a.t, a.avg, a.max);
  if (r.loaf.scripts.length) { console.log('  loafScripts'); for (const a of r.loaf.scripts.slice(0, 6)) console.log('    ', a.name.slice(0, 110), a.n, a.t, a.max); }
  if (r.profile) { console.log('  prof self'); for (const a of r.profile.self.slice(0, 14)) console.log('    ', a.fn, a.ms, a.pct + '%'); console.log('  prof total'); for (const a of r.profile.total.slice(0, 22)) console.log('    ', a.fn, a.ms, a.pct + '%'); }
  if (r.trace) { console.log('  trace'); for (const a of r.trace.top.slice(0, 30)) console.log('    ', a.ev.slice(0, 110), a.n, a.ms, a.max); }
}

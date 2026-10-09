// Isolated boot-check profile: actual renderer, animation and PNG export regression.
const q = s => document.querySelector(s), check = (v, m) => { if (!v) throw new Error(m); };
closeTossModal(); closeCgSetup();
const work = JSON.parse(JSON.stringify(stateForSave()));
work.style = Object.keys(MAP.styles).find(k => MAP.styles[k].typhoon && !MAP.styles[k].compare);
const pts = Array.from({ length: 5 }, (_, i) => ({ lon: 130 + i * 2, lat: 20 + i * 3, ws: 30, tmef: '202610' + String(7 + i).padStart(2, '0') + '0000', fcst: i > 2 }));
work.typhoon = Object.assign({}, typhoonStyleDefaults(), { name: '점선 검증', issues: [{ tmfc: '', label: 'test', points: pts }], sel: 0, nowIdx: 2, trackMode: 'line', lineColor: '#00AAFF', lineWidth: 5, places: [], labels: [], compare: [], krShow: 0 });
work.anim = { dur: 6, fps: 29.97, tracks: [{ id: 'ty', kind: 'typhoon', ps: 1, pe: 4, start: 1, len: 3, lab: {} }] };
loadProjectData(work, null); setTyphoonDefaultView(); renderTyphoon();
const pathFor = pp => 'M' + pp.map(p => typhoonXY(p.lon, p.lat).join(' ')).join('L');
const forecastSelector = '#L_typhoon [data-typ-line-forecast]';
check(q(forecastSelector)?.getAttribute('d') === pathFor(pts.slice(2)), 'forecast must start at current position');
check(q(forecastSelector).getAttribute('stroke') === '#00AAFF' && q(forecastSelector).getAttribute('stroke-width') === '5', 'forecast style mismatch');
check(q(forecastSelector).getAttribute('stroke-dasharray') === '16 12.5', 'forecast must be dashed');
const snapshot = q(forecastSelector).getAttribute('d');
for (const time of [0, 2, 4, 6]) {
  renderAnimFrame(time);
  check(q(forecastSelector)?.getAttribute('d') === snapshot, 'forecast disappears during animation at ' + time);
}
const solid = q('#L_typhoon > path:not([data-typ-line-forecast])');
check(solid?.getAttribute('d') === pathFor(pts.slice(0, 3)), 'solid path must stop at current position');
const icons = q('#L_typhoon').querySelectorAll(':scope > g');
check(icons.length === 1, 'line mode must keep only one icon');
const currentXY = typhoonXY(pts[2].lon, pts[2].lat);
check(icons[0].getAttribute('transform')?.includes('translate(' + currentXY[0]), 'icon must stop at current position');
animOff();
let pngHasForecast = false;
const png = await svgBlob(c => { pngHasForecast = !!c.querySelector('[data-typ-line-forecast]'); }, true);
check(pngHasForecast && png.size > 0, 'image export loses forecast');
const ranged = JSON.parse(JSON.stringify(stateForSave()));
ranged.typhoon.rangeOn = true; ranged.typhoon.rangeTo = '2026-10-10T09:00';
loadProjectData(ranged, null); renderTyphoon();
check(q(forecastSelector)?.getAttribute('d') === pathFor(pts.slice(2, 4)), 'date range must trim forecast');
ranged.typhoon.rangeTo = '2026-10-09T09:00'; loadProjectData(ranged, null); renderTyphoon();
check(!q(forecastSelector), 'no forecast segment when range ends at current position');
ranged.typhoon.rangeOn = false; ranged.typhoon.trackMode = 'full'; loadProjectData(ranged, null); renderTyphoon();
check(!q(forecastSelector), 'normal mode must not duplicate forecast');
return { ok: true, futureDashed: true, currentStop: true, animation: true, imageExport: true, dateRange: true, normalUnchanged: true };

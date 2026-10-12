// 격리된 WCG_TEST 프로필 전용. 실제 사용자 앱에는 실행하지 않는다.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
const out = { modes: [] };
const check = (v, why) => { if (!v) throw new Error(why); };
try { closeTossModal(); closeCgSetup(); } catch (_) { /* 첫 화면 */ }
const st = Object.keys(MAP.styles).find((k) => MAP.styles[k].typhoon && !MAP.styles[k].compare);
setStyle(st);
await pause(300);
S.showGuide = 0;
S.map.s = 0.307; S.map.x = 860; S.map.y = 377;
for (const bm of ['satdark', 'satellite']) {
  S.typhoon.basemap = bm; renderAll();
  const E = satMipEntry(bm);
  await satMipEnsure(E);
  check(E.state === 'ready', bm + ': ' + E.err);
  check(E.levels.length === 6, 'six levels');
  for (let i = 1; i < 6; i++) {
    const size = satMipImgSize(E.levels[i].url);
    check(size.w === Math.ceil(E.w / 2 ** i) && size.h === Math.ceil(E.h / 2 ** i), 'level size ' + i);
  }
  satMipShowNow(); await pause(400); satMipShowNow();
  const a = q('#typhoonSat');
  check(a._satEntry === E && a._satLv.startsWith(bm + ':'), 'screen ' + bm);
  const clone = svg.cloneNode(true);
  const expected = satMipPick(satMipK(E, a, satMipMapScale(clone.querySelector('#bgMapT')), 0.5));
  await satMipClone(clone, 0.5);
  check(clone.querySelector('#typhoonSat').getAttribute('href') === E.levels[expected.lo].url, 'export level');
  const b = clone.querySelector('#typhoonSatB');
  check(expected.t > 0 ? b && +b.getAttribute('opacity') > 0 : !b, 'export blend');
  // 확대에는 원본으로 돌아온다.
  await satMipClone(clone, 100);
  check(clone.querySelector('#typhoonSat').getAttribute('href') === E.src && !clone.querySelector('#typhoonSatB'), 'zoom original');
  out.modes.push({ bm, dimensions: [E.w, E.h], screen: a._satLv, exportLevel: expected, stats: E.stats });
}
// 실제 이미지·AE SVG·프로젝트 미리보기 길은 모두 디코드 가능한 결과여야 한다.
const image = await svgToImage(960, 540);
check(image.naturalWidth === 960, 'svgToImage decode');
const blob = await svgBlob(() => {}, false);
check(blob.type === 'image/png' && blob.size > 1000, 'AE PNG');
const preview = await previewPng(480);
check(preview.type === 'image/png' && preview.size > 1000, 'preview');
S.typhoon.basemap = 'blue'; renderAll();
check(q('#typhoonSat').style.display === 'none' && q('#typhoonSatB').style.display === 'none', 'blue hides both');
const hidden = svg.cloneNode(true); await satMipClone(hidden, 0.5);
check(!hidden.querySelector('#typhoonSatB'), 'hidden clone removes overlay');
// 작은 흰 점 격자를 7배 축소한 채 1px 이내 움직인다: 밉맵의 밝기 흔들림이 원본보다 작아야 한다.
const c = document.createElement('canvas'); c.width = c.height = 512;
const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#fff';
for (let y = 8; y < 512; y += 16) for (let x = 8; x < 512; x += 16) g.fillRect(x, y, 3, 3);
const fixture = { src: c.toDataURL(), state: 'idle', p: null };
await satMipEnsure(fixture); check(fixture.state === 'ready', 'fixture pyramid');
const k = 1 / 7.1, pick = satMipPick(k), vals = [[], []];
c.width = c.height = 74;
for (let j = 0; j < 16; j++) for (let mode = 0; mode < 2; mode++) {
  g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, 74, 74);
  const shift = j / 16;
  // Canvas drawImage 자체의 축소 품질이 아닌 실제 앱과 같은 SVG <image> 래스터화를 비교한다.
  const imgEl = (level, opacity) => `<image href="${fixture.levels[level].url}" width="${512 * k}" height="${512 * k}" x="${shift}" y="${shift}" opacity="${opacity}"/>`;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74">${imgEl(mode ? pick.lo : 0, 1)}${mode && pick.t ? imgEl(pick.hi, pick.t) : ''}</svg>`;
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); await im.decode();
  g.drawImage(im, 0, 0);
  const d = g.getImageData(4, 4, 64, 64).data;
  let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i];
  vals[mode].push(sum);
}
const spread = (v) => (Math.max(...v) - Math.min(...v)) / (v.reduce((a, b) => a + b, 0) / v.length);
const sourceMeans = [];
for (const lv of fixture.levels) {
  const im = new Image(); im.src = lv.url; await im.decode();
  c.width = lv.w; c.height = lv.h; g.globalAlpha = 1; g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, lv.w, lv.h).data; let sum = 0; let max = 0;
  for (let i = 0; i < d.length; i += 4) { sum += d[i]; max = Math.max(max, d[i]); }
  sourceMeans.push([sum / (lv.w * lv.h), max]);
}
out.flicker = { original: spread(vals[0]), mip: spread(vals[1]), samples: vals, sourceMeans, levels: fixture.levels.map((lv) => [lv.w, lv.h]) };
check(out.flicker.mip < out.flicker.original * 0.8, 'flicker not improved ' + JSON.stringify(out.flicker));
out.ok = true;
return out;

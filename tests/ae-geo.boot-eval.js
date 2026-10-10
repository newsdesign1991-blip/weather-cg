// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/ae-geo.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱: GEOlayers가 '있다'고 답하는 가짜 헬퍼(fetch 가로채기 — AE는 안 띄움)로 'AE로 보내기' → 보내는 방식 팝업(카드 2장·흐림 까닭) →
// 'GEOlayers 지도로' 보내기 → /api/ae 스펙(mode·geo·리깅 항등 카메라)과 업로드한 지도 겹 PNG(바다가 빠져 투명)를 본다. 일반 지도에선 GEOlayers 칸이 흐림.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $q = (s) => document.querySelector(s);
for (let i = 0; i < 12; i++) { if ($q('#tourWrap.on') && $q('#tourClose')) $q('#tourClose').click(); const x = $q('#tossOv .tossX'); if (x) x.click(); await sleep(150); }
{ const so = $q('#startOverlay'); if (so && so.classList.contains('on')) so.classList.remove('on'); }
try { closeCgSetup(); } catch (e) { /* 이미 닫힘 */ }
const caps = { ae: [], frames: {}, geoCaps: 0 };
const realFetch = window.fetch.bind(window);
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, opts) => {
  const u = String(url);
  if (/\/ping(\?|$)/.test(u)) return json({ ok: true, ff: true, ver: 20261009 });
  if (u.includes('/api/geo-caps')) { caps.geoCaps++; return json({ ok: true, geolayers: { installed: true, version: '1.17.0' } }); }
  if (u.includes('/api/frame')) { const q = new URL(u).searchParams; caps.frames[+q.get('index')] = opts && opts.body; return json({ ok: true }); }
  if (u.includes('/api/ae')) { caps.ae.push(JSON.parse(opts.body)); return json({ ok: true, ae: 'AE test', fontsOk: true }); }
  return realFetch(url, opts);
};
try { localStorage.removeItem('wcg_ae_mode'); } catch (e) { /* 없어도 된다 */ }
const R = {};
// 태풍 작업(카메라 키 2개)
const work = JSON.parse(JSON.stringify(stateForSave()));
work.style = Object.keys(MAP.styles).find((k) => MAP.styles[k].typhoon && !MAP.styles[k].compare);
work.res = '1920x1080';
const pts = Array.from({ length: 6 }, (_, i) => ({ lon: 132 - i * 0.8, lat: 18 + i * 3, ws: 30 + i, tmef: '202610' + String(5 + i).padStart(2, '0') + '0000', fcst: i > 2, r15: i >= 2 ? 200 : 0, r25: i >= 2 ? 80 : 0, r70: i >= 2 ? 150 + i * 20 : 0 }));
work.typhoon = Object.assign({}, typhoonStyleDefaults(), { name: 'GEO 점검', issues: [{ tmfc: '', label: 'test', points: pts }], sel: 0, nowIdx: 2, trackMode: 'full', places: [], labels: [], compare: [], krShow: 1, basemap: 'blue' });
work.anim = { dur: 6, fps: 29.97, tracks: [{ id: 'ty', kind: 'typhoon', ps: 1, pe: 4, start: 1, len: 3, lab: {} }], cam: { keys: [] } };
loadProjectData(work, null); setTyphoonDefaultView(); renderTyphoon(); await sleep(400);
anim().cam.keys = [{ t: 0.5, x: S.map.x, y: S.map.y, s: S.map.s, rz: 0 }, { t: 3, x: S.map.x - 300, y: S.map.y + 200, s: S.map.s * 1.5, rz: 0 }];
const openPop = async () => { $q('#aeSend').onclick(); for (let i = 0; i < 30 && !$q('#tossOv .aeModeCards'); i++) await sleep(100); return $q('#tossOv'); };
// 1) 태풍 지도 — 두 카드, GEOlayers 칸 켜짐, 기본은 지금 방식
let ov = await openPop();
const cards = () => [...document.querySelectorAll('#tossOv .aeModeCards .cgsCard')];
R.typhoon = { pop: !!ov, title: ov && ov.querySelector('.tossTitle').textContent, cards: cards().map((b) => ({ mode: b.dataset.mode, dis: b.getAttribute('aria-disabled') === 'true', on: b.classList.contains('choicePending'), txt: b.textContent })) };
cards().find((b) => b.dataset.mode === 'geolayers').click(); await sleep(100);
R.typhoon.afterPick = cards().map((b) => b.classList.contains('choicePending'));
R.typhoon.note = ($q('#tossOv .aeModeNote') || {}).textContent || '';
$q('#tossOv [data-go]').click();
for (let i = 0; i < 100 && !caps.ae.length; i++) await sleep(150);
const spec = caps.ae[0];
R.spec = spec ? { mode: spec.mode, geoV: spec.geo && spec.geo.v, keys: spec.geo && spec.geo.view.keys.length, rows: spec.geo && spec.geo.view.frames && spec.geo.view.frames.rows.length,
  fc: spec.geo && Object.keys(spec.geo.typhoon.geojson), kr: spec.geo && spec.geo.overlays.kr ? spec.geo.overlays.kr.file : null,
  camKeys: (spec.layers.find((l) => l.typhoonRig) || {}).typhoonRig.camera.keys, anchor: (spec.layers.find((l) => l.typhoonRig) || {}).typhoonRig.camera.anchor,
  token: /pk\.[A-Za-z0-9]|access_token/.test(JSON.stringify(spec)) } : null;
R.saved = (() => { try { return localStorage.getItem('wcg_ae_mode'); } catch (e) { return null; } })();
// 업로드한 지도 겹 PNG — 바다·육지가 빠져 화면 가장자리가 투명(알파 0)이어야
if (spec) {
  const rig = spec.layers.find((l) => l.typhoonRig).typhoonRig;
  const alphaAt = async (b, x, y) => { const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return { w: bm.width, h: bm.height, a: g.getImageData(x, y, 1, 1).data[3] }; };
  R.overlay = await alphaAt(caps.frames[+rig.bg.slice(2, 7)], 2, 2);
  if (spec.geo.overlays.kr) R.kr = await alphaAt(caps.frames[+spec.geo.overlays.kr.file.slice(2, 7)], 2, 2);
}
await sleep(9500);   // 재전송 잠금(9초) 풀림
// 2) 일반 지도 — GEOlayers 칸 흐림 + 까닭, 취소
const w2 = JSON.parse(JSON.stringify(stateForSave())); w2.style = 'sgg'; loadProjectData(w2, null); await sleep(300);
ov = await openPop();
R.sgg = { pop: !!ov, cards: cards().map((b) => ({ mode: b.dataset.mode, dis: b.getAttribute('aria-disabled') === 'true', on: b.classList.contains('choicePending'), txt: b.textContent })) };
cards().find((b) => b.dataset.mode === 'geolayers').click(); await sleep(80);
R.sgg.afterPick = cards().map((b) => b.classList.contains('choicePending'));
const n0 = caps.ae.length;
$q('#tossOv [data-cancel]').click(); await sleep(400);
R.sgg.closed = !$q('#tossOv .aeModeCards'); R.sgg.sent = caps.ae.length - n0;
R.geoCaps = caps.geoCaps;
window.fetch = realFetch;
return R;

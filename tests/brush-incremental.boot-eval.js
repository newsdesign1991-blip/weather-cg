// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/brush-incremental.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱에서 합성 PointerEvent 로 브러쉬 모드 → SHIFT+클릭 영역 선택 → 덧칠·지우개 → 되돌리기·다시 실행을 해 보고,
// 런 이미지(PNG)를 픽셀로 비교한다: 되돌리면 칠하기 전과 같고, 다시 실행하면 칠한 직후와 같아야 한다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
for (let i = 0; i < 12; i++) {   // 둘러보기·공지 등 부팅 팝업 닫기
  if ($('#tourWrap.on')) $('#tourClose').click();
  const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
  await sleep(150);
  if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
}
// 시도군 지도로 시작(시작 화면이면 CG 구성에서 고르기)
if ($('#startOverlay').classList.contains('on')) { $('#startSetup').click(); await sleep(400); }
else { $('#cgSetupBtn').click(); await sleep(400); }
$('#resBtns [data-res="1920x1080"]')?.click(); $('#styleBtns [data-style="sgg"]')?.click(); await sleep(80);
if ($('#cgsDone') && !$('#cgsDone').disabled) $('#cgsDone').click(); else $('#cgsX')?.click();
await sleep(1500);
for (let i = 0; i < 8; i++) { const x = document.querySelector('#tossOv .tossX'); if (x) x.click(); if ($('#tourWrap.on')) $('#tourClose').click(); await sleep(120); }
// 브러쉬 이미지 갱신(비동기)이 끝날 때까지
let mut = 0;
new MutationObserver(() => { mut++; }).observe($('#cg'), { subtree: true, attributes: true, attributeFilter: ['href', 'style'], childList: true });
const settle = async () => { let last = -1; for (let i = 0; i < 100; i++) { await sleep(120); if (mut === last) return; last = mut; } };
// 드래그 중 PNG 인코딩(toDataURL) 횟수 세기
let toDataURLs = 0;
const oTD = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (...a) { toDataURLs++; return oTD.apply(this, a); };
const R = { errors: [] };
$('#mBrush').click(); await sleep(300);
const sido = (id) => (id.includes('/') ? id.split('/')[0] : id);
const zonesOf = (s) => [...document.querySelectorAll('#gMain > path.zone')].filter((z) => sido(z.dataset.id) === s);
const pt = (s) => { const z = zonesOf(s).map((z) => ({ z, r: z.getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]; return { z: z.z, x: z.r.left + z.r.width / 2, y: z.r.top + z.r.height / 2, r: z.r }; };
const A = pt('경기'), B = pt('강원');
const pe = (type, x, y, o = {}) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true, ...o });
const top = (x, y) => document.elementFromPoint(x, y) || A.z;
// SHIFT+클릭 영역 선택
for (const p of [A, B]) { top(p.x, p.y).dispatchEvent(pe('pointerdown', p.x, p.y, { shiftKey: true })); window.dispatchEvent(pe('pointerup', p.x, p.y, { shiftKey: true })); await sleep(50); }
R.selHi = document.querySelectorAll('.brushSelHi').length;
// 획: 시작점에서 누르고 지그재그로 움직였다가 뗀다
const stroke = async (p, n, opt = {}) => {
  const pts = []; for (let i = 0; i < n; i++) pts.push([p.x + Math.sin(i / 3) * p.r.width * 0.25, p.y - p.r.height * 0.2 + (i / n) * p.r.height * 0.4]);
  top(pts[0][0], pts[0][1]).dispatchEvent(pe('pointerdown', pts[0][0], pts[0][1], opt));
  const before = toDataURLs;
  for (const [x, y] of pts.slice(1)) { window.dispatchEvent(pe('pointermove', x, y, opt)); await sleep(4); }
  R.toDataURLDuringDrag = (R.toDataURLDuringDrag || 0) + (toDataURLs - before);
  window.dispatchEvent(pe('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1], opt));
  await settle();
};
const setCol = (c) => { const i = $('#curHex'); i.value = c; i.dispatchEvent(new Event('change', { bubbles: true })); };
const capture = () => [...document.querySelectorAll('image.brushLayer[data-col]')].map((im) => ({ col: im.getAttribute('data-col'), run: im.getAttribute('data-run'), href: im.getAttribute('href') || '', disp: im.style.display || '', geo: ['x', 'y', 'width', 'height'].map((k) => im.getAttribute(k)).join(',') }));
const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
const pix = async (u) => { const i = await load(u); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
const same = async (a, b) => {
  if (a.length !== b.length) return { ok: false, why: `이미지 수 ${a.length}≠${b.length}` };
  let maxd = 0, painted = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k].col !== b[k].col || a[k].run !== b[k].run) return { ok: false, why: `런 ${k} 색/순번 다름` };
    if (a[k].geo !== b[k].geo) return { ok: false, why: `런 ${k} 위치·크기 다름 ${a[k].geo} ≠ ${b[k].geo}` };   // 런 캔버스 범위(잘라 든 크기)도 같아야
    if (a[k].href === b[k].href) continue;
    const [p, q] = await Promise.all([pix(a[k].href), pix(b[k].href)]);
    for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i] - q[i]); if (d > maxd) maxd = d; if ((i & 3) === 3 && p[i]) painted++; }
  }
  return { ok: maxd === 0, maxd, painted };
};
setCol('#E5231E'); await stroke(A, 30);
setCol('#E5231E'); await stroke(B, 25);   // 같은 색 → 같은 런
const s2 = capture();
R.afterTwo = s2.map((x) => x.col + ':' + x.run);
setCol('#2E6FB0'); await stroke(A, 30);   // 다른 색 → 새 런(앞 런 덮기)
await stroke(A, 20, { ctrlKey: true });   // Ctrl = 지우개
setCol('#3DAA5C'); await stroke(B, 25);
const s5 = capture();
R.afterFive = s5.map((x) => x.col + ':' + x.run);
R.live = [...document.querySelectorAll('.brushLayer.brushLive')].map((e) => e.tagName + ':' + (e.style.display || 'shown') + ':' + (e.firstChild && e.firstChild.tagName));
const liveEmpty = () => [...document.querySelectorAll('.brushLayer.brushLive canvas')].every((c) => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; });
R.liveEmpty = liveEmpty();
R.imgsShown = s5.every((x) => x.disp === '');
// 되돌리기 3번 → 두 획 칠한 직후와 같아야(조각 복원)
for (let i = 0; i < 3; i++) { $('#undo').click(); await settle(); }
R.undo3 = await same(capture(), s2);
// 다시 실행 3번 → 다섯 획 직후와 같아야(다시 더하기)
for (let i = 0; i < 3; i++) { $('#redo').click(); await settle(); }
R.redo3 = await same(capture(), s5);
// 연달아 빠르게 — 손 떼자마자 다음 획(앞 획 PNG 인코딩을 기다리지 않는다): 누를 때 동기 toDataURL 없음, 끝나면 이미지 보이고 라이브 비움
const quick = async (p, n, opt = {}, end = 'pointerup') => {
  const pts = []; for (let i = 0; i < n; i++) pts.push([p.x + Math.cos(i / 2) * p.r.width * 0.2, p.y - p.r.height * 0.15 + (i / n) * p.r.height * 0.3]);
  top(pts[0][0], pts[0][1]).dispatchEvent(pe('pointerdown', pts[0][0], pts[0][1], opt));
  for (const [x, y] of pts.slice(1)) { window.dispatchEvent(pe('pointermove', x, y, opt)); await sleep(2); }
  if (end) window.dispatchEvent(pe(end, pts[pts.length - 1][0], pts[pts.length - 1][1], opt));
};
const workN = () => { try { const w = JSON.parse(localStorage.getItem('wcg_work')); return w.brushByStyle[w.style].length; } catch (e) { return -1; } };
const td0 = toDataURLs;
setCol('#E5231E'); await quick(A, 14); await quick(B, 14); setCol('#2E6FB0'); await quick(A, 14); await quick(A, 10, { ctrlKey: true }); await quick(B, 14);
R.rapidToDataURL = toDataURLs - td0;
await settle(); await sleep(700);
R.rapidImgsShown = capture().every((x) => x.disp === '');
R.rapidLiveEmpty = liveEmpty();
R.rapidStrokes = workN();
// pointercancel 로 끝나도 획이 남고, 손 뗌을 놓친 채 같은 포인터로 다시 누르면 앞 획을 끝내고 새로 칠한다
await quick(A, 10, {}, 'pointercancel');
await quick(B, 10, {}, null);   // pointerup 없음
await quick(A, 10);
await settle(); await sleep(700);
R.lostUpStrokes = workN() - R.rapidStrokes;
R.lostUpImgsShown = capture().every((x) => x.disp === '');
await sleep(1800);   // 자동 저장(1.5초 주기)
R.work = (() => { try { const w = JSON.parse(localStorage.getItem('wcg_work')); const b = w.brushByStyle[w.style]; return { n: b.length, keys: Object.keys(b[0]).sort().join(','), erase: b.filter((s) => s.erase).length }; } catch (e) { return String(e); } })();
HTMLCanvasElement.prototype.toDataURL = oTD;
return R;

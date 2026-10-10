/* [모듈] js/map-render.js — 지도 렌더: 위치/잠금, 예보지도 연결, Mapbox 타일·위성 basemap, 인셋, 칠(renderFills), 경계선, 바다, 배경(renderBg) */
'use strict';

// ===================== 렌더 =====================
function renderMapTransform() {
  brushViewRev++;   // 칠하는 중이면 화면→지도 좌표 변환을 다시 구하게
  const t = `translate(${S.map.x} ${S.map.y}) scale(${S.map.s})`;
  $('#mapT').setAttribute('transform', t);
  $('#bgMapT').setAttribute('transform', t);
  document.querySelector('#L_mapBase [data-blindmapt]')?.setAttribute('transform', t);   // 블라인드 베이스 지도도 카메라를 따라간다
  // 지도 전체 크기 핸들 — 본토 오른쪽 아래 모서리에 붙인다.
  // 캔버스 밖으로 나가면 잘려서(overflow:hidden) 못 잡으므로 프레임 안에 붙잡아 둔다.
  const g = $('#mapGrip');
  if (g) {
    const h = MAP.mainH / 2;
    const gx = clamp(S.map.x + h * 0.62 * S.map.s, 22, 1898);
    const gy = clamp(S.map.y + h * S.map.s, 22, 1058);
    g.setAttribute('transform', `translate(${gx} ${gy})`);
    g.style.display = (mode === 'move' && !S.mapLock) ? '' : 'none';   // 잠금 중엔 크기 핸들도 숨김
  }
  // 지도에 고정된 산은 지도가 옮겨가거나 커지면 같이 따라가야 한다
  if (S.mtns && S.mtns.some((m) => m.anchor)) renderMtns();
  // 해상 구역(#seaT)은 #mapT 밖이라 따로 맞춘다(카메라·Alt 팬/줌·휠 경로 포함) — 페이드 마스크·선 굵기도 함께
  if (MAP.styles[S.style] && MAP.styles[S.style].sea) renderSea();
  // 태풍 경로/반경/라벨도 경위도 기준이라 지도 이동·확대에 따라와야 한다
  if (typeof isTyphoon === 'function' && isTyphoon()) renderTyphoon();
  if (typeof syncMapPosUI === 'function') syncMapPosUI();   // 좌표 숫자 표시 항상 최신
}
// 지도 위치 좌표 숫자·잠금 UI를 현재 상태로 맞춘다(입력 중 포커스면 건드리지 않음).
function syncMapPosUI() {
  const ax = document.activeElement;
  const set = (id, v) => { const n = document.getElementById(id); if (n && n !== ax) n.value = v; };
  set('mapPosX', Math.round(S.map.x)); set('mapPosY', Math.round(S.map.y)); set('mapPosS', +(+S.map.s).toFixed(3));
  const lk = document.getElementById('mapLock'); if (lk) lk.checked = !!S.mapLock;
  const btn = document.getElementById('mapLockBtn'); if (btn) { btn.classList.toggle('locked', !!S.mapLock); btn.title = S.mapLock ? '지도 잠김 — 눌러서 해제' : '지도 잠금 — 눌러서 잠그기'; }
}
// 지도 잠금 켜고/끄기(패널 체크박스·아트보드 자물쇠 버튼 공용).
function setMapLock(v) { S.mapLock = v ? 1 : 0; syncMapPosUI(); { const g = $('#mapGrip'); if (g) g.style.display = (mode === 'move' && !S.mapLock) ? '' : 'none'; } status(S.mapLock ? '지도 잠금 켜짐 — 팬·줌·방향키 차단' : '지도 잠금 해제', true); }
// 지도 위치 좌표 입력/복사/잠금 배선(1회).
function wireMapPos() {
  const apply = () => {
    const x = +document.getElementById('mapPosX').value, y = +document.getElementById('mapPosY').value, s = +document.getElementById('mapPosS').value;
    if (!isFinite(x) || !isFinite(y) || !isFinite(s)) return;
    pushUndo('mappos');
    S.map.x = Math.round(x); S.map.y = Math.round(y); S.map.s = Math.max(0.02, Math.min(4, s));
    renderMapTransform(); renderStrokeScale(); renderSea(); if (typeof applyTilt === 'function') applyTilt();   // 배율이 바뀌면 경계선 굵기도 보정
    status(`지도 위치 · X ${S.map.x} · Y ${S.map.y} · 확대 ${S.map.s}`, true);
  };
  const ap = document.getElementById('mapPosApply'); if (ap) ap.onclick = apply;
  ['mapPosX', 'mapPosY', 'mapPosS'].forEach((id) => { const n = document.getElementById(id); if (n) n.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }; });
  const cp = document.getElementById('mapPosCopy'); if (cp) cp.onclick = async () => {
    const txt = `${Math.round(S.map.x)}, ${Math.round(S.map.y)}, ${(+S.map.s).toFixed(3)}`;
    try { await navigator.clipboard.writeText(txt); } catch (e) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (_) {} t.remove(); }
    cp.textContent = '복사됨'; setTimeout(() => { cp.textContent = '복사'; }, 1400);
  };
  const lk = document.getElementById('mapLock'); if (lk) lk.onchange = () => setMapLock(lk.checked);
  const btn = document.getElementById('mapLockBtn'); if (btn) btn.onclick = () => setMapLock(!S.mapLock);
  wireBasemap();
  wireFctMap();
}
// 아트보드 '지금 칠하는 구분' 배지 배선(1회 — 옛 전국/서울 지도 종류 버튼 자리·id 그대로).
// 누르면 팝오버: 예상 강수·적설이면 [시군 | 시도] 고르기(setStyle), 그 밖은 지금 구분 한 줄 + [장면 설정 열기](다른 자료 = 다른 카드).
let _fctMapWired = false;
function wireFctMap() {
  if (_fctMapWired) return;
  const btn = $('#fctMapBtn'), pop = $('#fctMapPop');
  if (!btn || !pop) return;
  _fctMapWired = true;
  btn.onclick = (e) => { e.stopPropagation(); const open = pop.style.display !== 'none'; if (!open) mapUnitPopFill(pop); pop.style.display = open ? 'none' : ''; };
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !pop.contains(b) || b.disabled) return;
    e.stopPropagation();
    pop.style.display = 'none';
    if (b.dataset.style) { if (S.style !== b.dataset.style && MAP.styles[b.dataset.style]) setStyle(b.dataset.style); }
    else if (b.dataset.act === 'setup') openCgSetup();
  });
  document.addEventListener('pointerdown', (e) => { if (pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) pop.style.display = 'none'; });
  syncMapUnit();
}

// ── Mapbox 실시간 타일 (개인 URL, 브라우저 로컬에만 저장 — 프로젝트/깃 미포함) ──
const MBX_KEY = 'wcg_mapbox_url';
function mapboxUrlRaw() { try { return localStorage.getItem(MBX_KEY) || ''; } catch (e) { return ''; } }
function setMapboxUrl(v) { try { if (v) localStorage.setItem(MBX_KEY, v); else localStorage.removeItem(MBX_KEY); } catch (e) {} }
// 붙여넣은 URL을 {z}/{x}/{y} 타일 템플릿으로 정규화. 스타일/WMTS URL이면 tiles 템플릿으로 변환.
function mapboxTileTemplate() {
  let u = mapboxUrlRaw().trim(); if (!u) return '';
  if (u.indexOf('{z}') >= 0) return u;   // 이미 타일 템플릿
  const tok = (u.match(/access_token=([^&\s]+)/) || [])[1] || '';
  const m = u.match(/styles\/v1\/([^\/]+)\/([^\/?]+)/);   // mapbox 스타일/WMTS URL
  if (m && tok) return 'https://api.mapbox.com/styles/v1/' + m[1] + '/' + m[2] + '/tiles/256/{z}/{x}/{y}@2x?access_token=' + tok;
  const r = u.match(/\/v4\/([^\/?]+)/);   // raster(mapbox.satellite 등)
  if (r && tok) return 'https://api.mapbox.com/v4/' + r[1] + '/{z}/{x}/{y}@2x.jpg90?access_token=' + tok;
  return u;   // 알 수 없으면 그대로(사용자가 직접 템플릿을 준 것으로 간주)
}
const _lon2xt = (lon, n) => (lon + 180) / 360 * n;
const _lat2yt = (lat, n) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
const _yt2lat = (y, n) => { const t = Math.PI * (1 - 2 * y / n); return Math.atan(Math.sinh(t)) * 180 / Math.PI; };
// 타일 data URI 캐시 — 실시간 타일은 외부 URL이라 SVG 래스터(3D·추출)엔 안 들어감. 로드 때 data URI로도 받아 캐시하고,
// svgToImage(래스터)에서 href를 이 data URI로 바꿔 끼워 넣는다 → 3D 회전·영상/이미지 추출에도 타일이 나온다.
const _tileData = {};
const _tileWait = {};   // 받는 중인 타일 → 약속(같은 타일을 두 번 안 받게)
let _mbxCacheBust = '';   // '적용'(재publish 반영) 때마다 바꿔 캐시(메모리·디스크·브라우저 HTTP)를 우회해 새 타일을 받는다
// 지도 타일 받기 — 데스크톱 앱이면 메인의 디스크 캐시(desktop/tile-cache.js: 한 번 받은 타일은 이 PC에서 바로, 버튼 없이 자동),
// 아니면(웹·캐시가 거절한 주소) 그냥 fetch. Mapbox 실시간 타일(아래)·가벼운 지도 벡터 타일(js/gl-basemap.js)·렌더 전 미리 받기가 같이 쓴다.
// 디스크 캐시 길이 안 되면 그냥 fetch로 — 앱을 새로 켜지 않고 새로고침만 해 메인에 받는 곳('wcg:tile-get')이 아직 없을 때(invoke가 거절),
// 메인이 못 받았을 때(사내 프록시 등). 서버가 분명히 답한 4xx(타일 없음)만 그대로 실패. 메인 길이 연달아 3번 안 되는데 fetch는 되면 이번 실행 동안 끈다.
// 돌려주는 것: { data: Uint8Array, type } — 못 받으면 throw
let _tileIpcOff = false, _tileIpcMiss = 0;
async function tileFetch(url) {
  const d = window.wcgDesktop;
  let viaIpcFailed = false;
  if (!_tileIpcOff && d && typeof d.tileGet === 'function') {
    let r = null;
    try { r = await d.tileGet(url); } catch (e) { r = null; _tileIpcOff = true; }   // 받는 곳 없음(옛 메인) — 이번 실행 동안 fetch로
    if (r && r.ok) { _tileIpcMiss = 0; return { data: r.body, type: r.type || '' }; }
    if (r && r.err === 'http' && r.status >= 400 && r.status < 500) throw new Error('tile http ' + r.status);
    viaIpcFailed = !!r && r.err !== 'denied';
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('tile http ' + res.status);
  if (viaIpcFailed && ++_tileIpcMiss >= 3) _tileIpcOff = true;   // 메인은 못 받는데 여기선 받힌다 — 디스크 캐시 길을 쉰다
  return { data: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') || '' };
}
// 타일 하나를 data URI로(래스터·추출용 _tileData, 화면 <image>도 이걸로). quiet = 렌더 전 미리 받기 — 화면·틸트를 건드리지 않는다.
// 돌려주는 것: data URI 또는 null(실패). 진행 중이면 _tileData[url] = null, 실패하면 지운다(undefined).
function fetchTileData(url, quiet) {
  if (_tileData[url]) return Promise.resolve(_tileData[url]);
  if (_tileWait[url]) return _tileWait[url];
  _tileData[url] = null;
  const p = tileFetch(url)
    .then(({ data, type }) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(new Blob([data], { type: type || 'image/jpeg' })); }))
    .then((durl) => {
      _tileData[url] = durl;
      mbxTileShow(url, durl);
      if (!quiet) { tiltInvalidate(); if (camActive3d()) applyTilt(); }   // 틸트 그림(태풍 바탕 포함)에 새 타일을 넣게 다시 굽는다 — 평면이면 미리 구운 그림만 버린다
      return durl;
    })
    .catch(() => { delete _tileData[url]; return null; })
    .finally(() => { delete _tileWait[url]; });
  _tileWait[url] = p;
  return p;
}
// 받은 타일을 화면 <image>에 — 새 배율 타일이 다 떴으면 밑에 남겨 둔 옛 배율 타일(data-stale)을 치운다
function mbxTileShow(url, durl) {
  const g = $('#typhoonTiles'); if (!g) return;
  g.querySelectorAll('image[data-url="' + CSS.escape(url) + '"]').forEach((im) => { if (!im.hasAttribute('href')) im.setAttribute('href', durl); });
  mbxDropStale(g);
}
function mbxDropStale(g) {
  if (!g.querySelector('image[data-stale]')) return;
  if (g.querySelector('image:not([data-stale]):not([href])')) return;   // 아직 안 뜬 새 타일이 있다 — 그 자리 빈 격자가 안 보이게 옛 타일을 둔다
  g.querySelectorAll('image[data-stale]').forEach((im) => im.remove());
}
// cam {x,y,s} 화면(여백 mgn 배)에 필요한 Mapbox 타일 — 배율 z와 타일 범위(타일 수 상한 cap을 넘으면 배율을 낮춘다)
function mapboxTileSet(cam, mgn, cap) {
  const [W, H] = RES[S.res].size;
  const { cx0, cy0, scale } = MAP.proj, s = +cam.s || 1;
  const ll = (x, y) => { const mx = (x - cam.x) / s / scale + cx0, my = cy0 - (y - cam.y) / s / scale; return [mx * 180 / Math.PI, (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI]; };
  const cs = [ll(0, 0), ll(W, 0), ll(0, H), ll(W, H)];
  let lo0 = Math.min(...cs.map((c) => c[0])), lo1 = Math.max(...cs.map((c) => c[0]));
  let la0 = Math.min(...cs.map((c) => c[1])), la1 = Math.max(...cs.map((c) => c[1]));
  const dlo = (lo1 - lo0) * mgn, dla = (la1 - la0) * mgn;
  lo0 -= dlo; lo1 += dlo; la0 = Math.max(-85, la0 - dla); la1 = Math.min(85, la1 + dla);
  let z = Math.max(2, Math.min(9, Math.round(Math.log2(2 * Math.PI * scale * s / 512))));
  let n = Math.pow(2, z);
  let x0 = Math.floor(_lon2xt(lo0, n)), x1 = Math.floor(_lon2xt(lo1, n));
  let y0 = Math.floor(_lat2yt(la1, n)), y1 = Math.floor(_lat2yt(la0, n));
  while ((x1 - x0 + 1) * (y1 - y0 + 1) > cap && z > 2) {   // 타일 과다 방지
    z--; n = Math.pow(2, z);
    x0 = Math.floor(_lon2xt(lo0, n)); x1 = Math.floor(_lon2xt(lo1, n));
    y0 = Math.floor(_lat2yt(la1, n)); y1 = Math.floor(_lat2yt(la0, n));
  }
  return { z, n, x0, x1, y0: Math.max(0, y0), y1: Math.min(n - 1, y1) };
}
function mapboxTileUrl(tmpl, z, tx, ty, n) {
  const X = ((tx % n) + n) % n;
  let url = tmpl.replace('{z}', z).replace('{x}', X).replace('{y}', ty);
  if (_mbxCacheBust) url += (url.indexOf('?') >= 0 ? '&' : '?') + '_cb=' + _mbxCacheBust;   // 재publish 반영 시 새 URL로
  return url;
}
// 여백·상한 — 3D 틸트는 원근으로 뷰포트보다 훨씬 넓은 영역이 보이므로 넉넉히(그 만큼 타일 미리 로드 → '탁탁' 방지). 추출은 커버 우선(상한 크게).
// 평면 프레임 추출은 프레임만 그리므로(svgToImage 뷰박스 = 프레임) 화면과 같은 여백 — 블리드(사방 1배)까지 받으면 타일이 3~4배(첫 렌더 미리 받기가 느려짐)
const mbxMargin = () => (camActive3d() ? CAM_BLEED : 0.3);
const mbxCap = () => ((camActive3d() || _exportingFrames) ? 300 : 140);
const camTilted = (c) => Math.abs(+c.rx || 0) > 0.05 || Math.abs(+c.ry || 0) > 0.05 || Math.abs(+c.rz || 0) > 0.05;   // setCamRot의 3D 켜짐 기준
// 렌더 전 미리 받기(js/export-video.js prefetchRenderTiles) — 카메라 프레임들(cams)의 추출에 필요한 타일 주소(추출 때 updateMapboxTiles와 같은 여백·상한)
function mapboxPrefetchUrls(cams) {
  const tmpl = mapboxTileTemplate(); if (!tmpl) return [];
  const out = new Set();
  for (const c of cams) {
    const t = mapboxTileSet(c, camTilted(c) ? CAM_BLEED : 0.3, 300);
    for (let ty = t.y0; ty <= t.y1; ty++) for (let tx = t.x0; tx <= t.x1; tx++) out.add(mapboxTileUrl(tmpl, t.z, tx, ty, t.n));
  }
  return [...out];
}
let _mbxT = 0;
function scheduleMapboxTiles() { clearTimeout(_mbxT); _mbxT = setTimeout(updateMapboxTiles, 120); }
function updateMapboxTiles() {
  const g = $('#typhoonTiles'); if (!g) return;
  const T = S.typhoon;
  const on = isTyphoon() && T && T.basemap === 'mapbox';
  const tmpl = on ? mapboxTileTemplate() : '';
  if (!on || !tmpl) { g.style.display = 'none'; if (!on) g.textContent = ''; return; }
  g.style.display = '';
  const t = mapboxTileSet(S.map, mbxMargin(), mbxCap());
  const { z, n } = t;
  const need = {};
  for (let ty = t.y0; ty <= t.y1; ty++) {
    for (let tx = t.x0; tx <= t.x1; tx++) {
      const key = z + '/' + tx + '/' + ty; need[key] = 1;
      const old = g.querySelector('image[data-k="' + key + '"]');
      if (old) { old.removeAttribute('data-stale'); continue; }
      const tl = projLL(tx / n * 360 - 180, _yt2lat(ty, n)), br = projLL((tx + 1) / n * 360 - 180, _yt2lat(ty + 1, n));
      const url = mapboxTileUrl(tmpl, z, tx, ty, n);
      const im = _te('image', { 'data-k': key, 'data-url': url, x: tl[0], y: tl[1], width: (br[0] - tl[0]), height: (br[1] - tl[1]), preserveAspectRatio: 'none' });
      // 그림은 받은 data URI로(디스크 캐시를 거친다 — 화면·래스터·추출이 같은 한 번 받기). 아직이면 받은 뒤 mbxTileShow가 채운다
      if (_tileData[url]) im.setAttribute('href', _tileData[url]);
      g.appendChild(im);   // 새 타일은 위에(옛 배율 타일은 밑에 남아 빈 격자를 가린다)
      if (!_tileData[url]) fetchTileData(url);
    }
  }
  // 필요 없어진 타일: 새 타일이 다 떴으면 바로 치우고, 아직이면 밑에 남겨 둔다(카메라 확대로 배율이 바뀔 때 빈 격자가 번쩍이지 않게). 너무 쌓이면 오래된 것부터
  const gone = [...g.children].filter((ch) => !need[ch.getAttribute('data-k')]);
  gone.forEach((ch) => ch.setAttribute('data-stale', '1'));
  if (gone.length > 400) gone.slice(0, gone.length - 400).forEach((ch) => ch.remove());
  mbxDropStale(g);
}

// 지도 배경(파란/위성/Mapbox) 선택 버튼 + 팝오버
let _basemapWired = false;
function wireBasemap() {
  if (_basemapWired) return;   // renderInsets가 여러 번 불려도 1회만 바인딩(리스너 중복 방지)
  const btn = $('#basemapBtn'), pop = $('#basemapPop'), box = $('#bmMbxBox'), urlIn = $('#bmMbxUrl'), applyBtn = $('#bmMbxApply');
  if (!btn || !pop) return;
  _basemapWired = true;
  const glBox = $('#bmGlBox');   // 가벼운 지도(WebGL · 시험) 상태 줄 — js/gl-basemap.js
  glbWire();
  const syncOpts = () => {
    const cur = (S.typhoon && S.typhoon.basemap) || 'blue';
    pop.querySelectorAll('.bmOpt').forEach((b) => b.classList.toggle('on', b.dataset.bm === cur));
    if (box) box.style.display = cur === 'mapbox' ? '' : 'none';
    if (glBox) { glBox.style.display = cur === 'gl' ? '' : 'none'; glbUi(); }
    if (urlIn && document.activeElement !== urlIn) urlIn.value = mapboxUrlRaw();
  };
  btn.onclick = (e) => { e.stopPropagation(); const open = pop.style.display !== 'none'; pop.style.display = open ? 'none' : ''; if (!open) syncOpts(); };
  pop.querySelectorAll('.bmOpt').forEach((b) => { b.onclick = (e) => {
    e.stopPropagation();
    if (!S.typhoon) return;
    pushUndo(); S.typhoon.basemap = b.dataset.bm;
    renderTyphoon();
    { const eye = $('#typGridEye'); if (eye) eye.classList.toggle('off', !typhoonGridOn(S.typhoon)); }   // 격자 켜기는 배경마다 따로(위성은 기본 끔)
    if (b.dataset.bm === 'mapbox') { syncOpts(); updateMapboxTiles(); status('Mapbox 실시간 타일' + (mapboxTileTemplate() ? '' : ' — URL을 붙여넣으세요'), true); }
    else if (b.dataset.bm === 'gl') { glbPicked(); syncOpts(); }   // 팝오버는 열어 둔다 — 불러오는 중·실패 상태 줄을 보이게
    else { pop.style.display = 'none'; status({ satellite: '밝은 위성지도', satdark: '어두운 위성지도' }[b.dataset.bm] || '파란 지도', true); }
  }; });
  if (applyBtn) applyBtn.onclick = (e) => {
    e.stopPropagation();
    setMapboxUrl((urlIn && urlIn.value || '').trim());
    _mbxCacheBust = String(Date.now());            // 재publish 반영 — 캐시(메모리·HTTP) 우회
    for (const k in _tileData) delete _tileData[k];   // 메모리 타일 캐시 비우기
    const g = $('#typhoonTiles'); if (g) g.textContent = '';   // 기존 타일 이미지 제거 → 새 URL로 다시 받게
    if (S.typhoon) S.typhoon.basemap = 'mapbox';
    renderTyphoon(); updateMapboxTiles();
    status(mapboxTileTemplate() ? 'Mapbox 타일 적용됨 (새로 불러옴)' : 'URL을 확인하세요', true);
  };
  document.addEventListener('pointerdown', (e) => { if (pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) pop.style.display = 'none'; });
}

function renderInsets() {
  bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
  brushViewRev++;     // 칠하는 중이면 화면→섬 좌표 변환을 다시 구하게
  // '특보 + 해상' 지도는 도서 박스를 안 쓴다 — 섬이 전부 제자리에 있으므로 박스·핸들을 숨긴다
  const off = !!curStyle().noInsets;
  for (const key of Object.keys(S.insets)) {
    const c = S.insets[key];
    for (const id of ['#inset-', '#box-', '#grip-', '#hit-']) {
      const n = $(id + key);
      if (n) n.style.display = off ? 'none' : (id === '#grip-' ? (mode === 'move' ? '' : 'none') : '');
    }
    if (off) continue;
    const [bx, by, bw, bh] = c.box;
    const anchor = c.anchorXY ? c.anchorXY
      : c.anchor ? projLL(c.anchor[0], c.anchor[1])
      : (() => { const b = insetBBox(key); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; })();
    const cxp = bx + bw / 2 + c.ox, cyp = by + bh / 2 + c.oy;
    $('#insetT-' + key).setAttribute('transform',
      `translate(${cxp} ${cyp}) scale(${c.s}) translate(${-anchor[0]} ${-anchor[1]})`);

    const cr = $('#cliprect-' + key);
    cr.setAttribute('x', bx); cr.setAttribute('y', by);
    cr.setAttribute('width', bw); cr.setAttribute('height', bh);

    const box = $('#box-' + key);
    box.setAttribute('x', bx); box.setAttribute('y', by);
    box.setAttribute('width', bw); box.setAttribute('height', bh);
    box.setAttribute('stroke', c.show ? 'rgba(255,255,255,.42)' : 'none');
    box.setAttribute('stroke-width', 1.4);

    const hit = $('#hit-' + key);
    if (hit) {
      hit.setAttribute('x', bx); hit.setAttribute('y', by);
      hit.setAttribute('width', bw); hit.setAttribute('height', bh);
      // 칠하기 모드에선 박스가 클릭을 가로채면 안 된다
      hit.setAttribute('pointer-events', mode === 'move' ? 'all' : 'none');
    }
    const grip = $('#grip-' + key);
    if (grip) {
      grip.setAttribute('transform', `translate(${bx + bw} ${by + bh})`);
      grip.style.display = mode === 'move' ? '' : 'none';
    }
  }
  renderFills(); // 인셋 배율이 바뀌면 경계선 굵기 보정도 다시
  // 인셋(제주 등)에 고정된 산은 박스가 옮겨가거나 커지면 같이 따라간다
  if (S.mtns && S.mtns.some((m) => m.anchor && m.anchor.inset)) renderMtns();
}

function renderFills() {
  bumpMapContent();
  const F = fills();
  const overlap = typeof wrnOverlapPlan === 'function' ? wrnOverlapPlan() : {};
  svg.querySelectorAll('[data-wrnstripe]').forEach((p) => p.remove());
  for (const [id, arr] of zoneEls) {
    const filled = !!F[id];
    const f = filled ? F[id] : S.base;
    // 밝은 모드: 칠한 구역의 테두리는 그 칠한 색으로 → 거의 안 보이게. 안 칠한 구역은 S.stroke(#e2e2e2 등).
    const sCol = (S.cgLight && filled) ? f : S.stroke;
    for (const { el: e, inset } of arr) {
      // 그룹 배율로 나눠서, 확대해도 경계선 굵기는 화면상 일정하게
      const sc = inset ? S.insets[inset].s : S.map.s;
      e.setAttribute('fill', overlap[id] ? wrnStripeFill(svg, overlap[id], sc, null, null, inset) : f);
      e.setAttribute('stroke', S.sggOn ? sCol : 'none');
      e.setAttribute('stroke-opacity', S.sggOp / 100);
      e.setAttribute('stroke-width', S.strokeW / (sc || 1));
    }
  }
  // 아사모사(부드러운 경계): '내륙·해안·산지'처럼 애매하게 표현된 구역만 블러로 번지게 하고,
  // '경북·전북' 같은 확실한 지명은 또렷하게 둔다. 애매한 구역만 블러 그룹(#gMainSoft)에 복제해 겹친다.
  // 경계선(#zoneLineMain 등)은 #gMain의 형제라 안 흐려진다.
  const gm = $('#gMain');
  if (gm) {
    const clipD = ($('#landClipMainP')?.getAttribute('d') || '');   // 클립 경로가 비면 클립을 안 건다(지도 통째로 사라짐 방지)
    let soft = $('#gMainSoft');
    const sz = (S.softZonesByStyle && S.softZonesByStyle[S.style]) || [];   // 지도 종류별 애매 구역
    const softIds = (S.softFill && Array.isArray(sz)) ? sz.filter((id) => F[id]) : [];
    if (S.softFill && softIds.length) {
      // 선별 블러 — 본토(#gMain)는 또렷하게 두고, 애매한 구역만 블러 오버레이로.
      // 확실한 지명(전북·경북 등)은 절대 흐려지지 않는다.
      gm.removeAttribute('filter'); gm.removeAttribute('clip-path');
      if (!soft) { soft = el('g', { id: 'gMainSoft' }); }
      if (soft.parentNode !== gm) gm.appendChild(soft);   // 항상 #gMain 안에 = 본토 변환 그대로 상속
      soft.setAttribute('filter', 'url(#softFillF)');
      soft.setAttribute('pointer-events', 'none');
      if (clipD.length > 4) soft.setAttribute('clip-path', 'url(#landClipMain)'); else soft.removeAttribute('clip-path');
      soft.textContent = '';
      for (const id of softIds) {
        const arr = zoneEls.get(id); if (!arr) continue;
        for (const { el: e, inset } of arr) { if (inset) continue; soft.appendChild(el('path', { 'data-id': id, d: e.getAttribute('d') || '', fill: F[id], stroke: 'none' })); }
      }
    } else {
      // 부드러운 경계 꺼짐, 또는 애매한 구역이 하나도 없으면 → 전부 또렷(블러 없음)
      if (soft) soft.remove();
      gm.removeAttribute('filter'); gm.removeAttribute('clip-path');
    }
  }
  renderZoneLines();
  renderSidoLines();
  renderSea();
  if (typeof syncSeoulPaintTop === 'function') syncSeoulPaintTop();   // 서울: 칠한 색을 한강 위로
  if (typeof regionSearchHighlight === 'function') regionSearchHighlight();
  if (typeof tlContentChanged === 'function') tlContentChanged();   // 타임라인이 열려 있으면 칠 레이어 행 확인(새 색 = 새 행)
}
// 지도 배율만 바뀌었을 때 — 칠(fill)은 건드리지 않고 경계선 굵기 보정(÷배율)만 다시. 좌표 입력·Alt 줌 확정에서 부른다.
function renderStrokeScale() {
  if (typeof wrnOverlapPlan === 'function' && Object.keys(wrnOverlapPlan()).length) { renderFills(); return; }
  for (const [, arr] of zoneEls) for (const { el: e, inset } of arr) {
    const sc = inset ? S.insets[inset].s : S.map.s;
    e.setAttribute('stroke-width', S.strokeW / (sc || 1));
  }
  renderZoneLines(); renderSidoLines();
}

// 실제 방송용 구역선 (베이스색). 작업용 선과 독립적으로 켜고 끈다.
function renderZoneLines() {
  const put = (node, sc) => {
    if (!node) return;
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', S.realOn ? S.realCol : 'none');
    node.setAttribute('stroke-opacity', S.realOp / 100);
    node.setAttribute('stroke-width', S.realW / (sc || 1));
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('pointer-events', 'none'); // 칠하기 클릭을 가로채면 안 된다
  };
  put($('#zoneLineMain'), S.map.s);
  for (const key of Object.keys(S.insets)) put(svg.querySelector(`[data-zoneline="${key}"]`), S.insets[key].s);
}

// 해상 특보구역. '특보 + 해상' 지도에서만 나온다. 안 칠한 구역은 기본 농도만큼만 비친다.
function renderSea() {
  bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
  const on = !!curStyle().sea;
  $('#L_sea').style.display = on ? '' : 'none';
  // 가장자리 페이드 — 캔버스가 아니라 '바다 영역 자체'의 좌·우·하단에서 사라지게 한다.
  // 그라디언트 범위를 바다 bbox에 맞춘다 (밖은 마지막 stop 색이 이어져서 자연스럽게 잘린다).
  if (S.seaFade > 0) {
    const b = $('#seaT').getBBox(); // 지도 좌표계 (transform 적용 전)
    const x0 = S.map.x + b.x * S.map.s, x1 = x0 + b.width * S.map.s;
    const y0 = S.map.y + b.y * S.map.s, y1 = y0 + b.height * S.map.s;
    const f = S.seaFade / 100;
    const gh = $('#seaFadeH');
    gh.setAttribute('x1', x0); gh.setAttribute('x2', x1);
    $('#seaFadeH1').setAttribute('offset', f);
    $('#seaFadeH2').setAttribute('offset', 1 - f);
    const gv = $('#seaFadeV');
    gv.setAttribute('y1', y0); gv.setAttribute('y2', y1);
    $('#seaFadeV1').setAttribute('offset', 1 - f);
    $('#L_sea').setAttribute('mask', 'url(#seaMask)');
  } else $('#L_sea').removeAttribute('mask');
  { const n = document.querySelector('.sec[data-sec="sea"]'); if (n) n.style.display = secDisplay('sea', n); }   // 창 비활성 탭이면 숨김 유지
  if (!on) { for (const p of document.querySelectorAll('#seaT .sea')) p.setAttribute('pointer-events', 'none'); return; }
  $('#seaT').setAttribute('transform', `translate(${S.map.x} ${S.map.y}) scale(${S.map.s})`);
  const overlap = typeof wrnOverlapPlan === 'function' ? wrnOverlapPlan() : {};
  for (const p of document.querySelectorAll('#seaT .sea')) {
    const f = S.seaFills[p.dataset.id];
    p.setAttribute('fill', overlap[p.dataset.id] ? wrnStripeFill(svg, overlap[p.dataset.id], S.map.s) : (f || S.seaBase));
    p.setAttribute('fill-opacity', f ? 1 : S.seaBaseOp / 100);
    p.setAttribute('stroke', S.seaCol);
    p.setAttribute('stroke-opacity', (f ? 1 : Math.max(S.seaBaseOp / 100, 0.25)) * (S.sggOp / 100));
    p.setAttribute('stroke-width', S.seaW / (S.map.s || 1));
    p.setAttribute('pointer-events', 'all');
  }
}

// 시도 경계선은 채운 조각들 위에 덧그린다 (같은 그룹 안에 있어야 인셋 transform을 따라감)
function renderSidoLines() {
  bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
  const put = (node, sc) => {
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', S.sidoOn ? S.sidoCol : 'none');
    node.setAttribute('stroke-opacity', S.sidoOp / 100);
    node.setAttribute('stroke-width', S.sidoW / (sc || 1));
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('pointer-events', 'none'); // 칠하기 클릭을 가로채면 안 된다
  };
  put($('#sidoMain'), S.map.s);
  for (const key of Object.keys(S.insets)) {
    const n = svg.querySelector(`[data-sido-inset="${key}"]`);
    if (n) put(n, S.insets[key].s);
  }
}

// 배경은 '타입(기본/비)'만 고르고, 실제 이미지는 CG 모드(어두운/밝은)에 따라 자동으로 고른다.
const BGS = { bg: '기본', bgRain: '비', bgVfDark: 'VF기본' };       // 고르는 타입 (bgVfDark = 노말 VF용 배경, CG모드 따라 어두움/밝음 자동)
const BG_LIGHT = { bg: 'bgBright', bgRain: 'bgBrightRain', bgVfDark: 'bgVfBright' };   // 각 타입의 밝은 모드 이미지
// 현재 S.bg를 유효한 타입으로 (옛 값 bgBright/bgBrightRain 은 타입으로 되돌린다)
function bgTypeOf() {
  let t = S.bg;
  if (t === 'bgBright') t = 'bg';
  if (t === 'bgBrightRain') t = 'bgRain';
  return (t in BGS) ? t : 'bg';
}
// 모드까지 반영한 실제 이미지 키
function bgKey() { const t = bgTypeOf(); return S.cgLight ? (BG_LIGHT[t] || t) : t; }

function renderBg() {
  bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
  const typh = isTyphoon();   // 태풍 지도는 한국 배경/이웃나라 대신 광역 바다·해안선을 쓴다
  const bg = $('#bgImg');
  const src = (bgUseFile && bgOverride) || IMG[bgKey()] || IMG.bg;
  if (src) bg.setAttribute('href', src);
  bg.style.display = (S.showBg && !typh) ? '' : 'none';
  markBgBtns();

  for (const [id, on] of [['#nbrNW', S.showNW], ['#nbrJP', S.showJP]]) {
    const n = $(id);
    n.setAttribute('fill', S.nbrCol);
    n.setAttribute('opacity', S.nbrOp / 100);
    // 실루엣(Natural Earth)과 남한 지도(행정동/기상청)는 출처가 달라서 휴전선에서 딱 안 맞는다.
    // 같은 색 선으로 살짝 부풀려 그 틈을 메운다. 남한 지도가 위에 덮이므로 넘친 부분은 안 보인다.
    n.setAttribute('stroke', S.nbrCol);
    n.setAttribute('stroke-width', S.nbrGrow);
    n.setAttribute('stroke-linejoin', 'round');
    n.style.display = (on && !typh && !isSeoul()) ? '' : 'none';   // 서울 지도에선 북한/이웃 실루엣 숨김
  }

  const g = $('#guideImg');
  const gsrc = S.res === '2158x1214' ? IMG.guide1214 : IMG.guide1080;
  if (gsrc) g.setAttribute('href', gsrc);
  $('#L_guide').style.display = S.showGuide ? '' : 'none';
  g.setAttribute('opacity', S.guideOp / 100);
  applyVfClip();
  renderVfBar();
}

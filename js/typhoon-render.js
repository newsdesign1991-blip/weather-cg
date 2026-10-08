/* [모듈] js/typhoon-render.js — 태풍 그리기: 예보 비교 경로·라벨, 진로선, 지명표시, 제목, 재생, renderTyphoon */
'use strict';

// ── 예보 비교(여러 기관 예보선 겹쳐 보기) ──
// S.typhoon.compare = [{ id, name, color, show, points:[...] }] — 각 예보의 스냅샷. 얇은 선 + 아주 작은 색틴트 아이콘, 반경 없음.
const CMP_PALETTE = ['#FF5A5A', '#FFC53D', '#31C48D', '#4C9AFF', '#B36BFF', '#FF77C2', '#20C9C9', '#FF8A3D'];
// 비교 트랙 진행도 — 정지(typhoonCmpProg==null)면 전체 표시.
function compareProg(id) { return (typhoonCmpProg && (id in typhoonCmpProg)) ? typhoonCmpProg[id] : null; }
// 임의 지점배열+진행도(prog: null=전체 / 0..1 비율) → 화면좌표(리빌 head 포함). 반경은 안 씀.
// 리빌은 '호길이(화면거리) 기준 등속' — 지점 간격이 불균일(JMA 과거 촘촘·예보 성김)해도 헤드가 일정 속도로 부드럽게 이동.
function compareScreenPts(points, prog) {
  const toS = (p, idx) => { const [x, y] = typhoonXY(p.lon, p.lat); return { x, y, idx, head: false, noIcon: !!p.noIcon,
    r15: (p.r15 || 0) ? typhoonKmToUnit(p.r15, p.lat) * S.map.s : 0, r25: (p.r25 || 0) ? typhoonKmToUnit(p.r25, p.lat) * S.map.s : 0, r70: (p.r70 || 0) ? typhoonKmToUnit(p.r70, p.lat) * S.map.s : 0 }; };
  const all = points.map(toS);
  if (prog == null || prog >= 1) return all;
  if (prog <= 0) return all.length ? [all[0]] : [];
  const seg = [], cum = [0]; let total = 0;
  for (let i = 0; i + 1 < all.length; i++) { const d = Math.hypot(all[i + 1].x - all[i].x, all[i + 1].y - all[i].y); seg.push(d); total += d; cum.push(total); }
  if (total <= 0) return all;
  const target = prog * total;
  const out = []; let i = 0;
  while (i + 1 < all.length && cum[i + 1] <= target) { out.push(all[i]); i++; }
  out.push(all[i]);
  if (i + 1 < all.length) { const t = seg[i] > 0 ? (target - cum[i]) / seg[i] : 0; const a = all[i], b = all[i + 1]; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, idx: i + t, head: true, noIcon: false, r15: (b.r15 || 0) ? lerp(a.r15 || 0, b.r15 || 0, t) : 0, r25: (b.r25 || 0) ? lerp(a.r25 || 0, b.r25 || 0, t) : 0, r70: (b.r70 || 0) ? lerp(a.r70 || 0, b.r70 || 0, t) : 0 }); }
  return out;
}
// 색별 아이콘 틴트 필터(빨강 몸통→그 색, 흰 눈 유지) — 색마다 하나만 만들어 재사용.
function ensureCmpTintFilter(hex) {
  const id = 'typCmpTint_' + String(hex).replace('#', '').toUpperCase();
  if (!document.getElementById(id)) {
    const defs = svg.querySelector('defs');
    if (defs) { const f = el('filter', { id, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }); f.appendChild(el('feColorMatrix', { type: 'matrix', values: iconTintValues(hex) })); defs.appendChild(f); }
  }
  return id;
}
// 비교용 '아주 작은' 태풍 아이콘(색 틴트). 선두(head)만 살짝 크게.
function compareIconEl(x, y, color, isHead, dot, scale) {
  const sc = scale == null ? 1 : scale;
  const IC = window.TYPHOON_ICON, r = (isHead ? 10 : 6) * sc;
  const g = _te('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
  if (dot) { const rr = r * 1.05; g.appendChild(_te('circle', { r: rr, fill: color, stroke: '#FFFFFF', 'stroke-width': Math.max(1.4, rr * 0.34) })); }   // 작은 원 모드
  else if (IC && IC.img) { const fid = ensureCmpTintFilter(color); const h = r * 2.5, w = h * (IC.w / IC.h); g.appendChild(_te('image', { href: IC.img, x: -w / 2, y: -h / 2, width: w, height: h, preserveAspectRatio: 'xMidYMid meet', filter: 'url(#' + fid + ')' })); }
  else g.appendChild(_te('circle', { r, fill: color, stroke: '#FFFFFF', 'stroke-width': 1.2 }));
  return g;
}
// 이 비교 예보에서 실제로 그릴 지점들(표시 날짜범위 반영).
function compareVisiblePoints(c) {
  let pts = (c && c.points) || [];
  if (c && c.rangeOn && (c.rangeFrom || c.rangeTo)) {
    const from = c.rangeFrom || '', to = c.rangeTo || '￿';
    pts = pts.filter((p) => { const d = typhoonDateKST(p.tmef); return d && d >= from && d <= to; });
  }
  return pts;
}
// 원본 지점 인덱스(c.labels[].idx) → 표시 지점(compareVisiblePoints) 인덱스. 날짜범위 밖이면 없음(undefined).
function compareVisibleIdxMap(c) {
  const all = (c && c.points) || [], vis = compareVisiblePoints(c), m = {};
  let k = 0; all.forEach((p, i) => { if (vis[k] === p) { m[i] = k; k++; } });
  return m;
}
// 수동 경로 점 편집 핸들 — 점 드래그(이동)·더블클릭(삭제)·선 중간 +(추가). L(#L_typhoon)에 그려 팬/줌·리렌더에 정렬 유지.
function drawPointHandles(L, c) {
  const pts = c.points || []; if (!pts.length) return;
  const scr = pts.map((p) => typhoonXY(p.lon, p.lat));
  for (let i = 0; i + 1 < scr.length; i++) {   // 선 중간 '+' = 그 자리에 점 추가
    const mx = (scr[i][0] + scr[i + 1][0]) / 2, my = (scr[i][1] + scr[i + 1][1]) / 2;
    const g = _te('g', { transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})`, style: 'cursor:pointer' }); g.style.pointerEvents = 'auto';
    g.appendChild(_te('circle', { r: 7, fill: '#0A1526', 'fill-opacity': 0.55, stroke: c.color, 'stroke-width': 1.4, 'stroke-dasharray': '2 2' }));
    g.appendChild(_te('path', { d: 'M-3.2 0H3.2M0 -3.2V3.2', stroke: '#FFFFFF', 'stroke-width': 1.7, 'stroke-linecap': 'round' }));
    const ii = i;
    g.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); revealSecFor('cmp', c.id); pushUndo(); c.points.splice(ii + 1, 0, { lon: (pts[ii].lon + pts[ii + 1].lon) / 2, lat: (pts[ii].lat + pts[ii + 1].lat) / 2, ws: 30, r15: 0, r25: 0, r70: 0, tmef: '', label: '', fcst: false }); (c.labels || []).forEach((l) => { if (l.idx > ii) l.idx++; }); buildCompareSection(); renderTyphoon(); });   // 뒤쪽 라벨은 같은 지점을 따라 한 칸 밀기
    L.appendChild(g);
  }
  scr.forEach((xy, i) => {   // 점 핸들 = 드래그 이동 / 더블클릭 삭제
    const g = _te('g', { transform: `translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`, style: 'cursor:move' }); g.style.pointerEvents = 'auto';
    g.appendChild(_te('circle', { r: 9, fill: '#FFFFFF', 'fill-opacity': 0.92, stroke: c.color, 'stroke-width': 3 }));
    g.appendChild(_te('circle', { r: 3, fill: c.color }));
    g.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); revealSecFor('cmp', c.id); const p = c.points[i]; const [sx, sy] = typhoonXY(p.lon, p.lat); pushUndo(); dragLoop(e, (dx, dy) => { const ll = xyToLonLat(sx + dx, sy + dy); p.lon = ll.lon; p.lat = ll.lat; renderTyphoon(); }); });
    g.addEventListener('dblclick', (e) => { e.stopPropagation(); e.preventDefault(); if (c.points.length <= 2) { status('점이 2개뿐이라 못 지웁니다', true); return; } pushUndo(); c.points.splice(i, 1); c.labels = (c.labels || []).filter((l) => l.idx !== i); c.labels.forEach((l) => { if (l.idx > i) l.idx--; }); buildCompareSection(); renderTyphoon(); });   // 지운 지점 라벨 삭제, 뒤쪽 라벨은 한 칸 당김
    L.appendChild(g);
  });
}
// 팬/줌 시 비교 라벨(이름표·수치라벨)의 화면좌표 위치를 지도와 함께 이동(단일 라벨과 동일한 보정).
function shiftCompareLabelsBy(tx, ty, r) {
  const cmp = (S.typhoon && S.typhoon.compare) || [];
  for (const c of cmp) {
    if (c.labelPos) { c.labelPos.x = Math.round(tx + c.labelPos.x * r); c.labelPos.y = Math.round(ty + c.labelPos.y * r); }
    for (const lb of (c.labels || [])) { if (lb.x != null) { lb.x = Math.round(tx + lb.x * r); lb.y = Math.round(ty + lb.y * r); } }
  }
  const imgs = (S.typhoon && (S.typhoon.refImgs || (S.typhoon.refImg ? [S.typhoon.refImg] : []))) || [];   // 참고 이미지(기준점 포함) 모두 지도와 함께 이동·확대(정렬 유지)
  for (const ri of imgs) { ri.x = Math.round(tx + ri.x * r); ri.y = Math.round(ty + ri.y * r); ri.w = Math.round(ri.w * r); ri.h = Math.round(ri.h * r); if (ri.px != null) { ri.px = Math.round(tx + ri.px * r); ri.py = Math.round(ty + ri.py * r); } }
}
// 지도 이동·확대량만큼 태풍 라벨·비교 라벨·참고 이미지를 같이 옮긴다(평면 태풍 지도 — 틸트는 빌보드라 제외).
// Alt 팬/줌·휠·이동 모드 드래그·방향키가 모두 이걸 써서 '지도에 붙은 채' 결과가 같다.
function shiftMapAttached(tx, ty, r) {
  if (!isTyphoon() || camActive3d()) return;
  for (const b of labelList()) if (b && b.x != null) { b.x = Math.round(tx + b.x * r); b.y = Math.round(ty + b.y * r); }
  shiftCompareLabelsBy(tx, ty, r);
}
// 비교 예보선들을 그린다(비교 지도 전용). 얇은 색선 + 솎은 작은 아이콘(아이콘 표시 토글·날짜범위 반영).
// 비교 예보 아이콘을 어느 지점에 찍을지 index 집합. iconMode: 'even'(등간격 약10개)|'all'(실제 날짜별=전 지점)|'daily'(하루 하나).
function compareIconIdxSet(c, cpts) {
  const total = cpts.length, mode = c.iconMode || 'even', s = new Set();
  if (mode === 'all') { for (let k = 0; k < total; k++) s.add(k); return s; }
  if (mode === 'daily') { const seen = {}; for (let k = 0; k < total; k++) { const d = typhoonDateKST(cpts[k].tmef); const key = d || ('_' + k); if (!seen[key]) { seen[key] = 1; s.add(k); } } s.add(total - 1); return s; }
  const step = Math.max(1, Math.round(total / 10)); for (let k = 0; k < total; k++) if (k % step === 0 || k === total - 1) s.add(k); return s;
}
function drawCompareTracks(L) {
  const T = S.typhoon; if (!isTyphoonCompare() || !T || !Array.isArray(T.compare) || !T.compare.length) return;
  for (const c of T.compare) {
    if (!c.show) continue;
    const cpts = compareVisiblePoints(c);
    if (cpts.length < 2) continue;
    const sp = compareScreenPts(cpts, compareProg(c.id));
    if (sp.length < 1) continue;
    const g = _te('g', { 'data-cmp': c.id });
    // 반경 밴드(옵션, 기본 off) — 선 아래에 깔린다. 그 예보 점에 r15/r25/r70 있으면 표준 밴드색으로.
    if (c.showRadius) { for (const k of ['r70', 'r15', 'r25']) { const st = TYPHOON_BAND_DEF[k]; if (st) typhoonBandInto(g, sp, k, st); } }
    // 경로선: 실황(분석) 구간은 실선, 예상경로(예측) 구간은 점선 — 단일 태풍과 동일. 예보가 전부 예측이면 전 구간 점선.
    const cn = typhoonDefaultNowIdx(cpts);   // 마지막 실황 지점 idx (이 뒤가 예상경로)
    const lw = c.lineW || 2.2;
    const isc = c.iconScale == null ? 1 : c.iconScale;   // 아이콘 크기 배율
    const mkLine = (arr, dashed) => {
      if (arr.length < 2) return;
      const a = { d: 'M' + arr.map((p) => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L'), fill: 'none', stroke: c.color, 'stroke-width': lw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': 0.95 };
      if (dashed) a['stroke-dasharray'] = (lw * 4).toFixed(1) + ' ' + (lw * 3.5).toFixed(1);
      g.appendChild(_te('path', a));
    };
    mkLine(sp.filter((p) => p.idx <= cn), false);   // 실황 실선
    mkLine(sp.filter((p) => p.idx >= cn), true);     // 예상경로 점선(경계점 공유해 이어짐)
    if (c.showIcons !== 0) {   // 아이콘 표시 눈 토글 — 배치는 iconMode(등간격/실제 날짜별/하루 하나)
      const idxSet = compareIconIdxSet(c, cpts);
      for (const p of sp) {
        if (p.head) { g.appendChild(compareIconEl(p.x, p.y, c.color, true, c.dotIcon, isc)); continue; }
        if (!idxSet.has(Math.round(p.idx))) continue;
        g.appendChild(compareIconEl(p.x, p.y, c.color, false, c.dotIcon, isc));
      }
    }
    L.appendChild(g);
    if (penEditId === c.id && compareProg(c.id) == null) drawPointHandles(L, c);   // 점 편집 핸들(정지 상태에서만)
  }
}
// 비교 라벨 — 예보마다 (1) 기관 이름표(showName) + (2) 수치라벨(c.labels: 지점별 날짜/내용). 둘 다 개별 on/off.
// 이름표는 애니 중에도 '전체 경로 끝'에 고정(헤드 안 따라감). 위치는 드래그로 옮김(c.labelPos / 라벨별 pos).
function drawCompareLabels(LB) {
  if (!LB) return;
  const T = S.typhoon; if (!isTyphoonCompare() || !T || !Array.isArray(T.compare)) return;
  const mkText = (fill, size, weight, fam) => _te('text', { x: 0, y: 0, fill, 'font-family': (fam ? `"${fam}",` : '') + '"SUITE CG","Malgun Gothic",sans-serif', 'font-weight': weight, 'font-size': size, 'dominant-baseline': 'central', stroke: '#0A1526', 'stroke-width': 4.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'xml:space': 'preserve' });
  for (const c of T.compare) {
    if (!c.show) continue;
    const cpts = compareVisiblePoints(c);
    if (!cpts.length) continue;
    const full = compareScreenPts(cpts, null);   // 전체 경로(애니 무관) — 라벨 기준점
    const idxXY = {}; full.forEach((p, k) => { idxXY[k] = p; });
    // (1) 이름표
    if (c.showName !== 0) {
      let pos = c.labelPos;
      if (!pos) { const last = full[full.length - 1]; const [x, y] = camProjectXY(last.x, last.y); pos = { x: x + 13, y: y - 4 }; }
      const g = _te('g', { transform: `translate(${(+pos.x).toFixed(1)} ${(+pos.y).toFixed(1)})`, style: 'cursor:move' }); g.style.pointerEvents = 'auto';
      const t = mkText((c.labelCol || c.color), (c.labelSize || 34), (c.labelWeight || 800), c.labelFont); t.textContent = c.name || ''; g.appendChild(t);
      g.addEventListener('pointerdown', (e) => { e.stopPropagation(); revealSecFor('cmp', c.id); const o = { x: +pos.x, y: +pos.y }; pushUndo(); dragLoop(e, (dx, dy) => { c.labelPos = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }; renderTyphoon(); }); });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); const nv = prompt('예보선 이름', c.name || ''); if (nv != null) { pushUndo(); c.name = nv; buildCompareSection(); renderTyphoon(); renderLegend(); } });
      LB.appendChild(g);
    }
    // (2) 수치라벨 — 원래 리치 라벨 박스(fillLabelBox) 그대로 + 배경색 = 그 태풍 색. 지시선까지 단일 태풍과 동일.
    const ls = (typhoonStyleDefaults().labelStyle) || {};
    // 비교선은 호길이(arc-length)로 그려지므로, 라벨 등장도 호길이 비율로 맞춰야 선이 그 지점에 닿는 순간과 일치한다(index 비율이면 어긋나 툭 생김).
    const _cum = [0]; let _tot = 0;
    for (let i = 0; i + 1 < full.length; i++) { _tot += Math.hypot(full[i + 1].x - full[i].x, full[i + 1].y - full[i].y); _cum.push(_tot); }
    const _fracAt = (idx) => (_tot > 0 && _cum[idx] != null) ? _cum[idx] / _tot : (full.length > 1 ? idx / (full.length - 1) : 0);
    const _cmpP = (typhoonCmpProg && typhoonCmpProg[c.id] != null) ? typhoonCmpProg[c.id] : null;   // 이 예보선 진행도(0..1), null=정지=완전표시
    const _iconSet = (c.showIcons !== 0) ? compareIconIdxSet(c, cpts) : null;   // 그 지점에 태풍 아이콘이 이미 있으면 앵커 원 생략
    const _vmap = compareVisibleIdxMap(c);   // 라벨 idx는 원본 지점 기준 → 표시 지점 인덱스로(날짜범위로 앞 지점이 빠져도 같은 지점)
    for (const lb of (c.labels || [])) {
      if (lb.off) continue;
      const vk = _vmap[lb.idx]; if (vk == null) continue;   // 범위 밖 지점 라벨은 숨김
      const pt = idxXY[vk]; if (!pt) continue;
      const [prx, pry] = camProjectXY(pt.x, pt.y);
      if (lb.x == null) { lb.x = Math.round(pt.x + 150); lb.y = Math.round(pt.y - 92); }   // 첫 렌더 기본 박스 위치
      const b = Object.assign({}, ls, {
        id: 'cl_' + c.id + '_' + lb.idx, idx: lb.idx, title: '',
        txt: (lb.txt != null && lb.txt !== '') ? lb.txt : ((cpts[vk] && cpts[vk].label) || ''),
        x: lb.x, y: lb.y,
        fill: c.color, fill2: mixHex(c.color, '#000000', 0.5), stroke: mixHex(c.color, '#FFFFFF', 0.42), stroke2: mixHex(c.color, '#FFFFFF', 0.6),
        txtCol: c.numCol || ls.txtCol || '#FFFFFF', size: c.numSize || ls.size || 40,
      });
      // 등장 애니 — 선이 이 지점(호길이 _fA)에 '닿는 순간' 라벨이 딱 완성되도록(선 도달 전 창구간에 걸쳐 스으륵).
      // 이러면 마지막 지점도 선이 끝나며 진행도가 null이 되는 순간 이미 완성 상태라 툭 튀지 않는다.
      let _rv = 1, _sc = 1;
      if (typhoonCmpProg && _cmpP != null) {
        const _fA = _fracAt(vk);
        const _wR = 0.10, _wS = 0.16;                       // 지시선(짧게)·박스(조금 먼저·천천히) 창
        _rv = clamp01((_cmpP - _fA + _wR) / _wR);           // 선 도달 시 1
        _sc = clamp01((_cmpP - _fA + _wS) / _wS);           // 선 도달 시 1(박스는 더 일찍 시작)
      }
      const [bx, by] = camProjectXY(b.x, b.y);
      const g = _te('g', { transform: `translate(${bx} ${by})`, style: 'cursor:move' }); g.style.pointerEvents = 'auto';
      if (S.labShadow == null ? true : S.labShadow) g.setAttribute('filter', 'url(#typhoonLabelShadow)');
      LB.appendChild(g);   // getBBox 측정 위해 먼저 부착
      const box = fillLabelBox(g, b, labK());
      lb._w = box.w; lb._h = box.h;   // 실측 박스 크기 저장 — AE 리깅이 추정 대신 이 값을 써야 박스·지시선이 안 어긋남
      const geom = typhoonLeaderGeom(prx, pry, bx, by, box.w, box.h);
      if (_sc < 1) {   // 박스 스케일 인 — 지시선 끝(앵커) 기준으로 커진다
        const aLx = geom.useLeft ? -box.w / 2 : box.w / 2;
        g.setAttribute('transform', `translate(${bx} ${by}) translate(${aLx} 0) scale(${_sc}) translate(${-aLx} 0)`);
        g.setAttribute('opacity', clamp01(_sc * 2).toFixed(3));
      }
      // 앵커 원 — 아이콘 없는 빈 지점에만 그린다(그 지점에 태풍 아이콘이 이미 있으면 생략, 겹쳐 지저분하지 않게).
      if (!(_iconSet && _iconSet.has(vk))) LB.appendChild(_te('circle', { cx: prx.toFixed(1), cy: pry.toFixed(1), r: 6, fill: c.color, stroke: '#FFFFFF', 'stroke-width': 1.6, opacity: clamp01(_rv * 3).toFixed(3) }));
      const line = _te('path', { d: geom.d, stroke: '#DCE8F7', 'stroke-width': 2.6, fill: 'none', 'stroke-opacity': 0.9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (_rv < 1) { line.setAttribute('stroke-dasharray', geom.len); line.setAttribute('stroke-dashoffset', (geom.len * (1 - _rv)).toFixed(1)); }
      LB.insertBefore(line, g);   // 지시선은 박스 아래
      g.addEventListener('pointerdown', (e) => { e.stopPropagation(); revealSecFor('cmp', c.id); const o = { x: lb.x, y: lb.y }; pushUndo(); dragLoop(e, (dx, dy) => { lb.x = Math.round(o.x + dx); lb.y = Math.round(o.y + dy); renderTyphoon(); }); });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); const nv = prompt('라벨 내용', b.txt); if (nv != null) { pushUndo(); lb.txt = nv; buildCompareSection(); renderTyphoon(); } });
    }
  }
}

function drawTyphoonTrack(L, pts) {
  const T = S.typhoon;
  const cmpMode = isTyphoonCompare();   // 비교 지도: 굵은 메인·반경·라벨 숨기고 비교 예보선만 대등하게
  if (!pts || pts.length === 0) { if (cmpMode) { drawCompareTracks(L); const LB0 = $('#L_typhoonLabels'); if (LB0) { LB0.textContent = ''; drawCompareLabels(LB0); } } return; }
  const nowIdx = typhoonNowIdx(pts);
  const lineMode = !cmpMode && T && T.trackMode === 'line';
  let sp = typhoonScreenPts(pts);
  if (T && T.rangeOn) sp = sp.filter((p) => p.head || typhoonIdxInRange(pts, p.idx));   // 표시 날짜 범위 밖 지점 제외
  if (lineMode) sp = sp.filter((p) => p.idx <= nowIdx);   // 현재 이후 예상경로는 제외(진행 중 선두도 현재 위치를 넘지 않게 — 예보로 갔다 튀는 것 방지)
  const add = (e) => L.appendChild(e);
  // 독도 — 줌아웃하면 실제로는 안 보이므로 '있는듯 없는듯' 작은 점 하나로 표시(시청자 민감 이슈).
  // 크기는 울릉도 화면 반경의 1/4 정도로 비례, 색은 남한 강조 스트로크색. 남한 강조 끄면 같이 숨김.
  if (T && T.krShow !== 0) {
    const ul = projLL(130.905, 37.484), ul2 = projLL(130.905, 37.529);   // 울릉도 대략 반경(≈0.045°)
    const ulR = Math.abs(ul2[1] - ul[1]) * S.map.s;
    const sz = Math.max(1.2, Math.min(3, ulR * 0.22));                   // 예전보다 살짝 작게
    const [dokX, dokY] = typhoonXY(131.869, 37.241);
    const lineZf = Math.max(0.28, Math.min(1, (S.map.s || 1) / 0.6));   // 줌아웃 시 선 가늘게(남한 강조선과 동일 — 독도 선 뭉침 방지)
    const fill = T.krFill || '#2E6FB0', strk = T.krStroke || '#BFE3FF', sw = Math.max(0.9, sz * 0.45) * lineZf;
    // 실제 독도 모양 — 서도(왼쪽·높은 뾰족봉)와 동도(오른쪽·낮고 위가 평평). 색은 남한 강조색.
    const by = dokY + sz * 0.9;
    const peak = (cx, w, h) => `M${cx - w} ${by}L${cx - w * 0.55} ${by - h * 0.5}L${cx - w * 0.12} ${by - h}L${cx + w * 0.28} ${by - h * 0.55}L${cx + w * 0.66} ${by - h * 0.82}L${cx + w} ${by}Z`;
    const flat = (cx, w, h) => `M${cx - w} ${by}L${cx - w * 0.6} ${by - h * 0.72}L${cx - w * 0.18} ${by - h}L${cx + w * 0.32} ${by - h * 0.94}L${cx + w * 0.72} ${by - h * 0.62}L${cx + w} ${by}Z`;
    const g = _te('g', {});
    // 줌아웃되면 서도·동도 두 봉우리가 겹쳐 '선 뭉침'이 되므로, 형태가 뭉갤 만큼 작아지면(=sz가 바닥에 근접)
    // 원래 주석 의도대로 점 하나로만 표시(있는듯 없는듯). 충분히 확대됐을 때만 두 봉우리 디테일을 그린다.
    const detail = ulR * 0.22 > 1.7;
    if (detail) {
      g.appendChild(_te('path', { d: peak(dokX - sz * 1.0, sz * 0.85, sz * 2.0), fill, 'fill-opacity': 0.95, stroke: strk, 'stroke-width': sw, 'stroke-linejoin': 'round' }));  // 서도
      g.appendChild(_te('path', { d: flat(dokX + sz * 0.95, sz * 0.8, sz * 1.35), fill, 'fill-opacity': 0.95, stroke: strk, 'stroke-width': sw, 'stroke-linejoin': 'round' }));  // 동도
    } else {
      g.appendChild(_te('circle', { cx: dokX, cy: dokY, r: Math.max(1.1, sz * 0.9), fill, 'fill-opacity': 0.95, stroke: strk, 'stroke-width': sw }));  // 줌아웃: 점 하나
    }
    add(g);
  }
  if (!cmpMode) {
  if (lineMode) {
    const iconCol = T.iconCol || '#E5231E';
    if (sp.length > 1) add(_te('path', { d: 'M' + sp.map((p) => p.x + ' ' + p.y).join('L'), fill: 'none', stroke: T.lineColor || iconCol, 'stroke-width': Math.max(1, +T.lineWidth || 9.5), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const tip = sp[sp.length - 1];
    if (tip) {
      const srcIdx = Math.min(nowIdx, Math.max(0, Math.floor(tip.idx)));
      const dp = pts[srcIdx] || pts[nowIdx] || {};
      const ws = tip.head && tip.ws != null ? tip.ws : (+dp.ws || 99);
      const ex = tip.head ? !!tip.ex : !!dp.ex;
      const td = ex || ws < 17;
      add(typhoonIconEl(tip.x, tip.y, 17, iconCol, td, false, ws, tip.head ? !td : false, ex));   // 이동 중 선두만 일러스트 강제, 멈춘 아이콘은 아이콘 종류(강도 숫자/작은 원) 설정을 따름
    }
  } else {
  // 반경 엔벨로프 — 현재~미래(nowIdx 이상)만. 지난 구간은 예상반경 제외.
  // 헤드는 소수 인덱스(fl+frac)라 idx로 판단 — 헤드가 아직 과거면 밴드에 안 낀다(과거 구간에 강풍역 버블이 미리 뜨던 문제 방지).
  const activeSp = sp.filter((p) => p.idx >= nowIdx);
  const drawBand = (key) => {
    const st = Object.assign({}, TYPHOON_BAND_DEF[key], (T.bands && T.bands[key]) || {});
    if (st.off) return;   // 눈 꺼둔 반경은 안 그린다
    typhoonBandInto(L, activeSp, key, st);
  };
  drawBand('r70'); drawBand('r15'); drawBand('r25');
  // 경로선: 지난 구간 회색 실선 / 현재~미래 흰 점선
  // 헤드(소수 인덱스)를 idx로 분류 — 과거를 그리는 동안엔 헤드가 pastLine에 들어가 회색 선이 아이콘까지 딱 붙어 따라온다(선이 아이콘을 한 칸씩 뒤따르던 '텐션' 제거).
  const pastLine = sp.filter((p) => p.idx <= nowIdx);
  const futLine = sp.filter((p) => p.idx >= nowIdx);
  const trackW = Math.max(1, +T.lineWidth || 9.5);
  const pastTrackW = Math.max(1.5, trackW * 0.55);   // 과거 경로는 현재·예상선보다 가늘게 구분
  if (pastLine.length > 1) add(_te('path', { d: 'M' + pastLine.map((p) => p.x + ' ' + p.y).join('L'), fill: 'none', stroke: '#96A0AD', 'stroke-width': pastTrackW, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  if (futLine.length > 1) add(_te('path', { d: 'M' + futLine.map((p) => p.x + ' ' + p.y).join('L'), fill: 'none', stroke: '#FFFFFF', 'stroke-width': trackW, 'stroke-dasharray': `${trackW * 3.2} ${trackW * 2.5}`, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  // 지시선 레이어 — 아이콘보다 '먼저' 그려서 아이콘 뒤로 가게(선이 아이콘을 안 가림).
  // 태풍 아이콘 (지난 구간 회색, 현재/미래 색조 필터, 현재 크게, 약하면 열대저압부 점)
  const iconCol = T.iconCol || '#E5231E';
  const headWs = (pts[nowIdx] && pts[nowIdx].ws) || 40;
  for (const p of sp) {
    if (p.head) {   // 이동하는 선두 — 강한 구간=일러스트, 향하는 지점이 약하면(TD)·온대면 마커로 자연스럽게 전환(끝에서 탁 사라짐 방지).
      const hws = (p.ws == null) ? headWs : p.ws;
      const hEx = !!p.ex, htd = hEx || hws < 17;
      const hi = typhoonIconEl(p.x, p.y, 17, iconCol, htd, false, hws, !htd, hEx);   // htd면 마커(forceImage=false), 아니면 일러스트
      if (typhoonHeadFade < 1) hi.setAttribute('opacity', Math.max(0, typhoonHeadFade).toFixed(3));
      add(hi); continue;
    }
    if (p.noIcon) continue;   // 아이콘 숨김 지점(예: JMA 과거 경로·촘촘한 근접예보) — 선만 남기고 아이콘은 생략
    const past = p.idx < nowIdx;
    const dp = pts[p.idx];   // 호버 툴팁 — 그 지점의 날짜·시각(+실황/예상·강도)
    const ws = (dp && dp.ws) || 99;
    const ex = !!(dp && dp.ex);   // 온대저압부(수동 지정)
    const baseR = 17;   // 현재시각도 다른 지점과 같은 크기(예전엔 현재만 24로 살짝 키웠음 — 제거)
    const icon = typhoonIconEl(p.x, p.y, past ? baseR * 0.3 : baseR, iconCol, (ws < 17) || ex, past, ws, false, ex);   // 지나간 날짜는 현재·예상의 30%로 작게 / ex=온대저압부(저)
    if (dp) {
      const when = dp.label || (dp.tmef ? fmtKST(dp.tmef) : ('지점 ' + (p.idx + 1)));
      const kind = dp.fcst ? '예상' : '실황';
      const str = dp.ex ? '온대저압부' : ((dp.td || (dp.ws != null && dp.ws < 17)) ? '열대저압부' : (dp.ws != null ? Math.round(dp.ws) + 'm/s' : ''));
      const tt = _te('title'); tt.textContent = when + ' · ' + kind + (str ? ' · ' + str : '');
      icon.appendChild(tt);
      icon.style.pointerEvents = 'auto';   // 호버가 잡히도록(레이어가 pointer-events:none여도)
    }
    add(icon);
  }
  }
  }   // end if(!cmpMode) — 메인 트랙(반경·선·아이콘)은 비교 모드에서 숨김
  drawCompareTracks(L);   // 비교 예보선(다른 기관) — 비교 모드일 때만 실제로 그린다
  // 라벨(박스+지시선) — 기울지 않는 오버레이(#L_typhoonLabels)에 '세워서' 그린다(3D 회전해도 빌보드).
  // 지시선은 카메라로 투영한 지점(prx,pry)에서 박스로. 드래그·선택·편집기 전부 노말과 공유.
  const LB = $('#L_typhoonLabels'); if (LB) LB.textContent = '';
  if (cmpMode) { drawCompareLabels(LB); return; }   // 비교 모드: 지점별 라벨 대신 선마다 기관 이름표만
  if (lineMode) { drawTyphoonPlaces(L, LB); return; }   // 경로 시각 라벨은 숨기고 지명만 유지
  const idxXY = {}; for (const p of sp) if (!p.head) idxXY[p.idx] = p;
  if (LB) for (const b of labelList()) {
    if (b.off) continue;
    let p = idxXY[b.idx];
    if (!p) {   // 경로 head가 아직 이 지점에 도달 전 — 그래도 라벨은 자기 키 타이밍대로 뜨게(지점 좌표 직접 계산). 안 그러면 경로 도달 시 '탁' 하고 팝인.
      const pt = pts[b.idx];
      if (!pt) continue;                                         // 유효하지 않은 지점(발표시각 변경 등)만 스킵
      if (T && T.rangeOn && !typhoonIdxInRange(pts, b.idx)) continue;   // 표시 날짜 범위 밖은 스킵
      const [ax, ay] = typhoonXY(pt.lon, pt.lat);
      p = { x: ax, y: ay, idx: b.idx };
    }
    const [prx, pry] = camProjectXY(p.x, p.y);
    const parts = typhoonLabelParts(b, prx, pry, labK());
    if (parts.line) LB.appendChild(parts.line);
    LB.appendChild(parts.box);
  }
  drawTyphoonPlaces(L, LB);   // 지명표시(원+이름표)
}

// 지명→[경도,위도]. 정확일치→접미사 제거→접두 매칭 순. window.PLACE_GAZ(place-data.js) 사용.
function geocodePlace(q) {
  const G = window.PLACE_GAZ; if (!G) return null;
  q = (q || '').trim(); if (!q) return null;
  if (G[q]) return G[q];
  const strip = (s) => s.replace(/\s+/g, '').replace(/(특별자치도|특별자치시|특별시|광역시|자치도|자치시|도|시|군|구)$/, '');
  const exact = (s) => { if (G[s]) return G[s]; const sn = strip(s); if (G[sn]) return G[sn]; for (const key of Object.keys(G)) if (strip(key) === sn) return G[key]; return null; };
  // '경남 고성'처럼 앞에 시도가 붙으면 그 시도의 동명 키 → 뒤 지명 순으로 먼저 찾는다(앞 시도 중심으로 새지 않게).
  const SIDO_LONG = { 경상남도: '경남', 경상북도: '경북', 전라남도: '전남', 전라북도: '전북', 충청남도: '충남', 충청북도: '충북', 경기도: '경기', 강원도: '강원', 제주도: '제주' };
  const tk = q.split(/\s+/);
  if (tk.length > 1) {
    const s0 = SIDO_LONG[tk[0]] || strip(tk[0]).replace(/특별자치$/, '');
    if (/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(s0)) {
      const rest = tk.slice(1).join(' ');
      const r = G[s0 + ' ' + rest.replace(/\s+/g, '')] || G[s0 + ' ' + strip(rest)] || exact(rest);
      if (r) return r;
    }
  }
  const r0 = exact(q); if (r0) return r0;
  // 마지막 수단: 접두 일치 — 대략 위치라 approx 표시(호출부가 안내)
  for (const key of Object.keys(G)) if (key.indexOf(q) === 0 || q.indexOf(key) === 0) { const r = G[key].slice(); r.approx = 1; return r; }
  return null;
}
// 태풍 지도 지명표시: 각 지명에 원(#L_typhoon, 경위도 고정) + 이름표(#L_typhoonLabels, 같은 색) + 지시선.
function drawTyphoonPlaces(L, LB) {
  const places = (S.typhoon && S.typhoon.places) || [];
  if (!places.length) return;
  const k = labK();
  const szBase = (S.typhoon && S.typhoon.placeSize) || 34;
  for (const pl of places) {
    if (pl.off) continue;
    const [fx, fy] = typhoonXY(pl.lon, pl.lat);
    if (pl.sub) { drawSubPlace(L, LB, pl, fx, fy, szBase); continue; }   // 부지명: 흰 점+작은 흰 글씨(박스·선 없음)
    const col = pl.color || '#009afa';
    const dot = _te('circle', { cx: fx.toFixed(1), cy: fy.toFixed(1), r: 7, fill: col, stroke: '#FFFFFF', 'stroke-width': 2, 'data-place-dot': pl.id, style: 'cursor:move' });
    L.appendChild(dot);
    if (!LB) continue;
    const [sx, sy] = camProjectXY(fx, fy);
    const lx = sx + (pl.ox == null ? 0 : pl.ox);
    const ly = sy + (pl.oy == null ? -52 : pl.oy);
    const b = newLabel({ id: 'plb_' + pl.id, txt: pl.name, fill: col, size: pl.size || szBase, x: lx, y: ly });
    const g = _te('g', { class: 'drag', transform: `translate(${lx} ${ly})`, 'data-place-label': pl.id });
    if (S.labShadow == null ? true : S.labShadow) g.setAttribute('filter', 'url(#typhoonLabelShadow)');
    LB.appendChild(g);
    const { w, h } = fillLabelBox(g, b, k);
    pl._w = w; pl._h = h;   // 회전/틸트 때 지시선 재계산에 사용
    const geom = typhoonLeaderGeom(sx, sy, lx, ly, w, h);
    const line = _te('path', { d: geom.d, stroke: col, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': 0.92, 'data-place-leader': pl.id });
    LB.insertBefore(line, g);
    g.addEventListener('pointerdown', (e) => startPlaceLabelDrag(e, pl, g, line, sx, sy, w, h));
    dot.addEventListener('pointerdown', (e) => startPlaceDotDrag(e, pl, dot, g, line, w, h));   // 원 드래그 = 위치 이동
  }
}
// 부지명: 작은 흰 점 + 작은 흰 글씨(박스·지시선 없음). 이름표는 점 아래 살짝, 드래그로 이동.
function drawSubPlace(L, LB, pl, fx, fy, szBase) {
  const col = pl.color || '#FFFFFF';
  const dot = _te('circle', { cx: fx.toFixed(1), cy: fy.toFixed(1), r: 4, fill: col, stroke: '#FFFFFF', 'stroke-width': 1, 'stroke-opacity': 0.55, 'data-place-dot': pl.id, style: 'cursor:move' });
  L.appendChild(dot);
  if (!LB) return;
  const [sx, sy] = camProjectXY(fx, fy);
  const lx = sx + (pl.ox == null ? 0 : pl.ox), ly = sy + (pl.oy == null ? 16 : pl.oy);
  const sz = Math.round((pl.size || szBase) * 0.62);
  const g = _te('g', { class: 'drag', transform: `translate(${lx} ${ly})`, 'data-place-label': pl.id });
  if (S.labShadow == null ? true : S.labShadow) g.setAttribute('filter', 'url(#typhoonLabelShadow)');   // 가독성 그림자
  const t = _te('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: col, 'font-family': '"SUITE CG","Malgun Gothic",sans-serif', 'font-weight': 700, 'font-size': sz });
  t.textContent = pl.name;
  g.appendChild(t);
  LB.appendChild(g);
  pl._w = 0; pl._h = 0;
  g.addEventListener('pointerdown', (e) => startPlaceLabelDrag(e, pl, g, null, sx, sy, 0, 0));   // 지시선 없음(line=null)
  dot.addEventListener('pointerdown', (e) => startPlaceDotDrag(e, pl, dot, g, null, 0, 0));
}
// 지명 원 드래그 = 실제 위치(경위도) 이동. 이름표·지시선도 따라온다. (사전에 없는 지명 수동배치에 필수)
function startPlaceDotDrag(e, pl, dot, g, line, w, h) {
  e.stopPropagation();
  if (e.button != null && e.button !== 0) return;
  revealSecFor('place');   // 지명표시 섹션(놓을 때 연다)
  pushUndo('place');
  const [fx0, fy0] = typhoonXY(pl.lon, pl.lat);
  dragLoop(e, (dx, dy) => {
    const nfx = fx0 + dx, nfy = fy0 + dy;
    const ll = xyToLonLat(nfx, nfy);
    pl.lon = ll.lon; pl.lat = ll.lat;
    dot.setAttribute('cx', nfx.toFixed(1)); dot.setAttribute('cy', nfy.toFixed(1));
    const [nsx, nsy] = camProjectXY(nfx, nfy);
    const lx = nsx + (pl.ox || 0), ly = nsy + (pl.oy == null ? -52 : pl.oy);
    g.setAttribute('transform', `translate(${lx} ${ly})`);
    if (line) line.setAttribute('d', typhoonLeaderGeom(nsx, nsy, lx, ly, w, h).d);
  });
}
// 지명 이름표 드래그(원은 경위도 고정, 이름표만 오프셋 이동). 지시선도 따라 갱신.
function startPlaceLabelDrag(e, pl, g, line, sx, sy, w, h) {
  e.stopPropagation();
  if (e.button != null && e.button !== 0) return;
  revealSecFor('place');   // 지명표시 섹션(놓을 때 연다)
  pushUndo('place');
  const ox0 = pl.ox == null ? 0 : pl.ox, oy0 = pl.oy == null ? -52 : pl.oy;
  dragLoop(e, (dx, dy) => {
    pl.ox = Math.round(ox0 + dx); pl.oy = Math.round(oy0 + dy);
    const lx = sx + pl.ox, ly = sy + pl.oy;
    g.setAttribute('transform', `translate(${lx} ${ly})`);
    if (line) line.setAttribute('d', typhoonLeaderGeom(sx, sy, lx, ly, w, h).d);
  });
}
// 지명표시 사이드바 — 입력/추가/목록(색·삭제)/크기.
function buildTyphoonPlacesPanel() {
  const inp = $('#placeInput'), addB = $('#placeAdd'), addSubB = $('#placeAddSub'), list = $('#placeList'), sz = $('#placeSize'), szV = $('#placeSizeV');
  if (!list) return;
  if (S.typhoon && !S.typhoon.places) S.typhoon.places = [];
  const doAdd = (sub) => {
    const q = (inp && inp.value || '').trim(); if (!q) return;
    const ll = geocodePlace(q);
    let lon, lat, manual = false;
    if (ll) { lon = ll[0]; lat = ll[1]; }
    else { const c = xyToLonLat(960, 540); lon = c.lon; lat = c.lat; manual = true; }   // 사전에 없으면 화면 중앙에 두고 드래그로 배치
    pushUndo('place');
    const pl = { id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name: q, lon, lat };
    if (sub) { pl.sub = 1; pl.color = '#FFFFFF'; pl.ox = 0; pl.oy = 16; } else { pl.color = '#009afa'; }   // 부지명=흰색 작은 글씨(점 아래)
    (S.typhoon.places ||= []).push(pl);
    if (inp) inp.value = '';
    renderTyphoon(); buildTyphoonPlacesPanel();
    status(manual ? `'${q}' 사전에 없어 지도 중앙에 추가 — 점을 드래그해 위치를 맞추세요` : (ll && ll.approx) ? `'${q}' 대략 위치로 추가 — 점을 드래그해 위치를 확인하세요` : `'${q}' ${sub ? '부지명' : '지명'} 추가`, true);
  };
  if (addB) addB.onclick = () => doAdd(false);
  if (addSubB) addSubB.onclick = () => doAdd(true);
  if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(false); } };
  if (sz) { sz.value = (S.typhoon && S.typhoon.placeSize) || 34; if (szV) szV.textContent = sz.value; sz.oninput = () => { pushUndo('place'); S.typhoon.placeSize = +sz.value; if (szV) szV.textContent = sz.value; renderTyphoon(); }; }
  list.textContent = '';
  for (const pl of (S.typhoon.places || [])) {
    const row = document.createElement('div'); row.className = 'row'; row.style.gap = '6px';
    const c = document.createElement('input'); c.type = 'color'; c.value = pl.color || '#E5301F'; c.style.flex = '0 0 auto';
    c.oninput = () => { pl.color = c.value; renderTyphoon(); };
    const tag = document.createElement('span'); tag.textContent = pl.sub ? '부' : '지'; tag.style.cssText = 'flex:0 0 auto;font-size:10px;opacity:.55;width:11px;text-align:center';
    const nm = document.createElement('input'); nm.type = 'text'; nm.value = pl.name; nm.style.cssText = 'flex:1;font-size:12px';   // 이름 편집 가능
    wireImeText(nm, (v) => { const t = (v || '').trim(); if (!t) return; pl.name = t; renderTyphoon(); });
    const del = document.createElement('button'); del.textContent = '✕'; del.style.flex = '0 0 auto';
    del.onclick = () => { pushUndo('place'); S.typhoon.places = S.typhoon.places.filter((x) => x !== pl); renderTyphoon(); buildTyphoonPlacesPanel(); };
    row.append(c, tag, nm, del); list.append(row);
  }
}

// 태풍 전용 제목 — 표준 제목과 같은 스타일/위치, 편집·드래그 가능. (한국 제목은 태풍 모드에서 숨김)
const typhoonTitleText = () => { const T = S.typhoon || {}; return T.title != null ? T.title : ((T.name || '태풍') + ' 예상경로'); };
function drawTyphoonTitle(L) {
  const T = S.typhoon; if (!T || T.showTitle === 0) return;
  const txt = typhoonTitleText(); if (!txt) return;
  // 현재 해상도의 노말 제목 텍스트(첫 줄) 위치·크기·색을 기본으로 — 내용만 태풍용. 위치는 해상도별로 따로 저장.
  const std = (S.texts || []).find((t) => t.id === 't1') || (S.texts || [])[0] || {};
  const posMap = (T.titlePosByRes ||= {});
  const pos = posMap[S.res] || { x: std.x != null ? std.x : 130, y: std.y != null ? std.y : 150 };
  const size = T.titleSize || std.size || 90;
  const col = T.titleCol || std.col || '#FFFFFF';
  const g = _te('g', { style: 'cursor:move' });
  const t = _te('text', { x: pos.x, y: pos.y, fill: col, 'font-family': '"SUITE CG","Malgun Gothic",sans-serif', 'font-weight': (std.w || 800), 'font-size': size, 'letter-spacing': (std.track != null ? std.track : -1), 'text-anchor': (std.align || 'start'), 'xml:space': 'preserve' });
  t.textContent = txt; g.appendChild(t);
  g.addEventListener('pointerdown', (e) => { e.stopPropagation(); const o = { x: pos.x, y: pos.y }; pushUndo(); dragLoop(e, (dx, dy) => { (S.typhoon.titlePosByRes ||= {})[S.res] = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) }; renderTyphoon(); }); });
  L.appendChild(g);
}

// 부드러운 경로 진행 애니메이션 ('스으윽')
function playTyphoon() {
  if (!isTyphoon()) return;
  cancelAnimationFrame(typhoonRaf);
  const pts = curTyphoonPoints();
  if (pts.length < 2) { typhoonProg = null; renderTyphoon(); return; }
  const N = pts.length;
  const { lo, hi } = typhoonAnimWindow(pts);
  const span = typhoonAnimSpan(lo, hi);   // 라인 모드는 예상 지점으로 넘어가지 않고 현재 위치에서 멈춘다(현재=시작이면 제자리)
  const lineMode = typhoonLineMode();  // 라인 모드는 경로 시각 라벨을 안 그린다 → 라벨 키로 길이를 늘리지 않음
  const _tt = anim().tracks.find((x) => x.kind === 'typhoon');   // 경로 키 + 라벨별 키(미리보기도 타임라인과 동일)
  ensureTyphoonKeys(_tt);
  const ps = _tt ? +_tt.ps : 0, pe = _tt ? +_tt.pe : ps + 2.0;
  const psM = ps * 1000, peM = pe * 1000;
  const lab = (_tt && _tt.lab) || {};
  const map = {}; let labEnd = 0;   // 라벨별 등장 절대시각(ms) + 리더/스케일 시간
  if (!lineMode) for (const b of labelList()) if (!b.off && b.idx != null && b.idx >= lo && b.idx <= hi) {
    const e = lab[b.id]; if (!e) continue;
    const dur = Math.max(0.05, e.e - e.s) * 1000;
    map[b.id] = { st: e.s * 1000, LINE: dur * 0.6, SCALE: dur * 0.7 };
    labEnd = Math.max(labEnd, e.e * 1000);
  }
  const hasCam = camKeys().length >= 2;   // 카메라 키가 2개 이상이면 애니 확인에서 카메라도 보간해 보여준다
  const camEnd = hasCam ? Math.max(...camKeys().map((k) => k.t)) * 1000 : 0;
  const END = Math.max(peM, labEnd, camEnd) + 120;   // 경로·라벨·카메라 중 늦게 끝나는 것까지
  const easeCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);   // easeInOutCubic
  let t0 = null;
  const step = (ts) => {
    if (t0 == null) t0 = ts;
    const t = ts - t0;
    const pathK = clamp01((t - psM) / Math.max(1, peM - psM));
    typhoonProg = pathK >= 1 ? null : lo + easeCubic(pathK) * span;        // 범위 구간 [lo,hi]만 [ps,pe] 동안 스으윽
    { const cmp = (S.typhoon && S.typhoon.compare) || []; if (cmp.length) { typhoonCmpProg = {}; for (const c of cmp) typhoonCmpProg[c.id] = pathK >= 1 ? null : easeCubic(pathK); } else typhoonCmpProg = null; }   // 0..1 비율(호길이 등속). 미리보기에선 비교선도 함께 진행(정밀 타이밍은 타임라인 재생)
    typhoonHeadFade = 1;   // 선두 아이콘은 끝까지 보이다가 마지막 정적 아이콘으로 자연스럽게 넘어감
    typhoonLabelAnim = { at: t, map };   // t=경과 ms, st=절대 ms (t0=0이므로 일치)
    if (hasCam) applyCam(t / 1000);   // 카메라 키가 있으면 '애니메이션 확인'에서도 카메라 이동을 같이 보여준다(초 단위 = 타임라인 시각)
    renderTyphoon();
    if (t < END) typhoonRaf = requestAnimationFrame(step);
    else { typhoonProg = null; typhoonCmpProg = null; typhoonLabelAnim = null; typhoonHeadFade = 1; if (hasCam) restoreCamMap(); renderTyphoon(); }
  };
  typhoonProg = lo; typhoonCmpProg = null; typhoonHeadFade = 1; typhoonLabelAnim = { at: 0, map }; renderTyphoon();
  typhoonRaf = requestAnimationFrame(step);
}

// 태풍 모드에선 한국용 수치라벨(L_labels)·산(L_mtn)만 숨긴다.
// 제목·단위(L_title)와 범례(L_legend)는 노말 CG 시스템 그대로 사용(내용·위치·스타일·해상도별 동일).
function toggleKoreaOverlays(hide) {
  for (const id of ['#L_labels', '#L_mtn']) {
    const n = $(id); if (n) n.style.display = hide ? 'none' : '';
  }
}

// 광역 육지 path(남한 제외) — 남한은 정밀 외곽선으로 따로 그리므로 거친 ne50 남한을 뺀다. 1회 계산 캐시.
let _typhoonLandNoKr = null;
function typhoonLandNoKorea() {
  if (_typhoonLandNoKr != null) return _typhoonLandNoKr;
  const bc = window.TYPHOON_MAP && window.TYPHOON_MAP.byCountry;
  if (!bc) return (_typhoonLandNoKr = (window.TYPHOON_MAP && window.TYPHOON_MAP.land) || '');
  let d = '';
  for (const name of Object.keys(bc)) if (name !== 'South Korea') d += bc[name];
  return (_typhoonLandNoKr = d);
}
let _inTyphoonRender = false;
function renderTyphoon() {
  bumpMapContent();
  _inTyphoonRender = true;
  try { _renderTyphoon(); } finally { _inTyphoonRender = false; }
}
function _renderTyphoon() {
  const on = isTyphoon();
  toggleKoreaOverlays(on);
  // 지도 배경(거대 path)을 태풍 모드 동안 GPU 레이어로 '미리 데워' 둔다 — 팬 시작 때 텍스처를 만드느라 늦게 시작되던 지연 제거.
  for (const id of ['bgMapT', 'mapT']) { const n = $('#' + id); if (n) { if (on) { n.style.willChange = 'transform'; n.style.transformBox = 'view-box'; n.style.transformOrigin = '0 0'; } else { n.style.willChange = ''; n.style.transformBox = ''; n.style.transformOrigin = ''; n.style.transform = ''; } } }
  const ocean = $('#typhoonOcean'), land = $('#typhoonLand'), kr = $('#typhoonKr'), L = $('#L_typhoon');
  if (ocean) ocean.style.display = on ? '' : 'none';
  const T = on ? (S.typhoon || (initTyphoonData(), S.typhoon)) : null;
  if (land) {
    // 광역 육지에서 남한은 뺀다 — 남한은 아래 typhoonKrBase가 '정밀 외곽선(MAP.outline)'으로 그려
    // 강조 선/면과 지오메트리가 완전히 일치하게 한다(거친 ne50 남한이 비쳐 어긋나던 문제 해결).
    if (on && window.TYPHOON_MAP && !land.getAttribute('d')) {
      const dNoKr = typhoonLandNoKorea();
      land.setAttribute('d', dNoKr);
      const clip = $('#typhoonLandClipP'); if (clip) clip.setAttribute('d', dNoKr + (MAP.outline || ''));   // 지형은 정밀 남한에도 얹히게
    }
    land.style.display = on ? '' : 'none';
    if (on) { land.setAttribute('fill', (T && T.landFill) || '#12325A'); land.setAttribute('fill-rule', 'evenodd'); land.setAttribute('stroke', (T && T.landStroke) || '#3C6390'); land.setAttribute('stroke-width', 1.0 / (S.map.s || 1)); land.setAttribute('stroke-linejoin', 'round'); }
  }
  // 남한 육지(면) — 정밀 외곽선을 다른 나라와 같은 육지색으로. 강조를 꺼도 육지는 남아 있게 항상 표시.
  const krBase = $('#typhoonKrBase');
  if (krBase) {
    const showB = on && MAP.outline;
    if (showB && krBase.getAttribute('d') !== MAP.outline) krBase.setAttribute('d', MAP.outline);
    krBase.style.display = showB ? '' : 'none';
    if (showB) {
      krBase.setAttribute('fill', (T && T.landFill) || '#12325A');
      krBase.setAttribute('fill-rule', 'evenodd');
      krBase.setAttribute('stroke', (T && T.landStroke) || '#3C6390');
      krBase.setAttribute('stroke-width', 1.0 / (S.map.s || 1));
      krBase.setAttribute('stroke-linejoin', 'round');
    }
  }
  // 지형(음영기복 이미지) — Web Mercator라 projLL로 정렬. 강도 = 이미지 불투명도.
  const relief = $('#typhoonRelief');
  if (relief) {
    const amt = on && T ? (T.terrain == null ? 0.85 : T.terrain) : 0;
    const RL = window.TYPHOON_RELIEF;
    const show = on && amt > 0.001 && RL && RL.img;
    if (show && relief.getAttribute('href') !== RL.img) relief.setAttribute('href', RL.img);
    relief.style.display = show ? '' : 'none';
    if (show) {
      const [lo0, la0, lo1, la1] = RL.bbox;
      const tl = projLL(lo0, la1), br = projLL(lo1, la0);   // top-left(lat max), bottom-right(lat min)
      relief.setAttribute('x', tl[0]); relief.setAttribute('y', tl[1]);
      relief.setAttribute('width', br[0] - tl[0]); relief.setAttribute('height', br[1] - tl[1]);
      relief.setAttribute('opacity', amt);
    }
  }
  // 위성 basemap(밝은/어두운) — projLL 정렬(relief와 동일). 켜지면 파란 지도(바다·육지·지형) 숨김.
  const sat = $('#typhoonSat');
  const bmMode = (on && T) ? T.basemap : '';
  const SAT = bmMode === 'satdark' ? window.TYPHOON_SATELLITE_DARK : window.TYPHOON_SATELLITE;
  const isSat = !!((bmMode === 'satellite' || bmMode === 'satdark') && SAT && SAT.img);
  if (sat) {
    if (isSat) {
      if (sat.getAttribute('href') !== SAT.img) sat.setAttribute('href', SAT.img);
      const [lo0, la0, lo1, la1] = SAT.bbox;
      const tl = projLL(lo0, la1), br = projLL(lo1, la0);
      sat.setAttribute('x', tl[0]); sat.setAttribute('y', tl[1]);
      sat.setAttribute('width', br[0] - tl[0]); sat.setAttribute('height', br[1] - tl[1]);
      sat.style.display = '';
    } else sat.style.display = 'none';
  }
  const isMbx = !!(on && T && T.basemap === 'mapbox' && mapboxTileTemplate());   // Mapbox 실시간 타일(URL 있을 때만; 없으면 파란 지도 유지)
  const isDarkSat = bmMode === 'satdark';
  if (isSat || isMbx) {   // 위성/타일모드: 파란 육지/바다/지형 숨김(위성이 실제 지형 보여줌). 격자는 아래에서 바다에만 클립.
    if (ocean) ocean.style.display = 'none';
    if (land) land.style.display = 'none';
    if (krBase) krBase.style.display = 'none';
    if (relief) relief.style.display = 'none';
    for (const id of ['#typhoonSido', '#nbrNW', '#nbrJP']) { const nn = $(id); if (nn) nn.style.display = 'none'; }
  }
  { const coast = $('#typhoonCoast'); if (coast) coast.style.display = 'none'; }   // 해안선 외곽선 미사용(위성이 실제 해안선을 보여줌)
  scheduleMapboxTiles();   // 타일 그룹 표시/갱신(모드 아니면 숨김 처리)
  { const bmb = $('#basemapBtn'); if (bmb) { bmb.style.display = on ? '' : 'none'; bmb.classList.toggle('sat', isSat || isMbx); } if (!on) { const bp = $('#basemapPop'); if (bp) bp.style.display = 'none'; } }
  // 줌아웃하면 남한이 작아져 상세 외곽선/시도선이 겹쳐 뭉친다 → 많이 축소할수록 선을 가늘게(화면폭 축소).
  const lineZf = Math.max(0.28, Math.min(1, (S.map.s || 1) / 0.6));
  // 남한 강조 — 상세 외곽선(MAP.outline, 고해상도) + 반투명 오버레이로 뒤 음영기복이 비쳐 보이게
  if (kr) {
    const show = on && T && T.krShow !== 0 && MAP.outline;
    if (show && kr.getAttribute('d') !== MAP.outline) kr.setAttribute('d', MAP.outline);
    kr.style.display = show ? '' : 'none';
    if (show) {
      kr.setAttribute('fill', T.krFill || '#2E6FB0');
      kr.setAttribute('fill-opacity', T.krOpacity == null ? 0.45 : T.krOpacity);
      kr.setAttribute('fill-rule', 'evenodd');
      kr.setAttribute('stroke', T.krStroke || '#BFE3FF');
      kr.setAttribute('stroke-width', (T.krStrokeW == null ? 1.6 : T.krStrokeW) * lineZf / (S.map.s || 1));   // 줌아웃 시 가늘게(뭉침 방지)
      kr.setAttribute('stroke-opacity', T.krStrokeOp == null ? 1 : T.krStrokeOp);   // 남한 강조 '선' 투명도(면 투명도 krOpacity와 별개)
      kr.setAttribute('stroke-linejoin', 'round');
      kr.style.mixBlendMode = 'screen';
    }
  }
  // 남한 시도 구분선 — 남한과 같은 좌표계(KOREA_MAP 투영)라 #bgMapT에 얹으면 외곽선과 정확히 일치.
  const sido = $('#typhoonSido');
  if (sido) {
    const SL = MAP.styles.sido && MAP.styles.sido.sidoLines;
    const showS = on && T && T.krShow !== 0 && (T.sidoShow == null ? 1 : T.sidoShow) && SL && SL.main;
    if (showS && sido.getAttribute('d') !== SL.main) sido.setAttribute('d', SL.main);
    sido.style.display = showS ? '' : 'none';
    if (showS) {
      sido.setAttribute('fill', 'none');
      sido.setAttribute('stroke', T.sidoCol || T.krStroke || '#BFE3FF');
      sido.setAttribute('stroke-width', (T.sidoW == null ? 0.8 : T.sidoW) * lineZf / (S.map.s || 1));   // 줌아웃 시 가늘게(뭉침 방지)
      sido.setAttribute('stroke-opacity', T.sidoOp == null ? 0.55 : T.sidoOp);
      sido.setAttribute('stroke-linejoin', 'round');
      sido.setAttribute('stroke-linecap', 'round');
    }
  }
  // 경위도 격자선(바다) — bgMapT 첫 자식이라 육지에 가려 바다에만 보인다. 10도 간격 직선(메르카토르).
  const grid = $('#typhoonGrid');
  if (grid) {
    const showG = on && T && (T.gridShow == null ? 1 : T.gridShow);
    if (showG) {
      const step = 10;
      if (grid.getAttribute('data-step') !== String(step)) {
        const CL = (window.TYPHOON_MAP && window.TYPHOON_MAP.clip) || { lonMin: -12, lonMax: 200, latMin: -50, latMax: 78 };
        let d = '';
        const lo0 = Math.ceil(CL.lonMin / step) * step, lo1 = Math.floor(CL.lonMax / step) * step;
        const la0 = Math.ceil(CL.latMin / step) * step, la1 = Math.floor(CL.latMax / step) * step;
        for (let lon = lo0; lon <= lo1; lon += step) { const a = projLL(lon, CL.latMin), b = projLL(lon, CL.latMax); d += 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); }
        for (let lat = la0; lat <= la1; lat += step) { const a = projLL(CL.lonMin, lat), b = projLL(CL.lonMax, lat); d += 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); }
        grid.setAttribute('d', d); grid.setAttribute('data-step', String(step));
      }
      grid.setAttribute('fill', 'none');
      grid.setAttribute('stroke', T.gridCol || '#7FA8CC');
      grid.setAttribute('stroke-width', (T.gridW == null ? 0.6 : T.gridW) / (S.map.s || 1));
      grid.setAttribute('stroke-opacity', T.gridOp == null ? 0.18 : T.gridOp);
      // 위성/타일 모드엔 파란 육지가 없어 격자가 육지에도 보인다 → '바다만'으로 클립(큰 사각형 − 육지 evenodd).
      //  클립 path(수백 KB)는 바뀔 때만 다시 넣는다 — 애니 매 프레임 재설정하면 거대 path 재파싱으로 버벅임.
      if (isSat || isMbx) {
        const scp = $('#typhoonSeaClipP');
        if (scp) { const ck = (window.TYPHOON_MAP ? 1 : 0) + ':' + (MAP.outline || '').length; if (scp.getAttribute('data-k') !== ck) { scp.setAttribute('d', 'M-1000000 -1000000H1000000V1000000H-1000000Z' + typhoonLandNoKorea() + (MAP.outline || '')); scp.setAttribute('data-k', ck); } }
        if (grid.getAttribute('clip-path') !== 'url(#typhoonSeaClip)') grid.setAttribute('clip-path', 'url(#typhoonSeaClip)');
      }
      else if (grid.hasAttribute('clip-path')) grid.removeAttribute('clip-path');
    }
    grid.style.display = showG ? '' : 'none';
  }
  // 아이콘 색 — 빨강 몸통을 iconCol로 재계산(흰 눈 유지). hueRotate와 달리 아무 색이나 정확히 적용.
  const tintM = $('#typhoonIconTintM');
  if (tintM && on && T) tintM.setAttribute('values', iconTintValues(T.iconCol || '#E5231E'));
  // 아이콘 글로우 — 색은 glowCol(없으면 iconCol 따라감), 강도는 glowStr(0~1).
  const glowDS = $('#typhoonIconGlowDS');
  if (glowDS && on && T) {
    const gs = T.glowStr == null ? 0.5 : +T.glowStr;
    glowDS.setAttribute('flood-color', T.glowCol || T.iconCol || '#E5231E');
    glowDS.setAttribute('stdDeviation', (2 + gs * 10).toFixed(1));
    glowDS.setAttribute('flood-opacity', Math.min(1, 0.4 + gs * 0.7).toFixed(2));
  }
  if (!L) return;
  L.textContent = '';
  L.style.display = on ? '' : 'none';
  // 라벨 레이어(#L_typhoonLabels)는 태풍 모드일 때만 drawTyphoonLabels가 비우고 다시 채운다.
  // 태풍이 아니면 여기서 비워야 특보·일반 지도로 넘어갔을 때 옛 태풍 라벨(수치라벨+지시선)이 안 남는다.
  const LB0 = $('#L_typhoonLabels'); if (LB0) { LB0.style.display = on ? '' : 'none'; if (!on) LB0.textContent = ''; }
  if (!on) return;
  drawTyphoonTrack(L, curTyphoonPoints());
  renderRefImg();   // 참고 이미지(대고 그리기 언더레이) + 프리 트랜스폼 핸들
}

// 태풍 사이드바 값 채우기 (태풍 모드에서만)
// 태풍 라벨 기본값 — 노말 라벨과 같은 구조(newLabel) + idx(트랙 지점) + 진남색 박스. 내용은 그 시각.
function makeTyphoonLabel(i, p, side) {
  const [px, py] = typhoonXY(p.lon, p.lat);
  const ls = (typhoonStyleDefaults().labelStyle) || {};   // 굽힌 라벨 기본 스타일 우선
  const s = side === 'l' ? -1 : 1;
  // 아이콘 가까이 + 45° 대각선 뒤 수평이 잘 보이도록: 위로 살짝, 옆으로 조금 더(수평 구간 확보).
  return newLabel(Object.assign({
    idx: i, txt: p.label || (p.tmef && fmtKST(p.tmef)) || ('지점 ' + (i + 1)), title: '',
    x: Math.round(px + s * 150), y: Math.round(py - 92),
  }, ls));
}
// 불러오기/태풍 전환 시 라벨 자동 생성 — 오늘(현재 시각=마지막 실황) + 예측 최종 지점 2개.
// 라벨이 하나도 없으면 수치라벨 기능이 없어 보여서, 기본으로 보이게 한다. (현재 지도 뷰 기준 배치)
function autoTodayTyphoonLabel() {
  if (!S.typhoon) return;
  const pts = curTyphoonPoints();
  if (!pts || !pts.length) return;
  const ni = typhoonNowIdx(pts), last = pts.length - 1;
  const labs = [];
  if (pts[ni]) labs.push(makeTyphoonLabel(ni, pts[ni], 'r'));            // 오늘 — 오른쪽 대각선
  if (last !== ni && pts[last]) labs.push(makeTyphoonLabel(last, pts[last], 'r'));   // 예측 최종 — 오른쪽 대각선
  S.typhoon.labels = labs;
}

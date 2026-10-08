/* [모듈] js/vf-legend.js — VF 막대·VF 패널 배율, 그림자, 제목 텍스트(renderTexts), 범례(renderLegend·특보·태풍 범례 목록) */
'use strict';

// 노말 VF 제목 바 — 배경(패널)을 사각형만큼 잘라 지도 위에 올린다. 이동 모드에선 이동/크기 핸들도.
function renderVfBar() {
  // VF 미리보기 배경(가상 영상) — VF 화면 작업 중에만 보이고 추출엔 안 나간다.
  const prev = $('#L_vfPreview');
  if (prev) {
    const showPrev = S.res === '1920x1080-vf';
    prev.style.display = showPrev ? '' : 'none';
    if (showPrev) { const pi = $('#vfPreviewImg'); if (pi && !pi.getAttribute('href')) pi.setAttribute('href', IMG.bgVfPreview || ''); }
  }
  const b = (S.vfBar ||= { on: 0, x: 1140, y: 150, w: 640, h: 110 });
  const show = S.res === '1920x1080-vf' && b.on;
  const layer = $('#L_vfBar');
  if (layer) layer.style.display = show ? '' : 'none';
  if (show && layer) {
    const img = $('#vfBarImg'); if (img) img.setAttribute('href', IMG[bgKey()] || IMG.bgVfDark || '');
    const av = vfExpandedLegend();   // 범례 3+면 바를 아래로 확장해 가로 범례가 들어갈 띠를 만든다
    const barH = av ? b.h + av.extraH : b.h;
    const rc = $('#vfBarRect'); if (rc) { rc.setAttribute('x', b.x); rc.setAttribute('y', b.y); rc.setAttribute('width', Math.max(1, b.w)); rc.setAttribute('height', Math.max(1, barH)); }
    // 그림자 + 배경 패널로 클립(그림자가 패널 밖으로 안 나가게). 패널 사각형은 vfClip 공유.
    computeVfPanelRect((r) => { if (r) { const pc = $('#vfClipRect'); if (pc) { pc.setAttribute('x', r.x); pc.setAttribute('y', r.y); pc.setAttribute('width', r.w); pc.setAttribute('height', r.h); } } });
    const fe = $('#vfBarShadowFe');
    if (fe) { fe.setAttribute('flood-opacity', (b.shOp == null ? 42 : b.shOp) / 100); fe.setAttribute('stdDeviation', b.shBlur == null ? 7 : b.shBlur); fe.setAttribute('dy', b.shDy == null ? 7 : b.shDy); }
    layer.setAttribute('filter', (b.shOp === 0) ? 'none' : 'url(#vfBarShadow)');   // 농도 0이면 그림자 끔
    layer.setAttribute('clip-path', 'url(#vfClip)');
  } else if (layer) { layer.removeAttribute('filter'); layer.removeAttribute('clip-path'); }
  const handles = show && mode === 'move';
  const hit = $('#vfBarHit');
  if (hit) { hit.style.display = handles ? '' : 'none'; if (handles) { hit.setAttribute('x', b.x); hit.setAttribute('y', b.y); hit.setAttribute('width', Math.max(1, b.w)); hit.setAttribute('height', Math.max(1, b.h)); } }
  const grip = $('#vfBarGrip');
  if (grip) { grip.style.display = handles ? '' : 'none'; if (handles) grip.setAttribute('transform', `translate(${b.x + b.w} ${b.y + b.h})`); }
  renderLegend();   // 바 높이·상태가 바뀌면 범례도 함께 재배치(자동일 때 바 확장/축소에 맞춤). renderLegend는 renderVfBar를 안 부름(무한루프 방지).
}
// 범례 통째로 이동 — dragLoop(svg 좌표 델타) 사용. 3+ 자동배치 중이면 many(3개 이상 전용)를 옮긴다.
function startLegendMove(e) { const g = (S.legend ||= {}); const t = vfExpandedLegend() ? (g.many ||= {}) : g; const ox = t.x, oy = t.y; pushUndo(); dragLoop(e, (dx, dy) => { t.x = Math.round(ox + dx); t.y = Math.round(oy + dy); renderLegend(); }); }
// 노말 VF에선 범례가 래퍼(패널) 클립 안에 있어야 보인다. 패널 밖에 있으면 패널 안으로 옮겨 준다.
// (VF 특보 지도에서 범례를 켜도 화면 왼쪽 기본위치라 잘려 안 보이던 문제 — 켤 때 패널 안으로.)
function ensureLegendInVfPanel() {
  if (S.res !== '1920x1080-vf') return;
  const place = (r) => {
    if (!r) return;
    const g = S.legend; if (!g) return;
    const inside = g.x >= r.x && g.x <= r.x + r.w - 40 && g.y >= r.y && g.y <= r.y + r.h - 40;
    if (!inside) { g.x = Math.round(r.x + r.w * 0.10); g.y = Math.round(r.y + r.h * 0.5); renderLegend(); syncPanelFromState(); }
  };
  if (_vfPanelRect) place(_vfPanelRect); else computeVfPanelRect(place);
}
// 범례 크기 조절 — 우하단 핸들을 끌면 상자·글자·간격이 함께 커지고 작아진다
function startLegendResize(e) {
  const g = (S.legend ||= {});
  const t = vfExpandedLegend() ? (g.many ||= {}) : g;   // 3+ 확장배치 중이면 many 크기 조절
  const grp = document.querySelector('#L_legend g[data-kind="legend"]');
  const w0 = Math.max(40, grp ? grp.getBBox().width : 200);
  const s0 = { box: t.box, size: t.size, gap: t.gap == null ? 18 : t.gap, rowGap: t.rowGap == null ? 16 : t.rowGap };
  pushUndo();
  dragLoop(e, (dx) => {
    const k = Math.max(0.3, Math.min(4, (w0 + dx) / w0));
    t.box = Math.max(8, Math.round(s0.box * k));
    t.size = Math.max(10, Math.round(s0.size * k));
    t.gap = Math.round(s0.gap * k);
    t.rowGap = Math.round(s0.rowGap * k);
    renderVfBar();   // 크기 → 바 높이(extraH)도 재계산 (범례도 함께 렌더)
  }, () => syncPanelFromState());
}
// 제목 바 이동/크기 — dragLoop(svg 좌표 델타) 사용
function startVfBarMove(e) { const b = S.vfBar, ox = b.x, oy = b.y; pushUndo(); dragLoop(e, (dx, dy) => { b.x = Math.round(ox + dx); b.y = Math.round(oy + dy); renderVfBar(); }); }
function startVfBarResize(e) { const b = S.vfBar, ow = b.w, oh = b.h; pushUndo(); dragLoop(e, (dx, dy) => { b.w = Math.max(40, Math.round(ow + dx)); b.h = Math.max(24, Math.round(oh + dy)); renderVfBar(); }); }

// 노말 VF: 배경 패널(불투명 사각 범위) 안으로만 전체를 자른다. 래퍼(L_vfWrap) 하나에 clip을 걸어
// 지도·실루엣·박스·산·라벨·제목이 전부 패널 밖으로 안 새게 한다.
let _vfPanelRect = null;                 // 패널 불투명 영역의 사각 범위(캔버스 좌표)
function computeVfPanelRect(cb) {
  if (_vfPanelRect) { cb(_vfPanelRect); return; }
  const src = IMG.bgVfDark || IMG.bgVfBright;
  if (!src) { cb(null); return; }
  const im = new Image();
  im.onload = () => {
    const w = im.naturalWidth, h = im.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 30) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    // 이미지 1920x1080이 캔버스에 1:1(slice)로 들어가므로 좌표 그대로 쓴다.
    _vfPanelRect = (maxX >= minX) ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    cb(_vfPanelRect);
  };
  im.onerror = () => cb(null);
  im.src = src;
}
function clampVfScale(v) {
  v = Number(v);
  return Number.isFinite(v) ? Math.max(50, Math.min(150, Math.round(v))) : 100;
}
function vfScaleGroup() {
  if (isTyphoon()) return 'typhoon';   // 태풍 VF 전체 크기는 노말·특보와 독립 (서로 덮어써 풀리던 문제)
  return layoutGroup(S.style) === 'warnsea' ? 'warnsea' : 'common';
}
function setVfScale(v) {
  const scale = clampVfScale(v);
  S.vfScale = scale;
  S.vfScales ||= {};
  S.vfScales[vfScaleGroup()] = scale;
  return scale;
}
function vfScaleValue() {
  S.vfScales ||= {};
  const saved = S.vfScales[vfScaleGroup()];
  return setVfScale(saved === undefined ? S.vfScale : saved);
}
// 일반 출력 화면에서 패널을 동기화할 때는 작업용 VF 스케일을 만들지 않는다.
// 그래야 VF 첫 진입 시 배포 프리셋의 vfScale(일반/특보+해상)이 우선 적용된다.
function vfScaleForPanel() {
  return S.res === '1920x1080-vf' ? vfScaleValue() : clampVfScale(S.vfScale);
}
function applyPresetVfScale(preset, liveScale) {
  if (S.res !== '1920x1080-vf') return false;
  setVfScale(liveScale !== undefined ? liveScale : (preset && preset.vfScale !== undefined ? preset.vfScale : 100));
  return true;
}
function vfScaleTransform(r, value) {
  const k = clampVfScale(value) / 100;
  const ax = r.x + r.w, ay = r.y;
  return `translate(${ax} ${ay}) scale(${k}) translate(${-ax} ${-ay})`;
}
function renderVfScale() {
  const layer = $('#L_vfScale'), bounds = $('#vfScaleBounds'), grip = $('#vfScaleGrip');
  if (!layer || !bounds || !grip) return;
  if (S.res !== '1920x1080-vf') {
    layer.removeAttribute('transform');
    bounds.style.display = grip.style.display = 'none';
    return;
  }
  computeVfPanelRect((r) => {
    if (!r || S.res !== '1920x1080-vf') {
      layer.removeAttribute('transform');
      bounds.style.display = grip.style.display = 'none';
      return;
    }
    const scale = vfScaleValue(), k = scale / 100, ax = r.x + r.w, ay = r.y;
    layer.setAttribute('transform', vfScaleTransform(r, scale));
    const x = ax + (r.x - ax) * k, y = ay, w = r.w * k, h = r.h * k;
    const handles = mode === 'move';
    bounds.style.display = grip.style.display = handles ? '' : 'none';
    if (handles) {
      bounds.setAttribute('x', x); bounds.setAttribute('y', y);
      bounds.setAttribute('width', w); bounds.setAttribute('height', h);
      grip.setAttribute('transform', `translate(${x} ${y + h})`);
    }
    const input = $('#vfScale'), value = $('#vfScaleV');
    if (input) input.value = scale;
    if (value) value.textContent = scale + '%';
  });
}
function startVfScaleResize(e) {
  computeVfPanelRect((r) => {
    if (!r || S.res !== '1920x1080-vf') return;
    const start = vfScaleValue() / 100;
    const vx = -r.w, vy = r.h, denom = vx * vx + vy * vy;
    pushUndo('vfScale');
    dragLoop(e, (dx, dy) => {
      const nx = vx * start + dx, ny = vy * start + dy;
      setVfScale((nx * vx + ny * vy) / denom * 100);
      renderVfScale();
      if (isTyphoon() && camTiltOn()) { renderTyphoon(); applyTilt(); }   // 3D 회전 중이면 라벨 투영·지도 래스터도 VF 크기에 맞춰 갱신
    }, () => syncPanelFromState());
  });
}
function applyVfClip() {
  const vf = S.res === '1920x1080-vf' && S.showBg;
  const wrap = document.getElementById('L_vfWrap');
  const scaleLayer = document.getElementById('L_vfScale');
  if (!wrap || !scaleLayer) return;
  wrap.removeAttribute('clip-path'); // 진입 애니 래퍼는 이동·페이드만 담당
  if (!vf) { scaleLayer.removeAttribute('clip-path'); return; }
  computeVfPanelRect((r) => {
    if (!r) { scaleLayer.removeAttribute('clip-path'); return; }
    const rc = $('#vfClipRect');
    if (rc) { rc.setAttribute('x', r.x); rc.setAttribute('y', r.y); rc.setAttribute('width', r.w); rc.setAttribute('height', r.h); }
    scaleLayer.setAttribute('clip-path', 'url(#vfClip)');
  });
}

function renderShadow() {
  bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
  const s = S.shadow;
  const fx = $('#shadowFx');
  fx.setAttribute('dx', s.x); fx.setAttribute('dy', s.y);
  fx.setAttribute('stdDeviation', s.blur);
  fx.setAttribute('flood-color', s.col);
  fx.setAttribute('flood-opacity', s.op / 100);
  // 그림자가 꺼져 있으면 필터 자체를 떼서 렌더 비용을 없앤다
  const on = s.op > 0 && (s.blur > 0 || s.x || s.y);
  if (on) $('#L_map').setAttribute('filter', 'url(#shadowF)');
  else $('#L_map').removeAttribute('filter');
  // 수치 라벨도 지도와 같은 그림자 (S.labShadow 켜졌을 때)
  if (on && S.labShadow) $('#L_labels').setAttribute('filter', 'url(#shadowF)');
  else $('#L_labels').removeAttribute('filter');
  // 제목 텍스트도 지도와 같은 그림자 (S.txtShadow 켜졌을 때)
  if (on && S.txtShadow) $('#L_title').setAttribute('filter', 'url(#shadowF)');
  else $('#L_title').removeAttribute('filter');
}

function renderTexts() {
  const L = $('#L_title');
  L.textContent = '';
  for (const t of S.texts) {
    if (t.off) continue; // 눈 꺼짐 — 화면에도 추출에도 안 나온다
    const n = el('text', {
      class: 'drag', 'data-kind': 'text', 'data-id': t.id,
      x: t.x, y: t.y, fill: t.col, 'font-family': '"SUITE CG", "Malgun Gothic", sans-serif',
      'font-size': t.size, 'font-weight': t.w, 'letter-spacing': t.track,
      'text-anchor': t.align, 'xml:space': 'preserve',
    });
    n.textContent = t.txt;
    L.append(n);
  }
}

// 켜둔(눈 켠) 특보들을 색·이름으로 정리해 범례 항목으로. (buildWrnList의 집계와 같은 규칙)
function wrnLegendItems() {
  if (typeof wrnRows === 'undefined' || !Array.isArray(wrnRows) || !wrnRows.length) return [];
  const agg = {};
  for (const r of wrnRows) { const k = r.wrn + ' ' + r.lvl; (agg[k] ||= { wrn: r.wrn, lvl: r.lvl }); }
  return Object.values(agg)
    .filter((a) => !S.wrnOff[wrnKeyOf(a)])                      // 눈 끈 것은 제외
    .sort((a, b) => wrnRank(a) - wrnRank(b))                    // 목록과 같은 우선순위(위=우선)
    .map((a) => ({ col: wrnColorOf(a.wrn, a.lvl) || '#666', txt: (a.wrn + ' ' + a.lvl).trim() }));
}

// 노말 VF 완전자동: 제목 바가 켜져 있고 특보가 3개 이상이면 → 바를 아래로 확장하고 범례를 그 띠에 가로로 자동 배치.
// (2개까지는 사용자가 잡은 세로 배치 그대로.) 반환 null = 자동 적용 안 함.
function vfExpandedLegend() {
  const g = S.legend;
  if (S.res !== '1920x1080-vf' || !g || !g.on) return null;
  const ty = isTyphoon();
  const b = S.vfBar;
  if (!ty && (!b || !b.on)) return null;         // 특보: 제목 바가 있어야 그 아래로 확장. 태풍: 제목바 없어도 3+면 확장.
  const auto = g.auto == null ? 1 : g.auto;
  // 태풍 범례는 항상 15/25/70 3항목 → many(가로 확장) 배치를 쓴다.
  const items = (ty ? typhoonLegendItems() : (auto ? wrnLegendItems() : (g.items || []))).filter((it) => it && (it.txt || it.col));
  if (items.length < 3) return null;                       // 3개 이상일 때만
  // 3개 이상 전용 배치(many) — 사용자가 끌기·핸들로 조정하고 저장한다. 없으면 기본값 생성.
  if (!g.many) g.many = { x: b && b.on ? Math.round(b.x + 20) : Math.round((g.x || 150)), y: b && b.on ? Math.round(b.y + b.h + 8) : Math.round((g.y || 560)),
    box: Math.max(8, Math.round(g.box * 0.75)), size: Math.max(10, Math.round(g.size * 0.75)),
    gap: g.gap == null ? 18 : g.gap, rowGap: g.rowGap == null ? 16 : g.rowGap };
  const m = g.many;
  const rowH = Math.max(m.box, m.size * 1.1);
  const pad = Math.max(8, Math.round(m.size * 0.35));
  return { items, m, rowH, pad, extraH: rowH + pad * 2, b };
}

// 범례 마크 한 개 — 강도(kind:grade)는 숫자 원, 열대저압부(td)는 점, 그 외는 색상 사각형.
function drawLegendMark(grp, it, ox, top, box, rowH, radius) {
  const cx = ox + box / 2, cy = top + rowH / 2;
  if (it && it.kind === 'grade') {
    const rr = box / 2;
    grp.append(el('circle', { cx, cy, r: rr, fill: it.col || '#888', stroke: '#FFFFFF', 'stroke-width': Math.max(1, rr * 0.14) }));
    const t = el('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#FFFFFF', 'font-family': '"SUITE CG","Malgun Gothic",sans-serif', 'font-weight': 800, 'font-size': rr * 1.3, 'xml:space': 'preserve' });
    t.textContent = String(it.g); grp.append(t);
  } else if (it && it.kind === 'td') {
    grp.append(el('circle', { cx, cy, r: box * 0.28, fill: it.col || '#9AA3AD', stroke: '#FFFFFF', 'stroke-width': Math.max(1, box * 0.05) }));
  } else {
    grp.append(el('rect', { x: ox, y: top + (rowH - box) / 2, width: box, height: box, rx: radius || 0, ry: radius || 0, fill: (it && it.col) || '#FFFFFF' }));
  }
}
// 기상특보 범례 — 제목 밑에 '색상 상자 + 이름' 줄들. 전체를 한 그룹으로 끌어 옮긴다.
function renderLegend() {
  const L = $('#L_legend'); if (!L) return;
  L.textContent = '';
  const grip = $('#legendGrip'); if (grip) grip.style.display = 'none';   // 기본 숨김 — 아래서 렌더될 때만 켠다
  const g = (S.legend ||= { on: 0, auto: 1, x: 150, y: 560, box: 34, radius: 6, rowGap: 16, size: 34, weight: 600, txtCol: '#FFFFFF', gap: 18, items: [] });
  if (isTyphoon() && !isTyphoonCompare()) g.on = 1;   // 단일 태풍 지도는 범례 항상 표시. 비교 지도는 토글(#tycLegend)로 껐다 켰다.
  if (!g.on) return;
  // 자동: 특보 목록에서 눈 켠 것만 색·이름으로 자동 표시. 수동: 내가 만든 항목.
  // 태풍 지도에선 15/25m/s·70% 반경 항목을 특보 범례와 같은 스타일로 보여준다.
  const auto = g.auto == null ? 1 : g.auto;
  const src = isTyphoon() ? typhoonLegendItems() : (auto ? wrnLegendItems() : (g.items || []));
  const items = src.filter((it) => it && (it.txt || it.col));
  if (!items.length) return;
  const av = vfExpandedLegend();       // VF 범례 3+ → 별도 배치(many) 사용
  const lay = av ? av.m : g;       // 3+면 many(사용자 조정값), 아니면 기본 배치
  const horiz = av ? true : !!g.horiz;   // 3+면 강제 가로
  const box = lay.box, size = lay.size, rowGap = lay.rowGap == null ? 16 : lay.rowGap, gap = lay.gap == null ? 18 : lay.gap;
  const rowH = Math.max(box, size * 1.1);
  const ox0 = av ? av.m.x : g.x, oy0 = av ? av.m.y : g.y;   // 위치: 3+는 many, 아니면 기본
  const grp = el('g', { class: 'drag', 'data-kind': 'legend', 'data-id': 'legend', transform: `translate(${ox0} ${oy0})` });
  L.append(grp);   // 먼저 붙여야 가로 배치에서 글자 폭(getComputedTextLength)을 잴 수 있다
  let cursor = 0;
  items.forEach((it, i) => {
    const ox = horiz ? cursor : 0;
    const top = horiz ? 0 : i * (rowH + rowGap);
    drawLegendMark(grp, it, ox, top, box, rowH, g.radius);   // 강도=숫자원 / TD=점 / 그외=사각형
    const t = el('text', {
      x: ox + box + gap, y: top + rowH / 2, fill: g.txtCol || '#FFFFFF', 'font-family': '"SUITE CG", "Malgun Gothic", sans-serif',
      'font-size': size, 'font-weight': g.weight || 600, 'dominant-baseline': 'central', 'letter-spacing': -0.5, 'xml:space': 'preserve',
    });
    t.textContent = it.txt || '';
    grp.append(t);
    if (horiz) {
      let tw; try { tw = t.getComputedTextLength(); } catch (e) { tw = (it.txt || '').length * size * 0.95; }
      cursor = ox + box + gap + tw + Math.max(18, rowGap);   // 항목 사이 간격 = '줄 간격'
    }
  });
  // 크기 핸들 — 우하단 (2개까지는 기본 배치, 3+는 many 배치를 조정 → 각각 저장)
  if (grip) {
    const bb = grp.getBBox();
    grip.setAttribute('transform', `translate(${ox0 + bb.x + bb.width} ${oy0 + bb.y + bb.height})`);
    grip.style.display = '';
  }
}

// 자동/수동 모드에 따라 범례 UI 전환 (자동이면 수동 목록 숨기고 안내 표시)
function syncLegendMode() {
  const auto = (S.legend && S.legend.auto == null) ? 1 : (S.legend && S.legend.auto);
  const man = $('#lgManual'), hint = $('#lgAutoHint');
  if (man) man.style.display = auto ? 'none' : '';
  if (hint) hint.style.display = auto ? '' : 'none';
}
// 범례 항목 목록 UI (색상 + 이름 + 삭제)
function buildLgList() {
  const L = $('#lgList'); if (!L) return;
  const g = (S.legend ||= { items: [] });
  const items = (g.items ||= []);
  L.innerHTML = '';
  if (!items.length) { L.innerHTML = '<div class="empty">항목이 없습니다 — “+ 항목 추가”</div>'; return; }
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'row wide';
    row.style.cssText = 'gap:6px;align-items:center;margin-bottom:4px';
    row.innerHTML = `<input type="color" data-i="${i}" class="lgItemCol" value="${it.col || '#FFFFFF'}" style="flex:0 0 40px;padding:0">`
      + `<input type="text" data-i="${i}" class="lgItemTxt" value="${(it.txt || '').replace(/"/g, '&quot;')}" placeholder="이름" style="flex:1">`
      + `<button data-i="${i}" class="lgItemDel" title="삭제" style="flex:0 0 30px">✕</button>`;
    L.append(row);
  });
  L.querySelectorAll('.lgItemCol').forEach((n) => { n.oninput = (e) => { pushUndo('lgcol'); items[+e.target.dataset.i].col = e.target.value.toUpperCase(); renderVfBar(); }; });
  L.querySelectorAll('.lgItemTxt').forEach((n) => wireImeText(n, (v) => { pushUndo('lgtxt'); items[+n.dataset.i].txt = v; renderVfBar(); }));
  L.querySelectorAll('.lgItemDel').forEach((n) => { n.onclick = (e) => { pushUndo(); items.splice(+e.target.dataset.i, 1); renderVfBar(); buildLgList(); }; });
}
// 태풍 범례 선택 목록 — 후보(반경·강도)마다 눈 토글 + 드래그 순서. 강도는 숫자 원 미리보기.
function buildTyphoonLegendList() {
  const L = $('#typLegendList'); if (!L) return;
  const T = S.typhoon; if (!T) return;
  if (!T.legendOrder || !T.legendOrder.length) T.legendOrder = TYPHOON_LEGEND_DEFAULT_ORDER.slice();
  if (!T.legendHidden) T.legendHidden = Object.assign({}, TYPHOON_LEGEND_DEFAULT_HIDDEN);
  const cat = typhoonLegendCatalog(), byId = {}; for (const it of cat) byId[it.id] = it;
  for (const it of cat) if (!T.legendOrder.includes(it.id)) T.legendOrder.push(it.id);   // 새 후보 보강
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  L.innerHTML = '';
  T.legendOrder.forEach((id) => {
    const it = byId[id]; if (!it) return;
    const hidden = !!T.legendHidden[id];
    const mark = it.kind === 'grade'
      ? `<span style="flex:0 0 20px;height:20px;border-radius:50%;background:${it.col};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:1px solid #fff">${it.g}</span>`
      : it.kind === 'td'
        ? `<span style="flex:0 0 20px;display:inline-flex;justify-content:center"><span style="width:9px;height:9px;border-radius:50%;background:${it.col};border:1px solid #fff"></span></span>`
        : `<span style="flex:0 0 20px;height:14px;border-radius:3px;background:${it.col};display:inline-block"></span>`;
    const row = document.createElement('div');
    row.className = 'row wide'; row.draggable = true; row.dataset.id = id;
    row.style.cssText = 'gap:8px;align-items:center;margin-bottom:3px;cursor:grab';
    row.innerHTML = `<span style="flex:0 0 12px;opacity:.45;cursor:grab">⋮⋮</span>`
      + `<button class="eye lgTyEye${hidden ? ' off' : ''}" data-id="${id}" title="켜기/끄기" style="flex:0 0 auto"></button>`
      + mark
      + `<span style="flex:1;font-size:12px;${hidden ? 'opacity:.4' : ''}">${esc(it.txt)}</span>`;
    L.append(row);
  });
  L.querySelectorAll('.lgTyEye').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); pushUndo(); T.legendHidden[b.dataset.id] = T.legendHidden[b.dataset.id] ? 0 : 1; buildTyphoonLegendList(); renderLegend(); renderVfBar(); }; });
  let dragId = null;
  L.querySelectorAll('[draggable]').forEach((row) => {
    row.addEventListener('dragstart', () => { dragId = row.dataset.id; row.style.opacity = '.4'; });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', (e) => e.preventDefault());
    row.addEventListener('drop', (e) => {
      e.preventDefault(); const tid = row.dataset.id;
      if (!dragId || dragId === tid) return;
      const ord = T.legendOrder, from = ord.indexOf(dragId), to = ord.indexOf(tid);
      if (from < 0 || to < 0) return;
      pushUndo(); ord.splice(from, 1); ord.splice(to, 0, dragId);
      buildTyphoonLegendList(); renderLegend(); renderVfBar();
    });
  });
}

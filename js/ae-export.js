/* [모듈] js/ae-export.js — After Effects 보내기(레이어 분해 blob·sendToAE), download */
'use strict';

// ===== After Effects 자동 임포트(로컬 헬퍼 경유) — 타임라인과 같은 애니메이션 =====
function aeIsLocal() { const h = location.hostname; return h === 'localhost' || h === '127.0.0.1' || location.protocol === 'file:'; }
// AE로 넘길 때만 이모지 화살표(⬆⬇)를 폰트 글리프(↑↓)로 — 웹은 ⬆ 그대로, AE는 Wanted 글리프로.
const aeArrow = (s) => String(s == null ? '' : s).replace(/⬆/g, '↑').replace(/⬇/g, '↓');
// 카메라(일반 지도)가 있으면 레이어를 '카메라로 움직이는 부분'과 '고정 부분'으로 나눠 굽는다 — 앱 renderMapTransform은
// #mapT(본토 존·브러쉬·경계선)·#bgMapT·#seaT(바다)만 옮기고 인셋(#gInsets)·박스(#L_boxes)·배경 그림은 그대로 둔다.
// part: undefined = 전부(지금처럼), 'move' = 움직이는 부분만, 'fix' = 고정 부분(인셋)만
function aeKeepPart(c, part) {
  if (part === 'move') { c.querySelector('#gInsets')?.remove(); c.querySelector('#L_boxes')?.remove(); }
  else if (part === 'fix') { c.querySelector('#mapT')?.remove(); c.querySelector('#seaT')?.remove(); c.querySelector('#bgMapT')?.remove(); }
}
// 배경·지도 base — 칠·라벨·브러쉬 빼고 처음부터 보이는 정적 레이어(땅 색은 베이스로 비움)
// 카메라가 있으면 셋으로: 'fix0' = 배경 그림(맨 아래, 고정) · 'move' = 이웃 나라·바다·본토(움직임) · 'fix1' = 인셋·박스(고정, 위)
async function aeBaseBlob(part, opt) {
  return svgBlob((c) => {
    keepLayers(c, ALL_LAYERS);
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', S.base); z.setAttribute('stroke', 'none'); });
    c.querySelectorAll('#L_labels > *').forEach((n) => n.remove());   // 라벨 박스 + 지시선·앵커 전부 — 지시선은 라벨별 레이어(aeLeaderBlob)로 따로
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());
    c.querySelector('#L_mtn')?.remove();     // 산은 색칠 위 별도 레이어로 (덮임 방지)
    c.querySelector('#L_vfBar')?.remove();   // 제목 바는 지도·경계선 위 별도 레이어로
    c.querySelector('#L_title')?.remove();    // 제목은 AE 편집형 텍스트 레이어로
    c.querySelector('#L_legend')?.remove();  // 범례는 AE 편집형 Shape/Text 프리컴프로
    // 시도/시군 선은 색칠 위에 얹을 별도 레이어(경계선)로 → base에선 전부 뺀다(본토+인셋 시도선까지)
    c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());
    if (part === 'fix0') { c.querySelector('#bgMapT')?.remove(); for (const id of ['#L_sea', '#L_map', '#L_boxes']) c.querySelector(id)?.remove(); }
    else if (part === 'move') { c.querySelector('#typhoonOcean')?.remove(); c.querySelector('#bgImg')?.remove(); aeKeepPart(c, 'move'); }
    else if (part === 'fix1') { for (const id of ['#L_bg', '#L_sea', '#mapT']) c.querySelector(id)?.remove(); }
  }, false, opt);
}
// 브러쉬 덧칠 — 그 색 하나만(투명). 지도 좌표계(L_map) 유지해 브러쉬 위치 그대로.
async function aeBrushBlob(col, part, opt) {
  const U = col.toUpperCase();
  return svgBlob((c) => {
    keepLayers(c, ['L_sea', 'L_map']);
    c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());   // 본토+인셋 시도선·시군선 전부 제거(인셋 sidoLine이 남아 색/특보색 레이어에 지도라인이 새던 문제)
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', 'none'); z.setAttribute('stroke', 'none'); });
    c.querySelectorAll('#seaT .sea').forEach((p) => { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'none'); p.removeAttribute('mask'); });
    c.querySelectorAll('image.brushLayer').forEach((im) => {
      if (im.classList.contains('brushBox')) { if (!(im.getAttribute('data-cols') || '').split(',').includes(U)) im.remove(); return; }   // 공간 자리(투명)는 그 색이 있는 공간만
      if ((im.getAttribute('data-col') || '').toUpperCase() !== U) im.remove(); else { im.style.display = ''; im.removeAttribute('opacity'); }
    });
    aeKeepPart(c, part);
  }, false, opt);
}
// 시도/시군 경계선만(투명) — 색칠 위에 얹어 항상 보이게(정적)
async function aeLinesBlob(part, opt) {
  return svgBlob((c) => {
    keepLayers(c, ['L_map']);
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());   // 브러쉬는 전용 aeBrushBlob에만 — 경계선 레이어엔 빼기
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', 'none'); z.setAttribute('stroke', 'none'); });
    aeKeepPart(c, part);
  }, false, opt);
}
// 산 표시만(투명) — 색칠 위에 올림. base=true면 바탕색(정적, 항상 보임), false면 최종색(페이드인). id를 주면 그 산 하나만(Set이면 그 산들만).
async function aeMtnBlob(base, id) {
  return svgBlob((c) => {
    keepLayers(c, ['L_mtn']);
    c.querySelector('#L_mtn')?.removeAttribute('filter');
    if (id != null) c.querySelectorAll('#L_mtn > g').forEach((g) => { if (!(id instanceof Set ? id.has(g.dataset.id) : g.dataset.id === String(id))) g.remove(); });   // 산 하나만(산마다 레이어 — 타임라인 막대 타이밍)
    if (base) c.querySelectorAll('#L_mtn path').forEach((p) => p.setAttribute('fill', S.base));
  });
}
// 특보 AE 레이어는 최종 화면에서 보이는 조각이 아니라 각 특보의 전체 발효 구역을 보낸다.
// AE는 bottom→top으로 쌓으므로 낮은 우선순위부터 정렬한다. 사용자가 바꾼 wrnOrder도 그대로 반영된다.
function aeWarningFillDefs() {
  if (S.style !== 'warn' && S.style !== 'warnsea') return [];
  // wrnRows는 런타임 변수 — 프로젝트를 다시 열면 비어 있다. 그때는 저장해둔 S.wrnActive를 쓴다(가려진 특보까지 전부 보존).
  const src = (wrnRows && wrnRows.length) ? wrnRows : (S.wrnActive || []);
  const groups = new Map();
  for (const r of src) {
    const key = wrnKeyOf(r);
    if (S.wrnOff[key]) continue;
    const col = wrnColorOf(r.wrn, r.lvl);
    if (!col || !r.id) continue;
    if (!groups.has(key)) groups.set(key, {
      key, name: `${r.wrn}_${r.lvl}`, col, rank: wrnRank(r), ids: new Set(),
    });
    groups.get(key).ids.add(r.id);
  }
  return Array.from(groups.values())
    .sort((a, b) => b.rank - a.rank)
    .map((g) => ({ ...g, ids: Array.from(g.ids) }));
}
async function aeWarningFillBlob(def, part, opt) {
  const ids = new Set(def.ids);
  return svgBlob((c) => {
    keepLayers(c, ['L_sea', 'L_map']);
    c.querySelector('#L_map')?.removeAttribute('filter');
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());   // 브러쉬는 전용 레이어에만 — 특보색 레이어엔 빼기
    c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());   // 본토+인셋 시도선·시군선 전부 제거(인셋 sidoLine이 남아 색/특보색 레이어에 지도라인이 새던 문제)
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => {
      z.setAttribute('stroke', 'none');
      z.setAttribute('fill', ids.has(z.dataset.id) ? def.col : 'none');
    });
    c.querySelectorAll('#seaT .sea').forEach((p) => {
      p.setAttribute('fill', ids.has(p.dataset.id) ? def.col : 'none');
      p.setAttribute('stroke', 'none'); p.removeAttribute('mask'); p.removeAttribute('opacity');
    });
    aeKeepPart(c, part);
  }, false, opt);
}
// 색 하나만 칠한 투명 PNG (그 색만 따로 페이드인시키려고)
async function aeFillBlob(col, part, opt) {
  const F = fills(); const U = col.toUpperCase();
  return svgBlob((c) => {
    keepLayers(c, ['L_sea', 'L_map']);
    c.querySelector('#L_map')?.removeAttribute('filter');   // 색칠 레이어엔 지도 그림자(#shadowF) 빼기
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());   // 브러쉬는 전용 aeBrushBlob에만 — 색별 존 레이어에 남으면 이중 렌더
    c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());   // 본토+인셋 시도선·시군선 전부 제거(인셋 sidoLine이 남아 색/특보색 레이어에 지도라인이 새던 문제)
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => {
      const fc = F[z.dataset.id];
      z.setAttribute('stroke', 'none');   // 색칠 레이어엔 테두리(시군선) 절대 없음 — 색만 페이드인
      z.setAttribute('fill', (fc && fc.toUpperCase() === U) ? fc : 'none');
    });
    c.querySelectorAll('#seaT .sea').forEach((p) => {
      const sc = S.seaFills[p.dataset.id];
      p.setAttribute('fill', (sc && sc.toUpperCase() === U) ? sc : 'none');
      p.setAttribute('stroke', 'none'); p.removeAttribute('mask'); p.removeAttribute('opacity');
    });
    aeKeepPart(c, part);
  }, false, opt);
}
function vfScaledPoint(x, y) {
  if (S.res !== '1920x1080-vf' || !_vfPanelRect) return { x, y };
  const k = vfScaleValue() / 100, ax = _vfPanelRect.x + _vfPanelRect.w, ay = _vfPanelRect.y;
  return { x: ax + (x - ax) * k, y: ay + (y - ay) * k };
}
function vfScaledSize(value) {
  return S.res === '1920x1080-vf' ? value * vfScaleValue() / 100 : value;
}
// AE 스펙 출력 배율 — SVG 뷰박스(1920×1080) 좌표를 출력 해상도(터치 2158×1214 등)로. 노말·VF는 1.
function aeOutK() {
  const [W, H] = RES[S.res].size, kx = W / 1920, ky = H / 1080;
  return { kx, ky, kk: (kx + ky) / 2 };
}
// 화면 좌표/크기 → AE 출력 좌표/크기(VF 축소 + 출력 해상도 배율)
function aePt(x, y) { const p = vfScaledPoint(x, y), k = aeOutK(); return { x: p.x * k.kx, y: p.y * k.ky }; }
function aeSz(value) { return vfScaledSize(value) * aeOutK().kk; }
// 라벨 하나의 배경만(텍스트 뺀 rect+구분선) 그 라벨 크기(w×h)로 잘라서 PNG
async function aeLabelBgBlob(ld) {
  const box = { x: ld.cx - ld.w / 2, y: ld.cy - ld.h / 2, w: ld.w, h: ld.h };
  const clone = svg.cloneNode(true);
  keepLayers(clone, ['L_labels']);
  const scaleLayer = clone.querySelector('#L_vfScale'); if (scaleLayer) scaleLayer.removeAttribute('transform'); // 아래 캔버스 확대와 중복 금지
  clone.querySelectorAll('#L_labels > g').forEach((g) => { if (g.dataset.id !== ld.id) g.remove(); });
  clone.querySelectorAll('#L_labels > [data-fleader-id], #L_labels > [data-fanchor-id]').forEach((n) => n.remove());   // 지시선·앵커(모든 라벨 것)는 박스 g 밖 형제 — 박스 배경엔 빼고 라벨별 지시선 레이어(aeLeaderBlob)로
  clone.querySelectorAll(`#L_labels > g[data-id="${ld.id}"] text`).forEach((t) => t.remove());   // 텍스트 제거 → 배경만
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  const W = Math.max(1, Math.round(aeSz(box.w))), H = Math.max(1, Math.round(aeSz(box.h)));   // 출력 해상도(터치 등) 크기로
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  const fs = clone.querySelector('#fontStyle'); if (fs) fs.textContent = await suiteFontCss();
  const img = new Image(); img.decoding = 'sync'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0, W, H); return await new Promise((r) => c.toBlob(r, 'image/png'));
}
// 지시선 라벨(style 'leader')의 그 라벨 선·앵커원만(투명, 전체 화면) — 라벨 프리컴프와 같은 타이밍으로 페이드(배경에 굽지 않게)
const aeLeaderOwner = (n) => n.getAttribute('data-fleader-id') || n.getAttribute('data-fanchor-id');
async function aeLeaderBlob(id) {
  return svgBlob((c) => {
    keepLayers(c, ['L_labels']);
    c.querySelectorAll('#L_labels > *').forEach((n) => { if (aeLeaderOwner(n) !== id) n.remove(); });   // 박스 g·다른 라벨 지시선 전부 제거
  });
}
// 각 라벨의 프리컴프 정보(크기·중심위치·안쪽 텍스트들) — 화면에 그려진 DOM에서 실측
function aeLabelCompData() {
  const out = [];
  const leaderIds = new Set([...document.querySelectorAll('#L_labels > [data-fleader-id], #L_labels > [data-fanchor-id]')].map(aeLeaderOwner));   // 지시선·앵커가 있는 라벨
  for (const g of document.querySelectorAll('#L_labels > g')) {
    const id = g.dataset.id; const b = S.labels.find((x) => x.id === id);
    if (!b || b.off) continue;
    const rect = g.querySelector('rect'); if (!rect) continue;
    const w = Math.max(1, Math.round(+rect.getAttribute('width'))), h = Math.max(1, Math.round(+rect.getAttribute('height')));
    const texts = [];
    for (const t of g.querySelectorAll('text')) {
      const size = +t.getAttribute('font-size') || 30;
      texts.push({
        content: aeArrow(t.textContent), size,                     // AE엔 폰트 화살표로
        weight: parseInt(t.getAttribute('font-weight') || '500', 10),
        col: (b.txtCol || t.getAttribute('fill') || '#FFFFFF'),    // 라벨 글자색(항상 명시)
        track: +t.getAttribute('letter-spacing') || 0,
        cx: w / 2,                                                 // 가로 중앙(text-anchor middle)
        cy: h / 2 + (+t.getAttribute('y') || 0) + size * 0.34,     // 세로 중앙(central) → AE 베이스라인 보정
      });
    }
    const leader = leaderIds.has(id);
    // 지시선 라벨 — 앵커(ax,ay)·박스 실측 크기(_w,_h)·선 색: 새 헬퍼가 선을 셰이프로 만들어 올라오는 박스를 따라가게(aeLeaderSpec)
    const lg = leader && b.ax != null && b._w > 0 ? { ax: +b.ax, ay: +b.ay, w: +b._w, h: +b._h, col: b.stroke || '#FFFFFF', fill: b.fill } : null;
    out.push({ id, w, h, cx: b.x, cy: b.y, fill: b.fill, texts, leader, lg });
  }
  return out;
}
// VF 제목 바만 투명 PNG로. 지도·경계선보다 나중에 추가해 한반도가 바 위로 올라오지 않게 한다.
async function aeVfBarBlob() {
  return svgBlob((c) => keepLayers(c, ['L_vfBar']));
}
// 화면에 실제 렌더된 범례를 AE 편집형 프리컴프 계약으로 바꾼다.
// 문자열 폭을 다시 추정하지 않고 SVG getBBox 실측값을 써서 자동/수동 배치를 그대로 보존한다.
function aeLegendCompData() {
  if (!S.legend || !S.legend.on) return null;
  const grp = document.querySelector('#L_legend g[data-kind="legend"]');
  if (!grp) return null;
  const rects = Array.from(grp.querySelectorAll('rect'));
  const texts = Array.from(grp.querySelectorAll('text'));
  if (!rects.length || rects.length !== texts.length) return null;
  let bb;
  try { bb = grp.getBBox(); } catch (e) { return null; }
  if (!bb || !(bb.width > 0) || !(bb.height > 0)) return null;
  const tf = grp.transform && grp.transform.baseVal && grp.transform.baseVal.consolidate
    ? grp.transform.baseVal.consolidate() : null;
  const ox = tf ? tf.matrix.e : 0, oy = tf ? tf.matrix.f : 0;
  const k = aeSz(1);   // VF 축소 × 출력 해상도 배율(터치 2158×1214면 ≈1.124)
  const center = aePt(ox + bb.x + bb.width / 2, oy + bb.y + bb.height / 2);
  const items = rects.map((r, i) => {
    const t = texts[i], tb = t.getBBox();
    const content = t.textContent || '';
    return {
      name: content.trim() || `범례 ${i + 1}`,
      shape: {
        x: (+r.getAttribute('x') - bb.x) * k,
        y: (+r.getAttribute('y') - bb.y) * k,
        w: (+r.getAttribute('width')) * k,
        h: (+r.getAttribute('height')) * k,
        radius: (+r.getAttribute('rx') || 0) * k,
        fill: r.getAttribute('fill') || '#FFFFFF',
      },
      text: {
        content: aeArrow(content),
        x: (tb.x - bb.x) * k,
        centerY: (tb.y + tb.height / 2 - bb.y) * k,
        size: (+t.getAttribute('font-size') || 30) * k,
        weight: parseInt(t.getAttribute('font-weight') || '600', 10),
        track: (+t.getAttribute('letter-spacing') || 0) * k,
        fill: t.getAttribute('fill') || '#FFFFFF',
      },
    };
  });
  return { w: bb.width * k, h: bb.height * k, x: center.x, y: center.y, items };
}
// 태풍 아이콘을 단독 PNG로 래스터화(AE 리깅용). past=회색, 아니면 iconCol 틴트. {blob,w,h,cx,cy} 반환(중심=cx,cy).
// cmp=true면 비교 예보선 아이콘(compareIconEl 기준): 작은 원은 forceDot(=c.dotIcon)일 때만(단일 태풍 iconMode 무시).
// forceImg=true면 아이콘 종류와 무관하게 컬러 일러스트(움직이는 선두 — 화면 typhoonIconEl forceImage).
async function aeIconBlob(color, past, td, forceDot, ex, cmp, forceImg) {
  const IC = window.TYPHOON_ICON;
  const R = 90, w = Math.round(R * 3), h = Math.round(R * 3);
  let inner, iconH = R * 2.5;   // iconH=헬퍼 배율 기준 높이(iconScreenH=화면 r×2.5 와 짝)
  const dot = !forceImg && (cmp ? !!forceDot : (forceDot || ((S.typhoon || {}).iconMode || 'image') === 'dot'));
  if (ex) {   // 온대저압부 = 원 + '저' (typhoonIconEl ex 재현)
    const rr = R * 1.15, cx = w / 2, cy = h / 2;
    const lineCol = past ? '#79828E' : '#E24C4C';
    const faceCol = past ? '#AEB6C0' : '#FFFFFF';
    const op = past ? 0.85 : 1;
    const halo = rr + Math.max(1.6, rr * 0.18);
    inner = `<circle cx="${cx}" cy="${cy}" r="${halo}" fill="none" stroke="${past ? '#5A626C' : '#FFFFFF'}" stroke-width="${Math.max(1.6, rr * 0.22)}" stroke-opacity="${past ? 0.35 : 0.9}"/>`
      + `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${faceCol}" stroke="${lineCol}" stroke-width="${Math.max(1.6, rr * 0.15)}" stroke-opacity="${op}" fill-opacity="${op}"/>`
      + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${lineCol}" font-family="'SUITE CG','Malgun Gothic',sans-serif" font-weight="800" font-size="${rr * 1.42}" fill-opacity="${op}">저</text>`;
  } else if (td) {   // 열대저압부(TD) = 원 + X (아이콘 대신). typhoonIconEl의 TD 그리기를 r=R로 재현.
    const rr = R * 1.15, cx = w / 2, cy = h / 2;
    const lineCol = past ? '#79828E' : '#E24C4C';
    const faceCol = past ? '#AEB6C0' : '#FFFFFF';
    const op = past ? 0.85 : 1;
    const halo = rr + Math.max(1.6, rr * 0.18), xx = rr * 0.46;
    inner = `<circle cx="${cx}" cy="${cy}" r="${halo}" fill="none" stroke="${past ? '#5A626C' : '#FFFFFF'}" stroke-width="${Math.max(1.6, rr * 0.22)}" stroke-opacity="${past ? 0.35 : 0.9}"/>`
      + `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${faceCol}" stroke="${lineCol}" stroke-width="${Math.max(1.6, rr * 0.15)}" stroke-opacity="${op}" fill-opacity="${op}"/>`
      + `<path d="M${cx - xx} ${cy - xx}L${cx + xx} ${cy + xx}M${cx + xx} ${cy - xx}L${cx - xx} ${cy + xx}" fill="none" stroke="${lineCol}" stroke-width="${Math.max(1.6, rr * 0.2)}" stroke-linecap="round" stroke-opacity="${op}"/>`;
  } else if (dot) {   // 작은 원 모드 — 색 채움 + 흰 링 한 겹
    // 화면 원 반지름: 비교선 compareIconEl = r×1.05·링 0.34, 단일 태풍 typhoonIconEl = r×0.62·링 0.32 (r=화면 기준 반지름)
    const cx = w / 2, cy = h / 2, rr = R * 0.62, rk = cmp ? 1.05 : 0.62, ring = cmp ? 0.34 : 0.32;
    const face = past ? '#9AA3AD' : color;
    inner = `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${face}" stroke="${past ? '#C8D0DA' : '#FFFFFF'}" stroke-width="${Math.max(1.6, rr * ring)}" stroke-opacity="${past ? 0.7 : 1}" fill-opacity="${past ? 0.9 : 1}"/>`;
    iconH = rr * 2.5 / rk;   // 헬퍼 배율(iconScreenH/iconH)로 AE 원 반지름 = 화면 r×rk (비교선은 예전 59%로 작게 들어가던 문제)
  } else if (IC && IC.img) {
    const ih = R * 2.5, iw = ih * (IC.w / IC.h);
    const filt = past
      ? `<filter id="gi" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feColorMatrix type="matrix" values="1 0 0 0 0.15  0 1 0 0 0.15  0 0 1 0 0.15  0 0 0 1 0"/></filter>`
      : `<filter id="ti" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${iconTintValues(color)}"/></filter>`;
    inner = `<defs>${filt}</defs><image href="${IC.img}" x="${(w - iw) / 2}" y="${(h - ih) / 2}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid meet" filter="url(#${past ? 'gi' : 'ti'})"/>`;
  } else {
    inner = `<circle cx="${w / 2}" cy="${h / 2}" r="${R}" fill="${past ? '#9AA3AD' : color}"/>`;
  }
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  const img = new Image(); img.decoding = 'sync'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); await img.decode();
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
  return { blob: await new Promise((r) => c.toBlob(r, 'image/png')), w, h, iconH };   // iconH=아이콘 기준 높이(px) — AE 스케일 계산용
}
// AE가 안 켜져 있고 설치 버전이 여러 개일 때 — 버전 선택창(토스 모달). 고른 exe 경로(또는 null=취소) 반환.
function pickAeVersion(versions) {
  return new Promise((resolve) => {
    let done = false;
    const rows = versions.map((v, i) => `<button class="aeVerBtn" data-i="${i}" style="display:block;width:100%;box-sizing:border-box;text-align:left;margin:6px 0;padding:10px 14px;border:1px solid var(--outline-var,#d1d5db);border-radius:12px;background:var(--cgs-card,#fff);color:var(--on-surface,#111);font-size:13.5px;font-weight:700;cursor:pointer"></button>`).join('');
    const m = tossModal({
      title: 'After Effects 버전 선택',
      sub: '켜져 있는 AE가 없어요 — 어느 버전으로 열까요?',
      bodyHTML: '<p style="margin:0 0 6px;font-size:12.5px;line-height:1.5;color:var(--on-surface-var,#667)">설치된 AE가 여러 개입니다. 하나를 고르면 그 버전으로 리깅을 엽니다. (AE를 미리 켜두면 다음부턴 그 버전으로 바로 갑니다.)</p>' + rows,
      onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    m.body.querySelectorAll('.aeVerBtn').forEach((b) => {
      b.textContent = versions[+b.dataset.i].name || versions[+b.dataset.i].path;   // textContent = 주입 안전
      b.onmouseenter = () => { b.style.background = 'color-mix(in srgb, var(--primary,#5B8CFF) 12%, var(--cgs-card,#fff))'; };
      b.onmouseleave = () => { b.style.background = 'var(--cgs-card,#fff)'; };
      b.onclick = () => { done = true; const v = versions[+b.dataset.i]; m.close(); resolve((v && v.path) || null); };
    });
  });
}
// ===== 20261008 헬퍼 확장 — 타임라인에서 고친 것이 그대로 AE로 =====
// 앱 곡선 cubic-bezier(x1,0,x2,1)(easeOut·easeCam·easeVf) = AE 키 영향값(속도 0) 나감 x1·100 %, 들어옴 (1−x2)·100 % — 같은 곡선(근사 아님).
const aeEaseOf = (b) => [+(b[0] * 100).toFixed(4), +((1 - b[2]) * 100).toFixed(4)];
// 카메라 스펙 — 위치 키는 pt(작업 뷰 화면 좌표 → AE 좌표), 확대는 작업 뷰 배율 대비, 방향(rz)은 프레임 가운데 기준 2D 회전.
// 기울기(rx·ry)는 AE에 안 들어간다(타임라인 카메라 행 'AE 차이'). 회전하면 빈 모서리를 앱 추출처럼 CAM_VOID_COL로 메운다(노말 VF 제외).
function aeCamSpec(pt, m0) {
  const ks = camKeys().slice().sort((a, b) => a.t - b.t);
  if (!ks.length) return null;
  const [W, H] = RES[S.res].size;
  const a = pt(+m0.x, +m0.y);
  const o = { anchor: [a.x, a.y], sBaked: +m0.s || 1, keys: ks.map((k) => { const p = pt(+k.x, +k.y); return { t: +k.t, x: p.x, y: p.y, s: +k.s, rz: +k.rz || 0 }; }), ease: aeEaseOf(EASE_BEZIER), pivot: [W / 2, H / 2] };
  if (ks.some((k) => Math.abs(+k.rz || 0) > 0.05) && S.res !== '1920x1080-vf') o.voidCol = CAM_VOID_COL;
  return o;
}
// 카메라 블리드 — 키마다 프레임 네 모서리를 카메라 뷰 → 지도 → 작업 뷰로 되돌린 범위(SVG 1920×1080 바깥 좌표). 키 사이는 위치·배율이
// 같은 e로 보간되는 일차분수라 끝점 범위가 전부를 덮는다. 회전 키가 있으면 프레임 외접원. 각 변 최대 프레임 1배(넘으면 clipped).
// 노말 VF는 패널 축소(L_vfScale) 안쪽 좌표에서 계산해 바깥 좌표로. 프레임 안만 보면 box = null(블리드 없음).
function aeBleedBox(m0, ks) {
  ks = ks || camKeys();
  if (!ks.length) return null;
  const vf = S.res === '1920x1080-vf' && _vfPanelRect, vk = vf ? vfScaleValue() / 100 : 1, vax = vf ? _vfPanelRect.x + _vfPanelRect.w : 0, vay = vf ? _vfPanelRect.y : 0;
  const inv = (x, y) => (vf ? { x: vax + (x - vax) / vk, y: vay + (y - vay) / vk } : { x, y });
  const rot = ks.some((k) => Math.abs(+k.rz || 0) > 0.05), R = Math.hypot(960, 540);
  const oc = rot ? [[960 - R, 540 - R], [960 + R, 540 - R], [960 - R, 540 + R], [960 + R, 540 + R]] : [[0, 0], [1920, 0], [0, 1080], [1920, 1080]];
  let x0 = 0, y0 = 0, x1 = 1920, y1 = 1080;
  for (const k of ks) {
    const s = +k.s || 1;
    for (const [ox, oy] of oc) {
      const c = inv(ox, oy), q = vfScaledPoint(+m0.x + (+m0.s || 1) * (c.x - (+k.x || 0)) / s, +m0.y + (+m0.s || 1) * (c.y - (+k.y || 0)) / s);
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
  }
  const bx0 = Math.max(-1920, Math.floor(x0)), by0 = Math.max(-1080, Math.floor(y0)), bx1 = Math.min(3840, Math.ceil(x1)), by1 = Math.min(2160, Math.ceil(y1));
  const clipped = x0 < -1920 - 0.5 || y0 < -1080 - 0.5 || x1 > 3840 + 0.5 || y1 > 2160 + 0.5;
  if (bx0 >= 0 && by0 >= 0 && bx1 <= 1920 && by1 <= 1080) return { box: null, place: null, clipped };
  const { kx, ky } = aeOutK(), box = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
  return { box, place: { x: box.x * kx, y: box.y * ky, k: 1 }, clipped };
}
// 인셋에 무엇이 있나(카메라 때 고정 레이어를 따로 만들지) — 칠 색·존 id·브러쉬 색·경계선
function aeInsetInfo() {
  const F = fills(), out = { any: false, fills: new Set(), ids: new Set(), brush: new Set(), lines: false };
  const gi = document.getElementById('gInsets'); if (!gi) return out;
  for (const z of gi.querySelectorAll('.zone')) { out.any = true; out.ids.add(z.dataset.id); const c = F[z.dataset.id]; if (c) out.fills.add(c.toUpperCase()); }
  for (const im of gi.querySelectorAll('image.brushLayer[data-col]')) out.brush.add((im.getAttribute('data-col') || '').toUpperCase());
  out.lines = !!gi.querySelector('.zoneLine, .sidoLine');
  return out;
}
// 지시선 라벨 스펙(출력 px) — 앱 renderLeaderLabel: 선 = typhoonLeaderGeom(앵커, 올라오는 박스), 흰 선 2.4·불투명 0.92, 앵커 원 r6·흰 테 1.6
function aeLeaderSpec(lg) {
  if (!lg || !(lg.w > 0) || !(lg.h > 0) || !isFinite(lg.ax) || !isFinite(lg.ay)) return null;
  const a = aePt(lg.ax, lg.ay);
  return { ax: a.x, ay: a.y, w: aeSz(lg.w), h: aeSz(lg.h), col: lg.col || '#FFFFFF', sw: aeSz(2.4), op: 0.92, gap: aeSz(16), dot: { r: aeSz(6), fill: lg.fill || '#FFFFFF', stroke: '#FFFFFF', sw: aeSz(1.6) } };
}
// 블라인드 모드의 산 타이밍(앱 renderAnimFrameBody 규칙): 같은 색 칠 트랙이 있으면 그 칠 트랙, 그 색이 지도 칠에 있는데 칠 트랙이 없으면
// 처음부터 보임(null), 아니면 같은 색 산들의 산 트랙(화면은 같은 색 산을 가장 늦은 진행도로 함께 연다 — 가장 늦게 끝나는 막대).
function aeBlindMtnSpan(m, tracks) {
  const U = String(m.col || '').toUpperCase();
  if (!U) return null;
  const span = (tr) => (tr ? [+tr.start || 0, (+tr.start || 0) + (+tr.len || 0)] : null);
  const ft = tracks.find((x) => x.kind === 'fill' && String(x.key || '').toUpperCase() === U);
  if (ft) return span(ft);
  if (Object.values(fills()).some((c) => String(c || '').toUpperCase() === U)) return null;
  let best = null;
  for (const o of (S.mtns || [])) {
    if (o.off || String(o.col || '').toUpperCase() !== U) continue;
    const sp = span(tracks.find((x) => x.kind === 'mtn' && x.key === o.id));
    if (sp && (!best || sp[1] > best[1] || (sp[1] === best[1] && sp[0] > best[0]))) best = sp;
  }
  return best;
}
// 노말 VF 패널 클립 사각형(출력 px) — 클립이 걸려 있을 때만(applyVfClip: 배경 켬). 카메라로 움직이는 지도를 AE에서 패널 모양으로 자른다.
function aeVfMaskRect() {
  if (S.res !== '1920x1080-vf' || !_vfPanelRect) return null;
  const sl = document.getElementById('L_vfScale'); if (!sl || !sl.getAttribute('clip-path')) return null;
  const r = _vfPanelRect, a = aePt(r.x, r.y), b = aePt(r.x + r.w, r.y + r.h);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}
async function sendToAE() {
  const A = anim();
  let up = false, hv = 0;
  try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; if (up) { const j = await r.json().catch(() => ({})); hv = +((j && j.ver) || 0); } } catch (e) { up = false; }
  if (!up) { wnsHelperOffNotice(); return; }
  _helperVer = hv;   // 타임라인 'AE 차이'가 이 헬퍼 기준으로
  // 이미지 크기·자리가 바뀌는 블리드(place)는 새 헬퍼(20261008+)만 안다 — 옛 헬퍼는 가운데·100%로 얹어 어긋나므로 보내지 않는다.
  // 그 밖의 새 필드는 늘 보낸다(옛 헬퍼는 무시하고 지금처럼 = 가장 가까운 결과).
  const aeExt = hv >= AE_EXT_VER;
  const F = fills();
  const warningDefs = aeWarningFillDefs();
  const hasBrush = (typeof brushStrokes === 'function') && brushStrokes().some((s) => !s.erase);   // 브러쉬로만 칠한 경우도 AE 허용(존 클릭 색이 없어도)
  if (!isTyphoon() && !Object.keys(F).length && !warningDefs.length && !hasBrush) { status(wrnNoneLeftMapEmpty() ? wrnNoneEmptyText('보내세요') : '칠한 색이 없습니다 — 먼저 색칠하세요', true); return; }
  const btn = $('#aeSend'); if (btn) btn.disabled = true;
  // 미리보기(재생헤드 프레임) 중이면 평소 화면으로 — 레이어는 최종 모습·작업 뷰로 굽는다. 끝나면 다시 그 시각 프레임으로.
  const wasPreview = animT != null;
  if (wasPreview || animPlaying) { animStop(); animOff(); }
  // 작업 중 효과(js/busy-fx.js) — 제목줄 'AE로 보내기'에 색 띠 흐름 + 전송 진행 막대(exportProgress → fxProgress).
  // 성공하면 'AE 여는 중…'(재전송 잠금 9초) 동안도 흐름을 두고, 잠금이 풀릴 때 끄고 도착 빛. 실패·취소는 finally에서 바로 끈다.
  fxBusy(btn, true, { disable: false });
  let cooldown = false;
  try {
    const [W, H] = RES[S.res].size;
    // 스펙 좌표는 SVG 뷰박스(1920×1080) 기준이지만 배경/컴포지션은 출력해상도(W×H) → 좌표·크기를 출력해상도로(노말·VF=1, 터치≈1.124)
    const kx = W / 1920, ky = H / 1080;
    // 태풍·비교 리그 좌표(소수 1자리)·크기 — 노말 VF면 바탕 PNG처럼 패널 축소 공간(L_vfScale, aePt와 같은 변환)으로.
    // 예전엔 축소가 빠져 VF 축소가 100%가 아니면 리그(지점·라벨·카메라)가 바탕과 어긋났다(F7). 노말·터치는 그대로.
    const vfOn = S.res === '1920x1080-vf' && !!_vfPanelRect, vk = vfOn ? vfScaleValue() / 100 : 1;
    const vax = vfOn ? _vfPanelRect.x + _vfPanelRect.w : 0, vay = vfOn ? _vfPanelRect.y : 0;
    const SX = (v) => +((vax + (v - vax) * vk) * kx).toFixed(1), SY = (v) => +((vay + (v - vay) * vk) * ky).toFixed(1), kk = (kx + ky) / 2 * vk;
    const fps = A.fps || 29.97, f1 = 1 / fps;
    const EZ = aeEaseOf(EASE_BEZIER);   // 칠·브러쉬·산·라벨·지시선 페이드 = 앱 easeOut
    // 화면 = AE: 타임라인 레이어 계획(tlLayerPlan)의 순서·타이밍을 그대로 쓴다. 트랙 있음 → 그 시작·길이로 페이드, 트랙 없음 → 처음부터 보임(화면과 같음).
    // 타임라인을 아예 안 만들었으면(트랙·카메라 키 0) '자동 구성'이 만들 타이밍으로 보낸다(옛 기본 애니와 같은 규칙).
    const auto = (!A.tracks.length && !camKeys().length) ? autoTrackPlan() : null;
    const tracks = auto && auto.tracks.length ? auto.tracks : A.tracks;
    const durBase = auto && auto.tracks.length ? Math.max(+A.dur || 6, +auto.dur || 6) : (+A.dur || 6);
    const plan = tlLayerPlan({ tracks });
    const fadeOf = (L) => { const sp = L.track ? [+L.track.start || 0, (+L.track.start || 0) + (+L.track.len || 0)] : L.implicit; return sp ? { start: +(+sp[0]).toFixed(4), len: +Math.max(0.01, sp[1] - sp[0]).toFixed(4), ease: EZ } : null; };
    // bottom→top 순서로 레이어 구성(계획의 역순). 이미지 레이어는 uploads에 담아 순서대로 업로드, 텍스트 레이어는 파일 없이 스펙만.
    const uploads = [], specLayers = [];
    const addImg = (name, blob, fade, extra) => { const fi = uploads.length; uploads.push(blob); specLayers.push(Object.assign({ file: 'f_' + String(fi).padStart(5, '0') + '.png', name, fade: fade || null }, extra || {})); };
    const addFile = (blob) => { const fi = uploads.length; uploads.push(blob); return 'f_' + String(fi).padStart(5, '0') + '.png'; };   // 레이어 없이 파일만 업로드(리깅에서 표현식으로 참조)
    const addText = (name, t) => {
      const p = aePt(t.x, t.y);   // VF 축소 + 출력 해상도 배율
      specLayers.push({ text: { content: aeArrow(t.txt || ''), x: p.x, y: p.y, size: aeSz(t.size), col: t.col, align: t.align || 'start', track: aeSz(t.track || 0), weight: t.w || 400 }, name });
    };
    const addTop = async (L) => {   // 맨 위 정적(제목·범례) — 일반·태풍 공용
      if (L.sub.startsWith('title:')) { const t = S.texts.find((x) => x.id === L.key); if (t) addText('제목_' + (t.txt || '').slice(0, 8), t); }   // 제목=편집형 텍스트, 맨 위·정적
      else if (L.sub === 'legend') {
        const legendComp = aeLegendCompData();
        if (!legendComp) { if (isTyphoon()) return; throw new Error('범례 레이어 측정 실패 — 화면을 새로고침한 뒤 다시 보내 주세요'); }
        specLayers.push({ legendComp, name: '범례' });
      }
    };
    // 카메라(위치·확대·방향 키) — 태풍·비교 리그는 리그 좌표(SX/SY), 일반 지도는 aePt(둘 다 VF 축소 포함). 블리드는 새 헬퍼만.
    const camKs = camKeys();
    const rigPt = (x, y) => ({ x: SX(x), y: SY(y) });
    const rigBleed = () => (aeExt && camKs.length ? aeBleedBox(S.map) : null);
    let gCam = null;   // 일반 지도 카메라(spec.camera)
    // 노말 VF 패널 마스크(spec.vfMask) — 카메라로 움직이는 지도는 패널 클립 없이(블리드) 굽고, AE에선 진입 레이어의 마스크가 패널 모양으로 자른다(새 헬퍼)
    const gMask = camKs.length && aeExt ? aeVfMaskRect() : null;
    const bleedOpt = (bl) => (bl && bl.box ? { box: bl.box, noVfClip: !!gMask } : (gMask ? { noVfClip: true } : null));
    if (isTyphoon()) {
      const _tt = tracks.find((x) => x.kind === 'typhoon');
      if (isTyphoonCompare()) {
        // 비교 지도: 리깅 — 예보선별 (색 선 + 작은 틴트 아이콘 + 이름표 + 수치라벨). 널 옮기면 선·아이콘 따라옴.
        const T = S.typhoon;
        const bl = rigBleed();
        const bg = addFile(await svgBlob((c) => { for (const id of ['#L_typhoon', '#L_typhoonLabels', '#L_title', '#L_legend', '#L_refImg']) c.querySelector(id)?.remove(); }, false, bleedOpt(bl)));
        const ls = (typhoonStyleDefaults().labelStyle) || {};
        // 예보마다 진행 곡선(화면 renderAnimFrameBody): 비교 막대 → 없으면 메인 경로 막대 → 둘 다 없으면 처음부터 전부(정적)
        const cmpProg = (c) => { const tr = tracks.find((x) => x.kind === 'typcmp' && x.key === c.id); const sp = tr ? [+tr.start, +tr.start + Math.max(0.001, +tr.len)] : _tt ? [+_tt.ps, +_tt.ps + Math.max(0.001, +_tt.pe - +_tt.ps)] : [0, 0]; return { start: +sp[0].toFixed(4), end: +sp[1].toFixed(4), curve: 'ioc' }; };
        const typhoons = [];
        for (const c of (T.compare || [])) {
          if (!c.show) continue;
          const cpts = compareVisiblePoints(c);
          if (cpts.length < 1) continue;
          const sp = compareScreenPts(cpts, null).filter((p) => !p.head);
          if (sp.length < 1) continue;
          const ic = await aeIconBlob(c.color, false, false, !!c.dotIcon, false, true);   // 그 예보 색 아이콘(작은 원 옵션이면 원, compareIconEl 기준)
          const iconFile = addFile(ic.blob);
          const idxSet = compareIconIdxSet(c, cpts);   // 화면과 동일한 아이콘 배치(등간격/실제날짜별/하루하나)
          const iconAt = [];
          if (c.showIcons !== 0) sp.forEach((p) => { if (idxSet.has(Math.round(p.idx))) iconAt.push(p.idx); });   // noIcon은 안 본다(화면 drawCompareTracks·앵커 원 _iconSet과 같게)
          const idxXY = {}; sp.forEach((p) => { idxXY[p.idx] = p; });
          // 이름표 — 화면은 늘 보인다(always)
          let nameLabel = null;
          if (c.showName !== 0) {
            let pos = c.labelPos;
            if (!pos) { const last = sp[sp.length - 1]; const [x, y] = camProjectXY(last.x, last.y); pos = { x: x + 13, y: y - 4 }; }
            nameLabel = { txt: aeArrow(c.name || ''), x: SX(+pos.x), y: SY(+pos.y), size: (c.labelSize || 34) * kk, weight: (c.labelWeight || 800), col: (c.labelCol || c.color), always: 1 };   // 출력 해상도 배율
            // 옮기지 않은 이름표 — 화면은 마지막 지점의 지금 화면 자리 + (13, −4)(카메라를 따라감) → 새 헬퍼가 그 지점 널의 toComp로(출력 px 오프셋, 노말 VF 축소 포함)
            if (!c.labelPos) nameLabel.follow = [+(13 * vk * kx).toFixed(4), +(-4 * vk * ky).toFixed(4)];
          }
          // 수치라벨(리치 박스)
          const labels = [];
          const vmap = compareVisibleIdxMap(c);   // 원본 지점 idx → 표시 지점 idx(화면과 동일)
          for (const lb of (c.labels || [])) {
            if (lb.off) continue;
            const vk = vmap[lb.idx]; if (vk == null) continue;
            const pt = idxXY[vk]; if (!pt) continue;
            const txt = aeArrow((lb.txt != null && lb.txt !== '') ? lb.txt : ((cpts[vk] && cpts[vk].label) || ''));
            const size = c.numSize || ls.size || 40;
            const bxv = (lb.x != null ? lb.x : Math.round(pt.x + 150)), byv = (lb.y != null ? lb.y : Math.round(pt.y - 92));
            const est = Math.max(120, ((String(txt).length) || 4) * size * 0.62 + 56);   // 추정(화면에서 아직 안 그려져 실측이 없을 때만 폴백)
            // 좌표=kx/ky, 크기=kk(출력 해상도), 글자·선·모서리=화면 fillLabelBox처럼 labK 배율. track은 비율값이라 그대로.
            labels.push({ idx: vk, px: SX(pt.x), py: SY(pt.y), txt, bx: SX(bxv), by: SY(byv), bw: (lb._w || est) * kk, bh: (lb._h || (size + 34)) * kk, size: Math.round(size * labK() * kk), track: Math.round(((ls.track == null ? -1 : ls.track) / (c.numSize || ls.size || 40)) * 1000), weight: ls.w || 600, col: (c.numCol || ls.txtCol || '#FFFFFF'), fill: c.color, fillOp: (ls.fillOp == null ? 1 : ls.fillOp), stroke: mixHex(c.color, '#FFFFFF', 0.42), strokeW: (ls.strokeW || 0) * labK() * kk, radius: (ls.radius || 14) * labK() * kk });
          }
          typhoons.push({ color: c.color, lineW: (c.lineW || 2.2) * kk, iconFile, iconH: ic.h, iconRenderH: ic.iconH, iconScreenH: 15 * (c.iconScale == null ? 1 : c.iconScale) * kk, points: sp.map((p) => ({ x: SX(p.x), y: SY(p.y) })), iconAt, nameLabel, labels,
            prog: cmpProg(c), head: c.showIcons !== 0 ? 1 : 0, headK: 10 / 6 });   // 선두 = 화면 compareIconEl isHead(반지름 10 대 6)
        }
        // 비교 리그 타이밍 = 타임라인 비교 예보 막대(가장 이른 시작 ~ 가장 늦은 끝). 트랙 없는 예보는 메인 경로 막대(implicit), 그것도 없으면 처음부터 보임 — 화면과 같음.
        // (옛 헬퍼용 — 새 헬퍼는 예보마다 prog로 화면과 같은 곡선·타이밍)
        const cs = plan.filter((L) => L.kind === 'typcmp' && !L.dim && !L.gone).map((L) => (L.track ? [+L.track.start, +L.track.start + +L.track.len] : L.implicit)).filter(Boolean);
        // 수치라벨: 화면은 선이 그 지점에 닿는 순간 완성(진행도 창 10~16%) — 옛 헬퍼는 닿은 뒤 labelLen 동안 나오므로 경로의 20%(0.2~1초)로 짧게 해 화면에 가깝게.
        const cA = cs.length ? Math.min(...cs.map((s) => s[0])) : 0, cP = cs.length ? Math.max(f1, Math.max(...cs.map((s) => s[1])) - cA) : f1;
        const reveal = cs.length ? { start: cA, path: cP, labelLen: +Math.min(1, Math.max(0.2, cP * 0.2)).toFixed(4) } : { start: 0, path: f1, labelLen: f1 };
        const crig = { bg, reveal, typhoons, labelCurve: 1, leaderGap: +(16 * kk).toFixed(4) };
        const cam = aeCamSpec(rigPt, S.map);
        if (cam) crig.camera = cam;
        if (bl && bl.place) crig.bgPlace = bl.place;
        specLayers.push({ compareRig: crig, name: '태풍 비교 리깅' });
      } else {
        // 단일 태풍: 리깅 — 지점 널(수동 이동) + 표현식 경로선·반경(널 따라 움직임) + 아이콘(부모=널) + 리빌 키프레임 + 편집 라벨.
        const T = S.typhoon, pts = curTyphoonPoints(), nowIdx = typhoonNowIdx(pts);
        // 리깅 좌표는 위의 kx/ky/kk(출력해상도 배율)로 스케일한다(SX/SY) — 여기서 다시 곱하지 않는다.
        const lineMode = T.trackMode === 'line';   // 라인 모드: 화면 drawTyphoonTrack처럼 현재까지 단색선 + 선두 아이콘만
        let sp = typhoonScreenPts(pts).filter((p) => !p.head && typhoonIdxInRange(pts, p.idx));   // '표시 날짜 범위'만 내보냄
        if (lineMode) sp = sp.filter((p) => p.idx <= nowIdx);   // 현재 이후 예상경로 제외(화면과 동일)
        const iconCol = T.iconCol || '#E5231E';
        const trackW = Math.max(1, +T.lineWidth || 9.5);   // 화면 경로선 굵기(라인=단색선, 일반=현재~예상 점선)
        // 지명표시(원+이름표)는 정적이라 배경에 그대로 구워 넣는다 — 태풍 트랙/라벨만 제거(리깅이 재구성), place 요소는 보존.
        const bl = rigBleed();
        const bg = addFile(await svgBlob((c) => {
          for (const id of ['#L_title', '#L_legend', '#L_refImg']) c.querySelector(id)?.remove();
          for (const id of ['#L_typhoon', '#L_typhoonLabels']) { const ly = c.querySelector(id); if (ly) [...ly.children].forEach((ch) => { if (!ch.hasAttribute('data-place-dot') && !ch.hasAttribute('data-place-label') && !ch.hasAttribute('data-place-leader')) ch.remove(); }); }
        }, false, bleedOpt(bl)));
        const icC = await aeIconBlob(iconCol, false, false), icG = await aeIconBlob(iconCol, true, false);
        const icTC = await aeIconBlob(iconCol, false, true), icTG = await aeIconBlob(iconCol, true, true);
        const icExC = await aeIconBlob(iconCol, false, false, false, true), icExG = await aeIconBlob(iconCol, true, false, false, true);   // 온대저압부('저')
        const iconColFile = addFile(icC.blob), iconGrayFile = addFile(icG.blob);
        const iconTdColFile = addFile(icTC.blob), iconTdGrayFile = addFile(icTG.blob);
        const iconExColFile = addFile(icExC.blob), iconExGrayFile = addFile(icExG.blob);
        // 움직이는 선두 = 화면은 늘 컬러 일러스트(typhoonIconEl forceImage) — 아이콘 종류가 '작은 원'이면 일러스트를 따로 굽는다
        const headFile = (T.iconMode || 'image') === 'dot' ? addFile((await aeIconBlob(iconCol, false, false, false, false, false, true)).blob) : null;
        const bands = {};   // 라인 모드는 반경 없음(빈 객체)
        if (!lineMode) for (const k of ['r70', 'r15', 'r25']) { const st = Object.assign({}, TYPHOON_BAND_DEF[k], (T.bands && T.bands[k]) || {}); if (!st.off) bands[k] = { fill: st.fill, fillOp: st.fillOp, stroke: st.stroke, strokeW: (st.strokeW || 0) * kk, dash: st.dash ? 1 : 0 }; }   // 외곽선 굵기도 출력 배율(헬퍼 점선 sw×4/×3.5도 같이 맞음)
        // ws 없으면 99(화면 판정과 동일), noIcon=그 지점 아이콘만 생략, 라인 모드 선두=항상 컬러 아이콘(past·noIcon 무시)
        const points = sp.map((p, j) => {
          const tip = lineMode && j === sp.length - 1;
          return { x: SX(p.x), y: SY(p.y), r15: Math.round((p.r15 || 0) * kk), r25: Math.round((p.r25 || 0) * kk), r70: Math.round((p.r70 || 0) * kk), past: tip ? false : p.idx < nowIdx, idx: p.idx, ws: (pts[p.idx] && pts[p.idx].ws) || 99, ex: !!(pts[p.idx] && pts[p.idx].ex), noIcon: tip ? false : !!p.noIcon };
        });
        // 타임라인의 태풍 트랙에서 경로·라벨 애니 타이밍을 가져온다. 트랙이 없으면 화면처럼 처음부터 다 보이게(1프레임).
        if (_tt) ensureTyphoonKeys(_tt);
        const revPathStart = _tt && _tt.ps != null ? +_tt.ps : 0;
        const revPathLen = _tt && _tt.pe != null ? Math.max(f1, +_tt.pe - +_tt.ps) : f1;   // 경로 막대 길이 그대로(최소 1프레임)
        const _lab = (_tt && _tt.lab) || {};
        const idxXY = {}; sp.forEach((p) => { idxXY[p.idx] = p; });
        const labels = [];
        // 라인 모드는 경로 라벨 숨김(화면과 동일) → labels=[]
        if (!lineMode) for (const b of labelList()) { if (b.off) continue; const p = idxXY[b.idx]; if (!p) continue; const e = _lab[b.id]; labels.push({ idx: b.idx, px: SX(p.x), py: SY(p.y), txt: aeArrow(b.txt || (pts[b.idx] && pts[b.idx].label) || ''), title: aeArrow((b.title || '')), bx: SX(b.x), by: SY(b.y), bw: (b._w || 120) * kk, bh: (b._h || 60) * kk, size: Math.round((b.size || 40) * labK() * kk), track: Math.round(((b.track == null ? -1 : b.track) / (b.size || 40)) * 1000), weight: b.w || 600, col: b.txtCol || '#FFFFFF', fill: b.fill || '#0C295F', fillOp: (b.fillOp == null ? 1 : b.fillOp), stroke: b.stroke || '#3F6BD8', strokeW: (b.strokeW || 0) * labK() * kk, radius: (b.radius || 14) * labK() * kk, revStart: e ? +e.s : (_tt ? null : 0), revLen: e ? Math.max(0.05, +e.e - +e.s) : (_tt ? null : f1) }); }   // 라벨 막대 시작·길이 그대로(화면 renderAnimFrame과 같은 최소 0.05초)
        // 화면상 현재 아이콘 높이(px, 출력해상도 스케일) — AE 스케일 계산용. 라인 모드 선두도 화면에서 typhoonIconEl(…,17,…)이라 같은 값.
        const iconScreenH = 17 * (T.iconScale == null ? 1 : T.iconScale) * 2.5 * kk;
        const lineCol = T.lineColor || iconCol;
        // 진행 곡선(새 헬퍼) — 화면 renderAnimFrameBody: 진행(지점 단위) = easeInOutC((t−ps)/(pe−ps)) × (보낸 지점 수−1). 트랙 없으면 정적(처음부터 전부)
        const prog = _tt ? { start: +(+_tt.ps).toFixed(4), end: +(+_tt.ps + Math.max(0.001, +_tt.pe - +_tt.ps)).toFixed(4), curve: 'ioc' } : { start: 0, end: 0, curve: 'ioc' };
        const rig = { bg, points, nowIdx, iconColFile, iconGrayFile, iconTdColFile, iconTdGrayFile, iconExColFile, iconExGrayFile, iconH: icC.h, iconRenderH: icC.iconH, iconScreenH, bands, reveal: { start: revPathStart, path: revPathLen, labelLen: _tt ? 1.0 : f1 }, labels,
          // 화면 drawTyphoonTrack과 같은 선: 라인=단색선(lineColor·lineWidth) / 일반=지난 회색 실선(pastLineWidth)+현재~예상 흰 점선(lineWidth). 지난 아이콘=현재의 30%.
          trackMode: lineMode ? 'line' : 'full', lineColor: lineCol, lineWidth: +(trackW * kk).toFixed(2), pastLineWidth: +(Math.max(1.5, trackW * 0.55) * kk).toFixed(2), pastIconK: 0.3,
          prog, labelCurve: lineMode ? 0 : 1, leaderGap: +(16 * kk).toFixed(4) };
        if (headFile) rig.headFile = headFile;
        // 카메라(위치·확대·방향 키) — 헬퍼 CAM(·ROT) 널이 지도·지점·반경을 부모로 움직인다. 배경은 작업 뷰로 구웠으니 anchor=작업 뷰, sBaked=작업 배율.
        const cam = aeCamSpec(rigPt, S.map);
        if (cam) rig.camera = cam;
        if (bl && bl.place) rig.bgPlace = bl.place;
        specLayers.push({ typhoonRig: rig, name: '태풍 리깅' });
      }
      for (const L of plan.slice().reverse()) if (L.kind === 'static' && (L.sub === 'legend' || L.sub.startsWith('title:'))) await addTop(L);
    } else {
      // 일반 지도 — 계획의 아래(뒤)→위(앞): 배경 · 칠 · 브러쉬 · 경계선 · 산(바탕) · 산 · 라벨(+지시선) · VF 제목바 · 제목 · 범례
      const labData = aeLabelCompData();
      const labById = new Map(labData.map((d) => [d.id, d]));
      let li = 0;
      // 블라인드(Venetian Blinds) — 칠·특보는 지도 로컬 슬랫(간격 × 작업 배율), 산은 화면 간격. 방향 = 앱 각도. 타이밍·곡선은 fade 그대로.
      const blindsOn = (A.reveal || 'dissolve') === 'blinds';
      const blindsOf = (pitch) => ({ w: +aeSz(pitch).toFixed(4), dir: blindAngle(), ov: +(0.75 / blindPitch()).toFixed(6), two: 0 });
      // 카메라 — 지도 묶음(이동)은 CAM 자식(cam:1), 고정 부분(배경 그림·인셋·자유 산)은 회전만(cam:2 — 회전 키가 있을 때), 지도에 붙은 산은 자리만 따라감(camPt)
      const cam = aeCamSpec(aePt, S.map);
      const rotOn = !!(cam && cam.keys.some((k) => Math.abs(k.rz) > 0.05));
      const ins = cam ? aeInsetInfo() : null;
      const bl = cam && aeExt ? aeBleedBox(S.map) : null;   // 블리드는 새 헬퍼만
      const fixX = rotOn ? { cam: 2 } : null;
      const mvOpt = () => bleedOpt(bl);
      const mvX = () => Object.assign({ cam: 1 }, bl && bl.place ? { place: bl.place } : {});
      for (const L of plan.slice().reverse()) {
        if (L.gone || L.kind === 'oldText' || L.kind === 'camera' || L.kind === 'vfEnter') continue;   // VF 진입은 spec.vfEnter, 카메라는 spec.camera
        const fade = fadeOf(L);
        if (L.kind === 'static') {
          if (L.sub === 'bg') {
            if (!cam) addImg('배경·지도', await aeBaseBlob());
            else {
              addImg('배경', await aeBaseBlob('fix0'), null, fixX);
              addImg('배경·지도', await aeBaseBlob('move', mvOpt()), null, mvX());
              if (ins.any) addImg('인셋', await aeBaseBlob('fix1'), null, fixX);
            }
          } else if (L.sub === 'lines') {   // 시도·시군 선 — 색칠 위, 정적(항상 보임)
            if (!cam) addImg('경계선', await aeLinesBlob());
            else { addImg('경계선', await aeLinesBlob('move', mvOpt()), null, mvX()); if (ins.lines) addImg('경계선_인셋', await aeLinesBlob('fix'), null, fixX); }
          } else if (L.sub === 'mtnBase') {   // 바탕색 산 — 항상 보임(정적). 색칠처럼 모양은 처음부터.
            const ms = (S.mtns || []).filter((m) => !m.off);
            if (!cam) addImg('산(바탕)', await aeMtnBlob(true));
            else {
              const free = new Set(ms.filter((m) => !m.anchor).map((m) => m.id));
              if (free.size) addImg('산(바탕)', await aeMtnBlob(true, free), null, fixX);
              for (const m of ms) if (m.anchor) { const p = aePt(m.x, m.y); addImg('산(바탕)_' + String(m.txt || '').slice(0, 8), await aeMtnBlob(true, m.id), null, { camPt: [p.x, p.y] }); }
            }
          } else if (L.sub === 'vfbar') addImg('VF_제목바', await aeVfBarBlob());
          else await addTop(L);
          continue;
        }
        if (L.kind === 'fill') {
          const fd = fade && blindsOn ? Object.assign({}, fade, { blinds: blindsOf(blindPitch() * (+S.map.s || 1)) }) : fade;
          const nm = L.wrnDef ? '특보_' + L.wrnDef.name : '색칠_' + L.key.replace('#', '');
          const mk = (part, opt) => (L.wrnDef ? aeWarningFillBlob(L.wrnDef, part, opt) : aeFillBlob(L.key, part, opt));
          if (!cam) addImg(nm, await mk(), fd);
          else {
            addImg(nm, await mk('move', mvOpt()), fd, mvX());
            if (L.wrnDef ? L.wrnDef.ids.some((id) => ins.ids.has(id)) : ins.fills.has(String(L.key).toUpperCase())) addImg(nm + '_인셋', await mk('fix'), fd, fixX);
          }
          continue;
        }
        if (L.kind === 'brush') {   // 브러쉬 덧칠 — 색별 레이어(색칠 위, 경계선 아래). 블라인드 모드에서도 화면은 불투명 페이드.
          if (!cam) addImg('브러쉬_' + L.key.replace('#', ''), await aeBrushBlob(L.key), fade);
          else { addImg('브러쉬_' + L.key.replace('#', ''), await aeBrushBlob(L.key, 'move', mvOpt()), fade, mvX()); if (ins.brush.has(String(L.key).toUpperCase())) addImg('브러쉬_' + L.key.replace('#', '') + '_인셋', await aeBrushBlob(L.key, 'fix'), fade, fixX); }
          continue;
        }
        if (L.kind === 'mtn') {   // 산마다 레이어 — 그 산 막대 타이밍으로 페이드(블라인드면 같은 색 칠 트랙 규칙)
          const m = (S.mtns || []).find((x) => x.id === L.key);
          let fd = fade;
          if (blindsOn && m) { const sp = aeBlindMtnSpan(m, tracks); fd = sp ? { start: +(+sp[0]).toFixed(4), len: +Math.max(0.01, sp[1] - sp[0]).toFixed(4), ease: EZ, blinds: blindsOf(blindPitch()) } : null; }
          let x = null;
          if (cam && m) { if (m.anchor) { const p = aePt(m.x, m.y); x = { camPt: [p.x, p.y] }; } else x = fixX; }
          addImg('산_' + String(L.name || '').slice(0, 8), await aeMtnBlob(false, L.key), fd, x);
          continue;
        }
        if (L.kind === 'label') {
          // 라벨 = 프리컴프(배경 이미지 + 편집 텍스트). AE에서 라벨 하나가 한 컴프.
          const ld = labById.get(L.key); if (!ld) continue;
          li++;
          // 지시선 라벨: 새 헬퍼는 선·앵커를 셰이프로 만들어 올라오는 박스를 따라가게(labelComp.leader) — 옛 지시선 PNG는 legacy(새 헬퍼는 건너뜀, 옛 헬퍼는 그대로 얹음)
          const lsp = ld.leader ? aeLeaderSpec(ld.lg) : null;
          if (ld.leader) addImg('지시선_' + li, await aeLeaderBlob(ld.id), fade, lsp ? { legacy: 1 } : null);
          const fi = uploads.length; uploads.push(await aeLabelBgBlob(ld));
          const p = aePt(ld.cx, ld.cy);   // 위치·크기 모두 출력 해상도(VF 축소 × 터치 배율)
          const lc = { w: aeSz(ld.w), h: aeSz(ld.h), x: p.x, y: p.y, bg: 'f_' + String(fi).padStart(5, '0') + '.png',
            texts: ld.texts.map((t) => ({ ...t, size: aeSz(t.size), track: aeSz(t.track), cx: aeSz(t.cx), cy: aeSz(t.cy) })) };
          if (lsp) lc.leader = lsp;
          specLayers.push({ labelComp: lc, name: '라벨_' + li, fade: fade ? Object.assign({}, fade, { rise: aeSz(26) }) : null });   // rise=아래서 올라오기(타임라인 동일), 트랙 없으면 처음부터
        }
      }
      gCam = cam;
    }
    // 컴프 길이 — 타임라인 길이 그대로(화면 = AE, MXF와 같은 길이). 길이 밖으로 넘친 내용만 잘리지 않게 그 끝 + 0.6초까지 늘린다.
    let end = 0;
    for (const l of specLayers) {
      if (l.fade) end = Math.max(end, l.fade.start + l.fade.len);
      const tr = l.typhoonRig, cr = l.compareRig;
      if (tr) {
        const rv = tr.reveal;
        end = Math.max(end, rv.start + rv.path);
        for (const lb of tr.labels) end = Math.max(end, lb.revStart != null ? lb.revStart + (lb.revLen != null ? lb.revLen : rv.labelLen) : rv.start + rv.path + rv.labelLen);
        if (tr.camera) for (const k of tr.camera.keys) end = Math.max(end, k.t);
      }
      if (cr) {
        end = Math.max(end, cr.reveal.start + cr.reveal.path + cr.reveal.labelLen);
        for (const ty of (cr.typhoons || [])) if (ty.prog) end = Math.max(end, ty.prog.end);
        if (cr.camera) for (const k of cr.camera.keys) end = Math.max(end, k.t);
      }
    }
    if (gCam) for (const k of gCam.keys) end = Math.max(end, k.t);
    if (S.res === '1920x1080-vf') end = Math.max(end, ANIM_START + ANIM_VF_ENTER_LEN);
    const dur = end > durBase + 1e-4 ? Math.max(durBase, Math.ceil((end + 0.6) * 2) / 2) : durBase;
    const sid = 'ae' + Date.now();
    for (let i = 0; i < uploads.length; i++) {
      const r = await fetch(WNS_HELPER + '/api/frame?sid=' + sid + '&index=' + i + '&ext=png', { method: 'POST', body: uploads[i] });
      if (!r.ok) throw new Error('레이어 전송 실패(' + i + ')');
      exportProgress(i + 1, uploads.length + 1, 'AE 레이어 전송 중');
    }
    const sh = S.shadow || {};
    const spec = {
      sid, comp: { name: 'WeatherCG_' + dateTag(), w: W, h: H, fps, dur },
      vfEnter: (S.res === '1920x1080-vf') ? { start: ANIM_START, len: ANIM_VF_ENTER_LEN, dx: vfEnterDist() * vfScaleValue() / 100, ease: aeEaseOf(EASE_VF) } : null,   // 화면 VF 진입과 같은 길이(1.2초)·곡선(easeVf)
      shadow: { x: sh.x || 0, y: sh.y == null ? 8 : sh.y, blur: sh.blur == null ? 10 : sh.blur, op: sh.op == null ? 45 : sh.op, col: sh.col || '#000814' },
      layers: specLayers,
    };
    if (gCam) spec.camera = gCam;   // 일반 지도 카메라 — 이미지 레이어 cam:1(지도 묶음)의 부모(새 헬퍼)
    if (gMask) spec.vfMask = gMask;   // 노말 VF 패널 마스크 — 카메라로 움직이는 지도는 패널 클립 없이 구웠다
    exportProgress(uploads.length + 1, uploads.length + 1, 'AE 여는 중');
    const postAe = async (s) => { const r = await fetch(WNS_HELPER + '/api/ae', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); return { r, j: await r.json().catch(() => ({})) }; };
    let { r: rr, j: jr } = await postAe(spec);
    if (rr.ok && jr && jr.choose && Array.isArray(jr.versions) && jr.versions.length) {   // 켜진 AE 없음 + 설치 버전 여러 개 → 선택창
      const chosen = await pickAeVersion(jr.versions);
      if (!chosen) { status('AE 보내기 취소', true); return; }
      ({ r: rr, j: jr } = await postAe(Object.assign({}, spec, { aePath: chosen })));
    }
    if (!rr.ok || !jr.ok) throw new Error(jr.error || ('AE 실행 실패 ' + rr.status));
    status('AE로 보냄 — ' + (jr.ae || 'After Effects') + '에서 컴포지션이 열립니다' + (auto && auto.tracks.length ? ' (타임라인 트랙이 없어 자동 구성 타이밍으로 보냈습니다)' : '')); flashDone('AE로 보냄');
    if (jr.fontsOk === false) status('AE로 보냄 — SUITE 폰트를 설치하지 못해 AE에서 기본 폰트로 들어갈 수 있습니다', true);   // 새 헬퍼만 보냄(없으면 옛 헬퍼 → 안내 없음)
    else if (!aeExt) status('AE로 보냄 — 기능 확장팩이 옛 버전이라 일부 움직임이 화면과 조금 다르게 들어갑니다(기능 확장팩을 다시 실행하면 같아집니다)', true);
    { const el = $('#tlInfo'); if (el) el.textContent = 'AE로 보냄 — ' + (jr.ae || 'After Effects') + '에서 열림'; }
    // AE가 켜지는 동안 재전송하면 '프로젝트 닫을까?' 창이 뜬다 → 잠깐 잠가 중복 전송 막기
    cooldown = true;
    // 글자 span(.tbLbl)만 바꾼다 — 버튼 textContent 를 덮으면 채운 아이콘(svg)까지 지워져 안 돌아온다
    if (btn) {
      const lblEl = btn.querySelector('.tbLbl') || btn;
      const lbl = lblEl.textContent; lblEl.textContent = 'AE 여는 중…';
      setTimeout(() => { btn.disabled = false; lblEl.textContent = lbl; fxBusy(btn, false); fxArrive(btn); }, 9000);
    }
  } catch (e) {
    status('AE 보내기 실패: ' + (e.message || e), true);
    { const el = $('#tlInfo'); if (el) el.textContent = 'AE 보내기 실패'; }
  } finally {
    if (btn && !cooldown) btn.disabled = false;
    if (wasPreview && typeof tlRefreshPreview === 'function') tlRefreshPreview();
    if (!cooldown || !btn) fxBusy(btn, false);
  }
}

// 폴더를 물어보고 그 안에 이미지를 만드는 '이미지로 추출'(팝업·저장)은 js/export-dialog.js(renderExport)로 옮겼다.

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

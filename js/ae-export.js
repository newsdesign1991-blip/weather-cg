/* [모듈] js/ae-export.js — After Effects 보내기(레이어 분해 blob·sendToAE), doExport, 추출 선택, download */
'use strict';

// ===== After Effects 자동 임포트(로컬 헬퍼 경유) — 타임라인과 같은 애니메이션 =====
function aeIsLocal() { const h = location.hostname; return h === 'localhost' || h === '127.0.0.1' || location.protocol === 'file:'; }
// AE로 넘길 때만 이모지 화살표(⬆⬇)를 폰트 글리프(↑↓)로 — 웹은 ⬆ 그대로, AE는 Wanted 글리프로.
const aeArrow = (s) => String(s == null ? '' : s).replace(/⬆/g, '↑').replace(/⬇/g, '↓');
// 배경·지도 base — 칠·라벨·브러쉬 빼고 처음부터 보이는 정적 레이어(땅 색은 베이스로 비움)
async function aeBaseBlob() {
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
  });
}
// 브러쉬 덧칠 — 그 색 하나만(투명). 지도 좌표계(L_map) 유지해 브러쉬 위치 그대로.
async function aeBrushBlob(col) {
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
  });
}
// 시도/시군 경계선만(투명) — 색칠 위에 얹어 항상 보이게(정적)
async function aeLinesBlob() {
  return svgBlob((c) => {
    keepLayers(c, ['L_map']);
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());   // 브러쉬는 전용 aeBrushBlob에만 — 경계선 레이어엔 빼기
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', 'none'); z.setAttribute('stroke', 'none'); });
  });
}
// 산 표시만(투명) — 색칠 위에 올림. base=true면 바탕색(정적, 항상 보임), false면 최종색(페이드인). id를 주면 그 산 하나만.
async function aeMtnBlob(base, id) {
  return svgBlob((c) => {
    keepLayers(c, ['L_mtn']);
    c.querySelector('#L_mtn')?.removeAttribute('filter');
    if (id != null) c.querySelectorAll('#L_mtn > g').forEach((g) => { if (g.dataset.id !== String(id)) g.remove(); });   // 산 하나만(산마다 레이어 — 타임라인 막대 타이밍)
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
async function aeWarningFillBlob(def) {
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
  });
}
// 색 하나만 칠한 투명 PNG (그 색만 따로 페이드인시키려고)
async function aeFillBlob(col) {
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
  });
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
    out.push({ id, w, h, cx: b.x, cy: b.y, fill: b.fill, texts, leader: leaderIds.has(id) });
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
async function aeIconBlob(color, past, td, forceDot, ex, cmp) {
  const IC = window.TYPHOON_ICON;
  const R = 90, w = Math.round(R * 3), h = Math.round(R * 3);
  let inner, iconH = R * 2.5;   // iconH=헬퍼 배율 기준 높이(iconScreenH=화면 r×2.5 와 짝)
  const dot = cmp ? !!forceDot : (forceDot || ((S.typhoon || {}).iconMode || 'image') === 'dot');
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
async function sendToAE() {
  const A = anim();
  let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
  if (!up) { wnsHelperOffNotice(); return; }
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
    const kx = W / 1920, ky = H / 1080, kk = (kx + ky) / 2;
    const SX = (v) => +(v * kx).toFixed(1), SY = (v) => +(v * ky).toFixed(1);
    const fps = A.fps || 29.97, f1 = 1 / fps;
    // 화면 = AE: 타임라인 레이어 계획(tlLayerPlan)의 순서·타이밍을 그대로 쓴다. 트랙 있음 → 그 시작·길이로 페이드, 트랙 없음 → 처음부터 보임(화면과 같음).
    // 타임라인을 아예 안 만들었으면(트랙·카메라 키 0) '자동 구성'이 만들 타이밍으로 보낸다(옛 기본 애니와 같은 규칙).
    const auto = (!A.tracks.length && !camKeys().length) ? autoTrackPlan() : null;
    const tracks = auto && auto.tracks.length ? auto.tracks : A.tracks;
    const durBase = auto && auto.tracks.length ? Math.max(+A.dur || 6, +auto.dur || 6) : (+A.dur || 6);
    const plan = tlLayerPlan({ tracks });
    const fadeOf = (L) => { const sp = L.track ? [+L.track.start || 0, (+L.track.start || 0) + (+L.track.len || 0)] : L.implicit; return sp ? { start: +(+sp[0]).toFixed(4), len: +Math.max(0.01, sp[1] - sp[0]).toFixed(4) } : null; };
    // bottom→top 순서로 레이어 구성(계획의 역순). 이미지 레이어는 uploads에 담아 순서대로 업로드, 텍스트 레이어는 파일 없이 스펙만.
    const uploads = [], specLayers = [];
    const addImg = (name, blob, fade) => { const fi = uploads.length; uploads.push(blob); specLayers.push({ file: 'f_' + String(fi).padStart(5, '0') + '.png', name, fade: fade || null }); };
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
    if (isTyphoon()) {
      const _tt = tracks.find((x) => x.kind === 'typhoon');
      if (isTyphoonCompare()) {
        // 비교 지도: 리깅 — 예보선별 (색 선 + 작은 틴트 아이콘 + 이름표 + 수치라벨). 널 옮기면 선·아이콘 따라옴.
        const T = S.typhoon;
        const bg = addFile(await svgBlob((c) => { for (const id of ['#L_typhoon', '#L_typhoonLabels', '#L_title', '#L_legend', '#L_refImg']) c.querySelector(id)?.remove(); }));
        const ls = (typhoonStyleDefaults().labelStyle) || {};
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
          // 이름표
          let nameLabel = null;
          if (c.showName !== 0) {
            let pos = c.labelPos;
            if (!pos) { const last = sp[sp.length - 1]; const [x, y] = camProjectXY(last.x, last.y); pos = { x: x + 13, y: y - 4 }; }
            nameLabel = { txt: aeArrow(c.name || ''), x: SX(+pos.x), y: SY(+pos.y), size: (c.labelSize || 34) * kk, weight: (c.labelWeight || 800), col: (c.labelCol || c.color) };   // 출력 해상도 배율
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
          typhoons.push({ color: c.color, lineW: (c.lineW || 2.2) * kk, iconFile, iconH: ic.h, iconRenderH: ic.iconH, iconScreenH: 15 * (c.iconScale == null ? 1 : c.iconScale) * kk, points: sp.map((p) => ({ x: SX(p.x), y: SY(p.y) })), iconAt, nameLabel, labels });
        }
        // 비교 리그 타이밍 = 타임라인 비교 예보 막대(가장 이른 시작 ~ 가장 늦은 끝). 트랙 없는 예보는 메인 경로 막대(implicit), 그것도 없으면 처음부터 보임 — 화면과 같음.
        const cs = plan.filter((L) => L.kind === 'typcmp' && !L.dim && !L.gone).map((L) => (L.track ? [+L.track.start, +L.track.start + +L.track.len] : L.implicit)).filter(Boolean);
        // 수치라벨: 화면은 선이 그 지점에 닿는 순간 완성(진행도 창 10~16%) — AE(헬퍼)는 닿은 뒤 labelLen 동안 나오므로 경로의 20%(0.2~1초)로 짧게 해 화면에 가깝게.
        const cA = cs.length ? Math.min(...cs.map((s) => s[0])) : 0, cP = cs.length ? Math.max(f1, Math.max(...cs.map((s) => s[1])) - cA) : f1;
        const reveal = cs.length ? { start: cA, path: cP, labelLen: +Math.min(1, Math.max(0.2, cP * 0.2)).toFixed(4) } : { start: 0, path: f1, labelLen: f1 };
        specLayers.push({ compareRig: { bg, reveal, typhoons }, name: '태풍 비교 리깅' });
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
        const bg = addFile(await svgBlob((c) => {
          for (const id of ['#L_title', '#L_legend', '#L_refImg']) c.querySelector(id)?.remove();
          for (const id of ['#L_typhoon', '#L_typhoonLabels']) { const ly = c.querySelector(id); if (ly) [...ly.children].forEach((ch) => { if (!ch.hasAttribute('data-place-dot') && !ch.hasAttribute('data-place-label') && !ch.hasAttribute('data-place-leader')) ch.remove(); }); }
        }));
        const icC = await aeIconBlob(iconCol, false, false), icG = await aeIconBlob(iconCol, true, false);
        const icTC = await aeIconBlob(iconCol, false, true), icTG = await aeIconBlob(iconCol, true, true);
        const icExC = await aeIconBlob(iconCol, false, false, false, true), icExG = await aeIconBlob(iconCol, true, false, false, true);   // 온대저압부('저')
        const iconColFile = addFile(icC.blob), iconGrayFile = addFile(icG.blob);
        const iconTdColFile = addFile(icTC.blob), iconTdGrayFile = addFile(icTG.blob);
        const iconExColFile = addFile(icExC.blob), iconExGrayFile = addFile(icExG.blob);
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
        const rig = { bg, points, nowIdx, iconColFile, iconGrayFile, iconTdColFile, iconTdGrayFile, iconExColFile, iconExGrayFile, iconH: icC.h, iconRenderH: icC.iconH, iconScreenH, bands, reveal: { start: revPathStart, path: revPathLen, labelLen: _tt ? 1.0 : f1 }, labels,
          // 화면 drawTyphoonTrack과 같은 선: 라인=단색선(lineColor·lineWidth) / 일반=지난 회색 실선(pastLineWidth)+현재~예상 흰 점선(lineWidth). 지난 아이콘=현재의 30%.
          trackMode: lineMode ? 'line' : 'full', lineColor: lineCol, lineWidth: +(trackW * kk).toFixed(2), pastLineWidth: +(Math.max(1.5, trackW * 0.55) * kk).toFixed(2), pastIconK: 0.3 };
        // 카메라(위치·확대 키) — 헬퍼 CAM 널이 지도·지점·반경을 부모로 움직인다. 배경은 작업 뷰로 구웠으니 anchor=작업 뷰, sBaked=작업 배율.
        const cks = camKeys().slice().sort((a, b) => a.t - b.t);
        if (cks.length) rig.camera = { anchor: [SX(S.map.x), SY(S.map.y)], sBaked: +S.map.s || 1, keys: cks.map((k) => ({ t: +k.t, x: SX(+k.x), y: SY(+k.y), s: +k.s })) };
        specLayers.push({ typhoonRig: rig, name: '태풍 리깅' });
      }
      for (const L of plan.slice().reverse()) if (L.kind === 'static' && (L.sub === 'legend' || L.sub.startsWith('title:'))) await addTop(L);
    } else {
      // 일반 지도 — 계획의 아래(뒤)→위(앞): 배경 · 칠 · 브러쉬 · 경계선 · 산(바탕) · 산 · 라벨(+지시선) · VF 제목바 · 제목 · 범례
      const labData = aeLabelCompData();
      const labById = new Map(labData.map((d) => [d.id, d]));
      let li = 0;
      for (const L of plan.slice().reverse()) {
        if (L.gone || L.kind === 'oldText' || L.kind === 'camera' || L.kind === 'vfEnter') continue;   // VF 진입은 spec.vfEnter, 카메라는 일반 지도 미지원(행에 'AE 차이')
        const fade = fadeOf(L);
        if (L.kind === 'static') {
          if (L.sub === 'bg') addImg('배경·지도', await aeBaseBlob());
          else if (L.sub === 'lines') addImg('경계선', await aeLinesBlob());   // 시도·시군 선 — 색칠 위, 정적(항상 보임)
          else if (L.sub === 'mtnBase') addImg('산(바탕)', await aeMtnBlob(true));   // 바탕색 산 — 항상 보임(정적). 색칠처럼 모양은 처음부터.
          else if (L.sub === 'vfbar') addImg('VF_제목바', await aeVfBarBlob());
          else await addTop(L);
          continue;
        }
        if (L.kind === 'fill') { if (L.wrnDef) addImg('특보_' + L.wrnDef.name, await aeWarningFillBlob(L.wrnDef), fade); else addImg('색칠_' + L.key.replace('#', ''), await aeFillBlob(L.key), fade); continue; }
        if (L.kind === 'brush') { addImg('브러쉬_' + L.key.replace('#', ''), await aeBrushBlob(L.key), fade); continue; }   // 브러쉬 덧칠 — 색별 레이어(색칠 위, 경계선 아래)
        if (L.kind === 'mtn') { addImg('산_' + String(L.name || '').slice(0, 8), await aeMtnBlob(false, L.key), fade); continue; }   // 산마다 레이어 — 그 산 막대 타이밍으로 페이드
        if (L.kind === 'label') {
          // 라벨 = 프리컴프(배경 이미지 + 편집 텍스트). AE에서 라벨 하나가 한 컴프.
          const ld = labById.get(L.key); if (!ld) continue;
          li++;
          // 지시선 라벨: 선·앵커원을 라벨별 전체화면 투명 레이어로(라벨 바로 아래, 같은 페이드) — 배경에 정적으로 굽히던 문제
          if (ld.leader) addImg('지시선_' + li, await aeLeaderBlob(ld.id), fade);
          const fi = uploads.length; uploads.push(await aeLabelBgBlob(ld));
          const p = aePt(ld.cx, ld.cy);   // 위치·크기 모두 출력 해상도(VF 축소 × 터치 배율)
          specLayers.push({
            labelComp: { w: aeSz(ld.w), h: aeSz(ld.h), x: p.x, y: p.y, bg: 'f_' + String(fi).padStart(5, '0') + '.png',
              texts: ld.texts.map((t) => ({ ...t, size: aeSz(t.size), track: aeSz(t.track), cx: aeSz(t.cx), cy: aeSz(t.cy) })) },
            name: '라벨_' + li, fade: fade ? { start: fade.start, len: fade.len, rise: aeSz(26) } : null,   // rise=아래서 올라오기(타임라인 동일), 트랙 없으면 처음부터
          });
        }
      }
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
      if (cr) end = Math.max(end, cr.reveal.start + cr.reveal.path + cr.reveal.labelLen);
    }
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
      vfEnter: (S.res === '1920x1080-vf') ? { start: ANIM_START, len: ANIM_VF_ENTER_LEN, dx: vfEnterDist() * vfScaleValue() / 100 } : null,   // 화면 VF 진입과 같은 길이(1.2초)
      shadow: { x: sh.x || 0, y: sh.y == null ? 8 : sh.y, blur: sh.blur == null ? 10 : sh.blur, op: sh.op == null ? 45 : sh.op, col: sh.col || '#000814' },
      layers: specLayers,
    };
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

// 폴더를 물어보고 그 안에 이미지를 만든다. 폴더 선택을 못 쓰는 브라우저는 한 장씩 내려받는다.
async function doExport() {
  const keys = EXPORT_TARGETS.filter((t) => exportPick.has(t.key)).map((t) => t.key);
  if (!keys.length) { status('뽑을 항목을 하나 이상 고르세요', true); return; }
  const [W, H] = RES[S.res].size;
  const btn = $('#doExport');
  btn.disabled = true;
  // 작업 중 효과(js/busy-fx.js) — 저장 위치를 고른 뒤 굽는 동안: 추출 메뉴 섹션·뽑기 버튼·제목줄 '이미지로 추출'. 실패해도 finally에서 끈다
  const fx = [fxSec('out'), btn, '#titlebar [data-menu=out]'];
  let fxOn = false, saved = false;
  try {
    // 저장 대상을 '굽기 전에' 준비 — 폴더 권한 요청·저장창은 클릭 직후(사용자 활성화 안)에만 뜬다. 굽기가 길면 활성화가 끝나 다운로드로 새던 문제.
    // 폴더 선택기(directory picker)는 file://·다운로드·바탕화면 같은 '시스템 폴더'를 막는다.
    // → 파일 저장 대화상자(showSaveFilePicker)로 '이름 + 위치'를 고르게 한다(파일 저장은 다운로드 폴더도 허용).
    //   미지원(file:// 일부)이면 그 이름 그대로 다운로드 폴더로 받는다. 여러 장이면 ZIP 한 개로 묶는다.
    const total = keys.reduce((a, k) => a + exportCount(k), 0);
    if (!total) { status('뽑을 게 없습니다 (라벨이 없을 수 있음)', true); return; }
    const single = total === 1;
    const out = single ? await prepareOutput(dateTag(), 'png', 'image/png', '이미지(PNG)') : await prepareOutput(dateTag(), 'zip', 'application/zip', '이미지 묶음(zip)');
    if (!out) { status('저장을 취소했습니다'); return; }
    fxBusy(fx, true); fxOn = true;
    status('굽는 중…', true);
    const files = [];
    for (const k of keys) for (const f of await exportBlobs(k)) files.push({ name: `${f.name}.png`, blob: f.blob });
    if (!files.length) { status('뽑을 게 없습니다 (라벨이 없을 수 있음)', true); return; }

    if (single && files.length === 1) {
      await out.write(await files[0].blob.arrayBuffer());
      $('#exInfo').textContent = `${out.name} 저장됨`; status('저장됨: ' + out.name); flashDone('이미지 저장 완료'); saved = true;
    } else {
      const zf = [];
      for (const f of files) zf.push({ name: f.name, data: await blobBytes(f.blob) });
      await out.write(zipStore(zf));
      $('#exInfo').textContent = `${files.length}장을 ${out.name} 로 저장 (압축 풀어서 사용)`;
      status(`${files.length}장 저장됨 · ${out.name}`); flashDone('이미지 저장 완료'); saved = true;
    }
  } catch (err) {
    status('추출 실패: ' + err.message, true);
  } finally {
    btn.disabled = false;
    if (fxOn) fxBusy(fx, false);
    if (saved) fxArrive(['#titlebar [data-menu=out]', btn, $('#exInfo')]);   // 도착 — 버튼에 한 번 빛 + 저장 안내 줄이 떠오름
  }
}

function buildExportPick() {
  const w = $('#exPick');
  w.textContent = '';
  for (const t of EXPORT_TARGETS) {
    const d = document.createElement('div');
    d.className = 'exItem' + (exportPick.has(t.key) ? ' on' : '');
    d.innerHTML = `<div class="box"></div><div class="lb"></div>`;
    d.querySelector('.lb').innerHTML = `${t.label}<div class="sub">${t.sub}</div>`;
    d.onclick = () => {
      if (exportPick.has(t.key)) exportPick.delete(t.key); else exportPick.add(t.key);
      d.classList.toggle('on', exportPick.has(t.key));
    };
    w.append(d);
  }
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

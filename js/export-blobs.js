/* [모듈] js/export-blobs.js — 추출 핵심: 레이어 목록(ALL_LAYERS)·SVG→PNG blob(svgBlob·keepLayers)·미리보기, 프로젝트 파일 PNG 메타(pngEmbed·pngExtract·readProjectFile), 이미지로 추출 항목·장 목록·굽기(EXPORT_TARGETS·exportPlan·exportBake) */
'use strict';

const ALL_LAYERS = ['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn', 'L_typhoon', 'L_typhoonLabels', 'L_vfBar', 'L_labels', 'L_title', 'L_legend'];

// SVG 한 장을 PNG blob으로. mutate(clone)로 레이어/요소를 손봐서 원하는 그림만 남긴다. (이미지 추출·AE 보내기 공용)
// overlayText=true면 글자를 빼고 래스터한 뒤 캔버스에 SUITE로 직접(크롬 폰트 문제 우회). 남은 레이어 기준으로만 글자를 그린다.
// opt.tilt: 3D 기울기(S.map3d)를 켰으면 영상 프레임(drawExportFrame)처럼 지도 계열 레이어는 기울여 굽고 글자 계열은 평평하게 덮는다
//   (이미지 추출만 켠다 — AE는 기울기를 AE 카메라로 따로 다룬다). opt.opaque: 그때 지도 밖을 바다색으로 채운다(배경이 있는 항목).
async function svgBlob(mutate, overlayText, opt) {
  opt = opt || {};
  const [W, H] = RES[S.res].size;
  brushFinalize();   // 브러쉬 이미지 갱신이 남았으면 먼저 끝낸다
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  clone.setAttribute('preserveAspectRatio', 'none');   // 터치(2158×1214) 위·아래 0.06px 빈칸 방지 — svgToImage와 같은 까닭
  stripExportUi(clone);
  stripAnimState(clone);      // 타임라인 미리보기 잔재(블라인드 베이스 지도·슬랫 클립·VF 진입)가 남았어도 굽지 않게(안전망)
  inlineMapboxTiles(clone);   // 태풍 실시간 타일 — 외부 URL은 래스터에서 안 뜬다
  clone.querySelector('#fontStyle').textContent = await suiteFontCss();
  mutate(clone);
  syncSeoulExport(clone);   // 서울 칠 오버레이·한강을 남은 존 칠에 맞춘다
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  const has = (l) => !!clone.querySelector('#' + l);
  if (opt.tilt && camActive3d()) {
    const mapLs = CAM_MAP_LAYERS.filter(has), ovLs = CAM_OVERLAY_LAYERS.filter(has);
    if (opt.opaque && S.res !== '1920x1080-vf') { cx.fillStyle = CAM_VOID_COL; cx.fillRect(0, 0, W, H); }   // drawExportFrame과 같게
    if (mapLs.length) {   // 지도 계열 — 프레임 밖 여백까지 그려 기울인다(지도 글자는 SVG 그대로, drawExportFrame과 같게)
      const m = clone.cloneNode(true);
      for (const l of CAM_OVERLAY_LAYERS) m.querySelector('#' + l)?.remove();
      m.setAttribute('width', Math.round(W * (1 + 2 * CAM_BLEED))); m.setAttribute('height', Math.round(H * (1 + 2 * CAM_BLEED)));
      m.setAttribute('viewBox', camBleedViewBox());
      warpTilt3D(cx, await svgCloneImage(m), W, H);
    }
    if (ovLs.length) {    // 글자 계열 — 평평하게 위에
      for (const l of CAM_MAP_LAYERS) clone.querySelector('#' + l)?.remove();
      if (overlayText) clone.querySelectorAll('text').forEach((n) => n.remove());
      cx.drawImage(await svgCloneImage(clone), 0, 0, W, H);
      if (overlayText) drawExportTextOverlay(cx, ovLs, W, H);
    }
  } else {
    const remain = overlayText ? ALL_LAYERS.filter(has) : null;   // mutate 후 남은(글자 그릴) 레이어
    if (overlayText) clone.querySelectorAll('text').forEach((n) => n.remove());   // 글자는 캔버스에 직접 그린다
    cx.drawImage(await svgCloneImage(clone), 0, 0, W, H);
    if (overlayText) drawExportTextOverlay(cx, remain, W, H);   // 글자 SUITE로 직접
  }
  return await new Promise((r) => c.toBlob(r, 'image/png'));
}
// 손본 복제본 → 그림. data: URL — blob보다 <img> 안 SVG 렌더(임베드 글꼴)가 안정적
async function svgCloneImage(clone) {
  const img = new Image();
  img.decoding = 'sync';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await img.decode();
  return img;
}
// 타임라인 미리보기(재생 뒤 멈춤·스크럽)가 라이브 SVG에 남긴 것 — 정지 화면엔 없다. 복제본에서만 걷어낸다
// (영상 프레임 svgToImage·stripExportUi에는 넣지 않는다 — 영상은 그 애니 상태를 그려야 한다).
// 칠·라벨의 중간 값(번짐 색·위치)은 여기서 못 되돌리므로 이미지 추출은 굽기 전에 정지 화면으로 돌린다(withStaticFrame).
function stripAnimState(c) {
  c.querySelector('#L_mapBase')?.remove();                                   // 블라인드 밑 베이스 지도(지도 전체+경계선)
  c.querySelectorAll('clipPath[id^="bclip"]').forEach((n) => n.remove());   // 블라인드 슬랫 클립
  c.querySelectorAll('[clip-path^="url(#bclip"]').forEach((n) => n.removeAttribute('clip-path'));
  const w = c.querySelector('#L_vfWrap'); if (w) { w.removeAttribute('transform'); w.removeAttribute('opacity'); }   // VF 진입 슬라이드·페이드(clip-path는 정지 화면에도 있다)
}
const keepLayers = (clone, keep) => { for (const k of ALL_LAYERS) if (!keep.includes(k)) clone.querySelector('#' + k)?.remove(); };

// ── 프로젝트를 '그림(PNG)'으로 저장 — 파일 탐색기에서 지도 미리보기가 뜨고, 그 PNG를 그대로 다시 불러온다.
// 작업 JSON을 PNG의 tEXt 청크(keyword 'wcgwork')에 base64로 숨겨 넣는다. 한 파일로 미리보기+편집 둘 다.
async function previewPng(maxW) {
  const [W, H] = RES[S.res].size;
  const k = Math.min(1, maxW / W), w = Math.round(W * k), h = Math.round(H * k);
  brushFinalize();   // 브러쉬 이미지 갱신이 남았으면 먼저 끝낸다
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  clone.setAttribute('preserveAspectRatio', 'none');   // 가로·세로 배율이 조금 달라도 위·아래 빈 줄 없이
  stripExportUi(clone);
  clone.querySelector('#fontStyle').textContent = await suiteFontCss();
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image(); img.decoding = 'sync'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); await img.decode();   // data: URL — 폰트 확실 적용
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise((r) => c.toBlob(r, 'image/png'));
}
const _b64enc = (s) => { const u = new TextEncoder().encode(s); let b = ''; for (const x of u) b += String.fromCharCode(x); return btoa(b); };
const _b64dec = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new TextDecoder().decode(u); };
function _crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) { crc ^= bytes[i]; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
// PNG의 IEND(항상 마지막 12바이트) 바로 앞에 tEXt 청크를 끼워 넣는다
function pngEmbed(png, keyword, text) {
  const s = keyword + '\0' + text;
  const data = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i) & 0xff;
  const type = [0x74, 0x45, 0x58, 0x74]; // 'tEXt'
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set(type, 4); chunk.set(data, 8);
  const crcIn = new Uint8Array(4 + data.length); crcIn.set(type, 0); crcIn.set(data, 4);
  dv.setUint32(8 + data.length, _crc32(crcIn));
  const iend = png.length - 12;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend), 0); out.set(chunk, iend); out.set(png.subarray(iend), iend + chunk.length);
  return out;
}
// PNG에서 keyword의 tEXt 텍스트를 꺼낸다 (없으면 null)
function pngExtract(bytes, keyword) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const ds = pos + 8;
    if (type === 'tEXt') {
      let z = ds; while (z < ds + len && bytes[z] !== 0) z++;
      let kw = ''; for (let i = ds; i < z; i++) kw += String.fromCharCode(bytes[i]);
      if (kw === keyword) { let t = ''; for (let i = z + 1; i < ds + len; i++) t += String.fromCharCode(bytes[i]); return t; }
    }
    if (type === 'IEND') break;
    pos = ds + len + 4;
  }
  return null;
}
// File에서 프로젝트 데이터를 읽는다 — 새 형식(PNG, 데이터 내장)·옛 형식(JSON) 둘 다.
async function readProjectFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    const b64 = pngExtract(buf, 'wcgwork');
    if (!b64) throw new Error('이 PNG에는 작업 데이터가 없습니다 — 앱의 저장으로 만든 그림이어야 합니다');
    return { data: JSON.parse(_b64dec(b64)), png: true };
  }
  return { data: JSON.parse(new TextDecoder().decode(buf)), png: false };
}

// ===================== 이미지로 추출 — 항목(카드)·장 목록·굽기 =====================
// group: one(한 장으로 — 그대로 방송에 쓰는 완성 그림) · base(바탕·지도 레이어 — 투명, 아래부터 쌓기) · mark(글자·표시 레이어 — 투명, 지도 위에 얹기).
// name = 카드 이름 = 파일 이름(그래서 '(투명)' 같은 꾸밈말은 넣지 않는다 — 투명 여부는 판 부제·sub에). 팝업은 js/export-dialog.js.
const EXPORT_TARGETS = [
  { key: 'full', group: 'one', name: '전체 화면', sub: '배경·지도·글자 전부', def: true },
  { key: 'bgtext', group: 'one', name: '배경 + 글자', sub: '배경 그림에 제목만' },
  { key: 'map', group: 'one', name: '지도만', sub: '선 포함 · 투명' },
  { key: 'bg', group: 'base', name: '배경만', sub: '배경 그림 한 장' },
  { key: 'base', group: 'base', name: '바탕 지도', sub: '베이스색 · 선 없음' },
  { key: 'fills', group: 'base', name: '색칠만', sub: '칠한 구역·브러쉬 · 선 없음' },
  { key: 'lines', group: 'base', name: '경계선만', sub: '구역선·바깥선·시도 경계' },
  { key: 'sidoline', group: 'base', name: '시·도 선만', sub: '시도 경계선만' },
  { key: 'labels', group: 'mark', name: '수치 라벨', sub: '라벨마다 한 장' },
  { key: 'mtn', group: 'mark', name: '산 표시', sub: '산 색·테두리·이름' },
  { key: 'legend', group: 'mark', name: '범례', sub: '색 상자와 글' },
  { key: 'title', group: 'mark', name: '제목', sub: '제목 글자만' },
  { key: 'vfbar', group: 'mark', name: 'VF 제목 바', sub: '제목 뒤 바' },
  { key: 'typhoon', group: 'mark', name: '태풍 경로', sub: '경로·아이콘·반경·라벨·지명' },
];
// 편집용 레이어를 쌓는 순서(아래 → 위) — SVG 레이어 순서(ALL_LAYERS)와 같다. 이 순서로 쌓으면 '전체 화면'과 같아야 한다
// (tests/export-render.test.cjs R1). '시·도 선만'은 '경계선만'에 들어 있어 빠진다. 팝업의 '편집용 레이어 전부'도 이것.
const EXPORT_STACK = ['bg', 'base', 'fills', 'lines', 'mtn', 'typhoon', 'vfbar', 'labels', 'title', 'legend'];

// 파일 이름으로 안전하게 — Windows 금지 문자(\ / : * ? " < > |)·제어 문자를 지우고, 공백 하나로·끝 점/공백 떼기·80자,
// 예약 이름(CON·NUL·COM1 …)엔 '_'. 가운뎃점·+·~·괄호는 Windows에서 쓸 수 있어 그대로 둔다. 비면 '이름없음'.
const WIN_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function safeFileName(s) {
  let n = String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '').replace(/ {2,}/g, ' ').trim();   // 줄바꿈·탭은 빈칸으로 먼저
  n = n.replace(/[. ]+$/, '');
  const cp = [...n];
  if (cp.length > 80) n = cp.slice(0, 80).join('').replace(/[. ]+$/, '');
  if (WIN_RESERVED_NAME.test(n)) n += '_';
  return n || '이름없음';
}
// 라이브 SVG의 레이어에 보이는 게 있는지(범례·제목·VF 제목 바)
function exportLayerInk(id) {
  const n = $('#' + id);
  if (!n || n.style.display === 'none') return false;
  if (id === 'L_title') return [...n.querySelectorAll('text')].some((t) => t.textContent.trim());
  return n.childElementCount > 0;
}
function exportHasFill() {
  if (Object.values(fills()).some(Boolean)) return true;
  if (curStyle().sea && Object.values(S.seaFills || {}).some(Boolean)) return true;
  return !!document.querySelector('#L_map image.brushLayer:not(.brushBox)');   // 브러쉬 덧칠만 있어도
}
// 이 지도·지금 작업에서 이 항목을 뽑을 수 없는 까닭('' = 뽑을 수 있음). 팝업 카드는 흐리게 + 이 글을 한 줄 설명에(D6).
function exportWhyNot(key) {
  const typh = isTyphoon(), noTy = '태풍 지도엔 없어요';
  switch (key) {
    case 'full': return '';
    case 'bgtext': case 'bg': return (!typh && !S.showBg) ? '배경을 꺼 두었어요' : '';
    case 'map': case 'base': return typh ? noTy : '';
    case 'fills': return typh ? noTy : (exportHasFill() ? '' : '칠한 곳이 없어요');
    case 'lines': return typh ? noTy : ((S.sggOn || S.realOn || S.sidoOn) ? '' : '경계선을 모두 꺼 두었어요');
    case 'sidoline': return typh ? noTy : (S.sidoOn ? '' : '시·도 경계를 꺼 두었어요');
    case 'labels': return typh ? '태풍 라벨은 태풍 경로에 들어가요' : (S.labels.some((b) => !b.off) ? '' : '수치 라벨이 없어요');
    case 'mtn': return typh ? noTy : ((S.mtns || []).some((m) => !m.off) ? '' : '산 표시가 없어요');
    case 'legend': return exportLayerInk('L_legend') ? '' : '범례를 꺼 두었어요';
    case 'title': return exportLayerInk('L_title') ? '' : '제목 글자가 없어요';
    case 'vfbar': return S.res !== '1920x1080-vf' ? '노말 VF에서만 있어요' : (exportLayerInk('L_vfBar') ? '' : 'VF 제목 바를 꺼 두었어요');
    case 'typhoon': return typh ? '' : '태풍 지도에서만 있어요';
  }
  return '없는 항목';
}
// 고른 항목 → 뽑을 장 목록 [{ key, name, file, bake() → Promise<Blob> }] — 장수 표시·이름 확정·굽기가 모두 이것 하나를 쓴다
// (장수와 굽기가 어긋나 빈 PNG가 나오던 문제 방지). 순서 = 카드 순서. 이름이 겹치면(라벨끼리) ' (2)'.
function exportPlan(keys) {
  const want = new Set(keys || []), plan = [], used = new Set();
  const uniq = (nm) => { let n = nm, i = 2; while (used.has(n.toLowerCase())) n = `${nm} (${i++})`; used.add(n.toLowerCase()); return n; };   // Windows 이름은 대소문자 구분 없음
  const push = (key, nm, bake, id) => { const name = uniq(nm); plan.push({ key, id, name, file: name + '.png', bake }); };
  for (const t of EXPORT_TARGETS) {
    if (!want.has(t.key) || exportWhyNot(t.key)) continue;
    if (t.key === 'labels') {
      // 라벨마다 한 장 — '수치 라벨 - 강원 80~100'(2단 라벨은 윗줄 지역명을 앞에). 글이 없으면 '수치 라벨 01'
      S.labels.filter((b) => !b.off).forEach((b, i) => {
        const txt = [b.title, b.txt].map((x) => String(x == null ? '' : x).trim()).filter(Boolean).join(' ');
        push('labels', txt ? safeFileName('수치 라벨 - ' + txt) : '수치 라벨 ' + String(i + 1).padStart(2, '0'), () => exportLabelBlob(b.id), b.id);
      });
      continue;
    }
    push(t.key, safeFileName(t.name), () => exportBake(t.key));
  }
  return plan;
}
// 항목별 뽑힐 장수 — exportPlan 그대로
function exportCount(key) { return exportPlan([key]).length; }

// 항목 하나의 [{name, blob}] — exportPlan 위의 얇은 함수(점검 도구·옛 호출 호환)
async function exportBlobs(key) {
  const out = [];
  for (const p of exportPlan([key])) out.push({ name: p.name, blob: await p.bake() });
  return out;
}

// ---- 굽기 도우미 ----
const exZones = (c) => c.querySelectorAll('#gMain .zone, #gInsets .zone');
const exZoneScale = (z) => { const ins = z.getAttribute('data-inset'); return (ins && S.insets[ins] ? S.insets[ins].s : S.map.s) || 1; };
const exRemoveAll = (c, sel) => c.querySelectorAll(sel).forEach((n) => n.remove());
// 자기 색 테두리 1.5px(화면 기준 — 그룹 배율로 나눈다)
function exSelfEdge(p, col, sc) {
  p.setAttribute('stroke', col); p.setAttribute('stroke-opacity', '1');
  p.setAttribute('stroke-width', 1.5 / (sc || 1)); p.setAttribute('stroke-linejoin', 'round');
}
// 칠한 조각 묶음(부모 그룹마다) — 밑에 '자기 색 칠 + 자기 색 테두리 1.5px' 사본을 깔고, 그 위에 원래 조각을 테두리 없이 칠해
// 둘을 한 그룹으로 '그 그룹의 칠한 조각 합집합' 마스크에 넣는다.
//  · 밑판이 맞닿은 경계의 투명 틈(이음새 — 영상 위에 얹으면 희미한 구분선)을 메운다.
//  · 위 칠이 색과 색의 경계 모양을 화면 그대로 지킨다(테두리를 위에 그리면 경계가 0.75px 밀린다).
//  · 마스크를 묶음 전체에 걸어야 해안선·안 칠한 구역과의 경계 안티에일리어싱이 한 번만 먹는다(밑판만 가리면 위 칠과 겹쳐 0.25px 커진다).
//  · clip-path 대신 mask — 크로미움의 클립 가장자리는 칠보다 0.3~0.4px 두꺼워 경계가 칠한 색 쪽으로 번진다(다시 쌓기 비교에서 확인).
//  · 마스크는 조각들을 '한 path'로 이어 붙인다 — 조각마다 따로 그리면 마스크 자체가 맞닿은 경계마다 안티에일리어싱돼 반투명 줄이
//    다시 생긴다(구역은 면이 겹치지 않아 nonzero 합 = 합집합).
// groups: Map(부모 → [{ p: 조각, col, sc: 그룹 배율 }])
function exSeamless(c, groups, pre) {
  const defs = c.querySelector('defs'); let k = 0;
  const big = { x: -200000, y: -200000, width: 400000, height: 400000 };
  for (const [, items] of groups) {
    const id = pre + (k++);
    const cp = el('mask', Object.assign({ id, maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse' }, big));
    cp.append(el('path', { d: items.map((it) => it.p.getAttribute('d') || '').join(' '), fill: '#fff' }));
    defs.append(cp);
    const g = el('g', { mask: `url(#${id})` }), under = el('g', {});
    for (const it of items) {
      const u = el('path', { d: it.p.getAttribute('d') || '', fill: it.col });
      exSelfEdge(u, it.col, it.sc);
      under.append(u);
    }
    items[0].p.before(g);
    g.append(under);
    for (const it of items) g.append(it.p);   // 안 칠한 조각(fill·stroke none)과의 순서는 보이는 것에 영향 없음
  }
}
// 단색 밑판 — 그룹의 모든 구역을 '한 path'로 이어 붙여 칠한다(한 번에 래스터 → 구역 사이 이음새 없음, 바깥으로 안 커짐).
// 위의 구역들은 칠을 투명(fill-opacity 0)으로 두어 테두리선만 그린다 — fill 값은 남겨 서울 한강·칠 오버레이 판정(syncSeoulExport)이 그대로 돈다.
function exSolidUnderlay(c, col) {
  const groups = new Map();
  exZones(c).forEach((z) => { const p = z.parentNode; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(z); z.setAttribute('fill', col); z.setAttribute('fill-opacity', '0'); });
  for (const [p, zs] of groups) p.insertBefore(el('path', { d: zs.map((z) => z.getAttribute('d') || '').join(' '), fill: col, stroke: 'none' }), zs[0]);
}
// '특보 + 해상' 지도: 바다 구역은 육지 아래에 깔려 해안에서 육지 밑으로 들어간다(화면에선 육지에 가려 안 보임).
// 투명 레이어(색칠만·경계선만)에선 그 부분이 육지 위로 비치므로, 바다를 '육지 바깥'으로 마스크한다.
function exSeaUnderLand(c) {
  const st = c.querySelector('#seaT'), mt = c.querySelector('#mapT');
  if (!st || !mt || !curStyle().sea) return;
  const big = { x: -200000, y: -200000, width: 400000, height: 400000 };
  const m = el('mask', Object.assign({ id: 'xSeaLandOut', maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse' }, big));
  m.append(el('rect', Object.assign({ fill: '#fff' }, big)));
  const land = el('g', { transform: mt.getAttribute('transform') || '' });   // L_sea와 L_map은 같은 좌표계 — mapT 변환만 그대로
  land.append(el('path', { d: [...document.querySelectorAll('#gMain > .zone')].map((z) => z.getAttribute('d') || '').join(' '), fill: '#000' }));   // 한 path — 구역 경계에 틈이 없게
  m.append(land);
  c.querySelector('defs').append(m);
  const g = el('g', { mask: 'url(#xSeaLandOut)' });
  st.before(g); g.append(st);
}
// 칠한 것만(투명): 선은 하나도 없다(A — 안 칠한 구역 테두리=시군선이 희미하게 섞이던 문제). 칠한 조각끼리 이음새 없음(I), 바깥 번짐 없음.
// 서울은 한강을 칠한 동 위에만 남긴다(C·D5 — 칠 아래로 강이 비치는 화면 그대로, 안 칠한 동 위 한강은 '바탕 지도'에).
function fillOnlyLayer(c, pick, seaPick) {
  keepLayers(c, ['L_sea', 'L_map']);
  c.querySelector('#L_map')?.removeAttribute('filter');   // 그림자(#shadowF)는 '바탕 지도'에만
  exRemoveAll(c, '.zoneLine, .sidoLine');
  const zg = new Map(), sg = new Map();
  const add = (m, p, col, sc) => { const q = p.parentNode; if (!m.has(q)) m.set(q, []); m.get(q).push({ p, col, sc }); };
  exZones(c).forEach((z) => {
    const col = pick(z);
    z.setAttribute('fill', col || 'none'); z.setAttribute('stroke', 'none');
    if (col) add(zg, z, col, exZoneScale(z));
  });
  exSeamless(c, zg, 'xFillClip');
  c.querySelectorAll('#seaT .sea').forEach((p) => {
    const col = seaPick(p);
    p.setAttribute('fill', col || 'none'); p.setAttribute('fill-opacity', '1'); p.setAttribute('stroke', 'none');
    p.removeAttribute('mask'); p.removeAttribute('opacity');
    if (col) add(sg, p, col, S.map.s);
  });
  exSeamless(c, sg, 'xSeaClip');
  exSeaUnderLand(c);
  const river = c.querySelector('#seoulRiver');
  if (river && isSeoul()) {
    const dongs = [...c.querySelectorAll('#gMain .zone')].filter((z) => (z.getAttribute('fill') || 'none') !== 'none');
    if (!dongs.length) river.remove();
    else {
      // 동과 강은 같은 #mapT 좌표계(#gMain엔 변환 없음). 칠한 동 합집합 '한 path' 마스크(위 exSeamless와 같은 까닭)
      const big = { x: -200000, y: -200000, width: 400000, height: 400000 };
      const cp = el('mask', Object.assign({ id: 'xRiverMask', maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse' }, big));
      cp.append(el('path', { d: dongs.map((z) => z.getAttribute('d') || '').join(' '), fill: '#fff' }));
      c.querySelector('defs').append(cp);
      const g = el('g', { mask: 'url(#xRiverMask)' });
      river.before(g); g.append(river);
    }
  }
}
// 항목 굽기(수치 라벨 빼고 — exportLabelBlob). 모든 항목 공통: 3D 기울기면 영상 프레임처럼(opt.tilt).
async function exportBake(key) {
  const typh = isTyphoon(), T = { tilt: true };
  switch (key) {
    case 'full': {   // 화면 그대로 = 영상 한 프레임과 같은 경로(기울기·태풍 타일·VF 모두 같게). 정적 레이어 캐시는 앞뒤로 비운다
      const [W, H] = RES[S.res].size;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      clearExportCache();
      try { await drawExportFrame(cv.getContext('2d'), W, H); } finally { clearExportCache(); }
      return await new Promise((r) => cv.toBlob(r, 'image/png'));
    }
    case 'bgtext':   // 배경 그림 + 제목. 태풍은 바다·위성·해안선 바탕 지도가 곧 배경
      return svgBlob((c) => { keepLayers(c, ['L_bg', 'L_title']); if (!typh) c.querySelector('#bgMapT')?.remove(); }, true, { tilt: true, opaque: true });
    case 'bg':
      return svgBlob((c) => { keepLayers(c, ['L_bg']); if (!typh) c.querySelector('#bgMapT')?.remove(); }, false, { tilt: true, opaque: true });
    case 'map':   // 지도만(선 포함) — 베이스색 땅·경계선·실루엣·인셋 박스. 칠·브러쉬·산은 뺀다(산 이름이 '산 표시'와 겹치지 않게)
      return svgBlob((c) => {
        keepLayers(c, ['L_bg', 'L_sea', 'L_map', 'L_boxes']);
        c.querySelector('#bgImg')?.remove();   // 배경 그림만 빼고 실루엣(bgMapT)은 남긴다 → 투명 + 북한
        exRemoveAll(c, 'image.brushLayer'); c.querySelector('#gMainSoft')?.remove();
        exSolidUnderlay(c, S.base);
        // 테두리선은 '안 칠한' 모양으로 — 밝은 모드는 칠한 구역 테두리를 칠한 색으로 그려서, 그대로 두면 칠한 색 윤곽이 샌다
        exZones(c).forEach((z) => z.setAttribute('stroke', S.sggOn ? S.stroke : 'none'));
        const sOp = Math.max(S.seaBaseOp / 100, 0.25) * (S.sggOp / 100);
        c.querySelectorAll('#seaT .sea').forEach((p) => { p.setAttribute('fill', 'none'); p.removeAttribute('mask'); p.setAttribute('stroke-opacity', sOp); });
      }, false, T);
    case 'base':   // 바탕 지도 — 베이스색 땅(+안 칠한 바다·실루엣·인셋 박스·서울 한강), 선·칠·브러쉬·산 없음. 지도 그림자는 여기에만
      return svgBlob((c) => {
        keepLayers(c, ['L_bg', 'L_sea', 'L_map', 'L_boxes']);
        c.querySelector('#bgImg')?.remove();
        exRemoveAll(c, 'image.brushLayer, .zoneLine, .sidoLine'); c.querySelector('#gMainSoft')?.remove();
        exSolidUnderlay(c, S.base);
        exZones(c).forEach((z) => z.setAttribute('stroke', 'none'));
        c.querySelectorAll('#seaT .sea').forEach((p) => { p.setAttribute('fill', S.seaBase); p.setAttribute('fill-opacity', S.seaBaseOp / 100); p.setAttribute('stroke', 'none'); });
      }, false, T);
    case 'fills': {
      const F = fills();
      return svgBlob((c) => fillOnlyLayer(c, (z) => F[z.dataset.id], (p) => S.seaFills[p.dataset.id]), false, T);
    }
    case 'lines': {   // 경계선만 — 화면의 선 그대로(구역 테두리=시군선·실제 구역선·시도 경계·바다 경계). 칠·브러쉬·한강·그림자는 뺀다
      const F = fills();
      return svgBlob((c) => {
        keepLayers(c, ['L_sea', 'L_map']);
        c.querySelector('#L_map')?.removeAttribute('filter');
        exRemoveAll(c, 'image.brushLayer'); c.querySelector('#gMainSoft')?.remove();
        // 밝은 모드에서 칠한 구역 테두리는 칠한 색(화면에선 칠에 묻혀 안 보임) — 선 레이어엔 칠한 색 윤곽이 남지 않게 뺀다
        exZones(c).forEach((z) => { z.setAttribute('fill', 'none'); if (S.cgLight && F[z.dataset.id]) z.setAttribute('stroke', 'none'); });
        c.querySelectorAll('#seaT .sea').forEach((p) => p.setAttribute('fill', 'none'));
        exSeaUnderLand(c);
      }, false, T);
    }
    case 'sidoline':   // 시도 경계선(sidoMain·인셋 시도선)만 — 구역 칠·시군선·실제 구역선·실루엣은 없앤다
      return svgBlob((c) => {
        keepLayers(c, ['L_map']);
        c.querySelector('#L_map')?.removeAttribute('filter');
        exRemoveAll(c, 'image.brushLayer'); c.querySelector('#gMainSoft')?.remove();
        exZones(c).forEach((z) => { z.setAttribute('fill', 'none'); z.setAttribute('stroke', 'none'); });
        c.querySelector('#zoneLineMain')?.remove();
        exRemoveAll(c, '[data-zoneline]');
      }, false, T);
    case 'mtn':   // 산 표시 — 칠한 산 색·테두리·이름 그대로
      return svgBlob((c) => { keepLayers(c, ['L_mtn']); c.querySelector('#L_mtn')?.removeAttribute('filter'); }, true, T);
    case 'legend': return svgBlob((c) => keepLayers(c, ['L_legend']), true, T);
    case 'title': return svgBlob((c) => keepLayers(c, ['L_title']), true, T);   // 제목 그림자(필터)도 함께
    case 'vfbar': return svgBlob((c) => keepLayers(c, ['L_vfBar']), false, T);  // aeVfBarBlob과 같다
    case 'typhoon': return svgBlob((c) => keepLayers(c, ['L_typhoon', 'L_typhoonLabels']), true, T);   // 경로·아이콘·반경·라벨·지명
  }
  throw new Error('모르는 항목: ' + key);
}
// 수치 라벨 한 장 — 그 라벨의 박스·글자와, 박스 g 밖 형제인 지시선·앵커도 그 라벨 것만
function exportLabelBlob(id) {
  return svgBlob((c) => {
    keepLayers(c, ['L_labels']);
    c.querySelectorAll('#L_labels > g').forEach((g) => { if (g.dataset.id !== id) g.remove(); });
    c.querySelectorAll('#L_labels > [data-fleader-id], #L_labels > [data-fanchor-id]').forEach((n) => { if ((n.getAttribute('data-fleader-id') || n.getAttribute('data-fanchor-id')) !== id) n.remove(); });
  }, false, { tilt: true });
}

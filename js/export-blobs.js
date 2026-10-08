/* [모듈] js/export-blobs.js — 추출 핵심: 레이어 목록(ALL_LAYERS)·SVG→PNG blob(svgBlob·keepLayers)·미리보기, 프로젝트 파일 PNG 메타(pngEmbed·pngExtract·readProjectFile), 내보내기 대상(exportBlobs) */
'use strict';

const ALL_LAYERS = ['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn', 'L_typhoon', 'L_typhoonLabels', 'L_vfBar', 'L_labels', 'L_title', 'L_legend'];

// SVG 한 장을 PNG blob으로. mutate(clone)로 레이어/요소를 손봐서 원하는 그림만 남긴다.
// overlayText=true면 글자를 빼고 래스터한 뒤 캔버스에 SUITE로 직접(크롬 폰트 문제 우회). 남은 레이어 기준으로만 글자를 그린다.
async function svgBlob(mutate, overlayText) {
  const [W, H] = RES[S.res].size;
  brushFinalize();   // 브러쉬 이미지 갱신이 남았으면 먼저 끝낸다
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  stripExportUi(clone);
  clone.querySelector('#fontStyle').textContent = await suiteFontCss();
  mutate(clone);
  syncSeoulExport(clone);   // 서울 칠 오버레이·한강을 남은 존 칠에 맞춘다
  const remain = overlayText ? ALL_LAYERS.filter((l) => clone.querySelector('#' + l)) : null;   // mutate 후 남은(글자 그릴) 레이어
  if (overlayText) clone.querySelectorAll('text').forEach((n) => n.remove());   // 글자는 캔버스에 직접 그린다
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();   // data: URL — blob보다 <img> 안 SVG 렌더가 안정적
  img.decoding = 'sync';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, W, H);
  if (overlayText) drawExportTextOverlay(cx, remain, W, H);   // 글자 SUITE로 직접
  return await new Promise((r) => c.toBlob(r, 'image/png'));
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

// 뽑을 항목. 각 항목은 [{name, blob}] 여러 장을 낼 수 있다 (수치 라벨은 개수만큼).
const EXPORT_TARGETS = [
  { key: 'full', label: '전체', sub: '배경+지도+글자 전부', def: true },
  { key: 'bgtext', label: '배경 + 글자', sub: '배경 이미지에 제목 텍스트 합쳐서' },
  { key: 'map', label: '지도만 (베이스색만, 투명)', sub: '북한 실루엣 포함' },
  { key: 'sidoline', label: '시·도 선만 (투명)', sub: '시도 경계선만' },
  { key: 'fills', label: '특보·예보 색칠만 (투명)', sub: '칠한 구역만' },
  { key: 'mtn', label: '산 표시만 (투명)', sub: '칠한 산 색·테두리·이름 (색칠 위에 얹기)' },
  { key: 'labels', label: '수치 라벨만 (투명)', sub: '여러 개면 각각 한 장씩' },
  { key: 'typhoon', label: '태풍 라인만 (투명)', sub: '경로·아이콘·반경·라벨·지명 (태풍 지도)' },
];
let exportPick = new Set(['full']);
// 항목별 뽑힐 장수(exportBlobs와 같은 규칙) — 굽기 전에 저장 대상(png 한 장 / zip)을 정하는 데 쓴다.
function exportCount(key) {
  if (key === 'labels') return S.labels.filter((b) => !b.off).length;
  if (key === 'typhoon') return isTyphoon() ? 1 : 0;
  if (key === 'mtn') return (!isTyphoon() && (S.mtns || []).some((m) => !m.off)) ? 1 : 0;   // 태풍 지도는 산 레이어를 숨긴다
  return EXPORT_TARGETS.some((t) => t.key === key) ? 1 : 0;
}

async function exportBlobs(key) {
  const F = fills();
  if (key === 'full') return [{ name: '전체', blob: await svgBlob((c) => keepLayers(c, ALL_LAYERS), true) }];   // 글자 SUITE 직접
  if (key === 'bgtext') return [{ name: '배경글자', blob: await svgBlob((c) => {
    keepLayers(c, ['L_bg', 'L_title']);
    c.querySelector('#bgMapT')?.remove();   // 배경글자엔 지도 요소(북한·일본 실루엣 등) 빼고 배경+제목만
  }, true) }];
  if (key === 'map') return [{ name: '지도', blob: await svgBlob((c) => {
    keepLayers(c, ['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn']);
    c.querySelector('#bgImg')?.remove();   // 배경 이미지만 빼고 실루엣(bgMapT)은 남긴다 -> 투명 + 북한
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());   // 브러쉬 덧칠은 '색칠만'에 나가야 함 — 베이스 지도엔 빼기(L_map 안 L_brush가 keepLayers에 안 걸려 새던 문제)
    c.querySelector('#gMainSoft')?.remove();   // 부드러운 경계 오버레이(칠한 색)는 '베이스만'엔 없어야 한다
    // '지도 베이스만' — 칠한 색·산색을 전부 베이스색으로 되돌린다 (경계선·실루엣은 그대로).
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => z.setAttribute('fill', S.base));
    c.querySelectorAll('#L_mtn path').forEach((p) => p.setAttribute('fill', S.base));
    c.querySelectorAll('#seaT .sea').forEach((p) => { p.setAttribute('fill', 'none'); p.removeAttribute('mask'); });
  }) }];
  if (key === 'sidoline') return [{ name: '시도선', blob: await svgBlob((c) => {
    keepLayers(c, ['L_map']);
    c.querySelector('#L_map')?.removeAttribute('filter');   // 그림자(#shadowF)는 베이스 지도에만 — 선 레이어엔 없앤다
    c.querySelectorAll('image.brushLayer').forEach((im) => im.remove());   // 브러쉬는 '색칠만'에만 — 시도선(투명)엔 빼기
    c.querySelector('#gMainSoft')?.remove();   // 부드러운 경계 오버레이도 제거 — 시도선만 남긴다
    // 시도 경계선(sidoMain)만 남긴다 — 존 색·시군 경계선·실루엣은 전부 없앤다.
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', 'none'); z.setAttribute('stroke', 'none'); });
    c.querySelector('#zoneLineMain')?.remove();
    c.querySelectorAll('[data-zoneline]').forEach((n) => n.remove());
  }) }];
  if (key === 'fills') return [{ name: '색칠', blob: await svgBlob((c) => {
    keepLayers(c, ['L_sea', 'L_map']);
    c.querySelector('#L_map')?.removeAttribute('filter');   // 그림자(#shadowF)는 베이스 지도에만 — 색칠 레이어엔 없앤다
    // 칠한 구역만 남긴다 — 안 칠한 구역·경계선(본토+인셋 시도선)·바다 기본농도는 전부 없앤다
    c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => {
      const col = F[z.dataset.id];
      if (col) { z.setAttribute('fill', col); z.setAttribute('stroke', 'none'); }
      else z.setAttribute('fill', 'none');
    });
    c.querySelectorAll('#seaT .sea').forEach((p) => {
      const col = S.seaFills[p.dataset.id];
      p.setAttribute('fill', col || 'none');
      p.setAttribute('stroke', 'none');
      p.removeAttribute('mask'); p.removeAttribute('opacity');
    });
  }) }];
  if (key === 'mtn') {   // 산 표시만 — 칠한 산 색 그대로(지도만=베이스색, 색칠만=산 없음이라 분리 추출에서 산 색이 빠지던 것 보완)
    if (!exportCount('mtn')) return [];
    return [{ name: '산', blob: await svgBlob((c) => { keepLayers(c, ['L_mtn']); c.querySelector('#L_mtn')?.removeAttribute('filter'); }, true) }];
  }
  if (key === 'typhoon') {   // 태풍 라인만 — 경로·아이콘·반경·수치라벨·지명(투명 배경)
    if (!isTyphoon()) return [];
    return [{ name: '태풍', blob: await svgBlob((c) => keepLayers(c, ['L_typhoon', 'L_typhoonLabels']), true) }];
  }
  if (key === 'labels') {
    const labs = S.labels.filter((b) => !b.off);
    if (!labs.length) return [];
    const out = [], seen = {};
    for (let i = 0; i < labs.length; i++) {
      const b = labs[i], id = b.id;
      // 파일명은 라벨에 적힌 글(수치라벨 이름). 파일명 금지문자·줄바꿈 정리, 없으면 라벨NN. 같은 이름은 (2)(3)으로 구분.
      let nm = String(b.txt || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || ('라벨' + String(i + 1).padStart(2, '0'));
      if (seen[nm] != null) { seen[nm]++; nm = `${nm} (${seen[nm]})`; } else seen[nm] = 1;
      out.push({
        name: nm,
        blob: await svgBlob((c) => {
          keepLayers(c, ['L_labels']);
          c.querySelectorAll('#L_labels > g').forEach((g) => { if (g.dataset.id !== id) g.remove(); });
          // 지시선 라벨의 선·앵커(박스 g 밖 형제)도 이 라벨 것만 남긴다 — 안 그러면 모든 장에 남의 지시선이 중복
          c.querySelectorAll('#L_labels > [data-fleader-id], #L_labels > [data-fanchor-id]').forEach((n) => { if ((n.getAttribute('data-fleader-id') || n.getAttribute('data-fanchor-id')) !== id) n.remove(); });
        }),
      });
    }
    return out;
  }
  return [];
}

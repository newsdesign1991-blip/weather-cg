/* [모듈] js/timeline-plan.js — 타임라인 레이어 계획(tlLayerPlan: 화면·AE 공용 레이어 목록·순서·이름·타이밍), 시간 도우미(프레임·타임코드·입력 해석), 막대 끌기 계산, 스냅 대상 */
'use strict';

// ===================== 시간 도우미(프레임 단위) =====================
// 타임라인의 끌기·입력·단축키 결과는 모두 프레임 경계로 맞춘다(저장은 소수 4자리). 옛 2자리 값은 그대로 읽고 그대로 그린다.
function tlFps() { return +anim().fps || 29.97; }
function tlNomFps() { return Math.round(tlFps()); }   // 타임코드 칸의 프레임 수(29.97→30, 23.976→24)
function tlFrameOf(t) { return Math.round((+t || 0) * tlFps() + 1e-6); }
function tlQuant(t) { return +(Math.max(0, tlFrameOf(t)) / tlFps()).toFixed(4); }
function tlFrameDur() { return 1 / tlFps(); }
function tlPad(n, w) { return String(Math.max(0, Math.floor(n))).padStart(w || 2, '0'); }
// 29.97·59.94 = 드롭 프레임 타임코드(AE처럼 ';' 표기)
function tlIsDropFps() { const f = tlFps(); return Math.abs(f - 29.97) < 0.005 || Math.abs(f - 59.94) < 0.005; }
// 프레임 번호 → 시:분:초:프레임
function tlFramesToTC(f) {
  const nom = tlNomFps(); f = Math.max(0, Math.round(f));
  let sep = ':';
  if (tlIsDropFps()) {
    sep = ';';
    const drop = Math.round(nom / 15), per10 = nom * 600 - drop * 9, perMin = nom * 60 - drop;   // 30fps: 2프레임, 60fps: 4프레임
    const d = Math.floor(f / per10), m = f % per10;
    f += drop * 9 * d + (m > drop ? drop * Math.floor((m - drop) / perMin) : 0);
  }
  const ff = f % nom, s = Math.floor(f / nom);
  return `${Math.floor(s / 3600)}${sep}${tlPad(Math.floor(s / 60) % 60)}${sep}${tlPad(s % 60)}${sep}${tlPad(ff)}`;
}
function tlFmtTC(t) { return tlFramesToTC(tlFrameOf(t)); }
// 짧은 표기(시작·길이 칸·눈금) — 초:프레임 — 예 01:15f (AE 프레임 표기)
function tlFmtShort(t) { const f = tlFrameOf(t), n = tlNomFps(); return `${tlPad(Math.floor(f / n))}:${tlPad(f % n)}f`; }
// 시각 입력 해석 → 초(못 읽으면 null). '1.5'·'1.5s'=초, '45f'=프레임, '1:15'=초:프레임, '0;00;01;15'=타임코드,
// '+10'·'-5f'=지금(cur)에서 프레임만큼(AE), '+0.5s'=초만큼. frameMode면 맨 정수는 프레임 번호.
function tlParseTime(str, cur, frameMode) {
  let s = String(str == null ? '' : str).trim().replace(/\s+/g, '').replace(/초$/, 's');
  if (!s) return null;
  let rel = 0;
  if (/^[+-]/.test(s) && cur != null) { rel = s[0] === '-' ? -1 : 1; s = s.slice(1); }
  const fps = tlFps(), nom = tlNomFps();
  let m, t = null;
  if ((m = /^(\d+)[;:](\d{1,2})[;:](\d{1,2})[;:](\d{1,2})$/.exec(s))) {
    const h = +m[1], mi = +m[2], se = +m[3], fr = +m[4];
    let f = ((h * 60 + mi) * 60 + se) * nom + fr;
    if (tlIsDropFps() && s.includes(';')) { const drop = Math.round(nom / 15), tm = h * 60 + mi; f -= drop * (tm - Math.floor(tm / 10)); }
    t = f / fps;
  } else if ((m = /^(\d+)[;:](\d{1,2})f?$/i.exec(s))) t = (+m[1] * nom + +m[2]) / fps;
  else if ((m = /^(\d+(?:\.\d+)?)f$/i.exec(s))) t = +m[1] / fps;
  else if ((m = /^(\d*\.?\d+)(s)?$/i.exec(s))) {
    const isInt = !m[1].includes('.') && !m[2];
    t = (isInt && (rel || frameMode)) ? +m[1] / fps : +m[1];
  } else return null;
  if (!isFinite(t)) return null;
  return rel ? (+cur || 0) + rel * t : t;
}

// ===================== 레이어 계획 =====================
// 위(앞)→아래(뒤) 순서 = AE 레이어 순서. 화면(타임라인 행)·재생 막대·AE 보내기가 같은 목록을 쓴다(화면 = AE).
//  track: 그 레이어를 움직이는 S.anim.tracks 원소(null = 타이밍 없음 = 처음부터 보임)
//  span:  등장 구간 [시작, 끝](초) — 막대의 진한 부분.  implicit: 트랙은 없지만 앱이 정해 쓰는 기본 등장 구간(브러쉬·비교 예보)
//  animatable: 막대를 끌어 트랙을 만들 수 있다 · gone: 지도에서 사라진 대상의 트랙 · diff: AE에서 화면과 다르게 들어가는 점
const TL_CAM_COL = '#D98AD0';   // AE 카메라 레이어 라벨색(분홍)
const TL_DEF_LEN = { fill: 0.8, brush: 0.8, mtn: 0.8, label: 1.0, typcmp: 2.0 };
// 색(대문자) → 범례 글자(특보 목록·수동 범례). 없으면 비어 있다.
function tlLegendNames() {
  const out = {};
  const put = (col, txt) => { const k = String(col || '').toUpperCase(); if (k && txt && !out[k]) out[k] = String(txt); };
  try { if (S.style === 'warn' || S.style === 'warnsea') for (const d of aeWarningFillDefs()) put(d.col, d.name.replace(/_/g, ' ')); } catch (e) {}
  const g = S.legend || {};
  const auto = g.auto == null ? 1 : g.auto;
  try { for (const it of (isTyphoon() ? [] : (auto ? wrnLegendItems() : (g.items || [])))) if (it) put(it.col, it.txt); } catch (e) {}
  return out;
}
function tlLayerPlan(opt) {
  opt = opt || {};
  const A = anim();
  const tracks = opt.tracks || A.tracks;
  const used = new Set();
  const findKey = (kind, key) => tracks.find((x) => x.kind === kind && x.key === key) || null;
  const findCol = (kind, col) => { const U = String(col || '').toUpperCase(); return tracks.find((x) => x.kind === kind && String(x.key || '').toUpperCase() === U) || null; };
  const spanOf = (tr) => (tr ? [+tr.start || 0, (+tr.start || 0) + (+tr.len || 0)] : null);
  const out = [];
  const lay = (o) => {
    const L = Object.assign({ track: null, span: null, implicit: null, animatable: false, children: null, note: '', diff: [], col: null }, o);
    if (L.track) { used.add(L.track); if (!L.span) L.span = spanOf(L.track); }
    out.push(L); return L;
  };
  const stat = (sub, name, icon, extra) => lay(Object.assign({ id: 'st:' + sub, kind: 'static', sub, name, icon }, extra || {}));
  const blinds = (A.reveal || 'dissolve') === 'blinds';
  const names = tlLegendNames();
  const ty = isTyphoon(), cmpMap = ty && isTyphoonCompare();

  // 카메라(키가 있을 때만) — 맨 위(AE 카메라 레이어처럼)
  const ks = camKeys();
  if (ks.length) {
    const cam = lay({ id: 'cam', kind: 'camera', name: '카메라', icon: 'camera', col: TL_CAM_COL, keys: ks });
    if (!ty || cmpMap) cam.diff.push('AE로는 카메라 움직임이 안 들어갑니다(태풍 단일 지도만 지원)');
    else {
      if (camKeysRotate()) cam.diff.push('방향·기울기는 AE에 안 들어갑니다(위치·확대만)');
      if (ks.length > 2) cam.diff.push('AE에선 3번째 키부터 이징 없이 들어갑니다');
      // AE는 작업 뷰로 구운 지도 PNG·태풍 리그를 CAM 널로 통째 확대한다 — 화면은 확대해도 아이콘·선 굵기를 그대로 다시 그린다
      const s0 = +((stateForSave().map || {}).s) || 1;
      if (ks.some((k) => Math.abs((+k.s || 1) / s0 - 1) > 0.01)) cam.diff.push('AE에선 확대한 만큼 지도 그림(PNG)이 흐려지고 태풍 아이콘·선 굵기·지명표시도 같이 커집니다(화면은 크기 그대로)');
    }
  }
  // 범례·제목 — 맨 위 정적
  if (S.legend && S.legend.on) stat('legend', '범례', 'legend');
  const texts = (S.texts || []).filter((x) => !x.off);
  for (let i = texts.length - 1; i >= 0; i--) { const x = texts[i]; stat('title:' + x.id, '제목', 'title', { key: x.id, note: String(x.txt || '').split('\n')[0].slice(0, 14) }); }

  if (ty) {
    const tt = tracks.find((x) => x.kind === 'typhoon') || null;
    if (tt) ensureTyphoonKeys(tt);
    const iconCol = (S.typhoon && S.typhoon.iconCol) || '#E5231E';
    if (cmpMap) {
      // 비교 예보 — 카드 순서. 트랙이 없으면 메인 태풍 경로 타이밍을 같이 쓴다(화면과 같음). '태풍 경로' 행은 숨김(B19 — 비교 지도에선 효과 없음)
      if (tt) used.add(tt);
      const cmps = (S.typhoon && S.typhoon.compare) || [];
      for (const c of cmps) {
        const tr = findKey('typcmp', c.id);
        lay({ id: 'cmp:' + c.id, kind: 'typcmp', key: c.id, name: c.name || '비교 예보', icon: 'typhoon2', col: c.color || '#888', track: tr, animatable: true,
          implicit: !tr && tt ? [+tt.ps, +tt.pe] : null, note: c.show ? '' : '숨김', dim: !c.show });
      }
      // AE 비교 리그는 타이밍 하나(타이밍 있는 막대의 가장 이른 시작~가장 늦은 끝) — 막대끼리 다르거나, 타이밍 없는(처음부터 보이는) 예보가 섞여 있으면 차이
      const live = out.filter((L) => L.kind === 'typcmp' && !L.dim);
      const all = live.map((L) => L.span || L.implicit), sp = all.filter(Boolean);
      if (sp.length && (sp.length < all.length || sp.some((s) => Math.abs(s[0] - sp[0][0]) > 0.01 || Math.abs(s[1] - sp[0][1]) > 0.01))) for (const L of live) L.diff.push('AE에선 비교 예보가 한 타이밍(가장 이른 시작~가장 늦은 끝)으로 들어갑니다');
    } else {
      const typ = lay({ id: 'typ', kind: 'typhoon', key: 'typhoon', name: '태풍 경로', icon: 'typhoon', col: iconCol, track: tt, animatable: true });
      const kids = [];
      kids.push({ id: 'typ:path', kind: 'typPath', name: '경로', icon: 'path', col: iconCol, span: tt ? [+tt.ps, +tt.pe] : null, parent: typ, diff: tt ? ['AE에선 경로가 등속으로 그려집니다(화면은 처음·끝이 부드럽게)'] : [], note: '' });
      if (!typhoonLineMode()) {
        const pts = curTyphoonPoints();
        for (const b of typhoonLabels().slice().sort((a, b2) => a.idx - b2.idx)) {
          const e = tt && tt.lab && tt.lab[b.id];
          kids.push({ id: 'typ:lab:' + b.id, kind: 'typLabel', key: b.id, name: String(b.txt || (pts[b.idx] && pts[b.idx].label) || '라벨').split('\n')[0], icon: 'tag', col: iconCol, span: e ? [+e.s, +e.e] : null, parent: typ, diff: [], note: '' });
        }
      }
      typ.children = kids;
      if (tt) { const a = Math.min(...kids.filter((k) => k.span).map((k) => k.span[0])), b = Math.max(...kids.filter((k) => k.span).map((k) => k.span[1])); typ.span = [a, b]; }
      if ((S.typhoon && S.typhoon.places || []).length) stat('place', '지명표시', 'pin');
    }
  } else {
    // 일반 지도 — AE 쌓는 순서의 역: VF 제목바 · VF 진입 · 라벨(앞→뒤) · 산(앞→뒤) · 산(바탕) · 경계선 · 브러쉬 · 칠(어두운→밝은) · 배경
    const vf = S.res === '1920x1080-vf';
    if (vf && S.vfBar && S.vfBar.on) stat('vfbar', 'VF 제목바', 'vf');
    if (vf) lay({ id: 'vf', kind: 'vfEnter', name: 'VF 진입', icon: 'vf', col: '#3182F6', span: [ANIM_START, ANIM_START + ANIM_VF_ENTER_LEN], note: '고정' });
    const labs = (S.labels || []).filter((b) => !b.off);
    for (let i = labs.length - 1; i >= 0; i--) {
      const b = labs[i];
      const L = lay({ id: 'label:' + b.id, kind: 'label', key: b.id, name: String(b.txt || '(빈 라벨)').split('\n')[0], icon: 'tag', col: b.fill || '#888', track: findKey('label', b.id), animatable: true, note: b.style === 'leader' ? '지시선' : '' });
      if (b.style === 'leader' && L.track) L.diff.push('AE에선 지시선이 같은 타이밍으로 나타나기만 하고 올라오는 박스를 따라가지 않습니다(박스만 26px 올라옴)');
    }
    const mtns = (S.mtns || []).filter((m) => !m.off);
    for (let i = mtns.length - 1; i >= 0; i--) {
      const m = mtns[i];
      const L = lay({ id: 'mtn:' + m.id, kind: 'mtn', key: m.id, name: m.txt || '산', icon: 'mtn', col: m.col || '#888', track: findKey('mtn', m.id), animatable: true });
      if (blinds) L.diff.push('AE에선 블라인드 대신 페이드로 들어갑니다');
    }
    if (mtns.length) stat('mtnBase', '산(바탕)', 'mtn');
    stat('lines', '경계선', 'lines');
    // 브러쉬 — 색마다(처음 칠한 순서). 트랙 없는 색은 앱이 '첫 칠 전 페이드인'(0초~첫 칠)으로 그린다
    const bcols = [];
    for (const s of brushStrokes()) if (!s.erase && !bcols.some((x) => x.toUpperCase() === s.col.toUpperCase())) bcols.push(s.col);
    const fillStarts = tracks.filter((x) => x.kind === 'fill').map((x) => +x.start);
    const firstFill = fillStarts.length ? Math.min(...fillStarts) : ANIM_FILL_LEN;
    for (let i = bcols.length - 1; i >= 0; i--) {
      const c = bcols[i], U = c.toUpperCase(), tr = findCol('brush', U);
      lay({ id: 'brush:' + U, kind: 'brush', key: U, name: names[U] ? names[U] + ' 브러쉬' : '브러쉬', note: U, icon: 'brush', col: U, track: tr, animatable: true, implicit: tr ? null : [0, Math.max(firstFill, ANIM_FILL_LEN)] });
    }
    // 칠 — 특보 지도는 특보마다(우선순위 높은 것이 위), 그 밖은 색마다(어두운 색이 위). 트랙은 색으로 찾는다.
    const warn = S.style === 'warn' || S.style === 'warnsea';
    const defs = warn ? aeWarningFillDefs() : [];
    if (defs.length) {
      for (let i = defs.length - 1; i >= 0; i--) {
        const d = defs[i], U = d.col.toUpperCase();
        const L = lay({ id: 'wrn:' + d.key, kind: 'fill', key: U, name: d.name.replace(/_/g, ' '), note: U, icon: 'fill', col: U, track: findCol('fill', U), animatable: true, wrnDef: d });
        if (blinds) L.diff.push('AE에선 블라인드 대신 페이드로 들어갑니다');
      }
    } else {
      const seen = {};
      for (const c of Object.values(fills())) if (c) seen[c.toUpperCase()] = true;
      const cols = Object.keys(seen).sort((a, b) => lumOf(a) - lumOf(b));   // 어두운 → 밝은(위 → 아래)
      for (const U of cols) {
        const L = lay({ id: 'fill:' + U, kind: 'fill', key: U, name: names[U] || U, note: names[U] ? U : '', icon: 'fill', col: U, track: findCol('fill', U), animatable: true });
        if (blinds) L.diff.push('AE에선 블라인드 대신 페이드로 들어갑니다');
      }
    }
  }
  // 지도에서 사라진 대상의 트랙·옛 텍스트 트랙 — 배경 바로 위에 흐리게(지우지 않음)
  for (const tr of tracks) {
    if (used.has(tr)) continue;
    if (tr.kind === 'text') { lay({ id: 'text:' + tr.key, kind: 'oldText', key: tr.key, name: '옛 텍스트 트랙', note: '애니 없음', icon: 'title', col: '#888', track: tr, dim: true }); continue; }
    if (tr.kind === 'typhoon' && ty) continue;
    const info = trackInfo(tr);
    const why = tr.kind === 'typhoon' ? '이 지도엔 없음' : tr.kind === 'fill' || tr.kind === 'brush' ? '지도에 없는 색' : (tr.kind === 'label' && S.labels.some((b) => b.id === tr.key)) ? '숨김' : '지운 대상';
    lay({ id: 'gone:' + tr.kind + ':' + tr.key, kind: tr.kind, key: tr.key, name: tr.kind === 'fill' ? (names[String(tr.key).toUpperCase()] || tr.key) : info.name, note: why, icon: { fill: 'fill', brush: 'brush', label: 'tag', mtn: 'mtn', typhoon: 'typhoon', typcmp: 'typhoon2' }[tr.kind] || 'fill', col: info.col, track: tr, gone: true, dim: true, animatable: true });
  }
  stat('bg', '배경·지도', 'image');
  return out;
}
// 행 하나의 지금 등장 구간(트랙에서 바로 읽는다 — 계획을 다시 만들지 않고 끌기 중 갱신용)
function tlSpanNow(L) {
  if (!L) return null;
  if (L.kind === 'typPath') { const tr = L.parent.track; return tr ? [+tr.ps, +tr.pe] : null; }
  if (L.kind === 'typLabel') { const tr = L.parent.track, e = tr && tr.lab && tr.lab[L.key]; return e ? [+e.s, +e.e] : null; }
  if (L.kind === 'typhoon') { const tr = L.track; if (!tr) return null; const k = (L.children || []).map(tlSpanNow).filter(Boolean); return k.length ? [Math.min(...k.map((s) => s[0])), Math.max(...k.map((s) => s[1]))] : [+tr.ps, +tr.pe]; }
  if (L.kind === 'vfEnter') return L.span;
  return L.track ? [+L.track.start || 0, (+L.track.start || 0) + (+L.track.len || 0)] : null;
}
// 등장 구간을 [a,b]로 — 트랙 필드에 쓴다(소수 4자리). 태풍 부모는 하위(경로·라벨)를 함께 옮긴다.
function tlSetSpan(L, a, b) {
  const q = (v) => +(+v).toFixed(4);
  if (L.kind === 'typPath') { const tr = L.parent.track; tr.ps = q(a); tr.pe = q(b); syncTyphoonSpan(tr); return; }
  if (L.kind === 'typLabel') { const tr = L.parent.track; tr.lab[L.key] = { s: q(a), e: q(b) }; syncTyphoonSpan(tr); return; }
  if (L.kind === 'typhoon') {
    const s0 = tlSpanNow(L); if (!s0) return; const d = a - s0[0];
    const tr = L.track; tr.ps = q(tr.ps + d); tr.pe = q(tr.pe + d);
    for (const id in (tr.lab || {})) { const e = tr.lab[id]; if (e) tr.lab[id] = { s: q(e.s + d), e: q(e.e + d) }; }
    syncTyphoonSpan(tr); return;
  }
  if (!L.track) return;
  L.track.start = q(a); L.track.len = q(Math.max(0.0001, b - a));
}
// 막대 끌기 계산(순수) — type 'move'|'l'(시작 자르기·끝 고정)|'r'(길이). s0=[a,b], d=초, 결과는 프레임 경계·0 밑 금지·최소 1프레임.
function tlDragCalc(type, s0, d) {
  const f1 = tlFrameDur();
  const [a0, b0] = s0;
  if (type === 'move') { const a = tlQuant(Math.max(0, a0 + d)); return [a, +(a + (b0 - a0)).toFixed(4)]; }
  if (type === 'l') { const a = Math.min(tlQuant(Math.max(0, a0 + d)), +(b0 - f1).toFixed(4)); return [Math.max(0, a), b0]; }
  const b = Math.max(tlQuant(b0 + d), +(a0 + f1).toFixed(4)); return [a0, b];
}
// 트랙이 없는 레이어에 트랙을 만든다(그 시각에 기본 길이). 반환: 새 트랙(또는 이미 있으면 그것)
function tlEnsureTrack(L, t) {
  const A = anim();
  if (L.track) return L.track;
  const st = tlQuant(Math.max(0, t));
  if (L.kind === 'typhoon') {
    const hold = st, tr = { id: 'k' + seq++, kind: 'typhoon', key: 'typhoon', start: hold, len: 3.2, ps: hold, pe: +(hold + 2).toFixed(4) };
    A.tracks.push(tr); ensureTyphoonKeys(tr); L.track = tr; return tr;
  }
  if (L.kind === 'typcmp' && !A.tracks.some((x) => x.kind === 'typhoon')) {   // 비교 지도도 메인 경로 트랙이 있어야 재생된다(화면 규칙)
    A.tracks.push({ id: 'k' + seq++, kind: 'typhoon', key: 'typhoon', start: st, len: 2, ps: st, pe: +(st + 2).toFixed(4) });
  }
  const span = L.implicit;
  const tr = { id: 'k' + seq++, kind: L.kind, key: L.key, start: span ? tlQuant(span[0]) : st, len: span ? +(span[1] - span[0]).toFixed(4) : (TL_DEF_LEN[L.kind] || 0.8) };
  if (!span) tr.start = st;
  A.tracks.push(tr); L.track = tr; return tr;
}
// Shift 스냅 대상(초) — 0·길이 끝·CTI·작업 영역·다른 막대 시작/끝(태풍 하위 포함)·카메라 키. skip = 끌고 있는 행·키 id
function tlSnapTargets(skip, plan) {
  const A = anim(), out = [0, +A.dur, +tlHeadT || 0];
  if (A.work) out.push(+A.work.a, +A.work.b);
  for (const L of (plan || tlLayerPlan())) {
    if (skip && skip.has(L.id)) continue;
    const sp = tlSpanNow(L); if (sp && L.kind !== 'typhoon') out.push(sp[0], sp[1]);
    for (const c of (L.children || [])) { if (skip && skip.has(c.id)) continue; const cs = tlSpanNow(c); if (cs) out.push(cs[0], cs[1]); }
  }
  for (const k of camKeys()) if (!(skip && skip.has(k.id))) out.push(+k.t);
  return out;
}
// 옛 이름(측정 도구·옛 코드 호환) — 모든 스냅 시각
function timelineSnapTimes() { return tlSnapTargets(null); }
// 가장 가까운 스냅(문턱 px) — 없으면 null
function tlSnapNear(t, targets, thrSec) {
  let best = null, bd = thrSec;
  for (const s of targets) { const d = Math.abs(s - t); if (d < bd) { bd = d; best = s; } }
  return best;
}

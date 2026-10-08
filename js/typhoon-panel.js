/* [모듈] js/typhoon-panel.js — 태풍 패널 UI: 비교 카드, 태풍 패널·밴드, 펜툴, 참고 이미지, wireTyphoonPanel */
'use strict';
// 지금 불러온 예보를 '비교 목록'에 스냅샷으로 추가(색 자동 배정). auto=불러오기 자동추가(중복 이름은 갱신, undo/모드 자동켜기 생략).
function addCompareForecast(auto) {
  if (!S.typhoon) initTyphoonData();
  const pts = curTyphoonPoints();
  if (!pts || pts.length < 2) { if (!auto) status('먼저 예보를 불러오세요 — 비교에 추가할 게 없습니다', true); return; }
  const cmp = (S.typhoon.compare ||= []);
  const wl = S.typhoon.whichList, ws = S.typhoon.whichSel || 0;
  const nm = (wl && wl[ws] && wl[ws].name) || S.typhoon.name || ('예보 ' + (cmp.length + 1));
  if (!auto) pushUndo();   // 자동추가는 불러오기 쪽에서 이미 pushUndo 함
  const ex = cmp.find((c) => c.name === nm);   // 같은 이름이면 갱신(재불러오기·중복 방지)
  if (ex) ex.points = JSON.parse(JSON.stringify(pts));
  else cmp.push({ id: 'cmp' + (seq++), name: nm, color: CMP_PALETTE[cmp.length % CMP_PALETTE.length], show: 1, showIcons: 1, showName: 0, showLegend: 0, points: JSON.parse(JSON.stringify(pts)) });   // 이름표·범례 기본 꺼짐(원하면 탭에서 켬)
  buildCompareSection(); renderTyphoon(); renderLegend();
  status((ex ? '비교 갱신: ' : '비교에 추가: ') + nm + ' (' + cmp.length + '개)', true);
}
const CMP_FONTS = [['', 'SUITE(기본)'], ['Wanted Sans Variable', 'Wanted Sans'], ['Malgun Gothic', '맑은 고딕']];
const _cmpEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// 태풍 카드 본문 HTML(눈·색·이름·삭제 + 아이콘/이름/범례 + 날짜범위 + 수치라벨 + 이름표 글꼴). 태풍별 .sec 탭 안에 들어간다.
function compareCardBodyHTML(c, i) {
  const dates = (c.points || []).map((p) => typhoonDateKST(p.tmef)).filter(Boolean).sort();
  const dMin = dates[0] || '', dMax = dates[dates.length - 1] || '';
  const labBy = {}; (c.labels || []).forEach((l) => { labBy[l.idx] = l; });
  const ptRows = (c.points || []).map((p, pi) => {
    const lb = labBy[pi], on = lb && !lb.off;
    const def = p.label || (p.tmef ? (typhoonDateKST(p.tmef) || '') : ('지점 ' + (pi + 1)));
    return `<div class="row" style="gap:5px;margin:2px 0"><label class="chk" style="flex:0 0 auto"><input type="checkbox" data-i="${i}" data-lblchk="${pi}" ${on ? 'checked' : ''}></label>`
      + `<input type="text" data-i="${i}" data-lbltxt="${pi}" value="${_cmpEsc(lb ? (lb.txt || '') : '')}" placeholder="${_cmpEsc(def)}" style="flex:1;font-size:11px${on ? '' : ';opacity:.45'}" ${on ? '' : 'disabled'}></div>`;
  }).reverse().join('');   // 목록을 거꾸로(최신 시각이 위) — pi는 원래 지점 인덱스 유지
  const fontOpts = CMP_FONTS.map(([v, t]) => `<option value="${v}" ${(c.labelFont || '') === v ? 'selected' : ''}>${t}</option>`).join('');
  return `<div class="row" style="gap:6px;margin:0 0 6px">`
    + `<button class="eye${c.show ? '' : ' off'}" data-i="${i}" data-cmpeye="1" title="이 태풍 전체 표시/숨기기" style="flex:0 0 auto"></button>`
    + `<input type="color" data-i="${i}" data-cmpcol="1" value="${c.color}" style="flex:0 0 32px">`
    + `<input type="text" data-i="${i}" data-cmpname="1" value="${_cmpEsc(c.name)}" style="flex:1;font-size:12px">`
    + `<button data-i="${i}" data-cmpdel="1" class="ghost" title="이 태풍 비교 삭제" style="flex:0 0 auto;padding:2px 8px">삭제</button></div>`
    + `<div class="subhead" style="margin:4px 0 3px">표시</div>`
    + `<label class="swtch"><span>태풍 아이콘</span><input type="checkbox" data-i="${i}" data-cmpicons="1" ${c.showIcons !== 0 ? 'checked' : ''}></label>`
    + `<label class="swtch"><span>아이콘 대신 작은 원</span><input type="checkbox" data-i="${i}" data-cmpdot="1" ${c.dotIcon ? 'checked' : ''}></label>`
    + `<div class="row" style="gap:6px;margin:2px 0"><label style="flex:0 0 auto;font-size:11px">아이콘 위치</label><select data-i="${i}" data-cmpiconmode="1" style="flex:1;font-size:11px"><option value="even" ${(c.iconMode || 'even') === 'even' ? 'selected' : ''}>등간격(약 10개)</option><option value="all" ${c.iconMode === 'all' ? 'selected' : ''}>실제 날짜별(전부)</option><option value="daily" ${c.iconMode === 'daily' ? 'selected' : ''}>하루에 하나</option></select></div>`
    + `<div class="row" style="gap:6px;margin:2px 0"><label style="flex:0 0 auto;font-size:11px">선 두께</label><input type="number" data-i="${i}" data-cmplinew="1" step="0.2" min="0.5" max="10" value="${c.lineW || 2.2}" style="flex:0 0 60px"><label style="flex:0 0 auto;font-size:11px">아이콘 크기</label><input type="number" data-i="${i}" data-cmpiconscale="1" step="0.1" min="0.3" max="4" value="${c.iconScale == null ? 1 : c.iconScale}" style="flex:0 0 60px"></div>`
    + `<label class="swtch"><span>반경 표시</span><input type="checkbox" data-i="${i}" data-cmpradius="1" ${c.showRadius ? 'checked' : ''}></label>`
    + `<label class="swtch"><span>이름</span><input type="checkbox" data-i="${i}" data-cmpname2="1" ${c.showName !== 0 ? 'checked' : ''}></label>`
    + `<label class="swtch"><span>범례</span><input type="checkbox" data-i="${i}" data-cmplegend="1" ${c.showLegend !== 0 ? 'checked' : ''}></label>`
    + `<label class="swtch"><span>표시 날짜범위</span><input type="checkbox" data-i="${i}" data-cmprange="1" ${c.rangeOn ? 'checked' : ''}></label>`
    + `<div class="row" data-rangebox="${i}" style="gap:5px;margin:2px 0${c.rangeOn ? '' : ';display:none'}"><input type="date" data-i="${i}" data-cmpfrom="1" min="${dMin}" max="${dMax}" value="${c.rangeFrom || dMin}" style="flex:1"><span style="opacity:.55">~</span><input type="date" data-i="${i}" data-cmpto="1" min="${dMin}" max="${dMax}" value="${c.rangeTo || dMax}" style="flex:1"></div>`
    + `<div class="subhead" style="margin:7px 0 3px">수치 라벨 <span>· 체크하면 생성</span></div>`
    + `<div class="row" style="gap:6px;margin:3px 0"><label style="flex:0 0 auto;font-size:11px">글자 크기·색</label><input type="number" data-i="${i}" data-numsize="1" min="16" max="90" value="${c.numSize || 40}" style="flex:0 0 54px"><input type="color" data-i="${i}" data-numcol="1" value="${c.numCol || '#FFFFFF'}" style="flex:0 0 32px"></div>`
    + `<div class="list" style="max-height:200px;overflow:auto">` + ptRows + `</div>`
    + `<div class="subhead" style="margin:7px 0 3px">이름표 글꼴</div>`
    + `<div class="row" style="gap:6px;margin:3px 0"><select data-i="${i}" data-namefont="1" style="flex:1;font-size:11px">${fontOpts}</select></div>`
    + `<div class="row" style="gap:6px;margin:3px 0"><label style="flex:0 0 auto;font-size:11px">크기</label><input type="number" data-i="${i}" data-namesize="1" min="12" max="90" value="${c.labelSize || 34}" style="flex:0 0 54px"><label style="flex:0 0 auto;font-size:11px">굵기</label><input type="number" data-i="${i}" data-nameweight="1" min="100" max="900" step="100" value="${c.labelWeight || 800}" style="flex:0 0 60px"><input type="color" data-i="${i}" data-namecol="1" value="${c.labelCol || c.color}" style="flex:0 0 32px"></div>`
    + (c.manual ? (`<div class="subhead" style="margin:7px 0 3px">수동 경로 편집</div>`
      + `<div class="btns" style="margin:3px 0"><button data-i="${i}" data-cmpeditpts="1" style="flex:1">${penEditId === c.id ? '편집 끝내기' : '점 편집'}</button>`
      + (penEditId === c.id ? `<button data-i="${i}" data-cmpextend="1" style="flex:1">${penExtendId === c.id ? '이어그리기 끝(Enter)' : '이어그리기'}</button>` : '') + `</div>`
      + (penEditId === c.id ? `<p class="hint" style="margin:3px 0 0">점 <b>드래그</b>=이동 · <b>더블클릭</b>=삭제 · 선 중간 <b>+</b>=추가</p>` : '')) : '');
}
// 태풍 카드 본문 핸들러 배선(root=그 태풍 섹션 요소, i=인덱스).
function wireCompareCard(root, cmp, i) {
  const R = () => renderTyphoon();
  const RL = () => { renderTyphoon(); renderLegend(); };
  const q = (sel) => root.querySelectorAll(sel);
  q('[data-cmpeye]').forEach((n) => { n.onclick = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.show = c.show ? 0 : 1; buildCompareSection(); RL(); }; });
  q('[data-cmpcol]').forEach((n) => { n.oninput = () => { const c = cmp[i]; if (!c) return; pushUndo('cmpcol'); c.color = n.value.toUpperCase(); const dot = root.querySelector('h3 .cmpDot'); if (dot) dot.style.background = c.color; RL(); }; });
  q('[data-cmpname]').forEach((n) => wireImeText(n, (v) => { const c = cmp[i]; if (!c) return; pushUndo('cmpname'); c.name = v; const nm = root.querySelector('h3 .cmpNm'); if (nm) nm.textContent = c.name; RL(); buildTimeline(); }));
  q('[data-cmpicons]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.showIcons = n.checked ? 1 : 0; R(); }; });
  q('[data-cmpdot]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.dotIcon = n.checked ? 1 : 0; R(); }; });
  q('[data-cmpiconmode]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.iconMode = n.value; R(); }; });
  q('[data-cmplinew]').forEach((n) => { n.oninput = () => { const c = cmp[i]; if (!c) return; pushUndo('cmplinew'); c.lineW = Math.max(0.5, +n.value || 2.2); R(); }; });
  q('[data-cmpiconscale]').forEach((n) => { n.oninput = () => { const c = cmp[i]; if (!c) return; pushUndo('cmpiconscale'); c.iconScale = Math.max(0.3, +n.value || 1); R(); }; });
  q('[data-cmpradius]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.showRadius = n.checked ? 1 : 0; R(); }; });
  q('[data-cmpname2]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.showName = n.checked ? 1 : 0; R(); }; });
  q('[data-cmplegend]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.showLegend = n.checked ? 1 : 0; RL(); }; });
  q('[data-cmprange]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.rangeOn = n.checked ? 1 : 0; const box = root.querySelector('[data-rangebox]'); if (box) box.style.display = c.rangeOn ? '' : 'none'; if (c.rangeOn) { const f = root.querySelector('[data-cmpfrom]'), t = root.querySelector('[data-cmpto]'); if (f && !c.rangeFrom) c.rangeFrom = f.value; if (t && !c.rangeTo) c.rangeTo = t.value; } R(); }; });
  q('[data-cmpfrom]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.rangeFrom = n.value; R(); }; });
  q('[data-cmpto]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.rangeTo = n.value; R(); }; });
  q('[data-lblchk]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; const pi = +n.dataset.lblchk; pushUndo(); c.labels = c.labels || []; const ex = c.labels.find((l) => l.idx === pi); if (n.checked) { if (!ex) c.labels.push({ idx: pi, txt: '' }); else ex.off = 0; } else if (ex) c.labels = c.labels.filter((l) => l.idx !== pi); const tx = root.querySelector(`[data-lbltxt="${pi}"]`); if (tx) { tx.disabled = !n.checked; tx.style.opacity = n.checked ? '' : '.45'; if (!n.checked) tx.value = ''; } R(); }; });   // 전체 재빌드 대신 인접 입력만 갱신 → 목록 스크롤 유지(맨 위로 안 튐)
  q('[data-lbltxt]').forEach((n) => wireImeText(n, (v) => { const c = cmp[i]; if (!c) return; const pi = +n.dataset.lbltxt; const lb = (c.labels || []).find((l) => l.idx === pi); if (lb) { pushUndo('cmplbltxt'); lb.txt = v; R(); } }));
  q('[data-numsize]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.numSize = +n.value; R(); }; });
  q('[data-numcol]').forEach((n) => { n.oninput = () => { const c = cmp[i]; if (!c) return; pushUndo('cmpnumcol'); c.numCol = n.value.toUpperCase(); R(); }; });
  q('[data-namefont]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.labelFont = n.value; R(); }; });
  q('[data-namesize]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.labelSize = +n.value; R(); }; });
  q('[data-nameweight]').forEach((n) => { n.onchange = () => { const c = cmp[i]; if (!c) return; pushUndo(); c.labelWeight = +n.value; R(); }; });
  q('[data-namecol]').forEach((n) => { n.oninput = () => { const c = cmp[i]; if (!c) return; pushUndo('cmpnamecol'); c.labelCol = n.value.toUpperCase(); R(); }; });
  q('[data-cmpdel]').forEach((n) => { n.onclick = () => {
    const c = cmp[i]; if (!c) return; pushUndo();
    const A = anim(); A.tracks = A.tracks.filter((t) => !(t.kind === 'typcmp' && t.key === c.id));
    S.typhoon.compare = cmp.filter((x) => x.id !== c.id);
    buildCompareSection(); buildTimeline(); renderTyphoon(); renderLegend();
  }; });
  q('[data-cmpeditpts]').forEach((n) => { n.onclick = () => { const c = cmp[i]; if (!c) return; if (penEditId === c.id) { penEditId = null; penExtendId = null; } else { penEditId = c.id; penExtendId = null; } buildCompareSection(); renderTyphoon(); status(penEditId === c.id ? '점 편집: 드래그=이동 · 더블클릭=삭제 · 중간 +=추가' : '점 편집 종료', true); }; });
  q('[data-cmpextend]').forEach((n) => { n.onclick = () => { const c = cmp[i]; if (!c) return; if (penExtendId === c.id) { penExtendId = null; status('이어그리기 끝', true); } else { penEditId = c.id; penExtendId = c.id; status('지도를 클릭해 경로 뒤에 점을 이어 찍으세요 · Enter=완료', true); } buildCompareSection(); renderTyphoon(); }; });
}
// 태풍마다 사이드바에 '전용 탭'(.sec)을 만든다. 태풍 비교 섹션 바로 아래에 삽입. 기본 수치라벨/특보범례 탭과 같은 디자인.
function buildCompareTyphoonSections() {
  const panel = document.querySelector('#panel'); if (!panel) return;
  panel.querySelectorAll('.sec[data-cmpsec]').forEach((n) => n.remove());
  if (!isTyphoonCompare()) return;
  const anchor = panel.querySelector('.sec[data-sec="typhoonCompare"]');
  const cmp = (S.typhoon && S.typhoon.compare) || [];
  let after = anchor;
  cmp.forEach((c, i) => {
    const sec = document.createElement('div');
    sec.className = 'sec special' + (c._open === false ? ' closed' : '');
    sec.setAttribute('data-cmpsec', c.id);
    sec.innerHTML = `<h3><span class="cmpDot" style="display:inline-block;width:13px;height:13px;border-radius:4px;background:${c.color};margin-right:8px;vertical-align:-1px"></span><span class="cmpNm">${_cmpEsc(c.name || ('예보 ' + (i + 1)))}</span></h3>`
      + `<div class="body"><div class="bodyInner"><div class="bodyPad">${compareCardBodyHTML(c, i)}</div></div></div>`;
    if (after && after.nextSibling) panel.insertBefore(sec, after.nextSibling); else panel.appendChild(sec);
    after = sec;
    const h = sec.querySelector('h3');
    h.addEventListener('pointerdown', (e) => e.stopPropagation());   // 전역 섹션 드래그/팝아웃 차단(이 탭은 커스텀 접기)
    h.addEventListener('click', () => { c._open = !sec.classList.toggle('closed'); });
    wireCompareCard(sec, cmp, i);
  });
}
// 비교 지도 상단 컨트롤(가져올 태풍 목록·범례 토글) 갱신 + 태풍별 전용 탭 생성.
function buildCompareSection() {
  if (!isTyphoonCompare()) return;
  if (!S.typhoon) initTyphoonData();
  const _sc = $('#panel'), _st = _sc ? _sc.scrollTop : 0;   // 재빌드 후 스크롤 위치 복원(수치라벨 체크 시 맨 위로 튀는 것 방지)
  if (_sc) requestAnimationFrame(() => { _sc.scrollTop = _st; });
  const T = S.typhoon;
  const which = $('#tycWhichSel');
  if (which) {
    const list = T.whichList || []; which.innerHTML = '';
    if (list.length) { list.forEach((w, i) => { const o = document.createElement('option'); o.value = i; o.textContent = w.name; which.appendChild(o); }); which.value = String(T.whichSel || 0); which.disabled = false; }
    else { const o = document.createElement('option'); o.textContent = '(불러오기 전)'; which.appendChild(o); which.disabled = true; }
  }
  const lg = $('#tycLegend'); if (lg) lg.checked = !!(S.legend && S.legend.on);
  // 참고 이미지 컨트롤 동기화(배열·선택 칩)
  { const arr = refImgs(), sel = refSelIdx(), ri = refImg(), ctl = $('#tycRefCtl'), drop = $('#tycRefDrop');
    if (ctl) ctl.style.display = arr.length ? '' : 'none';
    if (drop) drop.style.display = arr.length >= MAX_REF ? 'none' : '';   // 5개 차면 드롭존 숨김
    const list = $('#tycRefList');
    if (list) { list.innerHTML = arr.map((im, i) => `<button data-refi="${i}" class="ghost" style="padding:3px 9px;font-size:11px${i === sel ? ';outline:2px solid var(--primary);background:color-mix(in srgb,var(--primary) 18%,transparent)' : ''}">이미지 ${i + 1}${im.show === 0 ? ' (숨김)' : ''}</button>`).join('');
      list.querySelectorAll('[data-refi]').forEach((n) => { n.onclick = () => { S.typhoon.refSel = +n.dataset.refi; renderRefImg(); buildCompareSection(); }; }); }
    if (ri) { const sh = $('#tycRefShow'); if (sh) sh.checked = ri.show !== 0; const op = $('#tycRefOp'), opv = $('#tycRefOpV'); const v = ri.op == null ? 0.6 : ri.op; if (op) op.value = v; if (opv) opv.textContent = Math.round(v * 100) + '%'; } }
  const wrap = $('#tycList'); const cmp = (T.compare ||= []);
  if (wrap) wrap.innerHTML = cmp.length
    ? '<p class="hint" style="margin:2px 0;opacity:.7">태풍마다 아래 <b>전용 탭</b>에서 조절해요.</p>'
    : '<p class="hint" style="margin:2px 0;opacity:.6">아직 없음 — 불러오면 아래에 <b>전용 탭</b>이 생겨요.</p>';
  buildCompareTyphoonSections();
}

function buildTyphoonPanel() {
  if (!isTyphoon()) return;
  if (!S.typhoon) initTyphoonData();
  const T = S.typhoon;
  for (const w of (T.whichList || [])) if (!w.td && w.year) w.name = typhoonDisplayName(w.year, w.tno, false);   // 저장된 이름을 라벨에 항상 반영(파일 로드 후에도)
  { const cur = (T.whichList || [])[T.whichSel || 0]; if (cur && !cur.td && cur.year) T.name = cur.name; }
  const which = $('#typWhichSel');
  if (which) {
    which.innerHTML = '';
    const list = T.whichList || [];
    if (list.length) { list.forEach((w, i) => { const o = document.createElement('option'); o.value = i; o.textContent = w.name; which.appendChild(o); }); which.value = String(T.whichSel || 0); which.disabled = false; }
    else { const o = document.createElement('option'); o.textContent = '(불러오기 전 · 샘플)'; which.appendChild(o); which.disabled = true; }
  }
  const nmeIn = $('#typName');   // 이름칸 = 현재 선택 태풍(기상청)일 때만 활성, 저장된 이름 표시
  if (nmeIn) {
    const cur = (T.whichList || [])[T.whichSel || 0];
    const ok = !!(cur && !cur.td && cur.year);
    nmeIn.disabled = !ok;
    nmeIn.value = ok ? typNameGet(cur.year, cur.tno) : '';
    nmeIn.placeholder = ok ? '예: 개미 (제' + cur.tno + '호에 저장)' : '기상청 태풍을 불러오면 입력';
  }
  const issueSel = $('#typIssueSel');   // ⚠ 전역 선택배열 sel을 가리지 않게 이름 분리(라벨 체크박스 핸들러가 전역 sel을 씀)
  if (issueSel) {
    issueSel.innerHTML = '';
    (T.issues || []).forEach((it, i) => { const o = document.createElement('option'); o.value = i; o.textContent = it.label; issueSel.appendChild(o); });
    issueSel.value = String(T.sel || 0);
  }
  const info = $('#typInfo'); if (info) info.textContent = T.fromApi ? '' : '지금은 샘플(6호 장미) — 위에서 불러오세요.';
  const trackMode = T.trackMode || 'full';
  document.querySelectorAll('#typTrackMode button').forEach((b) => b.classList.toggle('on', b.dataset.tm === trackMode));
  { const lw = $('#typLineWidth'), lwV = $('#typLineWidthV'), v = (T.lineWidth == null ? 9.5 : T.lineWidth); if (lw) lw.value = v; if (lwV) lwV.textContent = v + 'px'; }
  // 현재 시각 슬라이더 + 라벨 목록
  const pts = curTyphoonPoints();
  const now = $('#typNow'), nowV = $('#typNowV');
  if (now) { now.max = Math.max(0, pts.length - 1); now.value = typhoonNowIdx(pts); }
  if (nowV) { const i = typhoonNowIdx(pts); nowV.textContent = (pts[i] && pts[i].label) || i; }
  const list = $('#typLabelList');
  if (list) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const byIdx = {}; for (const b of labelList()) if (b.idx != null) byIdx[b.idx] = b;
    list.innerHTML = pts.map((p, i) => {
      const b = byIdx[i], on = !!b;
      const def = p.label || (p.tmef && fmtKST(p.tmef)) || ('지점 ' + (i + 1));
      const val = on ? (b.txt || '') : '';
      return `<div class="row" style="gap:6px;margin:2px 0"><label class="chk" style="flex:0 0 auto;gap:5px"><input type="checkbox" class="typLblChk" data-i="${i}" ${on ? 'checked' : ''}></label><input type="text" class="typLblTxt" data-i="${i}" value="${esc(val)}" placeholder="${esc(def)}" style="flex:1;font-size:12px${on ? '' : ';opacity:.45'}" ${on ? '' : 'disabled'}><label class="chk" title="온대저압부(저)로 표시" style="flex:0 0 auto;gap:3px;font-size:11px;white-space:nowrap"><input type="checkbox" class="typExChk" data-i="${i}" ${p.ex ? 'checked' : ''}>저</label></div>`;
    }).join('');
    list.querySelectorAll('.typLblChk').forEach((n) => { n.onchange = () => {
      const i = +n.dataset.i, pts2 = curTyphoonPoints(), p = pts2[i]; if (!p) return;
      pushUndo();
      const arr = labelList(), ex = arr.find((b) => b.idx === i);
      if (n.checked) { if (!ex) arr.push(makeTyphoonLabel(i, p)); }
      else if (ex) { setLabelList(arr.filter((b) => b.idx !== i)); sel = sel.filter((s) => !(s.kind === 'label' && s.id === ex.id)); }   // 전역 sel(선택배열)에서도 제거 — 이제 지역변수 issueSel로 이름 분리돼 정상 동작
      buildTyphoonPanel(); renderTyphoon(); renderSel(); refreshPanel();
    }; });
    list.querySelectorAll('.typLblTxt').forEach((n) => wireImeText(n, (v) => {
      const i = +n.dataset.i, b = labelList().find((x) => x.idx === i); if (!b) return;
      pushUndo('tyltxt'); b.txt = v; renderTyphoon();
      const s1 = one(); if (s1 && s1.kind === 'label' && s1.id === b.id) $('#lTxt').value = b.txt;
    }));
    list.querySelectorAll('.typExChk').forEach((n) => { n.onchange = () => {   // 온대저압부(저) 표시 토글
      const i = +n.dataset.i, p = curTyphoonPoints()[i]; if (!p) return;
      pushUndo(); p.ex = n.checked ? 1 : 0; renderTyphoon();
    }; });
  }
  const terr = $('#typTerrain'), terrV = $('#typTerrainV');
  if (terr) terr.value = (T.terrain == null ? 0.85 : T.terrain);
  if (terrV) terrV.textContent = Math.round((T.terrain == null ? 0.85 : T.terrain) * 100) + '%';
  buildTyphoonBands();
  const setPair = (c, h, v) => { const cc = $(c), hh = $(h); if (cc) cc.value = v; if (hh) hh.value = v; };
  setPair('#typLineColor', '#typLineColorHex', T.lineColor || '#E5231E');
  setPair('#typIconFill', '#typIconHex', T.iconCol || '#E5231E');
  setPair('#typKrFill', '#typKrFillHex', T.krFill || '#1C4E7E');
  setPair('#typKrStroke', '#typKrStrokeHex', T.krStroke || '#9FD0F5');
  setPair('#typLandFill', '#typLandFillHex', T.landFill || '#12325A');
  setPair('#typLandStroke', '#typLandStrokeHex', T.landStroke || '#3C6390');
  const w = $('#typKrW'); if (w) w.value = (T.krStrokeW == null ? 1.6 : T.krStrokeW);
  const kop = $('#typKrOp'), kopV = $('#typKrOpV'); const kv = (T.krOpacity == null ? 0.45 : T.krOpacity);
  if (kop) kop.value = kv; if (kopV) kopV.textContent = Math.round(kv * 100) + '%';
  { const ks = $('#typKrStrokeOp'), ksV = $('#typKrStrokeOpV'); const v = (T.krStrokeOp == null ? 1 : T.krStrokeOp); if (ks) ks.value = v; if (ksV) ksV.textContent = Math.round(v * 100) + '%'; }
  { const so = $('#typSidoOp'), soV = $('#typSidoOpV'); const v = (T.sidoOp == null ? 0.55 : T.sidoOp); if (so) so.value = v; if (soV) soV.textContent = Math.round(v * 100) + '%'; }
  const eye = $('#typKrEye'); if (eye) eye.classList.toggle('off', T.krShow === 0);
  // 시도 구분선
  setPair('#typSidoCol', '#typSidoColHex', T.sidoCol || T.krStroke || '#BFE3FF');
  const sidoW = $('#typSidoW'); if (sidoW) sidoW.value = (T.sidoW == null ? 0.8 : T.sidoW);
  const sidoEye = $('#typSidoEye'); if (sidoEye) sidoEye.classList.toggle('off', (T.sidoShow == null ? 1 : T.sidoShow) === 0);
  // 경위도 격자선(바다)
  setPair('#typGridCol', '#typGridColHex', T.gridCol || '#7FA8CC');
  const gridW = $('#typGridW'); if (gridW) gridW.value = (T.gridW == null ? 0.6 : T.gridW);
  const gridOp = $('#typGridOp'), gridOpV = $('#typGridOpV'); const gov = (T.gridOp == null ? 0.18 : T.gridOp);
  if (gridOp) gridOp.value = gov; if (gridOpV) gridOpV.textContent = Math.round(gov * 100) + '%';
  const gridEye = $('#typGridEye'); if (gridEye) gridEye.classList.toggle('off', (T.gridShow == null ? 1 : T.gridShow) === 0);
  // 3D 기울임 (전역 S.map3d)
  { const m = S.map3d || {}; const on = $('#tilt3dOn'); if (on) on.checked = !!m.on;
    const dg = $('#tilt3dDeg'), dv = $('#tilt3dDegV'); const d = (m.deg == null ? 14 : m.deg); if (dg) dg.value = d; if (dv) dv.textContent = d + '°';
    const pp = $('#tilt3dPersp'), pv = $('#tilt3dPerspV'); const p = (m.persp == null ? 2.2 : m.persp); if (pp) pp.value = p; if (pv) pv.textContent = p; }
  // 아이콘 종류/전체 크기
  const mode = T.iconMode || 'image';
  document.querySelectorAll('#typIconMode button').forEach((b) => b.classList.toggle('on', b.dataset.im === mode));
  const colRow = $('#typIconColRow'); if (colRow) colRow.style.display = (mode === 'image' || mode === 'dot') ? '' : 'none';   // 색은 이미지·작은원 모드
  const isc = $('#typIconScale'), iscV = $('#typIconScaleV'); const sv = (T.iconScale == null ? 1 : T.iconScale);
  if (isc) isc.value = sv; if (iscV) iscV.textContent = Math.round(sv * 100) + '%';
  // 글로우
  const gOn = $('#typGlowOn'); if (gOn) gOn.checked = (T.glowOn == null ? 1 : T.glowOn) ? true : false;
  const gStr = $('#typGlowStr'), gStrV = $('#typGlowStrV'); const gsv = (T.glowStr == null ? 0.5 : T.glowStr);
  if (gStr) gStr.value = gsv; if (gStrV) gStrV.textContent = Math.round(gsv * 100) + '%';
  const gc = $('#typGlowCol'), gh = $('#typGlowHex');
  if (gc) gc.value = T.glowCol || (T.iconCol || '#E5231E'); if (gh) gh.value = T.glowCol || '';
  // 표시 날짜 범위 — 입력칸(시각 단위 datetime-local) min/max를 경로 실제 기간으로, 기본값은 전체 범위
  const dts = pts.map((p) => typhoonDateTimeKST(p.tmef)).filter(Boolean).sort();
  const dMin = dts[0] || '', dMax = dts[dts.length - 1] || '';
  const rOn = $('#typRangeOn'), rF = $('#typRangeFrom'), rT = $('#typRangeTo');
  if (rOn) rOn.checked = !!T.rangeOn;
  if (rF) { rF.min = dMin; rF.max = dMax; rF.value = _typRangeNorm(T.rangeFrom, false) || dMin; }
  if (rT) { rT.min = dMin; rT.max = dMax; rT.value = _typRangeNorm(T.rangeTo, true) || dMax; }
}

// 반경 밴드 스타일 컨트롤(면색·투명도·외곽선색·굵기·점선) — 3밴드 동적 생성
function buildTyphoonBands() {
  const wrap = $('#typBands'); if (!wrap || !S.typhoon) return;
  const T = S.typhoon; T.bands = T.bands || {};
  const meta = [['r70', bandName('r70')], ['r15', bandName('r15')], ['r25', bandName('r25')]];   // 나라별 반경 이름
  wrap.innerHTML = '';
  for (const [key, label] of meta) {
    const st = Object.assign({}, TYPHOON_BAND_DEF[key], T.bands[key] || {});
    const fg = document.createElement('div'); fg.className = 'fieldGroup'; fg.style.marginBottom = '6px';
    if (st.off) fg.style.opacity = '.55';
    fg.innerHTML = `<div class="subhead" style="margin:2px 0;display:flex;align-items:center;gap:7px">`
      + `<button class="eye${st.off ? ' off' : ''}" data-b="${key}" data-eye="1" title="이 반경 표시/숨기기" style="flex:0 0 auto"></button>`
      + `<span>${label}</span></div>`
      + `<div class="row"><label>면 색</label><input type="color" data-b="${key}" data-f="fill" value="${st.fill}"><input type="range" data-b="${key}" data-f="fillOp" min="0" max="1" step="0.02" value="${st.fillOp}" title="채우기 투명도"></div>`
      + `<div class="row"><label>외곽선</label><input type="color" data-b="${key}" data-f="stroke" value="${st.stroke}"><input type="number" data-b="${key}" data-f="strokeW" step="0.5" min="0" max="10" style="flex:0 0 54px" value="${st.strokeW}"><label class="chk" style="flex:0 0 auto;gap:4px"><input type="checkbox" data-b="${key}" data-f="dash" ${st.dash ? 'checked' : ''}>점선</label></div>`;
    wrap.append(fg);
  }
  // 34노트 위험구역 여유(버퍼) — JTWC 위험구역(풍역+오차)처럼 15m/s(r15) 반경을 키운다. 0이면 실제 풍역 그대로.
  { const buf = +T.r15Buf || 0;
    const fg = document.createElement('div'); fg.className = 'fieldGroup'; fg.style.marginBottom = '6px';
    fg.innerHTML = `<div class="subhead" style="margin:2px 0">15m/s 위험구역 여유 <span>· JTWC처럼 크게</span></div>`
      + `<div class="row"><label>여유(km)</label><input type="range" id="typR15Buf" min="0" max="400" step="10" value="${buf}"><input type="number" id="typR15BufN" min="0" max="600" step="10" style="flex:0 0 60px" value="${buf}"></div>`;
    wrap.append(fg);
  }
  const apply = (el) => {
    const key = el.dataset.b, f = el.dataset.f;
    const b = (T.bands[key] = Object.assign({}, TYPHOON_BAND_DEF[key], T.bands[key] || {}));
    if (f === 'dash') b.dash = el.checked ? 1 : 0;
    else if (f === 'fill' || f === 'stroke') b[f] = el.value.toUpperCase();
    else b[f] = +el.value;
    renderTyphoon();
    if (f === 'fill') renderLegend();
  };
  wrap.querySelectorAll('input[type=color],input[type=number]').forEach((n) => { n.onchange = () => { pushUndo('typband'); apply(n); }; });
  wrap.querySelectorAll('input[type=range]').forEach((n) => { n.oninput = () => { pushUndo('typbandop'); apply(n); }; });
  wrap.querySelectorAll('input[type=checkbox]').forEach((n) => { n.onchange = () => { pushUndo(); apply(n); }; });
  wrap.querySelectorAll('button[data-eye]').forEach((n) => { n.onclick = () => {
    const key = n.dataset.b;
    const b = (T.bands[key] = Object.assign({}, TYPHOON_BAND_DEF[key], T.bands[key] || {}));
    pushUndo(); b.off = !b.off;
    buildTyphoonBands(); renderTyphoon(); renderLegend();   // UI(눈·흐림)·지도·범례 모두 갱신
  }; });
  { const sl = $('#typR15Buf'), nm = $('#typR15BufN');
    const setBuf = (v) => { T.r15Buf = Math.max(0, +v || 0); if (sl) sl.value = T.r15Buf; if (nm) nm.value = T.r15Buf; renderTyphoon(); };
    if (sl) sl.oninput = () => { pushUndo('r15buf'); setBuf(sl.value); };
    if (nm) nm.onchange = () => { pushUndo(); setBuf(nm.value); }; }
}

// ── 펜툴: 지도를 클릭해 태풍 경로를 직접 그린다(비교 지도 전용). 점마다 태풍점 → 새 비교 예보로. ──
let penMode = false, penPts = [];
let penEditId = null, penExtendId = null;   // 점 편집 중인 비교 트랙 / 이어그리기 중인 트랙
const compareById = (id) => ((S.typhoon && S.typhoon.compare) || []).find((c) => c.id === id) || null;
function updatePenBtn() { const b = $('#tycPen'); if (b) { b.classList.toggle('on', penMode); b.textContent = penMode ? '그리는 중… (Enter 완료 · Esc 취소)' : '펜툴로 경로 그리기'; } }
function clearPenPreview() { const g = document.getElementById('penPreview'); if (g) g.remove(); }
function renderPenPreview() {
  let g = document.getElementById('penPreview'); if (!g) { g = el('g', { id: 'penPreview' }); svg.appendChild(g); }
  g.textContent = '';
  if (!penPts.length) return;
  const scr = penPts.map((ll) => typhoonXY(ll.lon, ll.lat));
  if (scr.length > 1) g.appendChild(el('path', { d: 'M' + scr.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L'), fill: 'none', stroke: '#7FD0FF', 'stroke-width': 2.4, 'stroke-dasharray': '6 5', 'stroke-linecap': 'round' }));
  for (const p of scr) g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 5, fill: '#7FD0FF', stroke: '#FFFFFF', 'stroke-width': 1.5 }));
}
function startPen() {
  if (!isTyphoonCompare()) { status('펜툴은 태풍 비교 지도에서 씁니다', true); return; }
  penMode = !penMode;
  if (penMode) { penPts = []; status('지도를 클릭해 경로 점을 찍으세요 · Enter=완료 · Esc=취소', true); updatePenBtn(); }
  else finishPen();
}
function finishPen() {
  const pts = penPts.slice(); penPts = []; penMode = false; clearPenPreview(); updatePenBtn();
  if (pts.length < 2) { status('점을 2개 이상 찍어야 경로가 됩니다', true); return; }
  if (!S.typhoon) initTyphoonData();
  const cmp = (S.typhoon.compare ||= []);
  pushUndo();
  cmp.push({ id: 'cmp' + (seq++), name: '수동 경로 ' + (cmp.length + 1), color: CMP_PALETTE[cmp.length % CMP_PALETTE.length], show: 1, showIcons: 1, manual: true,
    points: pts.map((ll) => ({ lon: ll.lon, lat: ll.lat, ws: 30, r15: 0, r25: 0, r70: 0, tmef: '', label: '', fcst: false })) });
  buildCompareSection(); renderTyphoon(); renderLegend();
  status('수동 경로 추가됨 (' + pts.length + '점) — 카드에서 색·이름·아이콘 조절', true);
}
function cancelPen() { penMode = false; penPts = []; clearPenPreview(); updatePenBtn(); status('펜툴 취소', true); }
// 이어그리기 끝내기(점 편집은 유지)
function finishExtend() { if (!penExtendId) return; penExtendId = null; status('이어그리기 끝', true); if (isTyphoonCompare()) buildCompareSection(); renderTyphoon(); }
svg.addEventListener('pointerdown', (e) => {   // 캡처 단계 — 색칠/선택 핸들러보다 먼저 가로챈다
  if (e.button !== 0 || e.altKey) return;
  if (penMode) { e.preventDefault(); e.stopPropagation(); const p = toUser(e), ll = xyToLonLat(p.x, p.y); penPts.push(ll); renderPenPreview(); return; }
  if (penExtendId) { const c = compareById(penExtendId); if (c) { e.preventDefault(); e.stopPropagation(); const p = toUser(e), ll = xyToLonLat(p.x, p.y); (c.points ||= []).push({ lon: ll.lon, lat: ll.lat, ws: 30, r15: 0, r25: 0, r70: 0, tmef: '', label: '', fcst: false }); renderTyphoon(); } return; }
}, true);
// ── 참고 이미지(대고 그리기용, 최대 5개) + 프리 트랜스폼(이동·기준점 스케일[Shift=정비율]·회전) ──
const MAX_REF = 5;
// 배열로 통일(옛 단일 refImg는 배열로 마이그레이션). refImgs()=배열, refSelIdx()=편집 중(핸들 표시)인 인덱스.
function refImgs() { const T = S.typhoon; if (!T) return []; if (T.refImg && !T.refImgs) { T.refImgs = [T.refImg]; delete T.refImg; } return T.refImgs || (T.refImgs = []); }
function refSelIdx() { const T = S.typhoon; if (!T) return -1; const a = refImgs(); if (!a.length) return -1; if (T.refSel == null || T.refSel < 0 || T.refSel >= a.length) T.refSel = a.length - 1; return T.refSel; }
const refImg = () => { const a = refImgs(), i = refSelIdx(); return i >= 0 ? a[i] : null; };   // 선택된 이미지(컨트롤 대상)
const _rotPt = (px, py, cx, cy, rad) => { const c = Math.cos(rad), s = Math.sin(rad), dx = px - cx, dy = py - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
function _ftDrag(e, onMove) {
  e.preventDefault(); e.stopPropagation();
  const mv = (ev) => onMove(toUser(ev), ev);
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function clearRefImgLayer() { const g = document.getElementById('L_refImg'); if (g) g.remove(); }
function renderRefImg() {
  clearRefImgLayer();
  if (!isTyphoonCompare()) return;
  const arr = refImgs(); if (!arr.length) return;
  const g = el('g', { id: 'L_refImg' }); svg.appendChild(g);
  // 참고 이미지(본체·모서리·회전·기준점 어느 핸들이든) → '태풍 비교' 섹션. 핸들들이 전파를 막으므로 캡처 단계에서.
  g.addEventListener('pointerdown', (e) => { if (e.button === 0) revealSecFor('refImg'); }, true);
  const editing = !penMode && !penExtendId;   // 트레이싱(펜) 중엔 핸들 숨기고 클릭이 통과되게(대고 그리기)
  const sel = refSelIdx();
  arr.forEach((ri, i) => {
    if (!ri || !ri.href || ri.show === 0) return;
    if (ri.px == null) ri.px = ri.x + ri.w / 2;
    if (ri.py == null) ri.py = ri.y + ri.h / 2;
    const inner = el('g', { transform: `rotate(${ri.rot || 0} ${ri.px} ${ri.py})` }); g.appendChild(inner);   // 회전=기준점 중심
    inner.appendChild(el('image', { href: ri.href, x: ri.x, y: ri.y, width: ri.w, height: ri.h, opacity: (ri.op == null ? 0.6 : ri.op), preserveAspectRatio: 'none', style: 'pointer-events:none' }));
    if (!editing) return;
    if (i !== sel) {   // 선택 안 된 이미지 — 옅은 테두리, 클릭하면 선택(그 이미지에 핸들)
      const pick = el('rect', { x: ri.x, y: ri.y, width: ri.w, height: ri.h, fill: '#7FD0FF', 'fill-opacity': 0.001, stroke: '#7FD0FF', 'stroke-opacity': 0.45, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', style: 'cursor:pointer' });
      inner.appendChild(pick);
      pick.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); S.typhoon.refSel = i; renderRefImg(); buildCompareSection(); status('참고 이미지 ' + (i + 1) + ' 선택', true); });
      return;
    }
    // 선택된 이미지 — 이동/스케일/회전/기준점 핸들
    const body = el('rect', { x: ri.x, y: ri.y, width: ri.w, height: ri.h, fill: '#7FD0FF', 'fill-opacity': 0.001, stroke: '#3B82F6', 'stroke-width': 2, 'stroke-dasharray': '7 5', style: 'cursor:move' });
    inner.appendChild(body);
    body.addEventListener('pointerdown', (e) => { const o = { x: ri.x, y: ri.y, px: ri.px, py: ri.py }, s = toUser(e); pushUndo(); _ftDrag(e, (P) => { const dx = P.x - s.x, dy = P.y - s.y; ri.x = Math.round(o.x + dx); ri.y = Math.round(o.y + dy); ri.px = Math.round(o.px + dx); ri.py = Math.round(o.py + dy); renderRefImg(); }); });
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sy] of corners) {
      const hx = sx < 0 ? ri.x : ri.x + ri.w, hy = sy < 0 ? ri.y : ri.y + ri.h;
      const h = el('rect', { x: hx - 8, y: hy - 8, width: 16, height: 16, rx: 3, fill: '#FFFFFF', stroke: '#3B82F6', 'stroke-width': 2, style: 'cursor:nwse-resize' });
      inner.appendChild(h);
      h.addEventListener('pointerdown', (e) => {
        const r0 = Object.assign({}, ri), rad = (r0.rot || 0) * Math.PI / 180;
        const rx = sx < 0 ? r0.x : r0.x + r0.w, ry = sy < 0 ? r0.y : r0.y + r0.h;
        pushUndo();
        _ftDrag(e, (P, ev) => {
          const PL = _rotPt(P.x, P.y, r0.px, r0.py, -rad);
          let sxr = (PL[0] - r0.px) / ((rx - r0.px) || 1e-6), syr = (PL[1] - r0.py) / ((ry - r0.py) || 1e-6);
          if (ev.shiftKey) { const s2 = Math.max(sxr, syr); sxr = s2; syr = s2; }
          sxr = Math.max(0.03, sxr); syr = Math.max(0.03, syr);
          ri.w = Math.max(24, Math.round(r0.w * sxr)); ri.h = Math.max(24, Math.round(r0.h * syr));
          ri.x = Math.round(r0.px + (r0.x - r0.px) * sxr); ri.y = Math.round(r0.py + (r0.y - r0.py) * syr);
          renderRefImg();
        });
      });
    }
    const rhx = ri.x + ri.w / 2;
    inner.appendChild(el('line', { x1: rhx, y1: ri.y, x2: rhx, y2: ri.y - 26, stroke: '#7FD0FF', 'stroke-width': 1.5, style: 'pointer-events:none' }));
    const rh = el('circle', { cx: rhx, cy: ri.y - 26, r: 8, fill: '#3B82F6', stroke: '#FFFFFF', 'stroke-width': 2, style: 'cursor:grab' });
    inner.appendChild(rh);
    rh.addEventListener('pointerdown', (e) => { pushUndo(); _ftDrag(e, (P, ev) => { let ang = Math.atan2(P.y - ri.py, P.x - ri.px) * 180 / Math.PI + 90; ri.rot = ev.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang * 10) / 10; renderRefImg(); }); });
    const pv = el('g', { transform: `translate(${ri.px} ${ri.py})`, style: 'cursor:move' });
    pv.appendChild(el('circle', { r: 11, fill: 'rgba(0,0,0,0.25)', stroke: '#FFD400', 'stroke-width': 2 }));
    pv.appendChild(el('path', { d: 'M-15 0H15M0 -15V15', stroke: '#FFD400', 'stroke-width': 1.3, 'stroke-opacity': 0.8, style: 'pointer-events:none' }));
    pv.appendChild(el('circle', { r: 3.2, fill: '#FFD400' }));
    g.appendChild(pv);
    pv.addEventListener('pointerdown', (e) => { const o = { px: ri.px, py: ri.py }, s = toUser(e); pushUndo(); _ftDrag(e, (P) => { ri.px = Math.round(o.px + (P.x - s.x)); ri.py = Math.round(o.py + (P.y - s.y)); renderRefImg(); }); });
  });
}
// 이미지 파일 → 참고 이미지 목록에 추가(최대 5개). 새로 추가한 걸 선택 상태로.
function loadRefImgFromFile(file) {
  if (!file || !/^image\//.test(file.type)) { status('이미지 파일이 아닙니다', true); return; }
  if (!S.typhoon) initTyphoonData();
  if (refImgs().length >= MAX_REF) { status('참고 이미지는 최대 ' + MAX_REF + '개입니다 — 하나 지우고 추가하세요', true); return; }
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const maxW = 1920 * 0.6, sc = Math.min(1, maxW / im.width), w = Math.round(im.width * sc), h = Math.round(im.height * sc);
      // 원본 data URI를 그대로 S에 넣으면 undo 스냅샷·자동저장(localStorage)이 수 MB씩 커져 저장이 멈춘다 →
      // 긴 변 1920px 이하로 줄여 webp(투명 유지)로 다시 인코딩한다. 실패하면 원본.
      let href = rd.result;
      if (!/svg/i.test(file.type) && im.width > 0 && im.height > 0) try {   // SVG(벡터·크기 없을 수 있음)는 그대로
        const k =Math.min(1, 1920 / Math.max(im.width, im.height)), cw = Math.max(1, Math.round(im.width * k)), ch = Math.max(1, Math.round(im.height * k));
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
        const enc = cv.toDataURL('image/webp', 0.88);
        if (/^data:image\/webp/.test(enc) && enc.length < href.length) href = enc;
      } catch (e) { /* 원본 유지 */ }
      pushUndo();
      const arr = refImgs();
      const off = arr.length * 24;   // 겹치지 않게 살짝 어긋나게
      const rx0 = Math.round(960 - w / 2 + off), ry0 = Math.round(540 - h / 2 + off);
      arr.push({ href, x: rx0, y: ry0, w, h, rot: 0, op: 0.6, show: 1, px: Math.round(rx0 + w / 2), py: Math.round(ry0 + h / 2) });
      S.typhoon.refSel = arr.length - 1;
      buildCompareSection(); renderRefImg();
      status('참고 이미지 추가 (' + arr.length + '/' + MAX_REF + ') — 노란 기준점 기준으로 크기(Shift=정비율)·회전, 본체 드래그=이동, Delete=삭제', true);
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(file);
}
// 한글(IME) 안전 텍스트 입력 — 조합(compositionstart~end) 중엔 리렌더를 미뤄 한글 조합이 끊기지 않게 하고,
// 조합이 끝나거나(한글) 그냥 입력되면(영문) apply(value)를 부른다. 간헐적 한글 입력 버그 방지.
function wireImeText(input, apply) {
  if (!input) return;
  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; apply(input.value); });
  input.addEventListener('input', () => { if (!composing) apply(input.value); });
}
// 태풍 비교 지도 패널 핸들러 1회 배선
function wireCompareSection() {
  const f = $('#tycFetch'); if (f) f.onclick = () => { if (typeof fetchTyphoon === 'function') fetchTyphoon(); else status('태풍 API 연동 준비 중', true); };
  const fj = $('#tycFetchJma'); if (fj) fj.onclick = fetchJma;
  const dl = $('#tycJtwcDl'); if (dl) dl.onclick = () => { window.open('https://www.metoc.navy.mil/jtwc/jtwc.html', '_blank', 'noopener'); status('JTWC 통보문(.tcw)을 받아 붙여넣거나 창에 끌어다 놓으세요', true); };
  const pa = $('#tycPasteApply'); if (pa) pa.onclick = () => { const t = $('#tycPaste'); if (t && t.value.trim()) { pushUndo(); applyTyphoonText(t.value); } else status('붙여넣은 내용이 없습니다', true); };
  const add = $('#tycAdd'); if (add) add.onclick = () => addCompareForecast();
  const pen = $('#tycPen'); if (pen) pen.onclick = startPen;
  const play = $('#tycPlay'); if (play) play.onclick = playTyphoon;
  const which = $('#tycWhichSel'); if (which) which.onchange = () => selectTyphoonFromApi(+which.value, { fromSel: true });   // 비교 지도: 목록에서 고르면 그 태풍도 비교에 추가(fromSel이 되돌리기 기록)
  const lg = $('#tycLegend'); if (lg) lg.onchange = () => { pushUndo(); (S.legend ||= {}).on = lg.checked ? 1 : 0; renderLegend(); };
  // 참고 이미지
  const drop = $('#tycRefDrop'), file = $('#tycRefFile');
  if (drop && file) {
    drop.onclick = () => file.click();
    const hot = (on) => { drop.classList.toggle('drophot', on); const h = $('#dropHint'); if (h && on) h.classList.remove('on'); };   // 박스 위에선 전체창 오버레이 숨기고 박스 강조
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; hot(true); }));
    drop.addEventListener('dragleave', (e) => { e.stopPropagation(); hot(false); });
    drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); hot(false); dropHintReset(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadRefImgFromFile(f); });
    file.onchange = () => { if (file.files && file.files[0]) loadRefImgFromFile(file.files[0]); file.value = ''; };
  }
  const rShow = $('#tycRefShow'); if (rShow) rShow.onchange = () => { const ri = refImg(); if (!ri) return; pushUndo(); ri.show = rShow.checked ? 1 : 0; renderRefImg(); buildCompareSection(); };
  const rOp = $('#tycRefOp'); if (rOp) rOp.oninput = () => { const ri = refImg(); if (!ri) return; pushUndo('refop'); ri.op = +rOp.value; const v = $('#tycRefOpV'); if (v) v.textContent = Math.round(rOp.value * 100) + '%'; renderRefImg(); };
  const rRem = $('#tycRefRemove'); if (rRem) rRem.onclick = () => { if (!S.typhoon) return; const a = refImgs(), i = refSelIdx(); if (i < 0) return; pushUndo(); a.splice(i, 1); S.typhoon.refSel = a.length - 1; clearRefImgLayer(); buildCompareSection(); renderRefImg(); };
}
// 태풍 사이드바 핸들러 1회 배선
function wireTyphoonPanel() {
  const T = () => (S.typhoon || (initTyphoonData(), S.typhoon));
  const sel = $('#typIssueSel'); if (sel) sel.onchange = () => { pushUndo(); T().sel = +sel.value; renderTyphoon(); };
  const play = $('#typPlay'); if (play) play.onclick = playTyphoon;
  const fit = $('#typFit'); if (fit) fit.onclick = () => { pushUndo(); setTyphoonDefaultView(); renderAll(); status('광역 화면으로 맞춤'); };
  const open = $('#typOpen'); if (open) open.onclick = () => { window.open(typhoonApiUrl(1), '_blank'); };   // 1시간 전(발표 있는 시각)으로 열기
  const pasteApply = $('#typPasteApply'); if (pasteApply) pasteApply.onclick = () => { const t = $('#typPaste'); if (t && t.value.trim()) { pushUndo(); applyTyphoonText(t.value); } else status('붙여넣은 내용이 없습니다', true); };
  const addTD = $('#typAddTD'); if (addTD) addTD.onclick = prependGenesisTD;
  const fetchB = $('#typFetch'); if (fetchB) fetchB.onclick = () => { if (typeof fetchTyphoon === 'function') fetchTyphoon(); else status('태풍 API 연동은 곧 추가됩니다 (기존 특보 키 사용 예정)', true); };
  const pastB = $('#typPastFetch'); if (pastB) pastB.onclick = () => fetchTyphoonPast();
  const fetchJmaB = $('#typFetchJma'); if (fetchJmaB) fetchJmaB.onclick = fetchJma;
  const jtwcDl = $('#typJtwcDl'); if (jtwcDl) jtwcDl.onclick = () => { window.open('https://www.metoc.navy.mil/jtwc/jtwc.html', '_blank', 'noopener'); status('JTWC 사이트에서 통보문(.tcw)을 받아 창에 끌어다 놓거나 수동 붙여넣기 하세요', true); };
  const bindCol = (colId, hexId, apply) => {
    const c = $(colId), h = $(hexId);
    const set = (v) => { v = (v || '').toUpperCase(); if (!/^#[0-9A-F]{6}$/.test(v)) return; if (c) c.value = v; if (h) h.value = v; pushUndo('typcol'); apply(v); renderTyphoon(); };
    if (c) c.oninput = () => set(c.value);
    if (h) h.onchange = () => set(h.value);
  };
  bindCol('#typIconFill', '#typIconHex', (v) => T().iconCol = v);
  bindCol('#typKrFill', '#typKrFillHex', (v) => T().krFill = v);
  bindCol('#typKrStroke', '#typKrStrokeHex', (v) => T().krStroke = v);
  bindCol('#typLandFill', '#typLandFillHex', (v) => T().landFill = v);
  bindCol('#typLandStroke', '#typLandStrokeHex', (v) => T().landStroke = v);
  const w = $('#typKrW'); if (w) w.oninput = () => { pushUndo('typw'); T().krStrokeW = +w.value; renderTyphoon(); };
  const eye = $('#typKrEye'); if (eye) eye.onclick = () => { pushUndo(); const t = T(); t.krShow = t.krShow === 0 ? 1 : 0; eye.classList.toggle('off', t.krShow === 0); renderTyphoon(); };
  // 시도 구분선
  bindCol('#typSidoCol', '#typSidoColHex', (v) => T().sidoCol = v);
  const sidoW = $('#typSidoW'); if (sidoW) sidoW.oninput = () => { pushUndo('typsidow'); T().sidoW = +sidoW.value; renderTyphoon(); };
  const sidoEye = $('#typSidoEye'); if (sidoEye) sidoEye.onclick = () => { pushUndo(); const t = T(); const cur = (t.sidoShow == null ? 1 : t.sidoShow); t.sidoShow = cur === 0 ? 1 : 0; sidoEye.classList.toggle('off', t.sidoShow === 0); renderTyphoon(); };
  // 경위도 격자선(바다)
  bindCol('#typGridCol', '#typGridColHex', (v) => T().gridCol = v);
  const gridW = $('#typGridW'); if (gridW) gridW.oninput = () => { pushUndo('typgridw'); T().gridW = +gridW.value; renderTyphoon(); };
  const gridOp = $('#typGridOp'); if (gridOp) gridOp.oninput = () => { pushUndo('typgridop'); T().gridOp = +gridOp.value; const v = $('#typGridOpV'); if (v) v.textContent = Math.round(gridOp.value * 100) + '%'; renderTyphoon(); };
  const gridEye = $('#typGridEye'); if (gridEye) gridEye.onclick = () => { pushUndo(); const t = T(); const cur = (t.gridShow == null ? 1 : t.gridShow); t.gridShow = cur === 0 ? 1 : 0; gridEye.classList.toggle('off', t.gridShow === 0); renderTyphoon(); };
  // 3D 기울임 (전역)
  const t3On = $('#tilt3dOn'); if (t3On) t3On.onchange = () => { pushUndo(); (S.map3d ||= { deg: 14, persp: 2.2 }).on = t3On.checked ? 1 : 0; applyTilt(); };
  const t3Deg = $('#tilt3dDeg'); if (t3Deg) t3Deg.oninput = () => { pushUndo('tilt3d'); (S.map3d ||= {}).deg = +t3Deg.value; const v = $('#tilt3dDegV'); if (v) v.textContent = t3Deg.value + '°'; applyTilt(); };
  const t3P = $('#tilt3dPersp'); if (t3P) t3P.oninput = () => { pushUndo('tilt3dp'); (S.map3d ||= {}).persp = +t3P.value; const v = $('#tilt3dPerspV'); if (v) v.textContent = t3P.value; applyTilt(); };
  const kop = $('#typKrOp'); if (kop) kop.oninput = () => { pushUndo('typkrop'); T().krOpacity = +kop.value; const v = $('#typKrOpV'); if (v) v.textContent = Math.round(kop.value * 100) + '%'; renderTyphoon(); };
  const ksop = $('#typKrStrokeOp'); if (ksop) ksop.oninput = () => { pushUndo('typkrsop'); T().krStrokeOp = +ksop.value; const v = $('#typKrStrokeOpV'); if (v) v.textContent = Math.round(ksop.value * 100) + '%'; renderTyphoon(); };
  const sop = $('#typSidoOp'); if (sop) sop.oninput = () => { pushUndo('typsidoop'); T().sidoOp = +sop.value; const v = $('#typSidoOpV'); if (v) v.textContent = Math.round(sop.value * 100) + '%'; renderTyphoon(); };
  const now = $('#typNow'); if (now) now.oninput = () => { pushUndo('typnow'); T().nowIdx = +now.value; const pts = curTyphoonPoints(); const nv = $('#typNowV'); if (nv) nv.textContent = (pts[+now.value] && pts[+now.value].label) || now.value; renderTyphoon(); };
  const terr = $('#typTerrain'); if (terr) terr.oninput = () => { pushUndo('typterr'); T().terrain = +terr.value; const tv = $('#typTerrainV'); if (tv) tv.textContent = Math.round(terr.value * 100) + '%'; renderTyphoon(); };
  // 아이콘 종류(이미지/강도숫자)
  document.querySelectorAll('#typIconMode button').forEach((b) => { b.onclick = () => {
    pushUndo(); T().iconMode = b.dataset.im;
    document.querySelectorAll('#typIconMode button').forEach((x) => x.classList.toggle('on', x === b));
    const cr = $('#typIconColRow'); if (cr) cr.style.display = (b.dataset.im === 'image' || b.dataset.im === 'dot') ? '' : 'none';
    renderTyphoon();
  }; });
  const isc = $('#typIconScale'); if (isc) isc.oninput = () => { pushUndo('typiconsc'); T().iconScale = +isc.value; const v = $('#typIconScaleV'); if (v) v.textContent = Math.round(isc.value * 100) + '%'; renderTyphoon(); };
  document.querySelectorAll('#typTrackMode button').forEach((b) => { b.onclick = () => {
    pushUndo(); T().trackMode = b.dataset.tm === 'line' ? 'line' : 'full';
    document.querySelectorAll('#typTrackMode button').forEach((x) => x.classList.toggle('on', x === b));
    renderTyphoon(); renderLegend();   // 라인 모드는 범례의 반경 항목도 빠짐
    buildTimeline();   // 라인 모드면 라벨 하위 행을 빼고, 일반 모드면 다시 보인다
  }; });
  bindCol('#typLineColor', '#typLineColorHex', (v) => T().lineColor = v);
  const lineW = $('#typLineWidth'); if (lineW) lineW.oninput = () => { pushUndo('typlinew'); T().lineWidth = +lineW.value; const v = $('#typLineWidthV'); if (v) v.textContent = lineW.value + 'px'; renderTyphoon(); };
  // 글로우
  const gOn = $('#typGlowOn'); if (gOn) gOn.onchange = () => { pushUndo(); T().glowOn = gOn.checked ? 1 : 0; renderTyphoon(); };
  const gStr = $('#typGlowStr'); if (gStr) gStr.oninput = () => { pushUndo('typglow'); T().glowStr = +gStr.value; const v = $('#typGlowStrV'); if (v) v.textContent = Math.round(gStr.value * 100) + '%'; renderTyphoon(); };
  bindCol('#typGlowCol', '#typGlowHex', (v) => T().glowCol = v);
  const gAuto = $('#typGlowAuto'); if (gAuto) gAuto.onclick = () => { pushUndo(); T().glowCol = ''; const gh = $('#typGlowHex'); if (gh) gh.value = ''; const gc = $('#typGlowCol'); if (gc) gc.value = T().iconCol || '#E5231E'; renderTyphoon(); };
  // 표시 날짜 범위
  const rOn = $('#typRangeOn'); if (rOn) rOn.onchange = () => { pushUndo(); const t = T(); t.rangeOn = rOn.checked ? 1 : 0; if (t.rangeOn) { const rF = $('#typRangeFrom'), rT = $('#typRangeTo'); if (rF && !t.rangeFrom) t.rangeFrom = rF.value; if (rT && !t.rangeTo) t.rangeTo = rT.value; } renderTyphoon(); };
  const rF = $('#typRangeFrom'); if (rF) rF.onchange = () => { pushUndo(); T().rangeFrom = rF.value; renderTyphoon(); };
  const rT = $('#typRangeTo'); if (rT) rT.onchange = () => { pushUndo(); T().rangeTo = rT.value; renderTyphoon(); };
  const kin = $('#typKey'); if (kin) { kin.value = typKey(); kin.oninput = (e) => localStorage.setItem(TYP_KEY_STORE, e.target.value.trim()); }
  const which = $('#typWhichSel'); if (which) which.onchange = () => selectTyphoonFromApi(+which.value, { fromSwitch: true, fromSel: true });   // 전환도 되돌리기 가능(fromSel이 기록)
  const nmeIn = $('#typName');   // 이름 입력 → 번호별 저장 + 라벨/제목/드롭다운 즉시 반영
  if (nmeIn) nmeIn.oninput = (e) => {
    const T = S.typhoon; if (!T) return;
    const cur = (T.whichList || [])[T.whichSel || 0];
    if (!cur || cur.td || !cur.year) return;
    typNameSet(cur.year, cur.tno, e.target.value);
    refreshTyphoonNames();
  };
}

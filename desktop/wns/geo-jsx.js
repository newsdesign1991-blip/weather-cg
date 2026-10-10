'use strict';
// AE로 보내기 'GEOlayers 지도로'(앱 스펙 mode:'geolayers' + geo 명세 — js/ae-geo.js aeGeoSpec) → After Effects용 .jsx (10-10).
// 지금 jsx(ae-jsx.js buildAeJsx — helper.py와 바이트 동일)는 한 글자도 안 바꾸고 그대로 가운데에 넣는다(첫 줄 '실행 취소 묶음 열기'만 ①로 당겨 쓴다):
//   ① GEOlayers 확인·맵 컴프 찾기(못 하면 한국어 알림으로 멈춤 — 아무것도 안 만든다) → 실행 취소 묶음 열기 → 맵 컴프 복제
//      (복제를 못 하면 이번에 생긴 것만 지우고 알림으로 멈춤 — 사용자의 원래 맵 컴프는 읽기만 한다)
//   ② 기존 jsx(제목·범례·태풍 리깅 — 리깅 카메라는 항등 위치·배율 키라 CAM 널, 앱 카메라에 회전이 있으면 ROT 널도)
//   ③ 복제본을 우리 컴프 맨 아래에 · 보기 키(프레임마다) · 리깅 CAM 널을 GEOlayers 앵커에 표현식으로 묶기(ROT는 CAM 방향을 따라 라벨 박스를 돌림) · 남한 강조(스크린)
//   ④ (비동기, 패널이 처리) 태풍 GeoJSON을 draw로 GEOlayers 셰이프로 그려 꺼 두기 → finalize(타일 받기) → 알림·기록(geo_log.txt)
//      패널이 답하지 않으면(패널을 닫음) 일정 시간 뒤 알림(app.scheduleTask)
// mode·geo가 없는 스펙은 이 파일을 지나지 않는다(server.js) — 옛 출력 그대로(golden 시험).
// GEOlayers 3 스크립트 API(설치판 1.17.0 help.html·README): 전역 geolayers3는 GEOlayers 패널이 연 엔진에만 있다.
//   맵 컴프를 새로 만드는 공개 함수는 없다 → 사용자가 열어 둔(또는 고른) 맵 컴프를 duplicate로 복제해 쓴다.
//   확정 못 한 부분(draw 콜백·스타일 값 뜻)은 typeof·try로 감싸 실패해도 나머지는 진행하고 알림·기록에 남긴다.
//   duplicate 반환값은 모양을 확정 못 해 '담는 컴프·맵 컴프가 둘 다 이번에 새로 생긴 것'일 때만 쓴다(아니면 멈춤 — 원본을 고치는 길은 없다).
const { buildAeJsx, js } = require('./ae-jsx');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, dv) => (typeof v === 'number' && Number.isFinite(v) ? v : dv);
const hex6 = (v, dv) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : dv);
// jsx 숫자 글자(12자리 — 좌표·zoom에 충분, 지수 표기도 ES3 숫자 글자)
const numLit = (x) => { const r = +(+x).toPrecision(12); return Object.is(r, -0) ? '0' : String(r); };
// 값 → ES3 jsx 글자(문자열은 \uXXXX — 파일은 ASCII만)
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? numLit(v) : '0';
  if (typeof v === 'string') return '"' + js(v) + '"';
  if (Array.isArray(v)) return '[' + v.map(lit).join(',') + ']';
  return '{' + Object.keys(v).map((k) => '"' + js(k) + '":' + lit(v[k])).join(',') + '}';
}
const q = (s) => '"' + js(s) + '"';   // 한국어 문자열 → jsx 글자

// 이 스펙이 GEOlayers 길인가 — server.js가 이걸로 나눈다
const isGeoSpec = (spec) => isObj(spec) && spec.mode === 'geolayers' && isObj(spec.geo);

// 보내기 폴더에 저장할 GeoJSON — geo.typhoon.geojson의 키마다 geo_<키>.geojson(이름은 정해진 꼴만 — 경로 문자 막기) + 모두 합친 typhoon.geojson
const GEO_KEY = /^[a-z][a-z0-9]{0,11}$/;
function geoFiles(spec) {
  const t = isGeoSpec(spec) && isObj(spec.geo.typhoon) ? spec.geo.typhoon : null;
  const fc = t && isObj(t.geojson) ? t.geojson : {};
  const out = [], all = [];
  for (const k of Object.keys(fc)) {
    const c = fc[k];
    if (!GEO_KEY.test(k) || !isObj(c) || c.type !== 'FeatureCollection' || !Array.isArray(c.features) || !c.features.length) continue;
    out.push({ key: k, name: 'geo_' + k + '.geojson', text: JSON.stringify(c) });
    for (const f of c.features) all.push(f);
  }
  if (all.length) out.push({ key: null, name: 'typhoon.geojson', text: JSON.stringify({ type: 'FeatureCollection', features: all }) });
  return out;
}

// GEOlayers 셰이프 스타일 객체(설치판 main.js defaultDrawingOptions 모양 — 색 {r,g,b 0~255, a 0~1}, 끝·이음 2 = 둥글게).
// dashVal은 0~1 값으로 보인다(기본 '점선 3px' 스타일 0.716) — 뜻을 확정 못 해 점선이면 0.6(비슷하게만).
// 채움 불투명도 0은 채움 끄기로 넘긴다 — 설치판 normalizeDrawingOption이 'opacity: fillOpacity || 100'이라 0을 100(완전 불투명)으로 바꾼다.
function styleOf(d) {
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; };
  const col = hex6(d.col, '#FFFFFF'), w = Math.max(0, num(d.w, 0));
  if (d.kind === 'fill') {
    const fo = Math.round(Math.min(1, Math.max(0, num(d.op, 0.3))) * 100);
    return { name: String(d.name || ''), fill: { addFill: fo > 0, fillColor: rgb(col), randomizeColors: false, opacity: fo > 0 ? fo : 100 },
      stroke: { addStroke: w > 0, strokeColor: rgb(hex6(d.stroke, col)), sameColorAsFill: false, strokeWidth: w > 0 ? w : 1, strokeCap: 2, strokeJoin: 2, dashVal: d.dash ? 0.6 : 0, opacity: 100 }, extrusion: 0 };
  }
  return { name: String(d.name || ''), fill: { addFill: false, fillColor: rgb(col), randomizeColors: false, opacity: 100 },
    stroke: { addStroke: true, strokeColor: rgb(col), sameColorAsFill: false, strokeWidth: w > 0 ? w : 2, strokeCap: 2, strokeJoin: 2, dashVal: d.dash ? 0.6 : 0, opacity: 100 }, extrusion: 0 };
}

// 보기 [위도, 경도, zoom, bearing] — 형식이 틀리면 null
function viewOf(v) {
  if (!isObj(v)) return null;
  const la = num(v.latitude, null), lo = num(v.longitude, null), z = num(v.zoom, null);
  if (la === null || lo === null || z === null) return null;
  return [la, lo, z, num(v.bearing, 0)];
}
// 프레임마다 보기 [[시각, 위도, 경도, zoom, bearing], …] — 시각이 늘어나는 줄만, 2줄 이상일 때만
function framesOf(f) {
  if (!isObj(f) || !Array.isArray(f.rows)) return null;
  const rows = [];
  for (const r of f.rows) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const a = r.slice(0, 5).map((x) => num(x, null));
    if (a.some((x) => x === null)) continue;
    if (rows.length && a[0] <= rows[rows.length - 1][0]) continue;
    rows.push(a);
  }
  return rows.length >= 2 ? rows : null;
}

// ── 알림·기록 문구(한국어 — jsx에는 \uXXXX로) ──
const MSG = {
  noPanel: 'GEOlayers 3 패널이 열려 있지 않아요.\n\nAE 메뉴 창(Window) > 확장(Extensions) > GEOlayers 3 으로 패널을 열어 두고 다시 보내 주세요.\n(패널에서 위성 이미지로 맵 컴프를 하나 만들어 두면 그 맵 컴프를 복제해 얹어요.)\n\n메뉴에 GEOlayers 3가 없거나 패널이 뜨지 않으면, 설치된 GEOlayers 3가 이 AE 버전을 지원하는지도 확인해 주세요@RANGE@.',
  range: ' — 설치판 @VER@: AE @LO@~@HI@',
  aeVer: 'GEOlayers 3 패널이 이 AE에서는 뜨지 않아요.\n\n이 AE는 @AE@판인데, 설치된 GEOlayers 3@VER@는 AE @LO@~@HI@만 지원해요.\nGEOlayers 3를 새 판으로 올리거나, 지원하는 AE에서 다시 보내 주세요.',
  none: 'GEOlayers 맵 컴프를 못 찾았어요.\n\nGEOlayers 3 패널에서 새 맵 컴프를 만들고(위성 이미지 고르기, 크기 @W@×@H@) 그 컴프를 열어 둔 채 다시 보내 주세요.',
  many: 'GEOlayers 맵 컴프가 여러 개예요.\n\n쓸 맵 컴프(또는 그것을 담은 컴프)를 열어 두거나 프로젝트 창에서 고른 뒤 다시 보내 주세요.',
  head: 'GEOlayers 지도로 보냈어요',
  bad: '안 된 것',
  logAt: '기록',
  dup: '맵 컴프 복제: ',
  noDup: '맵 컴프를 복제하지 못해 멈췄어요 — 아무것도 만들지 않았고, 원래 맵 컴프도 건드리지 않았어요.\n\nGEOlayers 3 패널이 열려 있는지 보고 다시 보내 주세요. 계속 안 되면 GEOlayers 패널에서 맵 컴프를 직접 복제해 그것을 열어 둔 채 보내 주세요.\n\n복제하려던 맵 컴프: ',
  dupErr: '\n오류: ',
  mapcompsErr: '맵 컴프 목록(getMapcomps)을 못 읽었어요: ',
  lenErr: '맵 컴프 길이를 못 늘렸어요(GEOlayers에서 길이를 늘려 주세요): ',
  lenNote: '맵 컴프 길이를 우리 컴프 길이에 맞춰 늘렸어요 — 끝부분에 타일이 안 나오면 GEOlayers에서 맵 컴프 길이를 맞추고 마무리(Finalize)를 다시 눌러 주세요',
  view1: '보기 1개(키 없음)',
  zoomClip: 'GEOlayers가 보기 Zoom을 바꿔 넣었어요(이미지 범위) — 태풍은 지도를 따라가지만 화면 구도가 앱과 다를 수 있어요. 요청 → 적용: ',
  viewN: '보기 키 — 프레임마다 @N@개(앱 카메라와 같은 움직임, 위도·경도·Zoom·Bearing)',
  viewViaApi: '보기 키 — setViewAtTime으로 넣은 개수: ',
  viewErr: '보기를 넣지 못했어요: ',
  removeErr: '맵 컴프의 옛 보기 키를 못 지웠어요: ',
  tilt: '앱 카메라 기울기(rx)는 옮기지 않았어요 — GEOlayers Pitch 0(태풍 리깅이 2D라 기울이면 어긋남)',
  camOk: '태풍 리깅(CAM)이 GEOlayers 앵커를 따라가요 — AE에서 보기를 고쳐도 태풍이 지도에 붙어 있어요',
  camNone: '태풍 리깅 CAM 널을 못 찾아 보기에 묶지 못했어요',
  camErr: 'CAM 표현식을 못 넣었어요: ',
  rotOk: '라벨 박스·지시선이 지도 방향(Bearing)을 따라 화면 가운데 기준으로 돌아요(ROT 널)',
  rotErr: '라벨 회전(ROT) 표현식을 못 넣었어요 — 라벨 박스는 앱 카메라 회전 키대로만 돌아요: ',
  anchorGuess: '앵커 레이어 이름을 API로 못 얻어 짐작했어요: ',
  kr: '남한 강조 — 스크린 혼합',
  krErr: '남한 강조 레이어를 못 만들었어요: ',
  draw: 'GEOlayers 셰이프(편집용, 꺼 둠): ',
  drawErr: 'GEOlayers 셰이프를 못 그렸어요(draw): ',
  drawNone: 'draw 함수가 없어 GEOlayers 셰이프는 건너뛰었어요',
  dashNote: '점선 모양은 GEOlayers dashVal 값 뜻을 확정 못 해 비슷하게만 넣었어요',
  fin: '타일 받기(finalize) 끝',
  finErr: '타일 받기(finalize)를 못 했어요 — GEOlayers 패널에서 마무리(Finalize)를 눌러 주세요: ',
  finNone: '타일 받기(finalize)는 건너뛰었어요 — GEOlayers 패널에서 마무리(Finalize)를 눌러 주세요',
  finRun: '타일 받는 중(finalize) — GEOlayers 패널에서 진행을 볼 수 있어요',
  wait: 'GEOlayers 패널에서 @S@초 넘게 답이 없어요.\n\n셰이프 그리기·타일 받기(Finalize)는 GEOlayers 3 패널이 처리해요 — 패널이 닫혀 있으면 멈춰 있어요. 패널을 열고 마무리(Finalize)를 눌러 주세요.\n(타일을 받는 중이었다면 끝날 때 다시 알려요. 태풍 리깅·보기 키는 이미 들어가 있어요.)',
  marker: '앱 카메라 키 ',
};
// 패널 답 기다리기(초) — 그릴 셰이프가 있으면 첫 답(draw)이 금방 오고, 타일 받기만이면 오래 걸릴 수 있다
const WAIT_DRAW_S = 90, WAIT_FIN_S = 600;

// CAM 표현식 앞부분 — 투영 원점(지도 로컬 0,0)의 세계 px O와 그 오른쪽 D 세계 px 점을 GEOlayers 앵커로 우리 컴프 px로 옮겨
// 위치·배율·방향을 얻는다. 앵커 레이어(레이어 공간 = 세계 px)를 못 찾으면 맵 컴프 레이어의 Latitude·Longitude·Zoom·Bearing으로 같은 식을 직접 계산.
// @ANN@ = 앵커 레이어 이름, @MLN@ = 맵 컴프 레이어 이름(jsx가 실행할 때 채운다). ES3 문법만(옛 ExtendScript 표현식 엔진에서도 돌게).
function camExprHead(origin, sigma0) {
  return 'var NL=thisComp.layer("GEO_MAP"),S=NL.source,tc=time-NL.startTime,M=262144,D=1000,O=[' + numLit(origin[0]) + ',' + numLit(origin[1]) + '],SG0=' + numLit(sigma0) + ';' +
    'function G(q){var c=null;try{c=S.layer("@ANN@").toComp([q[0],q[1],0],tc);}catch(e){c=null;}' +
    'if(c===null){var L=S.layer("@MLN@"),la=L.effect("Latitude")(1).valueAtTime(tc),lo=L.effect("Longitude")(1).valueAtTime(tc),z=L.effect("Zoom")(1).valueAtTime(tc),b=L.effect("Bearing")(1).valueAtTime(tc)*Math.PI/180;' +
    'z=Math.max(0,Math.min(23,z));var f=Math.pow(2,z)*512/M,sn=Math.sin(la*Math.PI/180);sn=Math.max(-0.9999999,Math.min(0.9999999,sn));' +
    'var cx=(lo+180)/360*M,cy=(0.5-Math.log((1+sn)/(1-sn))/(4*Math.PI))*M,dx=(q[0]-cx)*f,dy=(q[1]-cy)*f,k=Math.cos(b),s=Math.sin(b);' +
    'c=L.toComp([L.source.width/2+dx*k-dy*s,L.source.height/2+dx*s+dy*k],tc);}' +
    'var r=NL.toComp([c[0],c[1]]);return [r[0],r[1]];}' +
    'var p0=G(O),p1=G([O[0]+D,O[1]]),dx=p1[0]-p0[0],dy=p1[1]-p0[1];';
}
const CAM_POS = '[p0[0],p0[1]]';
const CAM_SCL = 'var d=Math.sqrt(dx*dx+dy*dy)/D*M/(2*Math.PI)/SG0*100;[d,d]';
const CAM_ROT = 'Math.atan2(dy,dx)*180/Math.PI';
// ROT 널(라벨 박스·지시선을 프레임 가운데 기준으로 돌리는 널 — ae-jsx.js rotEmit·ROTC) 회전 = CAM 방향(GEOlayers Bearing을 따라 위 식으로 잰 값)
const ROT_EXPR = 'thisComp.layer("CAM").transform.rotation';

// ── buildGeoJsx ──
// opt = { ae: [AE 최소판, 최대판](설치된 GEOlayers 3 manifest의 AEFT 범위 — server.js geoCaps), ver: GEOlayers 판 } — 없으면 범위 안내 없이
function buildGeoJsx(spec, framesDir, opt) {
  if (!isGeoSpec(spec)) throw new Error('GEOlayers 스펙이 아님');
  const g = spec.geo;
  const base = Object.assign({}, spec); delete base.mode; delete base.geo;
  const L = buildAeJsx(base, framesDir).split('\n');
  const HEAD = 'app.beginUndoGroup("WeatherCG");', TAIL = 'comp.openInViewer();app.endUndoGroup();';
  if (L[0] !== HEAD || L[L.length - 1] !== TAIL) throw new Error('기존 jsx 모양이 예상과 달라요');
  const c = isObj(spec.comp) ? spec.comp : {};
  const W = Math.round(num(c.w, 1920)), H = Math.round(num(c.h, 1080));
  const cname = typeof c.name === 'string' ? c.name : 'WeatherCG';   // 기존 jsx가 만드는 우리 컴프 이름(ae-jsx.js — comp.name과 같다)
  const v = isObj(g.view) ? g.view : {};
  const work = viewOf(v.work) || [36, 127.5, 5, 0];
  const rows = framesOf(v.frames);
  const keyTs = Array.isArray(v.keys) ? v.keys.map((k) => (isObj(k) ? num(k.t, null) : null)).filter((t) => t !== null) : [];
  const bind = isObj(g.bind) ? g.bind : {};
  const origin = Array.isArray(bind.origin) && bind.origin.length === 2 && bind.origin.every((x) => num(x, null) !== null) ? bind.origin : null;
  const sigma0 = num(bind.sigma0, 0);
  const kr = isObj(g.overlays) && isObj(g.overlays.kr) && typeof g.overlays.kr.file === 'string' && /^f_[0-9]{5}\.png$/.test(g.overlays.kr.file) ? g.overlays.kr.file : null;
  const files = new Set(geoFiles(spec).filter((f) => f.key).map((f) => f.key));
  // 셰이프 — 채움도 선도 안 보이는 스타일(채움 0·선 0)은 그리지 않는다. 선이 있으면 굵기를 화면 px로 고정(autoStrokeWidth — 앱 경로선·반경 외곽선은 배율과 무관한 화면 px)
  const draws = (Array.isArray(g.draw) ? g.draw : []).filter((d) => isObj(d) && typeof d.key === 'string' && files.has(d.key))
    .map((d) => { const st = styleOf(d); return { f: 'geo_' + d.key + '.geojson', nm: String(d.name || ('GEO_' + d.key)), st, dash: !!d.dash, aw: !!st.stroke.addStroke }; })
    .filter((d) => d.st.fill.addFill || d.st.stroke.addStroke);
  const fin = g.finalize !== 0 && g.finalize !== false;
  const M = (k, rep) => { let s = MSG[k]; for (const r of Object.keys(rep || {})) s = s.split('@' + r + '@').join(rep[r]); return q(s); };
  const o = isObj(opt) ? opt : {};
  const aeR = Array.isArray(o.ae) && o.ae.length === 2 && o.ae.every((x) => num(x, null) !== null) && o.ae[0] <= o.ae[1] ? o.ae : null;
  const gver = typeof o.ver === 'string' && /^[0-9][0-9A-Za-z.-]{0,31}$/.test(o.ver) ? o.ver : '';

  const O = [];
  O.push('(function(){');
  // ① 확인·찾기 — 여기서 멈추면 아무것도 안 만든다
  O.push('var GOK=[],GNO=[];function gOk(s){GOK.push(s);}function gNo(s){GNO.push(s);}');
  if (aeR) {
    // 패널이 없을 때 — 이 AE가 설치된 GEOlayers 3의 지원 범위 밖이면(예: 1.17.0 = AE 26.9까지, AE 27은 1.18.0부터) 패널이 아예 안 뜨므로 그 까닭을 알린다
    const R = { VER: gver ? '(' + gver + ')' : '', LO: numLit(aeR[0]), HI: numLit(aeR[1]) };
    O.push('if(typeof geolayers3==="undefined"||!geolayers3){var gav=NaN;try{gav=parseFloat(String(app.version));}catch(e){}' +
      'if(gav>0&&(gav<' + numLit(aeR[0]) + '||gav>' + numLit(aeR[1]) + '))alert(' + M('aeVer', R) + '.split("@AE@").join(String(gav)));' +
      'else alert(' + M('noPanel', { RANGE: MSG.range.split('@VER@').join(gver || 'GEOlayers 3').split('@LO@').join(R.LO).split('@HI@').join(R.HI) }) + ');return;}');
  } else O.push('if(typeof geolayers3==="undefined"||!geolayers3){alert(' + M('noPanel', { RANGE: '' }) + ');return;}');
  O.push('function gIsComp(x){try{return !!x&&(x instanceof CompItem);}catch(e){return false;}}');
  // 같은 항목인가 — AE 객체 감싸개가 달라도 id로(복제 결과를 원본과 헷갈려 원본을 고치지 않게)
  O.push('function gSame(a,b){if(a===b)return true;try{return !!a&&!!b&&a.id===b.id;}catch(e){return false;}}');
  O.push('function gCtl(l,nm){try{var fx=l.property("ADBE Effect Parade");if(!fx)return null;var e=fx.property(nm);return e?e.property(1):null;}catch(e2){return null;}}');
  O.push('function gIsMapLayer(l){try{return !!(l&&l.source&&gIsComp(l.source)&&gCtl(l,"Latitude")&&gCtl(l,"Longitude")&&gCtl(l,"Zoom"));}catch(e){return false;}}');
  O.push('function gPairIn(C){if(!gIsComp(C))return null;for(var i=1;i<=C.numLayers;i++){var l=C.layer(i);if(gIsMapLayer(l))return {C:C,L:l,M:l.source};}return null;}');
  // 맵 컴프 → 담는 컴프(usedIn), 지난번에 보낸 우리 컴프(GEO_MAP 레이어) → 그 담는 컴프
  O.push('function gPairOf(X){if(!gIsComp(X))return null;var p=gPairIn(X);if(p)return p;var u=[];try{u=X.usedIn||[];}catch(e){}' +
    'for(var i=0;i<u.length;i++){var r=gPairIn(u[i]);if(r&&gSame(r.M,X))return r;}' +
    'for(var j=1;j<=X.numLayers;j++){var s=null;try{s=X.layer(j).source;}catch(e){}if(gIsComp(s)&&!gSame(s,X)){var r2=gPairIn(s);if(r2)return r2;}}return null;}');
  O.push('function gMine(C){try{return String(C.comment).indexOf("WeatherCG-GEO")===0;}catch(e){return false;}}');
  O.push('function gByName(n){var P=app.project;for(var i=1;i<=P.numItems;i++){var it=P.item(i);if(gIsComp(it)&&it.name===n)return it;}return null;}');
  O.push('var GP=null;try{GP=gPairOf(app.project.activeItem);}catch(e){}');
  O.push('if(!GP){var SEL=[];try{SEL=app.project.selection||[];}catch(e){}for(var i=0;i<SEL.length&&!GP;i++)GP=gPairOf(SEL[i]);}');
  O.push('if(!GP){var MCS=[];try{MCS=geolayers3.getMapcomps()||[];}catch(e){gNo(' + M('mapcompsErr') + '+e);}var cand=[],mine=[];' +
    'for(var k=0;k<MCS.length;k++){var X=MCS[k];if(typeof X==="string")X=gByName(X);var qq=gPairOf(X);if(!qq)continue;var seen=false,d;' +
    'for(d=0;d<cand.length;d++)if(gSame(cand[d].C,qq.C))seen=true;for(d=0;d<mine.length;d++)if(gSame(mine[d].C,qq.C))seen=true;if(seen)continue;if(gMine(qq.C))mine.push(qq);else cand.push(qq);}' +
    'if(cand.length===1)GP=cand[0];else if(cand.length>1){alert(' + M('many') + ');return;}else if(mine.length)GP=mine[mine.length-1];}');
  O.push('if(!GP){alert(' + M('none', { W: String(W), H: String(H) }) + ');return;}');
  // ① 끝 — 실행 취소 묶음을 열고(기존 jsx 첫 줄) 맵 컴프를 복제한다. 복제본(담는 컴프·맵 컴프 둘 다 새것)만 쓰고, 못 하면 이번에 새로 생긴 컴프만 지우고 멈춘다.
  O.push(HEAD);
  O.push('function gUniq(n){if(!gByName(n))return n;for(var i=2;i<1000;i++)if(!gByName(n+"_"+i))return n+"_"+i;return n;}');
  O.push('var GIDS={};try{for(var gi=1;gi<=app.project.numItems;gi++){try{GIDS["i"+app.project.item(gi).id]=1;}catch(e){}}}catch(e){}');
  O.push('function gNewC(x){try{return gIsComp(x)&&!GIDS["i"+x.id];}catch(e){return false;}}');
  O.push('var GNM=gUniq(' + q(cname + '_GEO') + '),GP2=null,GR1=null,GP1=null,GDE="";');
  O.push('try{GR1=geolayers3.duplicate(GP.C,{newContainingCompName:GNM});GP1=gPairOf(GR1);if(GP1&&!gSame(GP1.C,GP.C)&&!gSame(GP1.M,GP.M)&&gNewC(GP1.C)&&gNewC(GP1.M))GP2=GP1;}catch(e){GDE=String(e);}');
  O.push('if(!GP2){var gx=[GR1];if(GP1){gx.push(GP1.C);gx.push(GP1.M);}for(var gk=0;gk<gx.length;gk++){var gy=false;for(var gj=0;gj<gk;gj++)if(gx[gj]===gx[gk])gy=true;try{if(!gy&&gNewC(gx[gk]))gx[gk].remove();}catch(e){}}' +
    'app.endUndoGroup();var gm=' + M('noDup') + '+GP.C.name;if(GDE)gm+=' + M('dupErr') + '+GDE;alert(gm);return;}');
  // 복제본에만 표시(다음 보내기 때 '우리가 만든 것'으로 알아봄) — 지난번 결과를 복제했으면 그때 그린 셰이프(표시 붙은 레이어)는 지운다
  O.push('try{if(GP2.C.name!==GNM)GP2.C.name=GNM;}catch(e){}gOk(' + M('dup') + '+GP2.C.name);try{GP2.C.comment="WeatherCG-GEO "+' + q(cname) + ';}catch(e){}' +
    'for(var ol=GP2.C.numLayers;ol>=1;ol--){try{var oL=GP2.C.layer(ol);if(String(oL.comment).indexOf("WeatherCG-GEO")===0)oL.remove();}catch(e){}}');
  // ② 기존 jsx(첫 줄 — 실행 취소 묶음 열기 — 은 ①에서, 마지막 줄 — 뷰어 열기·묶음 닫기 — 은 ③ 뒤로)
  for (let i = 1; i < L.length - 1; i++) O.push(L[i]);
  // ③ 복제본을 우리 컴프에 넣기
  O.push('function gq(s){return String(s).replace(/\\\\/g,"\\\\\\\\").replace(/"/g,"\\\\\\"");}');
  O.push('function gLen(C,d){try{if(C.duration<d-1e-6){var od=C.duration;C.duration=d;for(var i=1;i<=C.numLayers;i++){try{var l=C.layer(i);if(l.outPoint>=od-0.001)l.outPoint=d;}catch(e){}}return true;}}catch(e){gNo(' + M('lenErr') + '+C.name);}return false;}');
  O.push('var gL1=gLen(GP2.C,TG.duration),gL2=gLen(GP2.M,TG.duration);if(gL1||gL2)gOk(' + M('lenNote') + ');try{GP2.C.frameRate=TG.frameRate;}catch(e){}');
  O.push('var NL=TG.layers.add(GP2.C);NL.name="GEO_MAP";NL.moveToEnd();');
  O.push('var FX=Math.max(TG.width/GP2.C.width,TG.height/GP2.C.height);try{NL.property("Position").setValue([TG.width/2,TG.height/2]);NL.property("Scale").setValue([FX*100,FX*100]);}catch(e){}');
  // zoom 보정 — 앱 zoom은 우리 컴프 px 기준. 담는 컴프를 FX배·맵 컴프 레이어를 SL배로 보이므로 그만큼 뺀다
  O.push('var SL=1;try{SL=Math.abs(GP2.L.property("Scale").value[0])/100||1;}catch(e){}var ZC=-Math.log(FX*SL)/Math.LN2;');
  // 보기 키 — 옛 키를 지우고, 프레임마다(값을 직접 — 빠르다) 또는 한 보기(setViewAtTime)
  O.push('try{geolayers3.removeMapcompControlKeys(GP2.C);}catch(e){gNo(' + M('removeErr') + '+e);}');
  O.push('var cLa=gCtl(GP2.L,"Latitude"),cLo=gCtl(GP2.L,"Longitude"),cZ=gCtl(GP2.L,"Zoom"),cB=gCtl(GP2.L,"Bearing"),cP=gCtl(GP2.L,"Pitch");');
  O.push('function gClr(p){try{while(p&&p.numKeys>0)p.removeKey(1);}catch(e){}}');
  O.push('function gLin(p){try{for(var i=1;i<=p.numKeys;i++)p.setInterpolationTypeAtKey(i,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);}catch(e){}}');
  O.push('function gV(a){return {latitude:a[0],longitude:a[1],zoom:a[2]+ZC,bearing:a[3],pitch:0};}');
  if (!rows) {
    O.push('var GV=' + lit(work) + ',gv=gV(GV),okV=false;');
    // setViewAtTime은 적용한 보기를 돌려준다 — Zoom을 이미지 범위로 자르면(설치판 clipZoom) 기록(프레임마다 길은 값을 직접 넣어 자르지 않는다)
    O.push('try{var rv=geolayers3.setViewAtTime(GP2.C,gv,false,0);okV=!!rv;if(rv&&typeof rv.zoom==="number"&&Math.abs(rv.zoom-gv.zoom)>0.01)gNo(' + M('zoomClip') + '+gv.zoom.toFixed(3)+" -> "+rv.zoom.toFixed(3));}catch(e){}');
    O.push('if(!okV){try{gClr(cLa);gClr(cLo);gClr(cZ);gClr(cB);cLa.setValue(gv.latitude);cLo.setValue(gv.longitude);cZ.setValue(gv.zoom);cB.setValue(gv.bearing);okV=true;}catch(e){gNo(' + M('viewErr') + '+e);}}');
    O.push('if(okV)gOk(' + M('view1') + ');');
  } else {
    O.push('var GR=' + lit(rows) + ',T=[],A=[],B=[],Z=[],R=[],okV=false;');
    O.push('for(var i=0;i<GR.length;i++){T.push(GR[i][0]);A.push(GR[i][1]);B.push(GR[i][2]);Z.push(GR[i][3]+ZC);R.push(GR[i][4]);}');
    O.push('try{if(cLa&&cLo&&cZ&&cB){gClr(cLa);gClr(cLo);gClr(cZ);gClr(cB);cLa.setValuesAtTimes(T,A);cLo.setValuesAtTimes(T,B);cZ.setValuesAtTimes(T,Z);cB.setValuesAtTimes(T,R);gLin(cLa);gLin(cLo);gLin(cZ);gLin(cB);okV=true;' +
      'gOk(' + M('viewN', { N: String(rows.length) }) + ');}}catch(e){gNo(' + M('viewErr') + '+e);}');
    O.push('if(!okV){var nV=0;for(var i2=0;i2<GR.length;i2++){try{if(geolayers3.setViewAtTime(GP2.C,gV(GR[i2].slice(1)),true,GR[i2][0]))nV++;}catch(e){}}if(nV)gOk(' + M('viewViaApi') + '+nV);else gNo(' + M('viewErr') + '+"setViewAtTime");}');
  }
  O.push('try{if(cP){gClr(cP);cP.setValue(0);}}catch(e){}');
  if (v.tilt) O.push('gNo(' + M('tilt') + ');');
  if (keyTs.length) O.push('var GK=' + lit(keyTs) + ';for(var mk=0;mk<GK.length;mk++){try{comp.markerProperty.setValueAtTime(GK[mk],new MarkerValue(' + M('marker') + '+(mk+1)));}catch(e){}}');
  // 남한 강조 — 리깅 바탕(지도 겹)과 같은 자리·같은 부모로 복제해 그림만 바꾸고 스크린 혼합(화면 mix-blend screen과 같게).
  // 겹 순서는 앱처럼 지도 겹(시도선·지명) 아래·GEOlayers 지도 위 — AE는 복제본을 원본 바로 위에 두므로 원본 아래로 옮긴다
  if (kr) O.push('try{var bg0=TG.layer("\\uc9c0\\ub3c4"),krl=bg0.duplicate();krl.replaceSource(imp("' + kr + '"),false);krl.name="\\ub0a8\\ud55c \\uac15\\uc870";krl.blendingMode=BlendingMode.SCREEN;krl.moveAfter(bg0);gOk(' + M('kr') + ');}catch(e){gNo(' + M('krErr') + '+e);}');
  // 리깅 CAM 널 → GEOlayers 앵커 따라가기(표현식). 부모 연결이 다 끝난 뒤에 건다(표현식 값으로 부모 보정이 일어나지 않게).
  // 앱 카메라에 회전이 있으면 기존 jsx가 ROT 널(피벗 = 프레임 가운데, 회전 키 = 앱 rz)을 CAM의 부모로 두고 라벨 박스·지시선을 ROT 회전으로 돌린다 →
  // CAM을 ROT에서 떼고(CAM 방향은 표현식이 GEOlayers Bearing에서 읽는다) ROT 회전을 CAM 방향으로 바꿔 라벨도 GEOlayers 보기를 따라 돌게 한다(키는 표현식이 꺼졌을 때의 대비로 남김)
  if (origin && sigma0 > 0) {
    O.push('var ANN="";try{var AN=geolayers3.getMapcompAnchor(GP2.C);ANN=AN&&AN.name?String(AN.name):"";}catch(e){}');
    O.push('if(!ANN){ANN=GP2.M.name+" Anchor";gNo(' + M('anchorGuess') + '+ANN);}');
    O.push('var EXH=' + q(camExprHead(origin, sigma0)) + '.split("@ANN@").join(gq(ANN)).split("@MLN@").join(gq(GP2.L.name)),nCam=0;');
    O.push('for(var ci=1;ci<=TG.numLayers;ci++){var cl=TG.layer(ci);if(cl.name!=="CAM")continue;try{if(cl.parent)cl.parent=null;}catch(e){}try{cl.property("Position").expression=EXH+' + q(CAM_POS) + ';cl.property("Scale").expression=EXH+' + q(CAM_SCL) +
      ';cl.property("Rotation").expression=EXH+' + q(CAM_ROT) + ';nCam++;}catch(e){gNo(' + M('camErr') + '+e);}}');
    O.push('if(nCam)gOk(' + M('camOk') + ');else gNo(' + M('camNone') + ');');
    O.push('var RO=null;for(var ri=1;ri<=TG.numLayers;ri++){if(TG.layer(ri).name==="ROT"){RO=TG.layer(ri);break;}}');
    O.push('if(RO&&nCam){try{RO.property("Rotation").expression=' + q(ROT_EXPR) + ';gOk(' + M('rotOk') + ');}catch(e){gNo(' + M('rotErr') + '+e);}}');
  } else O.push('gNo(' + M('camNone') + ');');
  O.push(TAIL);
  // ④ 비동기(패널이 처리) — 셰이프 그리기 → 타일 받기 → 알림. 콜백이 안 와도 ③까지의 기록은 먼저 남긴다
  O.push('var GD=' + lit(draws) + ',GC=GP2.C,GFIN=' + (fin ? 'true' : 'false') + ',GDASH=' + (draws.some((d) => d.dash) ? 'true' : 'false') + ',GRESP=false,GTASK=0;');
  O.push('function gLog(x){try{var f=new File(dir+"/geo_log.txt");f.encoding="UTF-8";f.open("w");f.write("OK\\n"+GOK.join("\\n")+"\\n\\nNO\\n"+GNO.join("\\n")+"\\n"+(x?"\\n"+x+"\\n":""));f.close();}catch(e){}}');
  O.push('function gEnd(){try{if(GTASK)app.cancelTask(GTASK);}catch(e){}GTASK=0;gLog();var s=' + M('head') + '+"\\n\\n- "+GOK.join("\\n- ");if(GNO.length)s+="\\n\\n"+' + M('bad') + '+":\\n- "+GNO.join("\\n- ");s+="\\n\\n"+' + M('logAt') + '+": "+dir+"/geo_log.txt";alert(s);}');
  O.push('function gIds(C){var o=[];for(var i=1;i<=C.numLayers;i++){try{o.push(C.layer(i).id);}catch(e){o.push(-i);}}return o;}');
  O.push('function gNew(C,bf){var o=[];for(var i=1;i<=C.numLayers;i++){var l=C.layer(i),id=-1,seen=false;try{id=l.id;}catch(e){}for(var j=0;j<bf.length;j++)if(bf[j]===id)seen=true;if(!seen)o.push(l);}return o;}');
  O.push('function gFin(){if(GFIN&&typeof geolayers3.finalize==="function"){try{geolayers3.finalize([GC],function(err,mc){GRESP=true;if(err)gNo(' + M('finErr') + '+err);else gOk(' + M('fin') + ');gEnd();},{});gOk(' + M('finRun') + ');gLog();return;}catch(e){gNo(' + M('finErr') + '+e);}}else if(GFIN)gNo(' + M('finNone') + ');gEnd();}');
  O.push('function gDraw(i){if(i>=GD.length){gFin();return;}if(typeof geolayers3.draw!=="function"){gNo(' + M('drawNone') + ');gFin();return;}var d=GD[i],bf=gIds(GC),done=false;' +
    'var cb=function(err,data){GRESP=true;if(done)return;done=true;try{if(err){gNo(' + M('drawErr') + '+d.nm+" "+err);}else{var nl=gNew(GC,bf);for(var k=0;k<nl.length;k++){try{nl[k].name=d.nm+(nl.length>1?" "+(k+1):"");nl[k].enabled=false;nl[k].comment="WeatherCG-GEO";}catch(e){}}gOk(' + M('draw') + '+d.nm);}}catch(e){}gDraw(i+1);};' +
    'try{geolayers3.draw(GC,File(dir+"/"+d.f),cb,{shapeLayerStyle:d.st,simplify:false,drawInsideMapcomp:false,individualLayers:false,autoStrokeWidth:!!d.aw});}catch(e){if(!done){done=true;gNo(' + M('drawErr') + '+d.nm+" "+e);gDraw(i+1);}}}');
  // 패널 답 기다리기 — 패널을 한 번 열었다 닫으면 geolayers3는 남아 있어도 draw·finalize 콜백이 오지 않는다(패널이 CSXSEvent를 받아 처리).
  // 그러면 마지막 알림이 안 뜨므로, 첫 답이 정한 시간 안에 안 오면 알림·기록(app.scheduleTask — 전역 함수 이름은 보낼 때마다 새로)
  O.push('var GAS=(GD.length&&typeof geolayers3.draw==="function")||(GFIN&&typeof geolayers3.finalize==="function"),GWS=(GD.length&&typeof geolayers3.draw==="function")?' + WAIT_DRAW_S + ':' + WAIT_FIN_S + ';');
  O.push('if(GAS&&typeof app.scheduleTask==="function"){try{var GW=$.global,GWN="wcgGeoWait"+(new Date().getTime());' +
    'GW[GWN]=function(){try{delete GW[GWN];}catch(e){}GTASK=0;if(GRESP)return;var m=' + M('wait') + '.split("@S@").join(String(GWS));gLog(m);alert(m+"\\n\\n"+' + M('logAt') + '+": "+dir+"/geo_log.txt");};' +
    'GTASK=app.scheduleTask(GWN+"()",GWS*1000,false);}catch(e){}}');
  O.push('if(GDASH&&GD.length)gNo(' + M('dashNote') + ');gLog();gDraw(0);');
  O.push('})();');
  return O.join('\n');
}

module.exports = { buildGeoJsx, isGeoSpec, geoFiles, styleOf, camExprHead, CAM_POS, CAM_SCL, CAM_ROT, ROT_EXPR, MSG, WAIT_DRAW_S, WAIT_FIN_S };

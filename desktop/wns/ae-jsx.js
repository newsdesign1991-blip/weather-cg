// AE 임포트용 .jsx 생성기 — R:\[F]_Util\WNS\_src\helper.py 의 build_ae_jsx 와 보조 함수를 '출력 바이트 동일'하게 옮긴 것.
// Python 로직을 줄 단위로 대응시켰다(분기·기본값·.get 기본값·float()/int() 변환·문자열 연결 순서).
// 원본이 예외를 내는 입력에서는 여기서도 예외를 던진다(원본은 500 응답).
'use strict';
const P = require('./pyfmt');
const { get, sub, iter, index, truthy, or, isNone, ge, le, max2, min2, float, int, round, ceil, div, mod,
  hypot, degrees, atan2, pyF, pyStr, pyJsonStr, fmt, pyErr } = P;

// ── helper.py wanted_ps ──
function wantedPs(w) {
  try { w = int(or(w, 400n)); } catch (e) { w = 400n; }
  const table = [[400n, 'Regular'], [500n, 'Medium'], [600n, 'SemiBold'], [700n, 'Bold'],
    [800n, 'ExtraBold'], [900n, 'Black'], [1000n, 'ExtraBlack']];
  return 'WantedSansVariable-' + nearest(table, w)[1];
}

// ── helper.py suite_ps ──
function suitePs(w) {
  try { w = int(or(w, 400n)); } catch (e) { w = 400n; }
  const table = [[300n, 'Light'], [400n, 'Regular'], [500n, 'Medium'], [600n, 'SemiBold'],
    [700n, 'Bold'], [800n, 'ExtraBold'], [900n, 'Heavy']];
  return 'SUITE-' + nearest(table, w)[1];
}
// min(table, key=lambda t: abs(t[0]-w)) — 첫 최소값 유지
function nearest(table, w) {
  const key = t => { const d = t[0] - w; return d < 0n ? -d : d; };
  let best = table[0], bk = key(best);
  for (let i = 1; i < table.length; i++) { const k = key(table[i]); if (k < bk) { best = table[i]; bk = k; } }
  return best;
}

// ── helper.py _js ── 따옴표·역슬래시 이스케이프 + 비ASCII 는 \uXXXX(U+10000 이상은 서로게이트 쌍 두 개, 외톨이 서로게이트는 하나)
function js(s) {
  const t = pyStr(s);
  let out = '';
  for (let i = 0; i < t.length; i++) {   // UTF-16 단위로 돌면 파이썬의 '코드포인트→쌍 분해'와 같은 결과
    const c = t.charCodeAt(i);
    if (c === 0x5c) out += '\\\\';
    else if (c === 0x22) out += '\\"';
    else if (c < 0x20 || c > 0x7e) { let h = c.toString(16); while (h.length < 4) h = '0' + h; out += '\\u' + h; }
    else out += t[i];
  }
  return out;
}

// ── helper.py _rig_num ── 태풍 리깅 선택 숫자 필드 — 없음/null(앱 JSON의 NaN)·비유한·음수면 기본값(옛 앱 호환)
function rigNum(d, k, dv) {
  const v = get(d, k);
  if (isNone(v)) return dv;
  let f;
  try { f = float(v); } catch (e) { if (e.pyType === 'OverflowError') return dv; throw e; }   // 너무 큰 정수(파이썬 OverflowError)도 기본값
  return (Number.isFinite(f) && f >= 0) ? f : dv;
}

// ── 20261008 확장(타임라인 = AE) — 새 필드 읽기(helper.py _xnum … 와 같은 규칙) ──
// 새 필드는 전부 아래 함수로만 읽는다: 숫자는 int(bool 제외)·float만, 형식이 틀리면 '없는 것'(= 옛 동작). 예외를 던지지 않는다.
function xnum(v, dv) {
  if (typeof v === 'bigint') { const f = Number(v); return Number.isFinite(f) ? f : dv; }   // 파이썬 float(int) 넘침(OverflowError) = Infinity → 기본값
  if (typeof v === 'number') return Number.isFinite(v) ? v : dv;
  return dv;
}
const on = (v) => xnum(v, 0.0) > 0;
function ease2(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const o = xnum(v[0], null), i = xnum(v[1], null);
  if (o === null || i === null) return null;
  return [Math.min(100.0, Math.max(0.1, o)), Math.min(100.0, Math.max(0.1, i))];
}
function pt2(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const x = xnum(v[0], null), y = xnum(v[1], null);
  if (x === null || y === null) return null;
  return [x, y];
}
const hexcol = (v) => ((typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) ? v : null);
function progOf(v) {
  if (!P.isDict(v) || get(v, 'curve') !== 'ioc') return null;
  const s = xnum(get(v, 'start'), null), e = xnum(get(v, 'end'), null);
  if (s === null || e === null) return null;
  return [s, e];
}
function placeOf(v) {
  if (!P.isDict(v)) return null;
  const x = xnum(get(v, 'x'), null), y = xnum(get(v, 'y'), null);
  if (x === null || y === null) return null;
  const k = xnum(get(v, 'k'), 1.0);
  return [x, y, k > 0 ? k : 1.0];
}
function camspec(c) {
  if (!P.isDict(c)) return null;
  const an = pt2(get(c, 'anchor'));
  if (an === null) return null;
  let sb = xnum(get(c, 'sBaked'), 1.0);
  if (sb <= 0) sb = 1.0;
  const ks = get(c, 'keys');
  const keys = [];
  if (Array.isArray(ks)) {
    for (const k of ks) {
      if (!P.isDict(k)) continue;
      const t = xnum(get(k, 't'), null), x = xnum(get(k, 'x'), null), y = xnum(get(k, 'y'), null), s = xnum(get(k, 's'), null);
      if (t === null || x === null || y === null || s === null || s <= 0) continue;
      keys.push([t, x, y, s, xnum(get(k, 'rz'), 0.0)]);
    }
  }
  if (!keys.length) return null;
  keys.sort((a, b) => a[0] - b[0]);   // 시각순(같은 시각은 원래 순서 — 안정 정렬)
  return { an, sb, keys, ease: ease2(get(c, 'ease')), pivot: pt2(get(c, 'pivot')), void: hexcol(get(c, 'voidCol')) };
}
const ef = (x) => pyF(Number.isFinite(x) ? x : 0.0);   // 표현식 안 숫자 — 비유한은 0
const efl = (a) => '[' + a.map(ef).join(',') + ']';
// 새 JSX 도우미 — 쓰일 때만 프롤로그(dshadow 정의 바로 뒤)에 한 번(helper.py _JSXFN·_need와 같은 글자·같은 순서)
const JSXFN = {
  ezE: 'function ezE(p,o,i){try{var sp=false;try{sp=p.isSpatial;}catch(e){}var d=1;try{d=p.value.length||1;}catch(e){d=1;}' +
    'var n=sp?1:d,A=[],B=[],z=[],k;for(k=0;k<n;k++){A.push(new KeyframeEase(0,o));B.push(new KeyframeEase(0,i));}for(k=0;k<d;k++)z.push(0);' +
    'p.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);' +
    'p.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);' +
    'p.setTemporalEaseAtKey(1,A,A);p.setTemporalEaseAtKey(2,B,B);' +
    'if(sp){try{p.setSpatialTangentsAtKey(1,z,z);p.setSpatialTangentsAtKey(2,z,z);}catch(e){}}}catch(err){}}',
  ezAll: 'function ezAll(p,o,i){try{var sp=false;try{sp=p.isSpatial;}catch(e){}var d=1;try{d=p.value.length||1;}catch(e){d=1;}' +
    'var n=sp?1:d,A=[],B=[],z=[],k;for(k=0;k<n;k++){A.push(new KeyframeEase(0,i));B.push(new KeyframeEase(0,o));}for(k=0;k<d;k++)z.push(0);' +
    'for(k=1;k<=p.numKeys;k++){p.setInterpolationTypeAtKey(k,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setTemporalEaseAtKey(k,A,B);' +
    'if(sp){try{p.setSpatialAutoBezierAtKey(k,false);p.setSpatialContinuousAtKey(k,false);p.setSpatialTangentsAtKey(k,z,z);}catch(e){}}}}catch(err){}}',
  linK: 'function linK(p){try{for(var k=1;k<=p.numKeys;k++)p.setInterpolationTypeAtKey(k,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);}catch(err){}}',
  fadeE: 'function fadeE(l,s,e,o,i){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ezE(op,o,i);}',
  slid: 'function slid(l,nm){var e=l.property("ADBE Effect Parade").addProperty("ADBE Slider Control");e.name=nm;return e.property(1);}',
};
const JSXDEP = { fadeE: ['ezE'] };
function need(L, nm) {
  for (const d of (JSXDEP[nm] || [])) need(L, d);
  const head = 'function ' + nm + '(';
  for (const s of L) if (s.startsWith(head)) return;
  let i = 0;
  while (!L[i].startsWith('function dshadow(')) i++;
  i++;
  while (i < L.length && L[i].startsWith('function ')) i++;
  L.splice(i, 0, JSXFN[nm]);
}
// 앱 easeInOutC — 표현식에 같은 글자로
const IOC = 'function ioc(x){x=x<0?0:x>1?1:x;return x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;}';
const placejs = (v, p) => fmt('%s.property("Anchor Point").setValue([0,0]);%s.property("Position").setValue([%f,%f]);%s.property("Scale").setValue([%f,%f]);',
  [v, v, p[0], p[1], v, 100.0 / p[2], 100.0 / p[2]]);
function rotEmit(L, tail, cv, rv, tz, pivot, cez, voidc) {
  if (!tz.some(([, z]) => Math.abs(z) > 0.05)) return false;
  const pv = pivot ? fmt('[%f,%f]', pivot) : '[TG.width/2,TG.height/2]';
  L.push(fmt('var %s=TG.layers.addNull();%s.name="ROT";%s.enabled=false;%s.property("Anchor Point").setValue(%s);%s.property("Position").setValue(%s);%s.parent=%s;',
    [rv, rv, rv, rv, pv, rv, pv, cv, rv]));
  if (voidc) L.push(fmt('try{var VOID=TG.layers.addSolid(hx("%s"),"VOID",TG.width,TG.height,1);VOID.moveToEnd();}catch(e){}', [voidc]));
  for (const [t, z] of tz) tail.push(fmt('%s.property("Rotation").setValueAtTime(%f,%f);', [rv, t, z]));
  if (cez) {
    need(L, 'ezAll');
    tail.push(fmt('ezAll(%s.property("Rotation"),%f,%f);', [rv, cez[0], cez[1]]));
  }
  return true;
}
function camEmit(L, cv, rv, cs) {
  const [ax, ay] = cs.an;
  L.push(fmt('var %s=TG.layers.addNull();%s.name="CAM";%s.enabled=false;%s.property("Anchor Point").setValue([%f,%f]);%s.property("Position").setValue([%f,%f]);',
    [cv, cv, cv, cv, ax, ay, cv, ax, ay]));
  const tail = [];
  for (const [t, x, y] of cs.keys) tail.push(fmt('%s.property("Position").setValueAtTime(%f,[%f,%f]);', [cv, t, x, y]));
  for (const [t, , , s] of cs.keys) { const csc = s / cs.sb * 100.0; tail.push(fmt('%s.property("Scale").setValueAtTime(%f,[%f,%f]);', [cv, t, csc, csc])); }
  const cez = cs.ease;
  if (cez) {
    need(L, 'ezAll');
    tail.push(fmt('ezAll(%s.property("Position"),%f,%f);ezAll(%s.property("Scale"),%f,%f);', [cv, cez[0], cez[1], cv, cez[0], cez[1]]));
  }
  const rot = rotEmit(L, tail, cv, rv, cs.keys.map((q) => [q[0], q[4]]), cs.pivot, cez, cs.void);
  return [tail, rot];
}
const ROTC = 'var RO=thisComp.layer("ROT"),th=RO.transform.rotation*Math.PI/180,pv=RO.transform.position,cs=Math.cos(th),sn=Math.sin(th);';
const rotxy = (bx, by) => fmt('var bx0=%f,by0=%f,bx=pv[0]+(bx0-pv[0])*cs-(by0-pv[1])*sn,by=pv[1]+(bx0-pv[0])*sn+(by0-pv[1])*cs;', [bx, by]);
const leadBox = (bx, by, hw, rot) => (rot ? ROTC + rotxy(bx, by) + fmt('var hw=%f;', [hw]) : fmt('var bx=%f,by=%f,hw=%f;', [bx, by, hw]));
const leadTail = (gap) => 'var lft=bx-hw,rgt=bx+hw;var useL=Math.abs(P[0]-lft)<=Math.abs(P[0]-rgt);var ax=useL?lft:rgt,ay=by;' +
  'var sgn=ax>=P[0]?1:-1;var dyA=Math.abs(ay-P[1]),room=Math.abs(ax-P[0]);var diag=Math.min(dyA,room);' +
  'var kx=P[0]+sgn*diag,ky=P[1]+(ay>=P[1]?diag:-diag);' +
  (gap > 0 ? fmt('var GAP=%f,kd=', [gap]) : 'var GAP=16,kd=') +
  'Math.sqrt((kx-P[0])*(kx-P[0])+(ky-P[1])*(ky-P[1]));if(kd<0.001)kd=1;' +
  'var sx=P[0]+(kx-P[0])/kd*Math.min(GAP,kd*0.9),sy=P[1]+(ky-P[1])/kd*Math.min(GAP,kd*0.9);' +
  'createPath([[sx,sy],[kx,ky],[ax,ay]],[],[],false);';
const TUBE = 'var Lr=[],Rr=[],i;for(i=0;i<N;i++){var A=P[Math.max(0,i-1)],B=P[Math.min(N-1,i+1)],dx=B[0]-A[0],dy=B[1]-A[1],ln=Math.sqrt(dx*dx+dy*dy)||1;dx/=ln;dy/=ln;' +
  'Lr.push([P[i][0]-dy*R[i],P[i][1]+dx*R[i]]);Rr.push([P[i][0]+dy*R[i],P[i][1]-dx*R[i]]);}' +
  'function cl(a){var o=[a[0]],j;for(j=1;j<a.length-1;j++){var v=o[o.length-1],cx=P[j][0]-P[j-1][0],cy=P[j][1]-P[j-1][1];if((a[j][0]-v[0])*cx+(a[j][1]-v[1])*cy>0)o.push(a[j]);}if(a.length>1)o.push(a[a.length-1]);return o;}' +
  'function nrm(a){while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;}' +
  'function arc(C,r,a0,dir){var out=[];for(var s=1;s<=9;s++){var a=a0+dir*Math.PI*(s/10);out.push([C[0]+Math.cos(a)*r,C[1]+Math.sin(a)*r]);}return out;}' +
  'var Lc=cl(Lr),Rc=cl(Rr),pp=Lc.slice(0);' +
  'var Ce=P[N-1],Le=Lc[Lc.length-1],aLe=Math.atan2(Le[1]-Ce[1],Le[0]-Ce[0]),aDe=Math.atan2(Ce[1]-P[N-2][1],Ce[0]-P[N-2][0]);pp=pp.concat(arc(Ce,R[N-1],aLe,nrm(aDe-aLe)>=0?1:-1));' +
  'for(i=Rc.length-1;i>=0;i--)pp.push(Rc[i]);' +
  'var Cs=P[0],R0=Rc[0],aRs=Math.atan2(R0[1]-Cs[1],R0[0]-Cs[0]),aDs=Math.atan2(Cs[1]-P[1][1],Cs[0]-P[1][0]);pp=pp.concat(arc(Cs,R[0],aRs,nrm(aDs-aRs)>=0?1:-1));' +
  'createPath(pp,[],[],true);';
function blindsOf(v) {
  if (!P.isDict(v)) return null;
  const w = xnum(get(v, 'w'), 0.0);
  if (w <= 0) return null;
  return [w, xnum(get(v, 'dir'), 0.0), Math.min(1.0, Math.max(0.0, xnum(get(v, 'ov'), 0.0))), on(get(v, 'two'))];
}
function leaderOf(v) {
  if (!P.isDict(v)) return null;
  const ax = xnum(get(v, 'ax'), null), ay = xnum(get(v, 'ay'), null), w = xnum(get(v, 'w'), 0.0), h = xnum(get(v, 'h'), 0.0);
  if (ax === null || ay === null || w <= 0 || h <= 0) return null;
  const gap = xnum(get(v, 'gap'), 16.0);
  const d = get(v, 'dot');
  let dot = null;
  if (P.isDict(d)) {
    const r = xnum(get(d, 'r'), 0.0);
    if (r > 0) dot = [r, hexcol(get(d, 'fill')) || '#FFFFFF', hexcol(get(d, 'stroke')) || '#FFFFFF', Math.max(0.0, xnum(get(d, 'sw'), 1.6))];
  }
  return { ax, ay, w, h, col: hexcol(get(v, 'col')) || '#FFFFFF', sw: Math.max(0.0, xnum(get(v, 'sw'), 2.4)),
    op: Math.min(1.0, Math.max(0.0, xnum(get(v, 'op'), 0.92))), gap: gap > 0 ? gap : 16.0, dot };
}
function fadejs(L, v, fz) {
  if (!fz) return '';
  const [s, e, ez] = fz;
  let out;
  if (ez) { need(L, 'fadeE'); out = fmt('fadeE(%s,%f,%f,%f,%f);', [v, s, e, ez[0], ez[1]]); }
  else out = fmt('fadeL(%s,%f,%f);', [v, s, e]);
  if (s > 0.001) out += fmt('try{%s.inPoint=%f;}catch(err){}', [v, s]);
  return out;
}
function leaderEmit(L, v, nm, ld, fz) {
  const ex = fmt('var B=thisComp.layer("%s").transform.position;var P=[%f,%f],bx=B[0],by=B[1],hw=%f;', [nm, ld.ax, ld.ay, ld.w / 2.0]) +
    'var lft=bx-hw,rgt=bx+hw;var useL=Math.abs(P[0]-lft)<=Math.abs(P[0]-rgt);var ax=useL?lft:rgt,ay=by;' +
    'var sgn=ax>=P[0]?1:-1;var dyA=Math.abs(ay-P[1]),room=Math.abs(ax-P[0]);var diag=Math.min(dyA,room);' +
    'var kx=P[0]+sgn*diag,ky=P[1]+(ay>=P[1]?diag:-diag);' +
    fmt('var GAP=%f,kd=Math.sqrt((kx-P[0])*(kx-P[0])+(ky-P[1])*(ky-P[1]))||1;', [ld.gap]) +
    'var sx=P[0]+(kx-P[0])/kd*Math.min(GAP,kd*0.9),sy=P[1]+(ky-P[1])/kd*Math.min(GAP,kd*0.9);' +
    'createPath([[sx,sy],[kx,ky],[ax,ay]],[],[],false);';
  const exj = pyJsonStr(ex), fl = fadejs(L, 'ln', fz);   // 파이썬 튜플 평가 순서와 같게(need 순서)
  L.push(fmt('(function(){var ln=TG.layers.addShape();ln.name="%s_\\uc9c0\\uc2dc\\uc120";ln.property("Position").setValue([0,0]);ln.property("Anchor Point").setValue([0,0]);' +
    'var root=ln.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
    'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;' +
    'var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);' +
    'try{st.property("ADBE Vector Stroke Opacity").setValue(%f);st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}' +
    'try{ln.moveAfter(%s);}catch(e){}%s})();',
  [nm, exj, ld.col, ld.sw, ld.op * 100.0, v, fl]));
  const dot = ld.dot;
  if (dot) {
    const fa = fadejs(L, 'ac', fz);
    L.push(fmt('(function(){var ac=TG.layers.addShape();ac.name="%s_\\uc575\\ucee4";ac.property("Position").setValue([0,0]);ac.property("Anchor Point").setValue([0,0]);' +
      'var root=ac.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
      'var el=ct.addProperty("ADBE Vector Shape - Ellipse");el.property("ADBE Vector Ellipse Size").setValue([%f,%f]);el.property("ADBE Vector Ellipse Position").setValue([%f,%f]);' +
      'var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("%s"));' +
      'var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);%s})();',
    [nm, 2 * dot[0], 2 * dot[0], ld.ax, ld.ay, dot[1], dot[2], dot[3], fa]));
  }
}

// p["idx"] 로 만든 posOf dict 의 get(idx, def) — 같은 키면 나중 j 가 덮어씀
function posOfGet(A, idx, def) {
  let found = def;
  for (let j = 0; j < A.length; j++) {
    const k = sub(A[j], 'idx');
    if (Array.isArray(k) || P.isDict(k)) throw pyErr('TypeError', "unhashable type: '" + P.typeName(k) + "'");
    if (typeof k === 'number' || typeof k === 'bigint' || typeof k === 'boolean') {
      if ((typeof k === 'boolean' ? (k ? 1 : 0) : k) == idx) found = j;   // eslint-disable-line eqeqeq
    }
  }
  return found;
}
// _cum[max(0, min(n - 1, int(j)))] / _tot 계산용 인덱스
function clampIdx(n, j) {
  return Number(max2(0n, min2(BigInt(n - 1), int(j))));
}

// ── helper.py emit_typhoon_rig ──
function emitTyphoonRig(L, rig) {
  const pts = get(rig, 'points', []);
  const nowIdx = int(get(rig, 'nowIdx', 0));
  const iconH = float(get(rig, 'iconH', 270));
  const iconRenderH = or(float(get(rig, 'iconRenderH', 225)), 225.0);
  const sc = float(get(rig, 'iconScreenH', 42)) / iconRenderH * 100.0;
  const anc = iconH / 2.0;
  const rv = or(get(rig, 'reveal', {}), {});
  const r_start = float(get(rv, 'start', 1.0)), r_path = float(get(rv, 'path', 2.0)), r_lab = float(get(rv, 'labelLen', 1.0));
  const cam = get(rig, 'camera');
  // 선 모양 — 라인 모드=현재까지 단색선+선두 아이콘만 / 일반=지난 회색 실선+예상 흰 점선
  const line_mode = get(rig, 'trackMode', 'full') === 'line';
  const _lc = get(rig, 'lineColor');
  const lineColor = (typeof _lc === 'string' && /^#[0-9A-Fa-f]{6}$/.test(_lc)) ? _lc : '#E5231E';
  const lineWidth = rigNum(rig, 'lineWidth', 2.8);
  const pastLineWidth = rigNum(rig, 'pastLineWidth', 2.6);
  const pastIconK = rigNum(rig, 'pastIconK', 0.3);
  const A = iter(pts);
  const n = A.length;
  const _cum = new Array(n).fill(0.0);
  for (let _j = 1; _j < n; _j++) {
    const _dx = float(sub(A[_j], 'x')) - float(sub(A[_j - 1], 'x')), _dy = float(sub(A[_j], 'y')) - float(sub(A[_j - 1], 'y'));
    _cum[_j] = _cum[_j - 1] + Math.sqrt(_dx * _dx + _dy * _dy);
  }
  const _tot = (n > 1 && _cum[n - 1] > 0) ? _cum[n - 1] : 1.0;
  const tapp = j => r_start + r_path * (index(_cum, clampIdx(n, j)) / _tot);
  posOfGet(A, 0n, 0);   // posOf 생성 시점의 KeyError/unhashable 검사
  let jNow = n - 1;
  for (let j = 0; j < n; j++) {
    if (ge(sub(A[j], 'idx'), nowIdx)) { jNow = j; break; }
  }
  // 20261008 — 진행 곡선(D2)·라벨 곡선·방향(rz). 없거나 틀리면 옛 리빌
  const pg = n >= 1 ? progOf(get(rig, 'prog')) : null;
  const pgs = pg !== null && pg[1] <= pg[0];
  const lcv = !line_mode && on(get(rig, 'labelCurve'));
  const gap = xnum(get(rig, 'leaderGap'), 0.0);
  const pre = pg !== null ? IOC + fmt('var p=ioc(thisComp.layer("TPROG").effect("PROG")(1)/100)*%d,f=Math.floor(p),r=p-f;', [n - 1]) : '';
  L.push('(function(){');
  L.push('var CAM=null;');
  let camk = null, rot = false;
  if (truthy(cam)) {
    const _an = get(cam, 'anchor', [0, 0]); const ax = float(index(_an, 0)), ay = float(index(_an, 1));
    const sb = or(float(get(cam, 'sBaked', 1)), 1.0);
    L.push(fmt('CAM=TG.layers.addNull();CAM.name="CAM";CAM.enabled=false;CAM.property("Anchor Point").setValue([%f,%f]);CAM.property("Position").setValue([%f,%f]);', [ax, ay, ax, ay]));
    camk = []; const kts = [];
    for (const k of iter(get(cam, 'keys', []))) {
      kts.push(float(get(k, 't', 0)));
      camk.push(fmt('CAM.property("Position").setValueAtTime(%f,[%f,%f]);', [kts[kts.length - 1], float(get(k, 'x', 0)), float(get(k, 'y', 0))]));
    }
    for (const k of iter(get(cam, 'keys', []))) {
      const csc = float(get(k, 's', 1)) / sb * 100.0;   // 카메라 스케일(아이콘 sc를 덮어쓰지 않게 따로)
      camk.push(fmt('CAM.property("Scale").setValueAtTime(%f,[%f,%f]);', [float(get(k, 't', 0)), csc, csc]));
    }
    const cez = ease2(get(cam, 'ease'));
    if (cez) {
      need(L, 'ezAll');
      camk.push(fmt('ezAll(CAM.property("Position"),%f,%f);ezAll(CAM.property("Scale"),%f,%f);', [cez[0], cez[1], cez[0], cez[1]]));
    } else camk.push('try{ezR(CAM.property("Position"));ezR(CAM.property("Scale"));}catch(e){}');
    const tz = iter(get(cam, 'keys', [])).map((k, i) => [kts[i], xnum(get(k, 'rz'), 0.0)]);
    rot = rotEmit(L, camk, 'CAM', 'ROT', tz, pt2(get(cam, 'pivot')), cez, hexcol(get(cam, 'voidCol')));
  }
  const bgp = placeOf(get(rig, 'bgPlace'));
  L.push(fmt('var bgL=TG.layers.add(imp("%s"));bgL.name="\\uc9c0\\ub3c4";%sif(CAM){bgL.parent=CAM;}', [js(get(rig, 'bg', '')), bgp ? placejs('bgL', bgp) : '']));
  L.push(fmt('var icC=imp("%s"),icG=imp("%s");', [js(get(rig, 'iconColFile', '')), js(get(rig, 'iconGrayFile', ''))]));
  const icTdC = get(rig, 'iconTdColFile'), icTdG = get(rig, 'iconTdGrayFile');
  L.push(fmt('var icTC=%s,icTG=%s;', [truthy(icTdC) ? fmt('imp("%s")', [js(icTdC)]) : 'icC', truthy(icTdG) ? fmt('imp("%s")', [js(icTdG)]) : 'icG']));
  const icExC = get(rig, 'iconExColFile'), icExG = get(rig, 'iconExGrayFile');
  L.push(fmt('var icEC=%s,icEG=%s;', [truthy(icExC) ? fmt('imp("%s")', [js(icExC)]) : 'icC', truthy(icExG) ? fmt('imp("%s")', [js(icExG)]) : 'icG']));
  if (pg !== null && n >= 2) {   // 움직이는 선두 — 화면은 늘 컬러 일러스트 → 앱이 따로 구운 headFile
    const hf = get(rig, 'headFile');
    L.push(fmt('var icH=%s;', [truthy(hf) ? fmt('imp("%s")', [js(hf)]) : 'icC']));
  }
  for (let i = 0; i < n; i++) {
    const p = A[i];
    L.push(fmt('var TP%d=TG.layers.addNull();TP%d.name="TP%d";TP%d.property("Position").setValue([%f,%f]);TP%d.enabled=false;if(CAM){TP%d.parent=CAM;}',
      [i, i, i, i, float(sub(p, 'x')), float(sub(p, 'y')), i, i]));
  }
  if (pg !== null || lcv) {
    need(L, 'slid');
    L.push('var TPN=TG.layers.addNull();TPN.name="TPROG";TPN.guideLayer=true;');
    if (pg !== null) {
      if (pgs) L.push('var PRP=slid(TPN,"PROG");PRP.setValue(100);');
      else {
        need(L, 'linK');
        L.push(fmt('var PRP=slid(TPN,"PROG");PRP.setValueAtTime(%f,0);PRP.setValueAtTime(%f,100);linK(PRP);', [pg[0], pg[1]]));
      }
    }
  }
  // 반경 밴드
  const bands = line_mode ? {} : get(rig, 'bands', {});   // 라인 모드는 반경 없음(값이 와도 무시)
  for (const key of ['r70', 'r15', 'r25']) {
    const b = get(bands, key);
    if (!truthy(b)) continue;
    const idxs = [];
    for (let i = 0; i < n; i++) { const p = A[i]; if (ge(sub(p, 'idx'), nowIdx) && float(get(p, key, 0)) > 0) idxs.push(i); }
    if (!idxs.length) continue;
    const fop = float(get(b, 'fillOp', 0.3)) * 100.0;
    const fill = js(get(b, 'fill', '#888'));
    const t0b = tapp(idxs[0]); let t1b = tapp(idxs[idxs.length - 1]);
    if (t1b <= t0b + 0.05) t1b = t0b + 0.3;
    const RA = pg !== null ? A.map((p) => (ge(sub(p, 'idx'), nowIdx) ? float(get(p, key, 0)) : 0.0)) : null;
    let parts;
    if (pg !== null) {
      parts = [fmt('try{var sl=TG.layers.addShape();sl.name="\\ubc18\\uacbd_%s";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);if(CAM){sl.parent=CAM;}' +
        'sl.property("Opacity").setValue(%f);' +
        'var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");', [key, fop])];
    } else {
      parts = [fmt('try{var sl=TG.layers.addShape();sl.name="\\ubc18\\uacbd_%s";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);if(CAM){sl.parent=CAM;}' +
        'var op=sl.property("Opacity");op.setValueAtTime(%f,0);op.setValueAtTime(%f,%f);ezR(op);' +
        'var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");', [key, t0b, t1b, fop])];
    }
    for (let si = 0; si < idxs.length - 1; si++) {
      const a = idxs[si], c = idxs[si + 1];
      const ra = float(get(index(A, a), key, 0)), rb = float(get(index(A, c), key, 0));
      let trap;
      if (pg !== null) {
        trap = pre + fmt('var A=thisComp.layer("TP%d").position,C=thisComp.layer("TP%d").position,ra=%s,rb=%s,b=null;' +
          'if(p>=%d){b=[C[0],C[1]];}else if(f==%d&&r>1e-4){var F=thisComp.layer("TP%d").position;b=[F[0]+(C[0]-F[0])*r,F[1]+(C[1]-F[1])*r];rb=%s+(rb-%s)*r;}' +
          'if(!b){createPath([[0,0],[0,0],[0,0]],[],[],true);}else{var a=[A[0],A[1]],dx=b[0]-a[0],dy=b[1]-a[1],ln=Math.sqrt(dx*dx+dy*dy)||1,nx=-dy/ln,ny=dx/ln;' +
          'createPath([[a[0]+nx*ra,a[1]+ny*ra],[b[0]+nx*rb,b[1]+ny*rb],[b[0]-nx*rb,b[1]-ny*rb],[a[0]-nx*ra,a[1]-ny*ra]],[],[],true);}',
        [a, c, ef(ra), ef(rb), c, c - 1, c - 1, ef(RA[c - 1]), ef(RA[c - 1])]);
      } else {
        trap = fmt('var a=thisComp.layer("TP%d").position;a=[a[0],a[1]];var b=thisComp.layer("TP%d").position;b=[b[0],b[1]];var ra=%f,rb=%f;' +
          'var dx=b[0]-a[0],dy=b[1]-a[1],ln=Math.sqrt(dx*dx+dy*dy);if(ln<0.001)ln=1;var nx=-dy/ln,ny=dx/ln;' +
          'createPath([[a[0]+nx*ra,a[1]+ny*ra],[b[0]+nx*rb,b[1]+ny*rb],[b[0]-nx*rb,b[1]-ny*rb],[a[0]-nx*ra,a[1]-ny*ra]],[],[],true);', [a, c, ra, rb]);
      }
      parts.push(fmt('var tp%d=ct.addProperty("ADBE Vector Shape - Group");tp%d.property("ADBE Vector Shape").expression=%s;', [si, si, pyJsonStr(trap)]));
    }
    for (const i of idxs) {
      const r = float(get(index(A, i), key, 0));
      const posx = fmt('var p=thisComp.layer("TP%d").position;[p[0],p[1]];', [i]);
      if (pg !== null) {
        parts.push(fmt('var el%d=ct.addProperty("ADBE Vector Shape - Ellipse");el%d.property("ADBE Vector Ellipse Size").expression=%s;el%d.property("ADBE Vector Ellipse Position").expression=%s;',
          [i, i, pyJsonStr(pre + fmt('f>=%d?[%s,%s]:[0,0]', [i, ef(2 * r), ef(2 * r)])), i, pyJsonStr(posx)]));
      } else {
        parts.push(fmt('var el%d=ct.addProperty("ADBE Vector Shape - Ellipse");el%d.property("ADBE Vector Ellipse Size").setValue([%f,%f]);el%d.property("ADBE Vector Ellipse Position").expression=%s;', [i, i, 2 * r, 2 * r, i, pyJsonStr(posx)]));
      }
    }
    if (pg !== null && n >= 2) {
      const hpos = pre + fmt('var g=f>%d?%d:f;var a=thisComp.layer("TP"+g).position,b=thisComp.layer("TP"+(g+1)).position;[a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r]', [n - 2, n - 2]);
      const hsz = pre + fmt('var R=%s,d=(r>1e-4&&f+1<=%d&&R[f+1]>0&&p>=%d)?2*(R[f]+(R[f+1]-R[f])*r):0;[d,d]', [efl(RA), n - 1, jNow]);
      parts.push(fmt('var eh=ct.addProperty("ADBE Vector Shape - Ellipse");eh.property("ADBE Vector Ellipse Size").expression=%s;eh.property("ADBE Vector Ellipse Position").expression=%s;', [pyJsonStr(hsz), pyJsonStr(hpos)]));
    }
    parts.push('try{var mg=ct.addProperty("ADBE Vector Filter - Merge");mg.property("ADBE Vector Merge Type").setValue(2);}catch(e){}');
    parts.push(fmt('var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("%s"));}catch(e){}', [fill]));
    L.push(parts.join(''));
    // 외곽 점선/실선 레이어
    const sw = float(get(b, 'strokeW', 0));
    if (sw > 0 && idxs.length >= 2) {
      const dashjs = truthy(get(b, 'dash')) ? fmt('var dd=st.property("ADBE Vector Stroke Dashes");try{dd.addProperty("ADBE Vector Stroke Dash 1").setValue(%f);dd.addProperty("ADBE Vector Stroke Gap 1").setValue(%f);}catch(e){}', [sw * 4, sw * 3.5]) : '';
      if (pg !== null) {
        const ilist = '[' + idxs.map((i) => fmt('%d', [i])).join(',') + ']';
        const hcond = fmt('r>1e-4&&f+1<=%d&&RA[f+1]>0&&p>=%d', [n - 1, jNow]);
        const tube = pre + fmt('var I=%s,RR=%s,RA=%s,P=[],R=[],k,q;', [ilist, efl(idxs.map((i) => float(get(index(A, i), key, 0)))), efl(RA)]) +
          'for(k=0;k<I.length;k++){if(f>=I[k]){q=thisComp.layer("TP"+I[k]).position;P.push([q[0],q[1]]);R.push(RR[k]);}}' +
          fmt('if(%s){var a=thisComp.layer("TP"+f).position,b=thisComp.layer("TP"+(f+1)).position;P.push([a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r]);R.push(RA[f]+(RA[f+1]-RA[f])*r);}', [hcond]) +
          'var N=P.length;if(N<2){createPath([[0,0],[0,0]],[],[],false);}else{' + TUBE + '}';
        const opx = pre + fmt('var I=%s,RA=%s,c=0,k;for(k=0;k<I.length;k++)if(f>=I[k])c++;if(%s)c++;c>=2?100:0', [ilist, efl(RA), hcond]);
        L.push(fmt('try{var sl=TG.layers.addShape();sl.name="\\ubc18\\uacbd\\uc120_%s";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);if(CAM){sl.parent=CAM;}' +
          'sl.property("Opacity").expression=%s;' +
          'var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
          'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;' +
          'var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);' +
          'try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}%s}catch(e){}',
        [key, pyJsonStr(opx), pyJsonStr(tube), js(get(b, 'stroke', '#FFFFFF')), sw, dashjs]));
        continue;
      }
      const posarr = '[' + idxs.map(i => fmt('thisComp.layer("TP%d").position', [i])).join(',') + ']';
      const radarr = '[' + idxs.map(i => fmt('%f', [float(get(index(A, i), key, 0))])).join(',') + ']';
      const tube = fmt('var P=%s,R=%s,N=P.length,pp=[];for(var i=0;i<N;i++){P[i]=[P[i][0],P[i][1]];}' +
        'function nrm(a){while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;}' +
        'function arc(C,r,a0,dir){var out=[];for(var s=1;s<=9;s++){var a=a0+dir*Math.PI*(s/10);out.push([C[0]+Math.cos(a)*r,C[1]+Math.sin(a)*r]);}return out;}' +
        'var Lp=[],Rp=[];for(var i=0;i<N;i++){var A=P[Math.max(0,i-1)],B=P[Math.min(N-1,i+1)];var dx=B[0]-A[0],dy=B[1]-A[1],ln=Math.sqrt(dx*dx+dy*dy);if(ln<0.001)ln=1;dx/=ln;dy/=ln;var nx=-dy,ny=dx;Lp.push([P[i][0]+nx*R[i],P[i][1]+ny*R[i]]);Rp.push([P[i][0]-nx*R[i],P[i][1]-ny*R[i]]);}' +
        'for(var i=0;i<N;i++)pp.push(Lp[i]);' +
        'var Ce=P[N-1],re=R[N-1],aLe=Math.atan2(Lp[N-1][1]-Ce[1],Lp[N-1][0]-Ce[0]),aDe=Math.atan2(Ce[1]-P[N-2][1],Ce[0]-P[N-2][0]),de=nrm(aDe-aLe)>=0?1:-1;pp=pp.concat(arc(Ce,re,aLe,de));' +
        'for(var i=N-1;i>=0;i--)pp.push(Rp[i]);' +
        'var Cs=P[0],rs=R[0],aRs=Math.atan2(Rp[0][1]-Cs[1],Rp[0][0]-Cs[0]),aDs=Math.atan2(Cs[1]-P[1][1],Cs[0]-P[1][0]),ds=nrm(aDs-aRs)>=0?1:-1;pp=pp.concat(arc(Cs,rs,aRs,ds));' +
        'createPath(pp,[],[],true);', [posarr, radarr]);
      L.push(fmt('try{var sl=TG.layers.addShape();sl.name="\\ubc18\\uacbd\\uc120_%s";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);if(CAM){sl.parent=CAM;}' +
        'var op=sl.property("Opacity");op.setValueAtTime(%f,0);op.setValueAtTime(%f,100);ezR(op);' +
        'var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
        'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;' +
        'var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);' +
        'try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}%s}catch(e){}',
      [key, t0b, t1b, pyJsonStr(tube), js(get(b, 'stroke', '#FFFFFF')), sw, dashjs]));
    }
  }
  // 경로선 — 지난(회색 실선) / 현재~미래(흰 점선). 진행 곡선이면 Trim End = 선두까지 그린 길이(호길이 비율)
  function emitLine(name, idxs, col, wid, dash) {
    if (idxs.length < 2) return;
    const ts = tapp(idxs[0]); let te = tapp(idxs[idxs.length - 1]);
    if (te <= ts + 0.05) te = ts + 0.3;
    const expr = 'var Q=[' + idxs.map(i => fmt('thisComp.layer("TP%d").position', [i])).join(',') + '];for(var i=0;i<Q.length;i++){Q[i]=[Q[i][0],Q[i][1]];}createPath(Q,[],[],false);';
    const dashjs = dash ? fmt('var dd=st.property("ADBE Vector Stroke Dashes");try{dd.addProperty("ADBE Vector Stroke Dash 1").setValue(%f);dd.addProperty("ADBE Vector Stroke Gap 1").setValue(%f);}catch(e){}', [wid * 3.2, wid * 2.5]) : '';   // 화면 dasharray(굵기×3.2, ×2.5)와 같게
    let trim;
    if (pg !== null) {
      const tex = pre + fmt('var J=[%s],Q=[%s],c=[0],i,d=0,T;', [idxs.map((i) => fmt('%d', [i])).join(','), idxs.map((i) => fmt('thisComp.layer("TP%d").position', [i])).join(',')]) +
        'for(i=1;i<Q.length;i++){var dx=Q[i][0]-Q[i-1][0],dy=Q[i][1]-Q[i-1][1];c.push(c[i-1]+Math.sqrt(dx*dx+dy*dy));}T=c[c.length-1];' +
        'for(i=0;i+1<J.length;i++){if(J[i+1]<=f){d=c[i+1];}else{if(J[i]==f&&J[i+1]==f+1)d=c[i]+(c[i+1]-c[i])*r;break;}}T>0?d/T*100:0';
      trim = fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");tm.property("ADBE Vector Trim End").expression=%s;', [pyJsonStr(tex)]);
    } else {
      trim = fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(%f,0);en.setValueAtTime(%f,100);', [ts, te]);
    }
    L.push(fmt('try{var sl=TG.layers.addShape();sl.name="%s";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);if(CAM){sl.parent=CAM;}' +
      'var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
      'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;', [name, pyJsonStr(expr)]) +
      trim +
      fmt('var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);' +
        'try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}%s}catch(e){}', [col, wid, dashjs]));
  }
  if (line_mode) {   // 라인 모드 — 모든 점을 잇는 lineColor 단색 실선 1개(대시 없음)
    const all_ = [];
    for (let i = 0; i < n; i++) all_.push(i);
    emitLine('\\uacbd\\ub85c', all_, lineColor, lineWidth, false);
  } else {
    const past_ = [], fut_ = [];
    for (let i = 0; i < n; i++) if (le(sub(A[i], 'idx'), nowIdx)) past_.push(i);
    emitLine('\\uacbd\\ub85c(\\uc9c0\\ub09c)', past_, '#96A0AD', pastLineWidth, false);
    for (let i = 0; i < n; i++) if (ge(sub(A[i], 'idx'), nowIdx)) fut_.push(i);
    emitLine('\\uacbd\\ub85c(\\uc608\\uc0c1)', fut_, '#FFFFFF', lineWidth, true);
  }
  // 아이콘 — 과거=pastIconK 배율, noIcon 지점은 아이콘만 생략. 라인 모드는 선두(마지막 점) 1개만(과거 아님·noIcon 무시).
  // 진행 곡선이면 화면처럼 닿는 순간 바로(첫 지점은 0초부터), 라인 모드는 지점마다 두고 선두가 그 지점에 멈춰 있을 때만.
  for (let i = 0; i < n; i++) {
    const p = A[i];
    let past;
    if (line_mode) {
      if (pg === null && i !== n - 1) continue;
      past = false;
    } else {
      if (truthy(get(p, 'noIcon'))) continue;
      past = truthy(get(p, 'past'));
    }
    const td = float(get(p, 'ws', 99)) < 17;
    let icvar;
    if (truthy(get(p, 'ex'))) icvar = past ? 'icEG' : 'icEC';
    else icvar = td ? (past ? 'icTG' : 'icTC') : (past ? 'icG' : 'icC');
    const psc = sc * (past ? pastIconK : 1.0);
    if (pg !== null) {
      const ox = pre + fmt(line_mode ? '(f==%d&&r<=1e-4)?100:0' : 'f>=%d?100:0', [i]);
      L.push(fmt('try{var ic=TG.layers.add(%s);ic.name="\\uc544\\uc774\\ucf58%d";ic.parent=TP%d;' +
        'ic.property("Anchor Point").setValue([%f,%f]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([%f,%f]);' +
        'ic.property("Opacity").expression=%s;}catch(e){}',
      [icvar, i, i, anc, anc, psc, psc, pyJsonStr(ox)]));
      continue;
    }
    const ti = tapp(i);
    L.push(fmt('try{var ic=TG.layers.add(%s);ic.name="\\uc544\\uc774\\ucf58%d";ic.parent=TP%d;' +
      'ic.property("Anchor Point").setValue([%f,%f]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([%f,%f]);' +
      'var op=ic.property("Opacity");op.setValueAtTime(%f,0);op.setValueAtTime(%f,100);ezR(op);}catch(e){}',
    [icvar, i, i, anc, anc, psc, psc, ti, ti + 0.22]));
  }
  // 선두(움직이는 아이콘) 3종 — 일러스트 / TD 마커 / '저' 마커, 위치 = 두 지점 널 사이 보간
  if (pg !== null && n >= 2) {
    const W = efl(A.map((p) => xnum(get(p, 'ws'), 99.0))), X = '[' + A.map((p) => (truthy(get(p, 'ex')) ? '1' : '0')).join(',') + ']';
    const hpos = pre + fmt('var g=f>%d?%d:f;var a=thisComp.layer("TP"+g).position,b=thisComp.layer("TP"+(g+1)).position;[a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r]', [n - 2, n - 2]);
    for (const [kind, iv, cond] of [[0, 'icH', '!td'], [1, 'icTC', 'td&&!e'], [2, 'icEC', 'e']]) {
      const hop = pre + fmt('var W=%s,X=%s,g=f>%d?%d:f,w=W[g]+(W[g+1]-W[g])*r,e=r>=0.5?X[g+1]:X[g],td=e||w<17;(r<=1e-4||f>=%d)?0:((%s)?100:0)', [W, X, n - 2, n - 2, n - 1, cond]);
      L.push(fmt('try{var hd=TG.layers.add(%s);hd.name="\\uc120\\ub450%d";if(CAM){hd.parent=CAM;}' +
        'hd.property("Anchor Point").setValue([%f,%f]);hd.property("Scale").setValue([%f,%f]);' +
        'hd.property("Position").expression=%s;hd.property("Opacity").expression=%s;}catch(e){}',
      [iv, kind, anc, anc, sc, sc, pyJsonStr(hpos), pyJsonStr(hop)]));
    }
  }
  // 라벨
  const labels = line_mode ? [] : iter(get(rig, 'labels', []));   // 라인 모드는 라벨 없음(값이 와도 무시)
  for (let li = 0; li < labels.length; li++) {
    const lb = labels[li];
    const idx = int(get(lb, 'idx', 0));
    const bx = float(get(lb, 'bx', 0)), by = float(get(lb, 'by', 0));
    const size = int(round(float(get(lb, 'size', 40)) * 1.1)); const col = js(get(lb, 'col', '#FFFFFF'));
    const bfill = js(get(lb, 'fill', '#0C295F')); const bstroke = js(get(lb, 'stroke', '#3F6BD8')); const bstrokeW = float(get(lb, 'strokeW', 0)) * 2.0; const brad = float(get(lb, 'radius', 14));
    const bfop = float(get(lb, 'fillOp', 1.0)) * 80.0;
    const font = suitePs(get(lb, 'weight', 600)); const txt = js(get(lb, 'txt', ''));
    const jlab = posOfGet(A, idx, jNow);
    const _rs = get(lb, 'revStart'), _rl = get(lb, 'revLen');
    let t_lab, lab_len;
    if (!isNone(_rs)) { t_lab = float(_rs); lab_len = !isNone(_rl) ? float(_rl) : r_lab; }
    else { t_lab = tapp(jlab); lab_len = r_lab; }
    const t_line_end = t_lab + lab_len * 0.66;
    const t_box = t_lab + lab_len * 0.33, t_box_end = t_box + lab_len * 0.66;
    const bw = float(get(lb, 'bw', 120)), bh = float(get(lb, 'bh', 60));
    const px = float(get(lb, 'px', bx));
    const use_left = Math.abs(px - (bx - bw / 2.0)) <= Math.abs(px - (bx + bw / 2.0));
    const off = use_left ? (-bw / 2.0) : (bw / 2.0);
    const leader = fmt('var P=thisComp.layer("TP%d").toComp([0,0]);P=[P[0],P[1]];', [jlab]) + leadBox(bx, by, bw / 2.0, rot) + leadTail(gap);
    let trim, anim;
    if (lcv) {   // 라벨 곡선(앱 typhoonLabelProg)
      if (pgs) L.push(fmt('var LS%d=slid(TPN,"L%d");LS%d.setValue(100);', [li, li, li]));
      else {
        need(L, 'linK');
        L.push(fmt('var LS%d=slid(TPN,"L%d");LS%d.setValueAtTime(%f,0);LS%d.setValueAtTime(%f,100);linK(LS%d);', [li, li, li, t_lab, li, t_lab + lab_len, li]));
      }
      const kxp = IOC + fmt('var k=thisComp.layer("TPROG").effect("L%d")(1)/100;', [li]);
      trim = fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");tm.property("ADBE Vector Trim End").expression=%s;', [pyJsonStr(kxp + '100*ioc(k/0.6)')]);
      anim = fmt('ll.property("Opacity").expression=%s;ll.property("Scale").expression=%s;',
        [pyJsonStr(kxp + 'var v=100*ioc((k-0.3)/0.7);Math.min(100,2*v)'), pyJsonStr(kxp + 'var v=100*ioc((k-0.3)/0.7);[v,v]')]);
    } else {
      trim = fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(%f,0);en.setValueAtTime(%f,100);ezR(en);', [t_lab, t_line_end]);
      anim = fmt('var lop=ll.property("Opacity");lop.setValueAtTime(%f,0);lop.setValueAtTime(%f,100);ezR(lop);' +
        'var lsc=ll.property("Scale");lsc.setValueAtTime(%f,[0,0]);lsc.setValueAtTime(%f,[100,100]);ezR(lsc);', [t_box, t_box + 0.3, t_box, t_box_end]);
    }
    L.push(fmt('try{var ln=TG.layers.addShape();ln.name="\\uc9c0\\uc2dc\\uc120%d";ln.property("Position").setValue([0,0]);ln.property("Anchor Point").setValue([0,0]);' +
      'var root=ln.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
      'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;', [li, pyJsonStr(leader)]) +
      trim +
      'var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#DCE8F7"));st.property("ADBE Vector Stroke Width").setValue(2.6);try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}}catch(e){}');
    // strokejs — 원본에서 계산만 하고 쓰지 않음
    if (bstrokeW > 0) fmt('var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);', [bstroke, bstrokeW]);
    const LW = 1000, LH = 360;
    const cx = 500, cy = 180;   // LW // 2, LH // 2
    const boxpath = fmt('var tr=thisComp.layer("LBLTX%d").sourceRectAtTime(time,false);var w=tr.width+48,h=tr.height+28;if(w<%f*0.6)w=%f*0.6;if(h<%f*0.6)h=%f*0.6;' +
      'var r=Math.min(%f,Math.min(w,h)/2);var hw=w/2,hh=h/2,k=r*0.5523;' +
      'var P=[[-hw+r,-hh],[hw-r,-hh],[hw,-hh+r],[hw,hh-r],[hw-r,hh],[-hw+r,hh],[-hw,hh-r],[-hw,-hh+r]];' +
      'var it=[[-k,0],[0,0],[0,-k],[0,0],[k,0],[0,0],[0,k],[0,0]];' +
      'var ot=[[0,0],[k,0],[0,0],[0,k],[0,0],[-k,0],[0,0],[0,-k]];' +
      'createPath(P,it,ot,true);', [li, bw, bw, bh, bh, brad]);
    const bpj = pyJsonStr(boxpath);
    const lpos = rot ? fmt('ll.property("Position").expression=%s;', [pyJsonStr(ROTC + rotxy(bx, by) + fmt('[bx+%f,by]', [off]))]) : '';
    L.push(fmt('try{var pc=proj.items.addComp("\\ub77c\\ubca8%d",%d,%d,1.0,TG.duration,TG.frameRate);' +
      'var tl=pc.layers.addText("%s");tl.name="LBLTX%d";var d=tl.property("Source Text").value;d.fontSize=%d;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("%s");' +
      'try{d.font="%s";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=%f;}catch(e){}tl.property("Source Text").setValue(d);' +
      'var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left+r.width/2,r.top+r.height/2]);tl.property("Position").setValue([%d,%d]);' +
      'var bfx=pc.layers.addShape();bfx.name="\\ubc15\\uc2a4";bfx.property("Anchor Point").setValue([0,0]);bfx.property("Position").setValue([%d,%d]);' +
      'var rf=bfx.property("ADBE Root Vectors Group");var gf=rf.addProperty("ADBE Vector Group");var cf=gf.property("ADBE Vectors Group");' +
      'var pf=cf.addProperty("ADBE Vector Shape - Group");pf.property("ADBE Vector Shape").expression=%s;' +
      'var fl=cf.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("%s"));try{fl.property("ADBE Vector Fill Opacity").setValue(%f);}catch(e){}' +
      'var sbx=pc.layers.addShape();sbx.name="\\ubc15\\uc2a4\\uc120";sbx.property("Anchor Point").setValue([0,0]);sbx.property("Position").setValue([%d,%d]);' +
      'var rs=sbx.property("ADBE Root Vectors Group");var gs=rs.addProperty("ADBE Vector Group");var cs=gs.property("ADBE Vectors Group");' +
      'var ps=cs.addProperty("ADBE Vector Shape - Group");ps.property("ADBE Vector Shape").expression=%s;' +
      'var st=cs.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(2);' +
      'try{bfx.moveToEnd();}catch(e){}try{tl.moveToBeginning();}catch(e){}' +
      'var ll=TG.layers.add(pc);ll.name="\\ub77c\\ubca8%d";ll.property("Anchor Point").setValue([%f,%d]);ll.property("Position").setValue([%f,%f]);try{dshadow(ll);}catch(e){}',
    [li, LW, LH, txt, li, size, col, font, float(get(lb, 'track', -25.0)), cx, cy, cx, cy, bpj, bfill, bfop, cx, cy, bpj, bstroke, li, cx + off, cy, bx + off, by]) +
      lpos + anim + '}catch(e){}');
  }
  if (camk !== null) for (const s of camk) L.push(s);   // 카메라 키 — 부모 연결이 다 끝난 뒤(F1)
  L.push('})();');
}

// ── helper.py emit_compare_rig ──
function emitCompareRig(L, rig) {
  const tys = iter(get(rig, 'typhoons', []));
  const rv = or(get(rig, 'reveal', {}), {});
  const r_start = float(get(rv, 'start', 1.0)), r_path = float(get(rv, 'path', 2.0)), r_lab = float(get(rv, 'labelLen', 1.0));
  const cs = camspec(get(rig, 'camera'));
  const lcv = on(get(rig, 'labelCurve'));
  const gap = xnum(get(rig, 'leaderGap'), 0.0);
  L.push('(function(){');
  let camk = null, rot = false;
  if (cs) [camk, rot] = camEmit(L, 'CAM', 'ROT', cs);
  const bgp = placeOf(get(rig, 'bgPlace'));
  L.push(fmt('var bgL=TG.layers.add(imp("%s"));bgL.name="\\uc9c0\\ub3c4";%s%s', [js(get(rig, 'bg', '')), bgp ? placejs('bgL', bgp) : '', cs ? 'bgL.parent=CAM;' : '']));
  const deferred = [];
  for (let ti = 0; ti < tys.length; ti++) {
    const ty = tys[ti];
    const A = iter(get(ty, 'points', []));
    const n = A.length;
    if (n < 1) continue;
    const col = js(get(ty, 'color', '#FF5A5A'));

    const _cc = new Array(n).fill(0.0);
    for (let _j = 1; _j < n; _j++) {
      const _dx = float(sub(A[_j], 'x')) - float(sub(A[_j - 1], 'x')), _dy = float(sub(A[_j], 'y')) - float(sub(A[_j - 1], 'y'));
      _cc[_j] = _cc[_j - 1] + Math.sqrt(_dx * _dx + _dy * _dy);
    }
    const _ct = (n > 1 && _cc[n - 1] > 0) ? _cc[n - 1] : 1.0;
    const tappc = j => r_start + r_path * (index(_cc, clampIdx(n, j)) / _ct);
    const pg = progOf(get(ty, 'prog'));
    // 지점 널
    for (let i = 0; i < n; i++) {
      const p = A[i];
      L.push(fmt('var C%d_%d=TG.layers.addNull();C%d_%d.name="C%d_%d";C%d_%d.property("Position").setValue([%f,%f]);C%d_%d.enabled=false;%s',
        [ti, i, ti, i, ti, i, ti, i, float(sub(p, 'x')), float(sub(p, 'y')), ti, i, cs ? fmt('C%d_%d.parent=CAM;', [ti, i]) : '']));
    }
    L.push(fmt('var ICON%d=imp("%s");', [ti, js(get(ty, 'iconFile', ''))]));
    let cpre = '', ccum = '';
    if (pg !== null) {
      need(L, 'slid');
      let pk;
      if (pg[1] <= pg[0]) pk = fmt('CPR%d.setValue(100);', [ti]);
      else {
        need(L, 'linK');
        pk = fmt('CPR%d.setValueAtTime(%f,0);CPR%d.setValueAtTime(%f,100);linK(CPR%d);', [ti, pg[0], ti, pg[1], ti]);
      }
      L.push(fmt('var CP%d=TG.layers.addNull();CP%d.name="CPROG%d";CP%d.guideLayer=true;var CPR%d=slid(CP%d,"PROG");%s', [ti, ti, ti, ti, ti, ti, pk]));
      cpre = IOC + fmt('var P=ioc(thisComp.layer("CPROG%d").effect("PROG")(1)/100);', [ti]);
      const q = [];
      for (let i = 0; i < n; i++) q.push(fmt('thisComp.layer("C%d_%d").position', [ti, i]));
      ccum = 'var Q=[' + q.join(',') + '],c=[0],i;' +
        'for(i=1;i<Q.length;i++){var dx=Q[i][0]-Q[i-1][0],dy=Q[i][1]-Q[i-1][1];c.push(c[i-1]+Math.sqrt(dx*dx+dy*dy));}var T=c[c.length-1];';
    }
    // 경로선
    if (n >= 2) {
      const q = [];
      for (let i = 0; i < n; i++) q.push(fmt('thisComp.layer("C%d_%d").position', [ti, i]));
      const expr = 'var Q=[' + q.join(',') + '];for(var i=0;i<Q.length;i++){Q[i]=[Q[i][0],Q[i][1]];}createPath(Q,[],[],false);';
      const lw = float(get(ty, 'lineW', 2.2));
      const trim = pg !== null
        ? fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");tm.property("ADBE Vector Trim End").expression=%s;', [pyJsonStr(cpre + '100*P')])
        : fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(%f,0);en.setValueAtTime(%f,100);', [tappc(0), tappc(n - 1)]);
      L.push(fmt('try{var sl=TG.layers.addShape();sl.name="\\ube44\\uad50\\uc120%d";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);%s' +
        'var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
        'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;', [ti, cs ? 'sl.parent=CAM;' : '', pyJsonStr(expr)]) +
        trim +
        fmt('var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);' +
          'try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}}catch(e){}', [col, lw]));
    }
    // 아이콘
    const icsc = float(get(ty, 'iconScreenH', 15)) / or(float(get(ty, 'iconRenderH', 225)), 225.0) * 100.0;
    const anc = float(get(ty, 'iconH', 270)) / 2.0;
    for (const i of iter(get(ty, 'iconAt', []))) {
      const ii = int(i); const ta = tappc(ii);
      if (pg !== null) {
        const ox = cpre + ccum + fmt('(%d==0||(P>0&&(T<=0||c[%d]<=P*T+1e-9)))?100:0', [ii, ii]);
        L.push(fmt('try{var ic=TG.layers.add(ICON%d);ic.name="\\uc544\\uc774\\ucf58%d_%d";ic.parent=C%d_%d;' +
          'ic.property("Anchor Point").setValue([%f,%f]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([%f,%f]);' +
          'ic.property("Opacity").expression=%s;}catch(e){}',
        [ti, ti, ii, ti, ii, anc, anc, icsc, icsc, pyJsonStr(ox)]));
        continue;
      }
      L.push(fmt('try{var ic=TG.layers.add(ICON%d);ic.name="\\uc544\\uc774\\ucf58%d_%d";ic.parent=C%d_%d;' +
        'ic.property("Anchor Point").setValue([%f,%f]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([%f,%f]);' +
        'var op=ic.property("Opacity");op.setValueAtTime(%f,0);op.setValueAtTime(%f,100);ezR(op);}catch(e){}',
      [ti, ti, ii, ti, ii, anc, anc, icsc, icsc, ta, ta + 0.22]));
    }
    // 선두 아이콘(화면 compareIconEl isHead)
    if (pg !== null && n >= 2 && on(get(ty, 'head'))) {
      const hk = xnum(get(ty, 'headK'), 10.0 / 6.0);
      const hpos = cpre + ccum + 'var tg=P*T,i2=0;while(i2+1<Q.length&&c[i2+1]<=tg)i2++;var j2=Math.min(i2+1,Q.length-1),sg=c[j2]-c[i2],u=sg>0?(tg-c[i2])/sg:0;' +
        '[Q[i2][0]+(Q[j2][0]-Q[i2][0])*u,Q[i2][1]+(Q[j2][1]-Q[i2][1])*u]';
      L.push(fmt('try{var hd=TG.layers.add(ICON%d);hd.name="\\uc120\\ub450%d";%shd.property("Anchor Point").setValue([%f,%f]);hd.property("Scale").setValue([%f,%f]);' +
        'hd.property("Position").expression=%s;hd.property("Opacity").expression=%s;}catch(e){}',
      [ti, ti, cs ? 'hd.parent=CAM;' : '', anc, anc, icsc * hk, icsc * hk, pyJsonStr(hpos), pyJsonStr(cpre + ccum + '(P>0&&P<1&&T>0)?100:0')]));
    }
    // 이름표
    const nl = get(ty, 'nameLabel');
    if (truthy(nl)) {
      const nsz = int(float(get(nl, 'size', 34))); const ncol = js(get(nl, 'col', '#FFFFFF')); const nwt = suitePs(get(nl, 'weight', 800)); const ntxt = js(get(nl, 'txt', ''));
      const tnl = tappc(n - 1);
      const nfade = on(get(nl, 'always')) ? '' : fmt('var op=nt.property("Opacity");op.setValueAtTime(%f,0);op.setValueAtTime(%f,100);ezR(op);', [tnl, tnl + 0.3]);
      deferred.push(fmt('try{var nt=TG.layers.addText("%s");nt.name="\\uc774\\ub984%d";var d=nt.property("Source Text").value;d.fontSize=%d;' +
        'd.applyFill=true;d.fillColor=hx("%s");d.applyStroke=true;d.strokeColor=hx("#0A1526");d.strokeWidth=4.5;try{d.strokeOverFill=false;}catch(e){}' +
        'try{d.font="%s";}catch(e){}try{d.tracking=0;}catch(e){}nt.property("Source Text").setValue(d);' +
        'var r=nt.sourceRectAtTime(0,false);nt.property("Anchor Point").setValue([r.left,r.top+r.height/2]);nt.property("Position").setValue([%f,%f]);',
      [ntxt, ti, nsz, ncol, nwt, float(get(nl, 'x', 0)), float(get(nl, 'y', 0))]) + nfade + '}catch(e){}');
    }
    // 수치라벨
    const icon_idx = new Set(iter(get(ty, 'iconAt', [])).map(x => int(round(float(x))).toString()));
    const labels = iter(get(ty, 'labels', []));
    for (let li = 0; li < labels.length; li++) {
      const lb = labels[li];
      const idx = int(get(lb, 'idx', 0));
      if (idx < 0n || idx >= BigInt(n)) continue;
      const bx = float(get(lb, 'bx', 0)), by = float(get(lb, 'by', 0));
      const bw = float(get(lb, 'bw', 120)), bh = float(get(lb, 'bh', 60));
      const size = int(round(float(get(lb, 'size', 40)) * 1.1)); const lcol = js(get(lb, 'col', '#FFFFFF'));
      const bfill = js(get(lb, 'fill', '#0C295F')); const bstroke = js(get(lb, 'stroke', '#3F6BD8')); const bstrokeW = float(get(lb, 'strokeW', 0)) * 2.0; const brad = float(get(lb, 'radius', 14));
      const bfop = float(get(lb, 'fillOp', 1.0)) * 80.0;
      const font = suitePs(get(lb, 'weight', 600)); const txt = js(get(lb, 'txt', ''));
      const px = float(get(lb, 'px', bx));
      const use_left = Math.abs(px - (bx - bw / 2.0)) <= Math.abs(px - (bx + bw / 2.0));
      const offx = use_left ? (-bw / 2.0) : (bw / 2.0);
      const t_lab = tappc(idx);
      const t_line_end = t_lab + r_lab * 0.66, t_box = t_lab + r_lab * 0.33, t_box_end = t_box + r_lab * 0.66;
      const nid = fmt('%d_%d', [ti, li]);
      const lx = pg !== null && lcv;
      const fa = lx ? cpre + ccum + fmt('var fA=T>0?c[%d]/T:%s;', [idx, n > 1 ? fmt('%d/%d', [idx, n - 1]) : '0']) : '';
      if (!icon_idx.has(idx.toString())) {
        const aop = lx
          ? fmt('ac.property("Opacity").expression=%s;', [pyJsonStr(fa + 'var v=(P-fA+0.1)/0.1;100*Math.min(1,3*(v<0?0:v>1?1:v))')])
          : fmt('var op=ac.property("Opacity");op.setValueAtTime(%f,0);op.setValueAtTime(%f,100);ezR(op);', [t_lab, t_lab + 0.22]);
        deferred.push(fmt('try{var ac=TG.layers.addShape();ac.name="\\uc575\\ucee4%s";ac.parent=C%d_%d;ac.property("Position").setValue([0,0]);ac.property("Anchor Point").setValue([0,0]);' +
          'var root=ac.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
          'var el=ct.addProperty("ADBE Vector Shape - Ellipse");el.property("ADBE Vector Ellipse Size").setValue([12,12]);' +
          'var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("%s"));' +
          'var stt=ct.addProperty("ADBE Vector Graphic - Stroke");stt.property("ADBE Vector Stroke Color").setValue(hx("#FFFFFF"));stt.property("ADBE Vector Stroke Width").setValue(1.6);',
        [nid, ti, idx, col]) + aop + '}catch(e){}');
      }
      const leader = fmt('var P=thisComp.layer("C%d_%d").%s;P=[P[0],P[1]];', [ti, idx, cs ? 'toComp([0,0])' : 'position']) + leadBox(bx, by, bw / 2.0, rot) + leadTail(gap);
      let trim, anim;
      if (lx) {
        trim = fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");tm.property("ADBE Vector Trim End").expression=%s;', [pyJsonStr(fa + 'var v=(P-fA+0.1)/0.1;100*(v<0?0:v>1?1:v)')]);
        anim = fmt('ll.property("Opacity").expression=%s;ll.property("Scale").expression=%s;',
          [pyJsonStr(fa + 'var v=(P-fA+0.16)/0.16;v=100*(v<0?0:v>1?1:v);Math.min(100,2*v)'), pyJsonStr(fa + 'var v=(P-fA+0.16)/0.16;v=100*(v<0?0:v>1?1:v);[v,v]')]);
      } else {
        trim = fmt('var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(%f,0);en.setValueAtTime(%f,100);ezR(en);', [t_lab, t_line_end]);
        anim = fmt('var lop=ll.property("Opacity");lop.setValueAtTime(%f,0);lop.setValueAtTime(%f,100);ezR(lop);' +
          'var lsc=ll.property("Scale");lsc.setValueAtTime(%f,[0,0]);lsc.setValueAtTime(%f,[100,100]);ezR(lsc);', [t_box, t_box + 0.3, t_box, t_box_end]);
      }
      deferred.push(fmt('try{var ln=TG.layers.addShape();ln.name="\\uc9c0\\uc2dc\\uc120%s";ln.property("Position").setValue([0,0]);ln.property("Anchor Point").setValue([0,0]);' +
        'var root=ln.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");' +
        'var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression=%s;', [nid, pyJsonStr(leader)]) +
        trim +
        'var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#DCE8F7"));st.property("ADBE Vector Stroke Width").setValue(2.6);try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}}catch(e){}');
      // strokejs — 원본에서 계산만 하고 쓰지 않음
      if (bstrokeW > 0) fmt('var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(%f);', [bstroke, bstrokeW]);
      const LW = 1000, LH = 360;
      const cxp = 500, cyp = 180;   // LW // 2, LH // 2
      const boxpath = fmt('var tr=thisComp.layer("LBLC%s").sourceRectAtTime(time,false);var w=tr.width+48,h=tr.height+28;if(w<%f*0.6)w=%f*0.6;if(h<%f*0.6)h=%f*0.6;' +
        'var r=Math.min(%f,Math.min(w,h)/2);var hw=w/2,hh=h/2,k=r*0.5523;' +
        'var P=[[-hw+r,-hh],[hw-r,-hh],[hw,-hh+r],[hw,hh-r],[hw-r,hh],[-hw+r,hh],[-hw,hh-r],[-hw,-hh+r]];' +
        'var it=[[-k,0],[0,0],[0,-k],[0,0],[k,0],[0,0],[0,k],[0,0]];' +
        'var ot=[[0,0],[k,0],[0,0],[0,k],[0,0],[-k,0],[0,0],[0,-k]];' +
        'createPath(P,it,ot,true);', [nid, bw, bw, bh, bh, brad]);
      const bpj = pyJsonStr(boxpath);
      const lpos = rot ? fmt('ll.property("Position").expression=%s;', [pyJsonStr(ROTC + rotxy(bx, by) + fmt('[bx+%f,by]', [offx]))]) : '';
      deferred.push(fmt('try{var pc=proj.items.addComp("\\ub77c\\ubca8%s",%d,%d,1.0,TG.duration,TG.frameRate);' +
        'var tl=pc.layers.addText("%s");tl.name="LBLC%s";var d=tl.property("Source Text").value;d.fontSize=%d;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("%s");' +
        'try{d.font="%s";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=%f;}catch(e){}tl.property("Source Text").setValue(d);' +
        'var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left+r.width/2,r.top+r.height/2]);tl.property("Position").setValue([%d,%d]);' +
        'var bfx=pc.layers.addShape();bfx.name="\\ubc15\\uc2a4";bfx.property("Anchor Point").setValue([0,0]);bfx.property("Position").setValue([%d,%d]);' +
        'var rf=bfx.property("ADBE Root Vectors Group");var gf=rf.addProperty("ADBE Vector Group");var cf=gf.property("ADBE Vectors Group");' +
        'var pf=cf.addProperty("ADBE Vector Shape - Group");pf.property("ADBE Vector Shape").expression=%s;' +
        'var fl=cf.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("%s"));try{fl.property("ADBE Vector Fill Opacity").setValue(%f);}catch(e){}' +
        'var sbx=pc.layers.addShape();sbx.name="\\ubc15\\uc2a4\\uc120";sbx.property("Anchor Point").setValue([0,0]);sbx.property("Position").setValue([%d,%d]);' +
        'var rs=sbx.property("ADBE Root Vectors Group");var gs=rs.addProperty("ADBE Vector Group");var cs=gs.property("ADBE Vectors Group");' +
        'var ps=cs.addProperty("ADBE Vector Shape - Group");ps.property("ADBE Vector Shape").expression=%s;' +
        'var st=cs.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("%s"));st.property("ADBE Vector Stroke Width").setValue(2);' +
        'try{bfx.moveToEnd();}catch(e){}try{tl.moveToBeginning();}catch(e){}' +
        'var ll=TG.layers.add(pc);ll.name="\\ub77c\\ubca8%s";ll.property("Anchor Point").setValue([%f,%d]);ll.property("Position").setValue([%f,%f]);try{dshadow(ll);}catch(e){}',
      [nid, LW, LH, txt, nid, size, lcol, font, float(get(lb, 'track', -25.0)), cxp, cyp, cxp, cyp, bpj, bfill, bfop, cxp, cyp, bpj, bstroke, nid, cxp + offx, cyp, bx + offx, by]) +
        lpos + anim + '}catch(e){}');
    }
  }
  for (const s of deferred) L.push(s);
  if (camk !== null) for (const s of camk) L.push(s);   // 카메라 키 — 부모 연결이 다 끝난 뒤(F1)
  L.push('})();');
}

// JUST.get(align, "LEFT") — 해시 불가(list/dict)면 TypeError
const JUST = { start: 'LEFT', middle: 'CENTER', end: 'RIGHT' };
function justGet(a) {
  if (Array.isArray(a) || P.isDict(a)) throw pyErr('TypeError', "unhashable type: '" + P.typeName(a) + "'");
  return (typeof a === 'string' && Object.prototype.hasOwnProperty.call(JUST, a)) ? JUST[a] : 'LEFT';
}
// str + str — str 아니면 TypeError
function strCat(a, b) {
  if (typeof a !== 'string') throw pyErr('TypeError', 'can only concatenate str (not "' + P.typeName(a) + '") to str');
  return a + b;
}

// ── helper.py build_ae_jsx ──
function buildAeJsx(spec, framesDir) {
  spec = P.pyJsonVal(spec);   // 정수 number → BigInt(파이썬 int 와 같은 값·자릿수)
  const c = get(spec, 'comp', {});
  const layers = get(spec, 'layers', []);
  const vfe = get(spec, 'vfEnter');
  const w = int(get(c, 'w', 1920)), h = int(get(c, 'h', 1080));
  const fps = float(get(c, 'fps', 29.97)), dur = max2(0.2, float(get(c, 'dur', 6)));
  const L = [];
  L.push('app.beginUndoGroup("WeatherCG");');
  L.push('var proj=app.project;');
  if (typeof framesDir !== 'string') throw pyErr('AttributeError', 'frames_dir has no replace');
  L.push(fmt('var dir="%s";', [js(framesDir.split('\\').join('/'))]));
  L.push(fmt('var comp=proj.items.addComp("%s",%d,%d,1.0,%f,%f);', [js(get(c, 'name', 'WeatherCG')), w, h, dur, fps]));
  if (truthy(vfe)) {
    L.push(fmt('var vfc=proj.items.addComp("VF_\\uc804\\uccb4",%d,%d,1.0,%f,%f);', [w, h, dur, fps]));
    L.push('var TG=vfc;');
  } else {
    L.push('var TG=comp;');
  }
  L.push('function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}');
  L.push('function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}');
  L.push('function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}');
  L.push('function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}');
  L.push('function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];' +
    'try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);' +
    'prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);' +
    'prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}');
  L.push('function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}');
  L.push('function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}' +
    'var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}' +
    'prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);' +
    'prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);' +
    'prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}');
  // 라벨/제목 그림자 = AE Drop Shadow
  const sh = or(get(spec, 'shadow'), {});
  const sx = float(get(sh, 'x', 0)), sy = float(get(sh, 'y', 8));
  const dist = hypot(sx, sy);
  const direction = mod(degrees(atan2(sx, -sy)) + 360.0, 360.0);
  const sop = max2(0.0, min2(255.0, float(get(sh, 'op', 45)) * 2.55));
  const softness = max2(0.0, float(get(sh, 'blur', 10)) * 2.0);
  const shcol = get(sh, 'col', '#000814');
  L.push(fmt('function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");' +
    'e.property("Shadow Color").setValue(hx("%s"));e.property("Opacity").setValue(%f);' +
    'e.property("Direction").setValue(%f);e.property("Distance").setValue(%f);e.property("Softness").setValue(%f);}catch(err){}}',
    [js(shcol), sop, direction, dist, softness]));
  // 20261008 — 일반 지도 카메라: CAM(·ROT) 널을 항등으로 먼저, cam:1 이미지(지도 묶음)를 자식으로, 키는 맨 끝에(F1)
  const gcs = camspec(get(spec, 'camera'));
  let gtail = null, grot = false;
  if (gcs) [gtail, grot] = camEmit(L, 'GCAM', 'GROT', gcs);
  const LA = iter(layers);
  for (let i = 0; i < LA.length; i++) {
    const l = LA[i];
    const v = fmt('L%d', [i]);
    if (truthy(get(l, 'typhoonRig'))) { emitTyphoonRig(L, get(l, 'typhoonRig')); continue; }
    if (truthy(get(l, 'compareRig'))) { emitCompareRig(L, get(l, 'compareRig')); continue; }
    if (on(get(l, 'legacy'))) continue;   // 새 헬퍼가 대신 만드는 옛 레이어(지시선 PNG) — 건너뜀
    const t = get(l, 'text');
    if (truthy(t)) {
      // 제목 = 편집 가능한 텍스트 레이어
      const sz = or(float(get(t, 'size', 60)), 60.0);
      L.push(fmt('var %s=addT("%s","%s");', [v, js(get(t, 'content', '')), js(get(l, 'name', 'text'))]));
      L.push(fmt('(function(){var d=%s.property("Source Text").value;d.fontSize=%d;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("%s");' +
        'try{d.font="%s";}catch(e){}' +
        'try{d.justification=ParagraphJustification.%s_JUSTIFY;}catch(e){}' +
        'try{d.tracking=%f;}catch(e){}' +
        '%s.property("Source Text").setValue(d);})();',
        [v, int(sz), js(get(t, 'col', '#FFFFFF')), suitePs(get(t, 'weight', 400)),
          justGet(get(t, 'align', 'start')), float(get(t, 'track', 0)) / sz * 1000.0, v]));
      L.push(fmt('%s.property("Position").setValue([%f,%f]);', [v, float(get(t, 'x', 0)), float(get(t, 'y', 0))]));
      L.push(fmt('dshadow(%s);', [v]));
      continue;
    }
    const lg = get(l, 'legendComp');
    if (truthy(lg)) {
      // 범례 = 프리컴프 안에 항목별 Shape Layer + Text Layer
      const lw = max2(1n, int(ceil(float(get(lg, 'w', 100)))));
      const lh = max2(1n, int(ceil(float(get(lg, 'h', 40)))));
      const pc = fmt('LG%d', [i]);
      L.push(fmt('var %s=proj.items.addComp("%s",%d,%d,1.0,%f,%f);', [pc, js(get(l, 'name', '범례')), lw, lh, dur, fps]));
      const items = iter(get(lg, 'items', []));
      for (let ji = 0; ji < items.length; ji++) {
        const item = items[ji];
        const nm = or(get(item, 'name'), fmt('범례 %d', [ji + 1]));
        const sh2 = or(get(item, 'shape'), {});
        const sx2 = float(get(sh2, 'x', 0)), sy2 = float(get(sh2, 'y', 0));
        const sw = max2(0.1, float(get(sh2, 'w', 1))), shh = max2(0.1, float(get(sh2, 'h', 1)));
        const sr = max2(0.0, float(get(sh2, 'radius', 0)));
        L.push(fmt('(function(){var sl=%s.layers.addShape();sl.name="%s";' +
          'var root=sl.property("ADBE Root Vectors Group");' +
          'var vg=root.addProperty("ADBE Vector Group");' +
          'var ct=vg.property("ADBE Vectors Group");' +
          'var rc=ct.addProperty("ADBE Vector Shape - Rect");' +
          'rc.property("ADBE Vector Rect Size").setValue([%f,%f]);' +
          'rc.property("ADBE Vector Rect Roundness").setValue(%f);' +
          'var fl=ct.addProperty("ADBE Vector Graphic - Fill");' +
          'fl.property("ADBE Vector Fill Color").setValue(hx("%s"));' +
          'sl.property("Anchor Point").setValue([0,0]);' +
          'sl.property("Position").setValue([%f,%f]);})();',
          [pc, js(strCat(nm, '_네모')), sw, shh, sr, js(get(sh2, 'fill', '#FFFFFF')),
            sx2 + sw / 2, sy2 + shh / 2]));
        const tx = or(get(item, 'text'), {});
        const tsz = max2(1.0, float(get(tx, 'size', 30)));
        L.push(fmt('(function(){var tl=%s.layers.addText("%s");tl.name="%s";' +
          'var d=tl.property("Source Text").value;d.fontSize=%d;' +
          'd.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("%s");' +
          'try{d.font="%s";}catch(e){}' +
          'try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}' +
          'try{d.tracking=%f;}catch(e){}tl.property("Source Text").setValue(d);' +
          'var r=tl.sourceRectAtTime(0,false);' +
          'tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);' +
          'tl.property("Position").setValue([%f,%f]);})();',
          [pc, js(get(tx, 'content', '')), js(strCat(nm, '_글자')), int(tsz),
            js(get(tx, 'fill', '#FFFFFF')), suitePs(get(tx, 'weight', 600)),
            float(get(tx, 'track', 0)) / tsz * 1000.0,
            float(get(tx, 'x', 0)), float(get(tx, 'centerY', div(lh, 2n)))]));
      }
      L.push(fmt('var %s=TG.layers.add(%s);%s.name="%s";', [v, pc, v, js(get(l, 'name', '범례'))]));
      L.push(fmt('%s.property("Position").setValue([%f,%f]);', [v, float(get(lg, 'x', 0)), float(get(lg, 'y', 0))]));
      continue;
    }
    const lc = get(l, 'labelComp');
    if (truthy(lc)) {
      // 라벨 = 프리컴프(배경 이미지 + 편집 텍스트)
      const lw = max2(1n, int(get(lc, 'w', 100))), lh = max2(1n, int(get(lc, 'h', 40)));
      const pc = fmt('PC%d', [i]);
      L.push(fmt('var %s=proj.items.addComp("%s",%d,%d,1.0,%f,%f);', [pc, js(get(l, 'name', 'label')), lw, lh, dur, fps]));
      L.push(fmt('%s.layers.add(imp("%s")).name="\\ubc30\\uacbd";', [pc, js(get(lc, 'bg', ''))]));
      for (const tx of iter(get(lc, 'texts', []))) {
        const tsz = or(float(get(tx, 'size', 30)), 30.0);
        L.push(fmt('(function(){var tl=%s.layers.addText("%s");var d=tl.property("Source Text").value;' +
          'd.fontSize=%d;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("%s");' +
          'try{d.font="%s";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}' +
          'try{d.tracking=%f;}catch(e){}tl.property("Source Text").setValue(d);' +
          'tl.property("Position").setValue([%f,%f]);})();',
          [pc, js(get(tx, 'content', '')), int(tsz), js(get(tx, 'col', '#FFFFFF')),
            suitePs(get(tx, 'weight', 500)), float(get(tx, 'track', 0)) / tsz * 1000.0,
            float(get(tx, 'cx', div(lw, 2n))), float(get(tx, 'cy', div(lh, 2n)))]));
      }
      const lcx = float(get(lc, 'x', 0)), lcy = float(get(lc, 'y', 0));
      L.push(fmt('var %s=TG.layers.add(%s);%s.name="%s";', [v, pc, v, js(get(l, 'name', 'label'))]));
      L.push(fmt('%s.property("Position").setValue([%f,%f]);', [v, lcx, lcy]));
      L.push(fmt('dshadow(%s);', [v]));
      const f = get(l, 'fade');
      let fz = null;
      if (truthy(f)) {
        const s = float(get(f, 'start', 0)); const e = s + float(get(f, 'len', 0.3));
        const ez = ease2(get(f, 'ease'));   // 앱 easeOut = AE 영향 34/85(속도 0) — 같은 곡선
        if (ez) { need(L, 'fadeE'); L.push(fmt('fadeE(%s,%f,%f,%f,%f);', [v, s, e, ez[0], ez[1]])); }
        else L.push(fmt('fadeL(%s,%f,%f);', [v, s, e]));
        const rise = float(get(f, 'rise', 0));
        if (truthy(rise)) {
          L.push(fmt('(function(){var p=%s.property("Position");p.setValueAtTime(%f,[%f,%f]);p.setValueAtTime(%f,[%f,%f]);%s})();',
            [v, s, lcx, lcy + rise, e, lcx, lcy, ez ? fmt('ezE(p,%f,%f);', ez) : 'ez2(p);']));
        }
        if (s > 0.001) L.push(fmt('try{%s.inPoint=%f;}catch(err){}', [v, s]));
        fz = [s, e, ez];
      }
      const ld = leaderOf(get(lc, 'leader'));
      if (ld) leaderEmit(L, v, js(get(l, 'name', 'label')), ld, fz);   // 지시선 라벨 — 선이 올라오는 박스를 따라가게
      continue;
    }
    L.push(fmt('var %s=addL("%s","%s");', [v, js(get(l, 'file', '')), js(get(l, 'name', 'layer'))]));
    const pl = placeOf(get(l, 'place'));   // 블리드(프레임보다 크게 구운 지도) — 왼쪽 위 자리·배율
    if (pl) L.push(placejs(v, pl));
    const cm = xnum(get(l, 'cam'), 0.0);   // 1 = 카메라 따라 이동·확대, 2 = 회전만
    const cp = pt2(get(l, 'camPt'));   // 지도에 붙은 산 — 자리만 카메라를 따라감(크기 그대로), 회전이 있으면 같이 돈다
    if (gcs && cp) {
      L.push(fmt('%s.property("Anchor Point").setValue([%f,%f]);%s.property("Position").expression=%s;%s',
        [v, cp[0], cp[1], v, pyJsonStr(fmt('thisComp.layer("CAM").toComp([%f,%f])', cp)),
          grot ? fmt('%s.property("Rotation").expression=%s;', [v, pyJsonStr('thisComp.layer("ROT").transform.rotation')]) : '']));
    } else if (gcs && cm === 1) L.push(fmt('%s.parent=GCAM;', [v]));
    else if (grot && cm === 2) L.push(fmt('%s.parent=GROT;', [v]));
    const f = get(l, 'fade');
    if (truthy(f)) {
      const s = float(get(f, 'start', 0)); const e = s + float(get(f, 'len', 0.3));
      const ez = ease2(get(f, 'ease'));
      const bl = blindsOf(get(f, 'blinds'));
      if (bl) {
        // 블라인드 — 레이어는 늘 100%, Venetian Blinds 완료도 = 앱 덮임 식. 진행 = 슬라이더(키 2개, 칠 곡선)
        need(L, 'slid');
        if (ez) need(L, 'ezE');
        const cx = fmt('var g=effect("PROG")(1)/100;g<=0?100:(g>=0.999?0:Math.max(0,1-%s-g)*%s)', [ef(bl[2]), bl[3] ? '50' : '100']);
        const vbs = (d) => fmt('var vb=%s.property("ADBE Effect Parade").addProperty("ADBE Venetian Blinds");try{vb.property(2).setValue(%f);vb.property(3).setValue(%f);vb.property(4).setValue(0);}catch(e){}vb.property(1).expression=%s;',
          [v, d, bl[0], pyJsonStr(cx)]);
        L.push(fmt('(function(){var pr=slid(%s,"PROG");pr.setValueAtTime(%f,0);pr.setValueAtTime(%f,100);%s%s%s})();',
          [v, s, e, ez ? fmt('ezE(pr,%f,%f);', ez) : 'ez2(pr);', vbs(bl[1]), bl[3] ? vbs(bl[1] + 180.0) : '']));
      } else if (ez) {
        need(L, 'fadeE');
        L.push(fmt('fadeE(%s,%f,%f,%f,%f);', [v, s, e, ez[0], ez[1]]));
      } else L.push(fmt('fadeL(%s,%f,%f);', [v, s, e]));
      if (s > 0.001) L.push(fmt('try{%s.inPoint=%f;}catch(err){}', [v, s]));
    }
  }
  if (gtail) for (const s of gtail) L.push(s);   // 일반 지도 카메라 키 — 부모 연결이 다 끝난 뒤(F1)
  if (truthy(vfe)) {
    // 내용 프리컴프(vfc)를 메인 컴프에 얹고 진입 애니
    const s = float(get(vfe, 'start', 1.0)); const e = s + float(get(vfe, 'len', 0.6)); const dx = float(get(vfe, 'dx', 320));
    L.push('var vfl=comp.layers.add(vfc);vfl.name="VF_\\uc9c4\\uc785";');
    const vm = get(spec, 'vfMask');   // 패널 마스크 — 진입 레이어와 같이 미끄러진다(화면 vfClip과 같게)
    if (P.isDict(vm)) {
      const mx = xnum(get(vm, 'x'), null), my = xnum(get(vm, 'y'), null), mw = xnum(get(vm, 'w'), 0.0), mh = xnum(get(vm, 'h'), 0.0);
      if (mx !== null && my !== null && mw > 0 && mh > 0) {
        L.push(fmt('try{var vmk=vfl.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");var vsh=new Shape();vsh.vertices=[[%f,%f],[%f,%f],[%f,%f],[%f,%f]];vsh.closed=true;vmk.property("ADBE Mask Shape").setValue(vsh);}catch(e){}',
          [mx, my, mx + mw, my, mx + mw, my + mh, mx, my + mh]));
      }
    }
    L.push('var pp=vfl.property("Position");var cc=[comp.width/2,comp.height/2];');
    L.push(fmt('pp.setValueAtTime(%f,[cc[0]+%f,cc[1]]);pp.setValueAtTime(%f,cc);', [s, dx, e]));
    L.push(fmt('var vo=vfl.property("Opacity");vo.setValueAtTime(%f,0);vo.setValueAtTime(%f,100);', [s, e]));
    const ve = ease2(get(vfe, 'ease'));   // 앱 easeVf = AE 영향 40/80
    if (ve) { need(L, 'ezE'); L.push(fmt('ezE(pp,%f,%f);ezE(vo,%f,%f);', [ve[0], ve[1], ve[0], ve[1]])); }
    else L.push('ez2(pp);ez2(vo);');
  }
  L.push('comp.openInViewer();app.endUndoGroup();');
  return L.join('\n');
}

module.exports = { buildAeJsx, emitTyphoonRig, emitCompareRig, js, suitePs, wantedPs };

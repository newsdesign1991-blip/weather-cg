# -*- coding: utf-8 -*-
# WNS Helper — 날씨CG 앱(브라우저)에서 보낸 PNG 프레임을 방송용 MXF / 투명 MOV 로 인코딩하는 로컬 서버.
# 파이썬 없이 쓰도록 PyInstaller 로 exe 로 컴파일해서 배포한다. (localhost:3720)
# API:
#   GET  /ping                                   -> {"ok":true, "ff":bool}
#   POST /api/frame?sid=..&index=i   (PNG body)  -> 프레임 저장 (index=0 이면 세션 리셋)
#   POST /api/finalize  {sid,mode,filename,outDir,tail}  -> ffmpeg 인코딩 -> {"ok":true,"path":..}
# 모든 응답에 CORS 허용(다른 출처인 앱에서 호출 가능).
import http.server, socketserver, json, os, sys, subprocess, shutil, tempfile, threading, webbrowser, glob, math
from urllib.parse import urlparse, parse_qs

PORT = 3720
FPS = "30000/1001"   # 29.97 방송 표준

def base_dir():
    # 컴파일(exe) 상태면 exe 위치, 아니면 스크립트 위치
    return os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))

def find_ffmpeg():
    p = os.path.join(base_dir(), "ffmpeg.exe")
    if os.path.exists(p):
        return p
    return shutil.which("ffmpeg") or p

FFMPEG = find_ffmpeg()
FRAMES = os.path.join(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "WNS_Helper", "frames")

def safe(s):
    return "".join(c for c in str(s) if c.isalnum() or c in "-_.")[:80] or "s"

# ── 방송용 MXF(XDCAM HD422 50Mbps) — VideoCodec 원본 그대로 (코덱 바꾸면 스튜디오 블랙 위험) ──
SCALE_TV = ("scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int"
            ":in_range=full:out_range=tv:out_color_matrix=bt709")
TFF = "setfield=tff"
SILENT_IN = ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"]
SILENT_MAP = ["-map", "0:v", "-map", "1:a", "-map", "1:a"]
SILENT_ENC = ["-c:a", "pcm_s24le", "-ar", "48000", "-shortest"]

def xdcam():
    return ["-c:v", "mpeg2video", "-profile:v", "0", "-level:v", "2", "-pix_fmt", "yuv422p",
            "-b:v", "50M", "-minrate", "50M", "-maxrate", "50M",
            "-bufsize", "17825792", "-rc_init_occupancy", "17825792",
            "-g", "15", "-bf", "2", "-flags", "+ildct+ilme",
            "-intra_vlc", "1", "-non_linear_quant", "1", "-intra_dc_precision", "2",
            "-qmin", "1", "-lmin", "1", "-qmax", "28",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
            "-aspect", "16:9"]

def mxf_args(pattern, tail, out):
    vf = "%s,tpad=stop_mode=clone:stop_duration=%d,format=yuv422p,%s" % (SCALE_TV, max(0, int(tail)), TFF)
    return ([FFMPEG, "-y", "-threads", "0", "-framerate", FPS, "-i", pattern]
            + SILENT_IN + SILENT_MAP + ["-vf", vf] + xdcam() + SILENT_ENC + ["-f", "mxf", out])

def mov_args(pattern, tail, out):
    vf = "scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=%d,format=argb" % max(0, int(tail))
    return [FFMPEG, "-y", "-threads", "0", "-framerate", FPS, "-i", pattern,
            "-vf", vf, "-c:v", "qtrle", "-pix_fmt", "argb", "-an", out]

# ── After Effects 자동 임포트 (버전 다양 → 설치 폴더 스캔해서 AfterFX.exe 찾음) ──
def find_afterfx():
    pats = [r"C:\Program Files\Adobe\Adobe After Effects *\Support Files\AfterFX.exe",
            r"C:\Program Files (x86)\Adobe\Adobe After Effects *\Support Files\AfterFX.exe"]
    found = []
    for p in pats:
        found += glob.glob(p)
    found.sort(reverse=True)   # 최신 버전(경로 이름 큰 것) 우선
    return found[0] if found else None

# ── Wanted Sans 폰트 사용자 계정 설치(관리자 불필요) — AE에서 제목이 Wanted로 나오게 ──
def _font_src():
    for p in [os.path.join(base_dir(), "fonts", "WantedSansVariable.ttf"),
              r"R:\[F]_Util\WNS\fonts\WantedSansVariable.ttf"]:
        if os.path.exists(p):
            return p
    return None

def ensure_wanted_font():
    try:
        import ctypes, winreg
        src = _font_src()
        if not src:
            return False
        fonts_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        dst = os.path.join(fonts_dir, "WantedSansVariable.ttf")
        newly = False
        if not os.path.exists(dst):
            shutil.copy2(src, dst); newly = True
        # HKCU 폰트 등록 (사용자 설치)
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts")
        try:
            cur, _ = None, None
            try: cur, _ = winreg.QueryValueEx(key, "Wanted Sans Variable (TrueType)")
            except FileNotFoundError: cur = None
            if cur != dst:
                winreg.SetValueEx(key, "Wanted Sans Variable (TrueType)", 0, winreg.REG_SZ, dst); newly = True
        finally:
            winreg.CloseKey(key)
        if newly:
            ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001D, 0, 0, 0, 1000)  # WM_FONTCHANGE 브로드캐스트
        return True
    except Exception:
        return False

SUITE_FONTS = [
    ("SUITE-Light.otf", "SUITE Light (OpenType)"),
    ("SUITE-Regular.otf", "SUITE Regular (OpenType)"),
    ("SUITE-Medium.otf", "SUITE Medium (OpenType)"),
    ("SUITE-SemiBold.otf", "SUITE SemiBold (OpenType)"),
    ("SUITE-Bold.otf", "SUITE Bold (OpenType)"),
    ("SUITE-ExtraBold.otf", "SUITE ExtraBold (OpenType)"),
    ("SUITE-Heavy.otf", "SUITE Heavy (OpenType)"),
]

def ensure_suite_fonts():
    try:
        import ctypes, winreg
        fonts_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts")
        newly = False
        installed = 0
        try:
            for filename, registry_name in SUITE_FONTS:
                candidates = [
                    os.path.join(base_dir(), "fonts", filename),
                    os.path.join(r"R:\[F]_Util\WNS\fonts", filename),
                ]
                src = next((p for p in candidates if os.path.exists(p)), None)
                if not src:
                    continue
                dst = os.path.join(fonts_dir, filename)
                if not os.path.exists(dst):
                    shutil.copy2(src, dst)
                    newly = True
                try:
                    cur, _ = winreg.QueryValueEx(key, registry_name)
                except FileNotFoundError:
                    cur = None
                if cur != dst:
                    winreg.SetValueEx(key, registry_name, 0, winreg.REG_SZ, dst)
                    newly = True
                installed += 1
        finally:
            winreg.CloseKey(key)
        if newly:
            ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001D, 0, 0, 0, 1000)
        return installed == len(SUITE_FONTS)
    except Exception:
        return False

# 제목 굵기(font-weight) → Wanted Sans 가변폰트의 명명 인스턴스 PostScript 이름
def wanted_ps(w):
    try: w = int(w or 400)
    except Exception: w = 400
    table = [(400, "Regular"), (500, "Medium"), (600, "SemiBold"), (700, "Bold"),
             (800, "ExtraBold"), (900, "Black"), (1000, "ExtraBlack")]
    best = min(table, key=lambda t: abs(t[0] - w))
    return "WantedSansVariable-" + best[1]

def suite_ps(w):
    try: w = int(w or 400)
    except Exception: w = 400
    table = [(300, "Light"), (400, "Regular"), (500, "Medium"), (600, "SemiBold"),
             (700, "Bold"), (800, "ExtraBold"), (900, "Heavy")]
    best = min(table, key=lambda t: abs(t[0] - w))
    return "SUITE-" + best[1]

def _js(s):
    # 따옴표·역슬래시 이스케이프 + 비ASCII(한글 등)는 \uXXXX 로 → jsx가 순수 ASCII라 AE 인코딩 문제 없음
    out = []
    for ch in str(s):
        o = ord(ch)
        if ch == "\\": out.append("\\\\")
        elif ch == '"': out.append('\\"')
        elif o < 0x20 or o > 0x7e: out.append("\\u%04x" % o)
        else: out.append(ch)
    return "".join(out)

# 레이어 이미지 + 타임라인 애니 정보를 받아, AE에서 컴포지션을 만들고 레이어를 임포트해
# 타임라인과 같은 애니메이션(색별 페이드인 = dissolve, VF 진입 슬라이드)을 거는 .jsx 를 만든다.
# spec = {comp:{name,w,h,fps,dur}, vfEnter:{start,len,dx}|None, layers:[{file,name,fade:{start,len}|None}] (bottom->top)}
def build_ae_jsx(spec, frames_dir):
    c = spec.get("comp", {})
    layers = spec.get("layers", [])
    vfe = spec.get("vfEnter")
    w = int(c.get("w", 1920)); h = int(c.get("h", 1080))
    fps = float(c.get("fps", 29.97)); dur = max(0.2, float(c.get("dur", 6)))
    L = []
    L.append('app.beginUndoGroup("WeatherCG");')
    L.append('var proj=app.project;')
    L.append('var dir="%s";' % _js(frames_dir.replace("\\", "/")))
    L.append('var comp=proj.items.addComp("%s",%d,%d,1.0,%f,%f);' % (_js(c.get("name", "WeatherCG")), w, h, dur, fps))
    # VF면 모든 내용을 하나의 프리컴프(vfc)에 담고 그 컴프에 진입(opacity+position) 애니. (널 부모는 opacity가 안 먹음)
    if vfe:
        L.append('var vfc=proj.items.addComp("VF_\\uc804\\uccb4",%d,%d,1.0,%f,%f);' % (w, h, dur, fps))
        L.append('var TG=vfc;')
    else:
        L.append('var TG=comp;')
    L.append('function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}')
    L.append('function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}')
    L.append('function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}')
    L.append('function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}')
    # 시작 전엔 안 보이고, [s,e] 동안 0->100 페이드인 (ease-out)
    # 페이드인 이징 — 빠르게 시작해서 느리게 안착(ease-out). 시작키 influence 33, 끝키 influence 75.
    # 공통 이징 — 불투명/위치 모두 temporal ease는 '1개'(위치는 공간속성이라 속도 하나). 시작 influence 33, 끝 75.
    L.append('function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];'
             'try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);'
             'prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);'
             'prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}')
    L.append('function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}')
    # 라벨/제목 그림자 = AE Drop Shadow 이펙트 (지도 그림자와 같은 값)
    sh = spec.get("shadow") or {}
    sx = float(sh.get("x", 0)); sy = float(sh.get("y", 8))
    dist = math.hypot(sx, sy)
    direction = (math.degrees(math.atan2(sx, -sy)) + 360.0) % 360.0   # AE 방향(0=위, 시계방향)
    sop = max(0.0, min(255.0, float(sh.get("op", 45)) * 2.55))
    softness = max(0.0, float(sh.get("blur", 10)) * 2.0)
    shcol = sh.get("col", "#000814")
    L.append('function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");'
             'e.property("Shadow Color").setValue(hx("%s"));e.property("Opacity").setValue(%f);'
             'e.property("Direction").setValue(%f);e.property("Distance").setValue(%f);e.property("Softness").setValue(%f);}catch(err){}}'
             % (_js(shcol), sop, direction, dist, softness))
    varlist = []
    JUST = {"start": "LEFT", "middle": "CENTER", "end": "RIGHT"}
    for i, l in enumerate(layers):
        v = "L%d" % i
        varlist.append(v)
        t = l.get("text")
        if t:
            # 제목 = 편집 가능한 텍스트 레이어 (AE에서 폰트·내용 바로 수정)
            sz = float(t.get("size", 60)) or 60.0
            L.append('var %s=addT("%s","%s");' % (v, _js(t.get("content", "")), _js(l.get("name", "text"))))
            L.append('(function(){var d=%s.property("Source Text").value;d.fontSize=%d;d.applyFill=true;d.fillColor=hx("%s");'
                     'try{d.font="%s";}catch(e){}'   # Wanted 폰트+굵기(설치돼 있으면 적용)
                     'try{d.justification=ParagraphJustification.%s_JUSTIFY;}catch(e){}'
                     'try{d.tracking=%f;}catch(e){}'
                     '%s.property("Source Text").setValue(d);})();'
                     % (v, int(sz), _js(t.get("col", "#FFFFFF")), suite_ps(t.get("weight", 400)),
                        JUST.get(t.get("align", "start"), "LEFT"), float(t.get("track", 0)) / sz * 1000.0, v))
            L.append('%s.property("Position").setValue([%f,%f]);' % (v, float(t.get("x", 0)), float(t.get("y", 0))))
            L.append('dshadow(%s);' % v)   # 제목 그림자
            continue
        lg = l.get("legendComp")
        if lg:
            # 범례 = 프리컴프 안에 항목별 편집 가능한 Shape Layer + Text Layer.
            lw = max(1, int(math.ceil(float(lg.get("w", 100)))))
            lh = max(1, int(math.ceil(float(lg.get("h", 40)))))
            pc = "LG%d" % i
            L.append('var %s=proj.items.addComp("%s",%d,%d,1.0,%f,%f);'
                     % (pc, _js(l.get("name", "범례")), lw, lh, dur, fps))
            for ji, item in enumerate(lg.get("items", [])):
                nm = item.get("name") or ("범례 %d" % (ji + 1))
                sh = item.get("shape") or {}
                sx = float(sh.get("x", 0)); sy = float(sh.get("y", 0))
                sw = max(0.1, float(sh.get("w", 1))); shh = max(0.1, float(sh.get("h", 1)))
                sr = max(0.0, float(sh.get("radius", 0)))
                L.append('(function(){var sl=%s.layers.addShape();sl.name="%s";'
                         'var root=sl.property("ADBE Root Vectors Group");'
                         'var vg=root.addProperty("ADBE Vector Group");'
                         'var ct=vg.property("ADBE Vectors Group");'
                         'var rc=ct.addProperty("ADBE Vector Shape - Rect");'
                         'rc.property("ADBE Vector Rect Size").setValue([%f,%f]);'
                         'rc.property("ADBE Vector Rect Roundness").setValue(%f);'
                         'var fl=ct.addProperty("ADBE Vector Graphic - Fill");'
                         'fl.property("ADBE Vector Fill Color").setValue(hx("%s"));'
                         'sl.property("Anchor Point").setValue([0,0]);'
                         'sl.property("Position").setValue([%f,%f]);})();'
                         % (pc, _js(nm + "_네모"), sw, shh, sr, _js(sh.get("fill", "#FFFFFF")),
                            sx + sw / 2, sy + shh / 2))
                tx = item.get("text") or {}
                tsz = max(1.0, float(tx.get("size", 30)))
                L.append('(function(){var tl=%s.layers.addText("%s");tl.name="%s";'
                         'var d=tl.property("Source Text").value;d.fontSize=%d;'
                         'd.applyFill=true;d.fillColor=hx("%s");'
                         'try{d.font="%s";}catch(e){}'
                         'try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}'
                         'try{d.tracking=%f;}catch(e){}tl.property("Source Text").setValue(d);'
                         'var r=tl.sourceRectAtTime(0,false);'
                         'tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);'
                         'tl.property("Position").setValue([%f,%f]);})();'
                         % (pc, _js(tx.get("content", "")), _js(nm + "_글자"), int(tsz),
                            _js(tx.get("fill", "#FFFFFF")), suite_ps(tx.get("weight", 600)),
                            float(tx.get("track", 0)) / tsz * 1000.0,
                            float(tx.get("x", 0)), float(tx.get("centerY", lh / 2))))
            L.append('var %s=TG.layers.add(%s);%s.name="%s";'
                     % (v, pc, v, _js(l.get("name", "범례"))))
            L.append('%s.property("Position").setValue([%f,%f]);'
                     % (v, float(lg.get("x", 0)), float(lg.get("y", 0))))
            continue
        lc = l.get("labelComp")
        if lc:
            # 라벨 = 프리컴프(배경 이미지 + 편집 텍스트). 라벨 하나가 한 컴프.
            lw = max(1, int(lc.get("w", 100))); lh = max(1, int(lc.get("h", 40)))
            pc = "PC%d" % i
            L.append('var %s=proj.items.addComp("%s",%d,%d,1.0,%f,%f);' % (pc, _js(l.get("name", "label")), lw, lh, dur, fps))
            L.append('%s.layers.add(imp("%s")).name="\\ubc30\\uacbd";' % (pc, _js(lc.get("bg", ""))))   # 배경
            for tx in lc.get("texts", []):
                tsz = float(tx.get("size", 30)) or 30.0
                L.append('(function(){var tl=%s.layers.addText("%s");var d=tl.property("Source Text").value;'
                         'd.fontSize=%d;d.applyFill=true;d.fillColor=hx("%s");'
                         'try{d.font="%s";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}'
                         'try{d.tracking=%f;}catch(e){}tl.property("Source Text").setValue(d);'
                         'tl.property("Position").setValue([%f,%f]);})();'
                         % (pc, _js(tx.get("content", "")), int(tsz), _js(tx.get("col", "#FFFFFF")),
                            suite_ps(tx.get("weight", 500)), float(tx.get("track", 0)) / tsz * 1000.0,
                            float(tx.get("cx", lw / 2)), float(tx.get("cy", lh / 2))))
            lcx = float(lc.get("x", 0)); lcy = float(lc.get("y", 0))
            L.append('var %s=TG.layers.add(%s);%s.name="%s";' % (v, pc, v, _js(l.get("name", "label"))))
            L.append('%s.property("Position").setValue([%f,%f]);' % (v, lcx, lcy))
            L.append('dshadow(%s);' % v)   # 라벨 그림자 (프리컴프 통째로)
            f = l.get("fade")
            if f:
                s = float(f.get("start", 0)); e = s + float(f.get("len", 0.3))
                L.append('fadeL(%s,%f,%f);' % (v, s, e))
                rise = float(f.get("rise", 0))
                if rise:   # 아래(+rise)에서 제자리로 올라오기 (타임라인 라벨과 동일)
                    L.append('(function(){var p=%s.property("Position");p.setValueAtTime(%f,[%f,%f]);p.setValueAtTime(%f,[%f,%f]);ez2(p);})();'
                             % (v, s, lcx, lcy + rise, e, lcx, lcy))
                if s > 0.001:
                    L.append('try{%s.inPoint=%f;}catch(err){}' % (v, s))
            continue
        L.append('var %s=addL("%s","%s");' % (v, _js(l.get("file", "")), _js(l.get("name", "layer"))))
        f = l.get("fade")
        if f:
            s = float(f.get("start", 0)); e = s + float(f.get("len", 0.3))
            L.append('fadeL(%s,%f,%f);' % (v, s, e))
            if s > 0.001:
                L.append('try{%s.inPoint=%f;}catch(err){}' % (v, s))   # 레이어를 애니 시작점에서 시작(타임라인에서 시작점 보이게)
    if vfe:
        # 내용 프리컴프(vfc)를 메인 컴프에 얹고, 그 레이어에 진입 애니(오른쪽에서 슬라이드 + 페이드인)
        s = float(vfe.get("start", 1.0)); e = s + float(vfe.get("len", 0.6)); dx = float(vfe.get("dx", 320))
        L.append('var vfl=comp.layers.add(vfc);vfl.name="VF_\\uc9c4\\uc785";')
        L.append('var pp=vfl.property("Position");var cc=[comp.width/2,comp.height/2];')
        L.append('pp.setValueAtTime(%f,[cc[0]+%f,cc[1]]);pp.setValueAtTime(%f,cc);' % (s, dx, e))
        L.append('var vo=vfl.property("Opacity");vo.setValueAtTime(%f,0);vo.setValueAtTime(%f,100);' % (s, e))
        L.append('ez2(pp);ez2(vo);')
    L.append('comp.openInViewer();app.endUndoGroup();')
    return "\n".join(L)

CORS = [("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type"),
        ("Access-Control-Max-Age", "86400")]

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj=None, ctype="application/json; charset=utf-8", body=None):
        if obj is not None:
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        for k, v in CORS:
            self.send_header(k, v)
        if body is not None:
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body is not None:
            self.wfile.write(body)

    def _read(self):
        n = int(self.headers.get("Content-Length", 0))
        buf, left = b"", n
        while left > 0:
            chunk = self.rfile.read(min(left, 1 << 20))
            if not chunk:
                break
            buf += chunk; left -= len(chunk)
        return buf

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        if urlparse(self.path).path == "/ping":
            return self._send(200, {"ok": True, "ff": os.path.exists(FFMPEG)})
        return self._send(404, {"ok": False})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/frame":
                q = parse_qs(urlparse(self.path).query)
                sid = safe((q.get("sid") or ["s"])[0]); idx = int((q.get("index") or ["0"])[0])
                ext = (q.get("ext") or ["png"])[0].lower()
                if ext not in ("png", "jpg"): ext = "png"
                d = os.path.join(FRAMES, sid)
                if idx == 0 and os.path.isdir(d):
                    shutil.rmtree(d, ignore_errors=True)
                os.makedirs(d, exist_ok=True)
                with open(os.path.join(d, "f_%05d.%s" % (idx, ext)), "wb") as f:
                    f.write(self._read())
                return self._send(200, {"ok": True})

            if path == "/api/finalize":
                obj = json.loads(self._read().decode("utf-8"))
                if not os.path.exists(FFMPEG):
                    return self._send(500, {"ok": False, "error": "ffmpeg.exe 없음 (헬퍼 옆에 두세요)"})
                sid = safe(obj.get("sid") or "s")
                mode = (obj.get("mode") or "mxf").lower()
                tail = int(obj.get("tail") or 0)
                d = os.path.join(FRAMES, sid)
                frames = sorted(os.listdir(d)) if os.path.isdir(d) else []
                if not frames:
                    return self._send(400, {"ok": False, "error": "프레임 없음"})
                fext = os.path.splitext(frames[0])[1].lstrip(".") or "png"   # 실제 프레임 확장자(png/jpg)
                ext = "mov" if mode == "mov" else "mxf"
                # 임시 파일로 인코딩한 뒤, 결과를 '바이트로 응답'한다. (저장 위치는 브라우저가 저장 대화상자로 고름)
                out = os.path.join(tempfile.gettempdir(), "wns_%s.%s" % (sid, ext))
                pattern = os.path.join(d, "f_%05d." + fext)
                args = mov_args(pattern, tail, out) if mode == "mov" else mxf_args(pattern, tail, out)
                r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                   creationflags=0x08000000)  # CREATE_NO_WINDOW
                shutil.rmtree(d, ignore_errors=True)
                if r.returncode != 0 or not os.path.exists(out):
                    return self._send(500, {"ok": False, "error": "ffmpeg 실패\n" + (r.stderr or "")[-700:]})
                with open(out, "rb") as f:
                    data = f.read()
                try: os.remove(out)
                except Exception: pass
                # 성공: 파일 바이트를 그대로 응답 (브라우저가 받아서 원하는 위치에 저장)
                return self._send(200, body=data, ctype="application/octet-stream")

            if path == "/api/ae":
                obj = json.loads(self._read().decode("utf-8"))
                sid = safe(obj.get("sid") or "ae")
                d = os.path.join(FRAMES, sid)
                if not os.path.isdir(d) or not os.listdir(d):
                    return self._send(400, {"ok": False, "error": "레이어 이미지가 없습니다 (먼저 전송하세요)"})
                afx = find_afterfx()
                if not afx:
                    return self._send(500, {"ok": False, "error": "After Effects를 못 찾았습니다 (설치 확인)"})
                ensure_wanted_font()
                ensure_suite_fonts()
                jsx = build_ae_jsx(obj, d)
                jsxpath = os.path.join(d, "_import.jsx")
                with open(jsxpath, "w", encoding="utf-8") as f:
                    f.write(jsx)
                # AfterFX -r <script> : AE가 켜져 있으면 그 인스턴스에서, 아니면 새로 켜서 스크립트 실행
                subprocess.Popen([afx, "-r", jsxpath])
                return self._send(200, {"ok": True, "ae": os.path.basename(os.path.dirname(os.path.dirname(afx)))})

            return self._send(404, {"ok": False})
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})

class Srv(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def main():
    os.makedirs(FRAMES, exist_ok=True)
    try:
        httpd = Srv(("127.0.0.1", PORT), H)
    except OSError:
        # 이미 실행 중이면 조용히 종료
        return
    httpd.serve_forever()

if __name__ == "__main__":
    main()

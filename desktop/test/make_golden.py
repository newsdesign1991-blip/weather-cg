# -*- coding: utf-8 -*-
# AE JSX 골든 생성기 — 원본 파이썬 헬퍼(build_ae_jsx)의 출력을 정답으로 저장한다.
#   ae-specs/<이름>.json  ->  golden/<이름>.jsx        (UTF-8, 줄바꿈 \n 그대로)
#                         ->  golden/<이름>.error.txt  (파이썬이 예외를 던진 스펙: "타입: 메시지")
#   + golden/pyfmt-cases.json  (pyF/pyD/pyJsonStr 기대값 — 파이썬 '%f'/'%d'/json.dumps 결과)
# 실행: py "D:\03_Util\10_XR\Plugins_Building\WeatherCG\desktop\test\make_golden.py"
# ※ helper.py 는 읽기만 한다(수정 금지). __pycache__ 도 안 만듦.
import sys, os, json, glob, math, random, struct

sys.dont_write_bytecode = True
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # 파이프로 읽어도 한글 안 깨지게
except Exception:
    pass
HELPER_DIR = r"R:\[F]_Util\WNS\_src"
sys.path.insert(0, HELPER_DIR)
import helper  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_DIR = os.path.join(HERE, "ae-specs")
GOLD_DIR = os.path.join(HERE, "golden")
FRAMES_DIR = r"C:\WCG\frames\sid01"   # 테스트 고정 경로(Node 테스트와 동일)


def _no_nan(tok):   # NaN/Infinity 리터럴은 Node JSON.parse가 못 읽음 → 코퍼스에서 금지(대신 1e400 사용)
    raise ValueError("스펙에 %s 리터럴 금지(Node가 못 읽음). 1e400 같은 숫자를 쓸 것" % tok)


def make_ae_golden():
    os.makedirs(GOLD_DIR, exist_ok=True)
    specs = sorted(glob.glob(os.path.join(SPEC_DIR, "*.json")))
    names = set()
    n_ok = n_err = n_nonascii = 0
    for path in specs:
        name = os.path.splitext(os.path.basename(path))[0]
        names.add(name)
        with open(path, "r", encoding="utf-8") as fh:
            spec = json.load(fh, parse_constant=_no_nan)
        jsx_p = os.path.join(GOLD_DIR, name + ".jsx")
        err_p = os.path.join(GOLD_DIR, name + ".error.txt")
        for p in (jsx_p, err_p):
            if os.path.exists(p):
                os.remove(p)
        try:
            out = helper.build_ae_jsx(spec, FRAMES_DIR)
        except Exception as e:  # 파이썬이 던지면 JS도 던져야 함
            with open(err_p, "w", encoding="utf-8", newline="") as fh:
                fh.write("%s: %s\n" % (type(e).__name__, e))
            n_err += 1
            print("  ERR  %-44s %s: %s" % (name, type(e).__name__, e))
            continue
        with open(jsx_p, "w", encoding="utf-8", newline="") as fh:
            fh.write(out)
        if any(ord(ch) > 0x7E for ch in out):
            n_nonascii += 1
            print("  주의: %s 출력에 비ASCII 문자 있음" % name)
        n_ok += 1
    # 스펙이 지워진 옛 골든 정리
    for p in glob.glob(os.path.join(GOLD_DIR, "*.jsx")) + glob.glob(os.path.join(GOLD_DIR, "*.error.txt")):
        b = os.path.basename(p)
        stem = b[:-len(".error.txt")] if b.endswith(".error.txt") else b[:-len(".jsx")]
        if stem not in names:
            os.remove(p)
            print("  정리: %s" % b)
    print("AE 골든: 스펙 %d개 → jsx %d개, error %d개 (비ASCII 출력 %d개)" % (len(specs), n_ok, n_err, n_nonascii))


# ───────── pyfmt 기대값 ─────────
def _r(x):   # float → repr 문자열('inf','-inf','nan','-0.0','1e+22' …) — JS에서 Number()로 정확히 복원
    return repr(float(x))


def _pyf_values(rng):
    v = [0.0, -0.0, math.inf, -math.inf, math.nan, 1.0, -1.0, 0.1, 0.2, 0.3, 1 / 3, 2 / 3, 29.97, 30000 / 1001, 59.94, 23.976,
         1920.0, 1080.0, 960.5, 1e-7, -1e-7, 4.9e-7, 5e-7, 5.0000001e-7, 1e-6, 0.0000015, 0.0000025, 5e-324, -5e-324,
         2.2250738585072014e-308, 1.7976931348623157e308, -1.7976931348623157e308, 1.5e300, 1e300, 1e100, 1e22, 1e21, -1e21,
         999999999999999999999.0, 9.999999999999999e20, 1e20, 123456789012345680000.0, 2.0 ** 53, 2.0 ** 53 + 2, 2.0 ** 63, 2.0 ** 64, 2.0 ** 70,
         1.0000005, 123.0000005, 0.5000005, 1.5000005, 2.5000005, -3.0000005, 0.0000005, 1048576.0078125, 0.0078125, -0.0078125,
         0.0234375, 0.1015625, 0.9921875, 2.5, -2.5, 0.5, -0.5, 1.5, 3.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625,
         123456789.123456789, 0.1 + 0.2, 1 - 1e-16, 0.9999995, 0.99999949999, 9.9999995, 99.9999995, -0.9999995, 0.0000004999999]
    v += [float(i) for i in range(-25, 26)]
    for k in range(-24, 25):   # 10의 거듭제곱 경계
        v.append(10.0 ** k)
        v.append(-(10.0 ** k))
    # 정확한 이진 동률값: j/2^(p+1) (j 홀수) 는 소수 p자리에서 정확히 반올림 동률
    for p in range(0, 8):
        d = 2 ** (p + 1)
        for j in range(-41, 42, 2):
            v.append(j / d)
        for j in (1001, 99999, 123457, 2 ** 20 + 1):
            v.append(j / d)
    # 동률값 바로 옆(nextafter)
    for x in (0.0078125, 2.5, 0.5, 1.0000005, 123.0000005, 0.0234375, -0.0078125):
        v.append(math.nextafter(x, math.inf))
        v.append(math.nextafter(x, -math.inf))
    # 랜덤(시드 고정)
    for _ in range(200):
        v.append(rng.uniform(-10000, 10000))
    for _ in range(120):
        v.append(round(rng.uniform(-2000, 4000), rng.choice([1, 2, 3, 4])))
    for _ in range(120):
        v.append(rng.choice([1, -1]) * 10 ** rng.uniform(-30, 300))
    for _ in range(120):   # 임의 비트 패턴의 double(유한값만)
        while True:
            x = struct.unpack("<d", struct.pack("<Q", rng.getrandbits(64)))[0]
            if math.isfinite(x):
                break
        v.append(x)
    for _ in range(80):   # 정수 + 7자리째가 5 인 근처값
        v.append(rng.randint(-5000, 5000) + rng.choice([0.0000005, 0.0000015, 0.0000025, 0.4999995, 0.5000005]))
    return v


def _pyd_values(rng):
    v = [0, -0.0, 0.0, 1, -1, 0.5, -0.5, 0.9999999, -0.9999999, 2.7, -2.7, 1920.0, 1079.999, 49.5, 1e15, 1e21, 1e22, -1e22, 1.5e300,
         2.0 ** 53, 2.0 ** 53 + 2, 2.0 ** 63, 2.0 ** 64, -(2.0 ** 63), 9007199254740991.0, 5e-324, 1e-7, math.inf, -math.inf, math.nan]
    v += [float(i) + 0.5 for i in range(-10, 10)]
    for _ in range(150):
        v.append(rng.uniform(-1e6, 1e6))
    for _ in range(80):
        v.append(rng.choice([1, -1]) * 10 ** rng.uniform(-5, 40))
    return v


def _pyjson_values(rng):
    v = ["", "a", "abc", '"', "\\", '\\"', "/", "</script>", "\n", "\r\n", "\t", "\b\f", "\x00", "\x1f", "\x7f", "\x80", "\xff", "\u0100",
         "\u2028\u2029", "\ufeff", "\uffff", "\ud800", "\udfff", "\ud83d", "\ude00", "\ud83d\ude00", "\U0001F300", "\U0001F600", "\U00020000", "\U0010FFFF",
         "\ud55c\uae00", "\ud0dc\ud48d \uacbd\ub85c", 'var Q=[thisComp.layer("TP0").position];createPath(Q,[],[],false);',
         "C:\\WCG\\frames\\sid01", "~ !#$%&'()*+,-./:;<=>?@[]^_`{|}", "\u00e9\u00e8", "a\u0300", "\x01\x02\x03\x04\x05\x06\x07\x0b\x0e"]
    pool = (list("abcXYZ019 \"\\/'{}[]") + ["\n", "\r", "\t", "\b", "\f", "\x00", "\x1b", "\x7f", "\x80", "\xa0", "\xe9",
            "\u2028", "\ud55c", "\uae00", "\ud800", "\udc00", "\U0001F300", "\U0001F600", "\U00020000", "\ufffd", "\uffff"])
    for _ in range(150):
        v.append("".join(rng.choice(pool) for _ in range(rng.randint(1, 24))))
    return v


def make_pyfmt_cases():
    rng = random.Random(20261007)
    pyF = []
    for x in _pyf_values(rng):
        pyF.append([_r(x), 6, "%f" % x])
    for x in _pyf_values(random.Random(7)):   # 다른 정밀도도 일부
        for p in (0, 1, 2, 3, 10):
            if abs(x) < 1e30 or not math.isfinite(x):
                pyF.append([_r(x), p, "%.*f" % (p, x)])
    pyD = []
    for x in _pyd_values(rng):
        try:
            pyD.append([_r(x), "%d" % x, None])
        except Exception as e:   # inf/nan → 파이썬은 예외 → JS도 던져야 함
            pyD.append([_r(x), None, type(e).__name__])
    pyJ = [[s, json.dumps(s)] for s in _pyjson_values(rng)]
    out = {"_note": "make_golden.py 가 생성. x는 파이썬 repr 문자열(inf/-inf/nan 포함). pyF=[x,prec,기대], pyD=[x,기대|null,예외타입|null], pyJsonStr=[s,기대]",
           "pyF": pyF, "pyD": pyD, "pyJsonStr": pyJ}
    p = os.path.join(GOLD_DIR, "pyfmt-cases.json")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        json.dump(out, fh, ensure_ascii=True, indent=0, allow_nan=False)   # ascii 고정(외톨이 서로게이트 안전)
        fh.write("\n")
    print("pyfmt 케이스: pyF %d, pyD %d, pyJsonStr %d → %s" % (len(pyF), len(pyD), len(pyJ), p))


# ───────── 스펙으로 못 닿는 경로: wanted_ps/suite_ps 직접 호출, frames_dir 종류 ─────────
def make_extra_cases():
    # 입력은 JSON 텍스트(양쪽이 같은 값으로 파싱; 1e400 → inf)
    ws = ["null", "0", "1", "299", "300", "349", "350", "351", "400", "449", "450", "451", "550", "650.9", "949", "950", "951",
          "1000", "1100", "-50", "-1e20", "1e20", "1e400", "-1e400", "true", "false", '"700"', '" 800 "', '"\\u3000600\\u3000"',
          '"\\uff17\\uff10\\uff10"', '"\\u0669\\u0660\\u0660"', '"\\u001c700"', '"7_0_0"', '"700.0"', '"abc"', '""', "[]", "[1]", "{}",
          '{"a": 1}', '"+900"', '"-0"',
          '"%s"' % ("9" * 4301), '"%s"' % ("9" * 4300), '"%s"' % ("0" * 4300 + "9"), '"%s"' % ("9_" * 4300 + "9"),   # int() 4300자리 제한
          "12345678901234567000", "-98765432109876540000"]   # 2^53 넘는 JSON 정수
    font = []
    for s in ws:
        v = json.loads(s)
        font.append([s, helper.wanted_ps(v), helper.suite_ps(v)])
    dirs = ['"C:\\\\WCG\\\\frames\\\\sid01"', '"D:\\\\\\uc791\\uc5c5\\\\\\ud504\\ub808\\uc784 01"', '"\\\\\\\\srv\\\\share\\\\a\\"b"',
            '"C:/x/y"', '""', '"\\ud83d\\ude00\\\\\\t"', "null", "5", "1.5", "true", '["a"]', '{"a": "b"}']
    fdir = []
    for s in dirs:
        try:
            fdir.append([s, helper.build_ae_jsx({}, json.loads(s)), None])
        except Exception as e:
            fdir.append([s, None, type(e).__name__])
    out = {"_note": "make_golden.py 가 생성. fontPs=[입력JSON, wanted_ps, suite_ps], framesDir=[입력JSON, jsx|null, 예외타입|null] (spec={})",
           "fontPs": font, "framesDir": fdir}
    p = os.path.join(GOLD_DIR, "extra-cases.json")
    with open(p, "w", encoding="utf-8", newline="") as fh:
        json.dump(out, fh, ensure_ascii=True, indent=0)
        fh.write("\n")
    print("추가 케이스: fontPs %d, framesDir %d → %s" % (len(font), len(fdir), p))


if __name__ == "__main__":
    make_ae_golden()
    make_pyfmt_cases()
    make_extra_cases()

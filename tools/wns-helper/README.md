# 옛 사본 — 고치지 말 것

`helper.py`는 기능 확장팩(WNS 헬퍼)의 **2026-07 옛 사본**(커밋 5ba99b5, `HELPER_VER` 없음)이다. 배포되는 헬퍼가 아니다.

- 원본: 저장소 밖 `R:\[F]_Util\WNS\_src\helper.py` (웹판 헬퍼 — `py -m PyInstaller`로 빌드)
- 데스크톱 내장판: `desktop/wns/`(server.js·ae-jsx.js — 원본을 Node로 옮긴 것). 정답 비교는 `desktop/test/make_golden.py`가 원본에서 만든다.
- 이 사본은 `tests/wns-helper-legend.test.cjs`·`tests/wns_helper_smoke.py`가 범례(legendComp) 기능만 확인하려고 남겨 둔 것이다.

헬퍼를 고치는 법은 저장소 루트 [`AGENTS.md`](../../AGENTS.md)의 '헬퍼' 항목.

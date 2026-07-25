# SUITE CG 폰트 적용 설계

## 목표

앱 UI는 기존 Wanted Sans를 유지하고, 날씨 CG 출력 화면에서 생성되는 기본 텍스트만 `FontNew`의 SUITE 폰트로 변경한다.

## 설계

- `FontNew/SUITE-*.otf` 7개 파일을 `SUITE CG`라는 별도 CSS 폰트 패밀리로 등록한다.
- 300부터 900까지 각 파일의 실제 굵기를 연결해 기존 CG 요소의 `font-weight` 설정을 보존한다.
- SVG 지도 라벨, 범례, 타이틀 및 출력용 HTML 텍스트 생성부의 기본 패밀리를 `SUITE CG`로 변경한다.
- `body`, 사이드바, 버튼, 입력창, 팝업 등 편집기 UI는 계속 `Wanted Sans Variable`을 사용한다.
- 폰트 파일이 없을 때는 `Malgun Gothic`, sans-serif 순으로 대체한다.

## 검증

- 자동 테스트로 7개 굵기 등록과 CG 생성부의 SUITE 사용을 확인한다.
- 같은 테스트에서 UI의 Wanted Sans 설정이 유지되는지 확인한다.
- 모든 인라인 스크립트의 구문을 검사한다.

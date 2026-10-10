MapLibre GL JS 5.24.0 (오픈소스, BSD-3-Clause — 같은 폴더 LICENSE.txt)

- 출처: npm 패키지 maplibre-gl@5.24.0 의 dist/maplibre-gl.js (고치지 않은 원본)
- sha256: 45a9b07a9189ce56054c620a947ccf41e291e58c95e9b61533b740aaa65ee5cb
- 쓰는 곳: js/gl-basemap.js — 태풍 지도 배경 '가벼운 지도 (WebGL · 시험)'을 고를 때만 불러온다(부팅 때는 안 읽음).
- 지도 자료: OpenFreeMap 벡터 타일(https://tiles.openfreemap.org/planet — 키·가입 없음).
  출처 표기: © OpenMapTiles · 지도 자료 © OpenStreetMap 기여자 · OpenFreeMap
- 판 올리기: 새 판의 dist/maplibre-gl.js 와 LICENSE.txt 로 바꾸고 위 판·sha256 을 고친 뒤
  WCG_BOOT_CHECK=1 node --test tests/gl-basemap.test.cjs 로 확인한다.
- 설치판을 만들 때 vendor/ 폴더를 함께 담아야 한다(없으면 가벼운 지도만 못 쓰고 파란 지도로 그린다).

# AE VF Legend Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AE에서 지도 경계선이 VF 제목 바를 침범하지 않게 하고, 범례를 항목별 Shape Layer와 Text Layer로 편집 가능하게 만든다.

**Architecture:** 웹 내보내기는 제목 바와 범례를 `배경·지도` PNG에서 분리한다. 제목 바는 지도 레이어 이후 별도 PNG로 추가하고, 범례는 SVG에 실제 렌더된 요소를 측정해 `legendComp` JSON 계약으로 보낸다. WNS 도우미는 이 계약을 AE 프리컴프, Shape Layer, Text Layer로 변환한다.

**Tech Stack:** 단일 HTML/JavaScript/SVG, Node.js `node:test`, Python 3.13, After Effects ExtendScript, PyInstaller 6.20

## Global Constraints

- AE 메인 컴프의 지도 관련 레이어보다 제목 바와 범례가 위에 있어야 한다.
- 자동·수동 범례 모두 같은 `legendComp` 계약을 사용한다.
- 범례 네모는 AE Shape Layer, 문구는 AE Text Layer여야 한다.
- VF 전체 스케일은 우상단 기준으로 정확히 한 번만 적용한다.
- 기존 `labelComp`, 제목 Text Layer, MXF·MOV API 동작은 유지한다.
- WNS 도우미 소스는 웹 저장소의 `tools/wns-helper/helper.py`에서 함께 버전 관리한다.
- 빌드 결과는 `R:\[F]_Util\WNS\WNS_Helper.exe`, 운영 소스는 `R:\[F]_Util\WNS\_src\helper.py`에 배포한다.

---

### Task 1: AE 내보내기 회귀 계약 테스트

**Files:**
- Create: `tests/ae-vf-legend.test.cjs`
- Modify: `index.html`

**Interfaces:**
- Produces: `aeLegendCompData(): null | {w,h,x,y,items}`
- Produces: `aeVfBarBlob(): Promise<Blob>`
- Consumes: `vfScaledPoint(x,y)`, `vfScaledSize(value)`, `vfExpandedLegend()`

- [ ] **Step 1: 실패 테스트 작성**

```js
test('AE base excludes bar title and legend', () => {
  const body = sliceBetween('async function aeBaseBlob()', '// 브러쉬 덧칠');
  assert.match(body, /#L_vfBar/);
  assert.match(body, /#L_title/);
  assert.match(body, /#L_legend/);
});

test('AE bar is added after map overlays and before editable title and legend', () => {
  const body = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const lines = body.indexOf("addImg('경계선'");
  const bar = body.indexOf("addImg('VF_제목바'");
  const title = body.indexOf("addText('제목_");
  const legend = body.indexOf('legendComp:');
  assert.ok(lines < bar && bar < title && title < legend);
});

test('AE legend contract is produced from rendered rects and texts', () => {
  const body = sliceBetween('function aeLegendCompData()', 'async function sendToAE()');
  assert.match(body, /#L_legend/);
  assert.match(body, /querySelectorAll\(['"]rect['"]\)/);
  assert.match(body, /querySelectorAll\(['"]text['"]\)/);
  assert.match(body, /getBBox\(\)/);
});
```

- [ ] **Step 2: 테스트를 실행해 기능 부재로 실패하는지 확인**

Run: `node --test tests/ae-vf-legend.test.cjs`

Expected: 제목 바·범례 제거, 별도 제목 바 레이어, `aeLegendCompData`가 없어 FAIL

- [ ] **Step 3: 제목 바와 범례 분리 구현**

`aeBaseBlob()`에서 다음 레이어를 제거한다.

```js
c.querySelector('#L_vfBar')?.remove();
c.querySelector('#L_title')?.remove();
c.querySelector('#L_legend')?.remove();
```

별도 제목 바 PNG 생성기를 추가한다.

```js
async function aeVfBarBlob() {
  return svgBlob((c) => keepLayers(c, ['L_vfBar']));
}
```

`sendToAE()`에서 경계선·산 뒤에 제목 바 PNG를 추가한다.

```js
if (S.res === '1920x1080-vf' && S.vfBar && S.vfBar.on) {
  addImg('VF_제목바', await aeVfBarBlob());
}
```

- [ ] **Step 4: 범례 DOM 측정 구현**

`aeLegendCompData()`는 `#L_legend g[data-kind="legend"]`의 `getBBox()`를 경계로 사용한다. 각 `rect`와 `text`의 SVG 속성을 수집하고, 그룹 translate와 VF 스케일을 반영한다.

```js
{
  w, h,
  x: scaledBoundsCenter.x,
  y: scaledBoundsCenter.y,
  items: [{
    name,
    shape: { x, y, w, h, radius, fill },
    text: { content, x, centerY, size, weight, track, fill }
  }]
}
```

텍스트 폭이나 항목 간격은 문자열로 재계산하지 않고 SVG의 `getBBox()`와 실제 속성을 사용한다.

- [ ] **Step 5: 웹 테스트 통과 확인**

Run: `node --test tests/ae-vf-legend.test.cjs`

Expected: 모든 테스트 PASS

- [ ] **Step 6: 웹 변경 커밋**

```bash
git add index.html tests/ae-vf-legend.test.cjs
git commit -m "AE VF 제목 바와 범례 레이어 분리"
```

---

### Task 2: WNS 도우미의 편집형 범례 프리컴프

**Files:**
- Create: `tools/wns-helper/helper.py`
- Create: `tests/wns-helper-legend.test.cjs`
- Source reference: `R:\[F]_Util\WNS\_src\helper.py`

**Interfaces:**
- Consumes: `layer.legendComp` 웹 JSON 계약
- Produces: AE JSX에서 `범례` 프리컴프와 항목별 Shape/Text Layer

- [ ] **Step 1: 현재 운영 도우미 소스를 저장소로 복사**

```powershell
New-Item -ItemType Directory -Force tools\wns-helper
Copy-Item -LiteralPath 'R:\[F]_Util\WNS\_src\helper.py' -Destination 'tools\wns-helper\helper.py'
```

- [ ] **Step 2: 도우미 실패 테스트 작성**

```js
test('WNS helper creates editable legend precomp layers', () => {
  const src = fs.readFileSync('tools/wns-helper/helper.py', 'utf8');
  assert.match(src, /legendComp/);
  assert.match(src, /ADBE Vector Shape - Rect/);
  assert.match(src, /ADBE Vector Graphic - Fill/);
  assert.match(src, /layers\.addText/);
  assert.match(src, /sourceRectAtTime/);
});
```

또한 Python에서 `build_ae_jsx()`에 한 항목짜리 `legendComp`를 넣고 결과 JSX에 프리컴프명, Shape Layer명, Text Layer명과 좌표가 포함되는지 검사한다.

- [ ] **Step 3: 테스트를 실행해 계약 미지원으로 실패하는지 확인**

Run: `node --test tests/wns-helper-legend.test.cjs`

Expected: `legendComp` 처리와 Shape Layer 생성 코드가 없어 FAIL

- [ ] **Step 4: `legendComp` JSX 생성 구현**

`build_ae_jsx()`의 레이어 루프에서 `labelComp` 앞에 `legendComp` 분기를 추가한다.

- `proj.items.addComp()`로 범례 프리컴프 생성
- `layers.addShape()`와 `ADBE Vector Shape - Rect`로 네모 생성
- `ADBE Vector Graphic - Fill`로 색상 적용
- `ADBE Vector Rect Roundness`로 모서리 반경 적용
- `layers.addText()`로 문구 생성
- `sourceRectAtTime()` 결과를 사용해 텍스트 왼쪽·세로 중앙 기준 앵커 설정
- 프리컴프 레이어를 `TG`에 추가하고 `legendComp.x/y` 중심에 배치

- [ ] **Step 5: 도우미 계약 테스트 통과 확인**

Run: `node --test tests/wns-helper-legend.test.cjs`

Expected: 모든 테스트 PASS

- [ ] **Step 6: 도우미 소스 커밋**

```bash
git add tools/wns-helper/helper.py tests/wns-helper-legend.test.cjs
git commit -m "WNS AE 편집형 범례 프리컴프 지원"
```

---

### Task 3: 통합 검증과 WNS 배포

**Files:**
- Modify: `R:\[F]_Util\WNS\_src\helper.py`
- Replace: `R:\[F]_Util\WNS\WNS_Helper.exe`

**Interfaces:**
- Consumes: 저장소의 `tools/wns-helper/helper.py`
- Produces: 운영 WNS 소스와 PyInstaller 실행 파일

- [ ] **Step 1: 전체 테스트 실행**

Run: `node --test tests/*.test.cjs`

Expected: 모든 테스트 PASS

- [ ] **Step 2: Python 구문과 JSX 생성 스모크 테스트**

```powershell
py -m py_compile tools\wns-helper\helper.py
```

한 항목짜리 `legendComp` 스펙으로 `build_ae_jsx()`를 호출하고 생성 결과에 `범례`, `_네모`, `_글자`, `ADBE Vector Shape - Rect`가 포함되는지 확인한다.

- [ ] **Step 3: WNS 실행 파일 로컬 빌드**

```powershell
py -m PyInstaller --onefile --noconsole --clean --name WNS_Helper `
  --distpath .tmp\wns-dist --workpath .tmp\wns-build --specpath .tmp `
  tools\wns-helper\helper.py
```

Expected: `.tmp\wns-dist\WNS_Helper.exe` 생성

- [ ] **Step 4: 운영 WNS에 소스와 EXE 배포**

현재 `localhost:3720` 도우미가 실행 중이면 `R:\[F]_Util\WNS\WNS_STOP (종료).vbs`로 종료한다. 기존 EXE와 소스의 SHA-256을 기록한 뒤 다음 파일을 교체한다.

```powershell
Copy-Item tools\wns-helper\helper.py 'R:\[F]_Util\WNS\_src\helper.py' -Force
Copy-Item .tmp\wns-dist\WNS_Helper.exe 'R:\[F]_Util\WNS\WNS_Helper.exe' -Force
```

배포 후 `R:\[F]_Util\WNS\WNS_START (창없이).vbs`를 실행하고 `/ping`이 `{"ok":true}`를 반환하는지 확인한다.

- [ ] **Step 5: 최종 Git 검증 및 push**

```bash
git diff --check
git status --short
git push origin main
```

Expected: `main`과 `origin/main` 동기화

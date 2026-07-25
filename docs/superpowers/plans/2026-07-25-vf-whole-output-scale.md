# VF Whole Output Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 50–150% whole-output scale control for normal VF, shared by light/dark within the common and warnsea layout groups, and preserved through projects, presets, baking, animation, raster exports, and AE export.

**Architecture:** Keep the existing single-file app architecture. Add a nested SVG scale group inside the existing VF animation wrapper so animation translation and persistent scale never overwrite each other; keep editor-only bounds and the bottom-left handle outside both groups. Store one `vfScale` value in each preset, and reuse the existing light/dark peer propagation in `savePreset()`.

**Tech Stack:** Static HTML, browser JavaScript, SVG transforms, `localStorage`, Node.js built-in test runner.

## Global Constraints

- Apply only when `S.res === '1920x1080-vf'`.
- Scale range is 50–150%, default 100%, step 1%.
- The blue panel’s top-right corner is the fixed anchor.
- The handle and selection outline appear only in move mode and are never exported.
- Common VF light/dark share one value; warnsea VF light/dark share another value; the two layout groups stay independent.
- Preserve the user’s existing uncommitted three-line change in `index.html`.
- Old projects and presets without `vfScale` load as 100%.

---

### Task 1: State, scale transform, and editor handle

**Files:**
- Create: `tests/vf-scale.test.cjs`
- Modify: `index.html` in the VF SVG markup, default state, VF render functions, and SVG pointer dispatch.

**Interfaces:**
- Consumes: `S.res`, `S.style`, `mode`, `_vfPanelRect`, `computeVfPanelRect(cb)`, `dragLoop(e, move, end)`, `pushUndo(key)`.
- Produces: `clampVfScale(value): number`, `vfScaleValue(): number`, `vfScaleTransform(rect, value): string`, `renderVfScale(): void`, `startVfScaleResize(e): void`.

- [ ] **Step 1: Write the failing structural and contract tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');

test('VF output has a nested persistent scale group and editor-only controls', () => {
  assert.match(html, /id="L_vfWrap"[\s\S]*id="L_vfScale"[\s\S]*id="L_bg"/);
  assert.match(html, /id="vfScaleBounds"/);
  assert.match(html, /id="vfScaleGrip"/);
});

test('VF scale contract uses 50..150 percent and a top-right anchor', () => {
  assert.match(html, /function clampVfScale\([^)]*\)[\s\S]*Math\.max\(50,[\s\S]*Math\.min\(150/);
  assert.match(html, /function vfScaleTransform\([^)]*\)[\s\S]*r\.x \+ r\.w/);
  assert.match(html, /function startVfScaleResize\(/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/vf-scale.test.cjs`

Expected: FAIL because `L_vfScale`, `vfScaleBounds`, and scale functions do not exist.

- [ ] **Step 3: Add the state and nested SVG structure**

Add `vfScale: 100` beside `vfBar` in `DEFAULTS()`. Inside `L_vfWrap`, place all exported VF layers inside `<g id="L_vfScale">…</g>`. Keep `L_grips`, `L_guide`, `L_guides`, and `L_sel` outside the new group. Add an editor-only `vfScaleBounds` rect and `vfScaleGrip` group to `L_grips`.

- [ ] **Step 4: Implement scale normalization and rendering**

```js
function clampVfScale(v) {
  v = Number(v);
  return Number.isFinite(v) ? Math.max(50, Math.min(150, Math.round(v))) : 100;
}
function vfScaleValue() {
  S.vfScale = clampVfScale(S.vfScale);
  return S.vfScale;
}
function vfScaleTransform(r, value) {
  const k = clampVfScale(value) / 100;
  const ax = r.x + r.w, ay = r.y;
  return `translate(${ax} ${ay}) scale(${k}) translate(${-ax} ${-ay})`;
}
```

`renderVfScale()` must clear the scale transform and hide controls outside VF. In VF it must wait for `computeVfPanelRect`, transform `L_vfScale`, draw the transformed panel bounds, and show the bounds/grip only in move mode. The grip position is the transformed bottom-left corner: `x = ax + (r.x - ax) * k`, `y = ay + r.h * k`.

- [ ] **Step 5: Implement bottom-left resize**

On pointer down, capture the top-right anchor and original scale. Convert pointer movement into a uniform factor using the diagonal distance from the fixed anchor; clamp to 50–150%. Call `pushUndo('vfScale')` once, update `S.vfScale`, call `renderVfScale()` and synchronize the panel on drag end. Route `#vfScaleGrip` before map/inset handlers in the SVG pointer dispatcher.

- [ ] **Step 6: Render the scale at every relevant state change**

Call `renderVfScale()` from `renderBg()`, mode changes, `renderAll()`, preset/project application, and after `_vfPanelRect` is computed. Do not put persistent scale on `L_vfWrap`; `applyVfEnter()` must remain the sole owner of `L_vfWrap`’s animation transform.

- [ ] **Step 7: Run the test and commit**

Run: `node --test tests/vf-scale.test.cjs`

Expected: PASS.

Commit:

```bash
git add index.html tests/vf-scale.test.cjs
git commit -m "feat: add VF whole-output scale handle"
```

### Task 2: Sidebar control and shared preset persistence

**Files:**
- Modify: `tests/vf-scale.test.cjs`
- Modify: `index.html` in the VF sidebar, panel synchronization, event wiring, `PRESET_KEYS`, `savePreset()`, and `applyPreset()`.

**Interfaces:**
- Consumes: `clampVfScale`, `renderVfScale`, `presetKey`, `layoutGroup`, `PRESET_KEYS`.
- Produces: `#vfScale`, `#vfScaleV`, preset property `vfScale: number`.

- [ ] **Step 1: Add failing persistence/UI tests**

```js
test('VF scale has a 50..150 sidebar control', () => {
  assert.match(html, /id="vfScale"[^>]*min="50"[^>]*max="150"[^>]*step="1"/);
  assert.match(html, /id="vfScaleV"/);
});

test('vfScale participates in preset save and light-dark peer sharing', () => {
  assert.match(html, /const PRESET_KEYS = \[[\s\S]*'vfScale'/);
  assert.match(html, /target\.vfScale\s*=\s*clampVfScale\(p\.vfScale\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/vf-scale.test.cjs`

Expected: FAIL because the UI and preset propagation are absent.

- [ ] **Step 3: Add the VF-only sidebar control**

Place a `vfScaleUI` block above the title-bar controls:

```html
<div id="vfScaleUI" style="display:none">
  <div class="row wide">
    <label>VF 전체 크기</label>
    <input type="range" id="vfScale" min="50" max="150" step="1">
    <span class="v" id="vfScaleV">100%</span>
  </div>
</div>
```

Show it only for `1920x1080-vf` in `syncPanelFromState()`. Keep the slider and label synchronized after handle drag, undo/redo, preset load, and project load.

- [ ] **Step 4: Wire sidebar editing**

Use `pushUndo('vfScale')`, assign `S.vfScale = clampVfScale(e.target.value)`, update the label, and call `renderVfScale()`. Continuous slider input should coalesce through the existing undo key.

- [ ] **Step 5: Add preset persistence and compatibility**

Add `'vfScale'` to `PRESET_KEYS`. In `savePreset()`, propagate `p.vfScale` to the existing light/dark peer `target` for the same `res|layoutGroup`, while leaving other layout groups untouched:

```js
if (p.vfScale !== undefined) target.vfScale = clampVfScale(p.vfScale);
```

In full and fallback preset application, normalize missing or invalid values to 100%. Since projects already serialize `S`, `DEFAULTS().vfScale = 100` provides backward compatibility for project JSON and work-state restoration.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/vf-scale.test.cjs`

Expected: PASS.

Commit:

```bash
git add index.html tests/vf-scale.test.cjs
git commit -m "feat: persist VF scale in presets"
```

### Task 3: Bake, animation/export consistency, and documentation

**Files:**
- Modify: `tests/vf-scale.test.cjs`
- Modify: `index.html` in bake normalization and AE export specification.
- Modify: `README.md` with the VF scale workflow and baked-default handoff.

**Interfaces:**
- Consumes: `vfScaleValue()`, `loadPresets()`, `bakeDefaults()`, AE `spec`.
- Produces: normalized baked `vfScale`, AE `vfEnter.scale`, documented handoff workflow.

- [ ] **Step 1: Add failing bake/export tests**

```js
test('baking normalizes VF scale and AE receives it', () => {
  assert.match(html, /function bakeDefaults\([\s\S]*vfScale[\s\S]*clampVfScale/);
  assert.match(html, /vfEnter:[\s\S]*scale:\s*vfScaleValue\(\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/vf-scale.test.cjs`

Expected: FAIL because bake and AE metadata do not explicitly carry scale.

- [ ] **Step 3: Normalize baked VF presets**

Before serializing `presets`, iterate only `1920x1080-vf|…` entries. Set missing/invalid `vfScale` to 100 and clamp present values. Ensure each common L/D pair has the same value and each warnsea L/D pair has the same value, taking the current/user-saved value as authoritative and never copying between common and warnsea.

- [ ] **Step 4: Make AE export scale-aware**

Raster AE layers already inherit the SVG transform. Add `vfScaledPoint(x, y)` and `vfScaledSize(value)` helpers that apply the same top-right-anchored scale only in VF. Use them when building editable AE title and label-comp coordinates, font sizes, label-comp dimensions, and rise distance. Keep raster layer coordinates unchanged so they are not scaled twice. Scale `vfEnter.dx` by `vfScaleValue() / 100` so the entrance distance matches the transformed panel width.

- [ ] **Step 5: Document operation and handoff**

Add README sections stating:

- VF scale affects the entire blue panel, title bar, map, labels, legend, and mountains.
- It is adjusted by the sidebar or bottom-left handle in move mode.
- Common and warnsea keep separate values while light/dark share.
- “현재 배치를 이 화면 기본값으로” and baking preserve it.
- A downloaded JS bake file can be supplied for validation, replacement of `default-presets.js`, testing, commit, and GitHub push.

- [ ] **Step 6: Run automated and manual verification**

Run:

```bash
node --test tests/vf-scale.test.cjs
```

Expected: all tests PASS.

Manual browser checks:

1. Common VF: set 80% in dark mode, switch to light, confirm 80%.
2. Warnsea VF: confirm it remains 100%, set 120%, switch light/dark, confirm 120%.
3. Switch back to common and confirm 80%.
4. Drag the bottom-left handle; confirm the panel top-right does not move.
5. Switch out of move mode; confirm bounds and handle disappear.
6. Undo/redo a handle drag.
7. Save current layout, reload, and confirm the value.
8. Save/open a project and confirm the value.
9. Bake defaults and confirm both layout groups contain the expected `vfScale`.
10. Preview VF animation and compare PNG/PNG sequence/alpha MOV/AE size to the editor.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/vf-scale.test.cjs README.md
git commit -m "feat: carry VF scale through exports and baking"
```

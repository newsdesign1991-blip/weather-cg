import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "tools" / "wns-helper" / "helper.py"
module_spec = importlib.util.spec_from_file_location("wns_helper", HELPER)
helper = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(helper)

ae_spec = {
    "comp": {"name": "legend-smoke", "w": 1920, "h": 1080, "dur": 6, "fps": 29.97},
    "layers": [{
        "name": "범례",
        "legendComp": {
            "w": 300, "h": 50, "x": 1500, "y": 200,
            "items": [{
                "name": "폭염 경보",
                "shape": {"x": 0, "y": 8, "w": 34, "h": 34, "radius": 6, "fill": "#FF2E1E"},
                "text": {
                    "content": "폭염 경보", "x": 52, "centerY": 25,
                    "size": 28, "weight": 600, "track": -0.5, "fill": "#FFFFFF",
                },
            }],
        },
    }],
}

jsx = helper.build_ae_jsx(ae_spec, "C:/tmp")
assert "ADBE Vector Shape - Rect" in jsx
assert "ADBE Vector Graphic - Fill" in jsx
assert "sourceRectAtTime" in jsx
assert "\\ub124\\ubaa8" in jsx  # 네모
assert "\\uae00\\uc790" in jsx  # 글자
print("WNS legendComp JSX smoke test: PASS")

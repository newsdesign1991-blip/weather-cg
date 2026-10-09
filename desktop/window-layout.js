'use strict';

// Electron screen.workArea의 DIP 좌표. 작업표시줄·배율·음수 좌표 보조 모니터를 그대로 존중한다.
function initialWindowBounds(area) {
  const width = Math.min(1920, Math.floor(area.width * 0.94));
  // 사이드바 약 350px + 작업창 16:9 + 제목/도구 여백. 세로를 불필요하게 길게 만들지 않는다.
  const height = Math.min(Math.floor(area.height * 0.90), Math.round((width - 350) * 9 / 16 + 110));
  return {
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
    width, height,
    minWidth: Math.min(1100, width), minHeight: Math.min(640, height),
  };
}

module.exports = { initialWindowBounds };

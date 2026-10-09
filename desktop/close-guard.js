// 창 닫기 전 묻기(저장하지 않은 변경·렌더 중) — 메인 프로세스 전용. main.js가 메인 창의 close 를 이것에 맡긴다.
// 흐름: 창 close(X·Alt+F4·작업표시줄 닫기·app.quit) → 막고(preventDefault) 웹앱에 묻는다(ask(번호) → 'wcg:close-ask').
//   웹앱(preload → js/project-io.js closeAsk)은 곧바로 답한다 — 'close'(물을 것 없음) | 'wait'(팝업을 띄웠다 — 사용자를 기다림).
//   사용자가 고르면 'close'(저장했음·저장 안 함) | 'stay'(취소·저장 위치 고르기 취소·저장 실패).
// 안전장치: 묻고 나서 timeoutMs 안에 아무 답이 없으면(웹앱 멈춤·오류) 그냥 닫는다(destroy — 사용자가 앱을 못 끄는 일이 없게).
//   물을 곳이 없으면(웹앱 렌더러가 죽음 — ask 가 false 를 돌려주거나 던짐) 기다리지 않고 곧바로 닫는다.
//   'wait' 뒤엔 시간 제한 없이 기다린다(사용자가 고르는 중). 그동안 또 닫기를 누르면 다시 묻는다 — 웹앱은 떠 있는 팝업을 그대로 두고
//   'wait'로 답하고(팝업 하나), 그 답마저 없으면(그 사이 멈춤) 시간 제한 뒤 닫는다.
//   'wait'가 오면 reveal() — 최소화했거나 뒤에 가린 창을 작업표시줄에서 닫았을 때 팝업이 안 보여 '안 꺼진다'로 보이지 않게 창을 앞으로.
// Electron 없이 시험할 수 있게 창 조작·타이머를 넘겨받는다(desktop/test/close-guard.test.cjs).
'use strict';

const CLOSE_ASK_MS = 5000;

// o: { ask(id) — 웹앱에 묻기(물을 곳이 없으면 false), close() — 다시 close 를 거쳐 닫기(웹앱 beforeunload 자동 저장이 돈다),
//      destroy() — 바로 닫기(웹앱이 답 없음), reveal?() — 팝업이 떴으니 창을 앞으로, timeoutMs?, setTimer?, clearTimer? }
function createCloseGuard(o) {
  const ms = o.timeoutMs || CLOSE_ASK_MS;
  const setT = o.setTimer || setTimeout, clrT = o.clearTimer || clearTimeout;
  let pass = false;                    // 닫아도 된다(웹앱이 'close'라 했거나 답이 없었다·윈도 종료) — 다음 close 는 막지 않는다
  let seq = 0, round = 0, last = 0;    // round: 이번 묻기의 첫 번호(그 앞 번호의 답은 지난 일), last: 마지막으로 물은 번호
  let timer = null;
  const stopTimer = () => { if (timer) { clrT(timer); timer = null; } };
  const end = () => { stopTimer(); round = 0; last = 0; };
  const giveUp = () => { timer = null; end(); pass = true; o.destroy(); };
  return {
    // close 이벤트에서 — true 면 부르는 쪽이 막는다(preventDefault)
    onClose() {
      if (pass) return false;
      seq++; last = seq; if (!round) round = seq;
      stopTimer();
      timer = setT(giveUp, ms);   // 답이 없으면 그냥 닫는다
      let sent = true;
      try { sent = o.ask(seq) !== false; } catch (e) { sent = false; }
      // 물을 곳이 없다 — 곧바로 닫는다(close 이벤트 안에서 창을 부수지 않게 타이머로 한 번 미룬다)
      if (!sent && timer) { stopTimer(); timer = setT(giveUp, 0); }
      return true;
    },
    // 웹앱 답 — 묻는 중이 아니거나 지난 번호·모르는 번호면 버린다
    onReply(id, act) {
      id = Math.floor(+id) || 0;
      if (pass || !round || id < round || id > last) return;
      if (act === 'wait') {
        if (id === last) stopTimer();   // 지난 물음의 'wait'로는 새 물음의 시간 제한을 끄지 않는다(그 사이 멈췄을 수 있다)
        try { if (o.reveal) o.reveal(); } catch (e) { /* 창을 앞으로 못 불러도 묻기는 그대로 */ }
        return;
      }
      if (act === 'stay') { end(); return; }
      if (act === 'close') { end(); pass = true; o.close(); }
    },
    // 묻지 않고 닫게(윈도 종료·다시 시작·로그오프)
    release() { end(); pass = true; },
    state() { return { pass, asking: !!round, timer: !!timer, last }; },
  };
}

module.exports = { createCloseGuard, CLOSE_ASK_MS };

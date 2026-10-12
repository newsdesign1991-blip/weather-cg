; 날씨 CG 설치 프로그램(electron-builder NSIS)에 끼워 넣는 설정 — tools/build-installer.cjs 가 nsis.include 로 넘긴다.
; 설치 방식 고르기 화면('모든 사용자 / 나만')을 없앤다(electron-builder 24 템플릿 multiUserUi.nsh 의 customInstallMode 자리 — 지우기에도 같이 들어간다).
;  - 보통은 '이 사용자만': 관리자 권한 없이 %LOCALAPPDATA%\Programs\weathercg-desktop(설치 위치는 다음 화면에서 바꿀 수 있음).
;  - 임시판(0.2.0)을 '모든 사용자'로 깐 PC(그 설치만 있을 때)는 그 자리(Program Files)에 덮어 올린다 — 관리자 권한 확인 창이 한 번 뜬다.
;    (안 그러면 이 사용자 자리에 하나 더 깔려 두 벌이 된다.) 조용한 설치(/S)는 이 화면 없이 onInit(initMultiUser)이 같은 기준으로 고른다.
!macro customInstallMode
  ${if} $hasPerMachineInstallation == "1"
  ${andIf} $hasPerUserInstallation == "0"
    StrCpy $isForceMachineInstall "1"
  ${else}
    StrCpy $isForceCurrentInstall "1"
  ${endIf}
!macroend

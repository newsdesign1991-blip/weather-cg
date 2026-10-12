; 날씨 CG 설치 프로그램(electron-builder NSIS)에 끼워 넣는 설정 — tools/build-installer.cjs 가 nsis.include 로 넘긴다.
; 늘 '이 사용자만' 설치한다: 관리자 권한 없이 %LOCALAPPDATA%\Programs\weathercg-desktop(설치 위치는 다음 화면에서 바꿀 수 있음).
; 이 매크로가 없으면 '모든 사용자 / 나만' 고르는 화면이 뜨고, 모든 사용자를 고르면 관리자 권한을 묻는다.
; (electron-builder 24 템플릿 multiUserUi.nsh 의 customInstallMode 자리 — 지우기에도 같이 들어가 '이 사용자 설치'를 지운다)
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; 날씨 CG 설치 프로그램(electron-builder NSIS)에 끼워 넣는 설정 — tools/build-installer.cjs 가 nsis.include 로 넘긴다.

; 1) 설치 방식 고르기 화면('모든 사용자 / 나만')을 없앤다(electron-builder 24 템플릿 multiUserUi.nsh 의 customInstallMode 자리 — 지우기에도 같이 들어간다).
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

; 2) 설치 프로그램 사본 지우기 — electron-builder 는 설치할 때마다 설치 파일 전체를 %LOCALAPPDATA%\weathercg-desktop-updater\installer.exe 로
;    복사해 둔다(자동 업데이트의 차등 받기용, 약 170MB, 제거해도 남음). 이 앱은 자동 업데이트를 쓰지 않으므로 설치 끝·제거 때 지운다(빈 폴더만 지움).
;    임시판(0.2.0)이 남긴 사본도 덮어 설치할 때 함께 지워진다. electron 사용자 데이터(%APPDATA%\날씨 CG)는 건드리지 않는다.
!ifdef APP_INSTALLER_STORE_FILE
  !ifndef WCG_UPDATER_DIR
    !searchparse "${APP_INSTALLER_STORE_FILE}" "" WCG_UPDATER_DIR "\"
  !endif
  !macro wcgDropInstallerCopy
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    RMDir "$LOCALAPPDATA\${WCG_UPDATER_DIR}"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  !macroend
!else
  !macro wcgDropInstallerCopy
  !macroend
!endif
!macro customInstall
  !insertmacro wcgDropInstallerCopy
!macroend
; 3) 제거 뒤 빈 설치 폴더 지우기 — 지우기 프로그램의 un.onInit 이 SetOutPath $INSTDIR 로 그 폴더를 자기 작업 폴더로 잡아 두어,
;    템플릿의 RMDir /r $INSTDIR 이 안의 파일만 지우고 폴더 자체는 못 지웠다(조용한 제거 뒤 빈 폴더가 남음 — 1.0.0 검증).
;    작업 폴더를 임시 폴더로 옮긴 뒤 '비어 있을 때만' 지운다(/r 아님 — 사용자가 넣어 둔 파일이 있으면 그대로). 업데이트(덮어 설치) 중에는
;    설치 프로그램이 그 폴더를 작업 폴더로 잡고 있어 안 지워지거나, 지워져도 곧바로 다시 만든다.
!macro customUnInstall
  !insertmacro wcgDropInstallerCopy
  SetOutPath "$TEMP"
  RMDir "$INSTDIR"
!macroend

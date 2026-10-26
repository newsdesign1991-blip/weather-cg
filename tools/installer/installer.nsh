; 날씨 CG 설치 프로그램(electron-builder NSIS)에 끼워 넣는 설정 — tools/build-installer.cjs 가 nsis.include 로 넘긴다.

; 1) 설치 방식 고르기 화면('모든 사용자 / 나만')을 없앤다(electron-builder 24 템플릿 multiUserUi.nsh 의 customInstallMode 자리 — 지우기에도 같이 들어간다).
;  - 보통은 '이 사용자만': 관리자 권한 없이. 새 설치는 %LOCALAPPDATA%\NDT\apps\weather-cg(아래 1-1), 이미 깔렸으면 그 자리(10-26 전 기본은 %LOCALAPPDATA%\Programs\weathercg-desktop).
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

; 1-1) 새 설치의 기본 자리 = %LOCALAPPDATA%\NDT\apps\weather-cg (10-26 — NDT 런처 통합. 설치 시험판은 weather-cg-installtest).
;  electron-builder 기본(%LOCALAPPDATA%\Programs\weathercg-desktop) 대신. 이전 설치 기록(Software\<GUID> InstallLocation — HKCU·HKLM)이 있으면
;  그 자리 그대로(예전 자리·사용자가 고른 자리 업데이트 — 옮기지 않음), /D=<자리>(명령줄 맨 끝·따옴표 없이)를 주면 그 자리.
;  조용한 설치(/S — 앱 업데이트·런처·우리 설치 창)는 onInit 의 customInit 이, 창 설치(NSIS 화면 — 평소엔 안 씀)는 설치 방식 화면이
;  자리를 다시 정한 뒤 설치 직전 빈 화면(customPageAfterChangeDir)이 같은 규칙으로 맞춘다. 자리 고르기 화면은 없다(allowToChangeInstallationDirectory: false).
!if "${APP_FILENAME}" == "weathercg-installtest"
  !define WCG_NDT_ID "weather-cg-installtest"
!else
  !define WCG_NDT_ID "weather-cg"
!endif
; /D= 자리는 NSIS 가 .onInit 전에 명령줄 끝까지(공백 포함) $INSTDIR 에 넣는데, 템플릿(multiUser.nsh setInstallModePerUser)이 그 값을
; StdUtils.GetParameter 로 다시 읽으며 첫 공백에서 잘랐다('…\예전 자리\날씨 앱' → '…\예전' — 10-26 시험에서 찾음. 사용자 이름에 공백이 있으면
; 우리 설치 창의 /D= 도 잘렸다). preInit 에서 NSIS 가 넣은 온전한 값을 잡아 두었다가 /D= 가 있으면 그 값으로 되돌린다.
Var wcgCmdDir
!macro preInit
  StrCpy $wcgCmdDir $INSTDIR
!macroend
!macro wcgNdtDefaultDir
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${StdUtils.GetParameter} $2 "D" ""
  ${if} $2 != ""
  ${andIf} $wcgCmdDir != ""
    StrCpy $INSTDIR $wcgCmdDir
  ${elseIf} $0 == ""
  ${andIf} $1 == ""
  ${andIf} $2 == ""
  ${andIf} $installMode == "CurrentUser"
    StrCpy $INSTDIR "$LOCALAPPDATA\NDT\apps\${WCG_NDT_ID}"
  ${endIf}
!macroend
!macro customInit
  !insertmacro wcgNdtDefaultDir
!macroend
!macro customPageAfterChangeDir
  Page custom wcgNdtDirPage
  Function wcgNdtDirPage
    !insertmacro wcgNdtDefaultDir
    Abort
  FunctionEnd
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
  ; 제거 목록(Uninstall\<GUID>)에 설치 자리도(10-26 NDT — 템플릿은 Software\<GUID> 에만 적는다). 지우기가 키째 지운다
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
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

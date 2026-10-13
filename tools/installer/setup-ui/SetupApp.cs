// 날씨 CG 설치 프로그램(겉 — WeatherCG-Setup-<판>.exe). 2026-10-13 사용자 요청: '설치 창이 윈도 기본 설치 창 같은데, 영상 플레이어처럼 독자적인 설치 창으로 — 우리 디자인으로'.
// 영상 플레이어(NewsPlayer) Installer\SetupWindow 를 날씨 CG 토스 카드 결(업데이트 진행 창 desktop/update-ui 와 같은 색·글꼴·단계 그림)로 옮겼다. MODULES.md 10장 '설치 창'.
// 빌드는 tools/build-setup-ui.cjs(.NET Framework 4 csc — C# 5 문법만, $"" 보간·?. ·식 본문 멤버 없음). XAML 은 exe 안 글자 그대로 XamlReader 로 읽는다(x:Class 없음).
//
// 속: electron-builder 가 구운 NSIS 설치 파일을 그대로 품는다(리소스 WeatherCGSetup.payload.exe). 하는 일은 NSIS 가 하고, 이 프로그램은 겉 창과 넘기기만.
//  · 창(인자에 /S 없음): 지금 깔린 판·자리(레지스트리 Software\<GUID> InstallLocation — HKCU, 없으면 HKLM = '모든 사용자')를 보여 주고 [설치] →
//      0) 설치 파일 풀기 — %TEMP%\wcg-setup\<pid>-<시각>\ 에 풀며 sha256 을 빌드 때 값과 맞춰 본다. 푼 파일을 잡아 두지는 않는다
//                          (exe 를 연 채 띄우면 이 PC 보안 검사가 핸들이 닫히길 기다려 .NET exe 는 약 23초 늦게 뜬다 — 10-13 실측. 풀자마자 띄우니 틈은 작다)
//      1) 날씨 CG 닫기   — 켜져 있으면(같은 exe 이름·같은 세션) 창에 닫기를 요청하고(저장 묻기는 앱이) 다 꺼질 때까지 — 이름으로 강제로 끄지 않는다
//      2) 날씨 CG 설치   — 품은 설치 파일을 '/S /currentuser|/allusers /D=<자리>' 로 조용히 돌리고 끝 코드·깔린 exe 판을 본다
//                          (조용한 설치는 진행률을 안 주니 설치 폴더 파일 변화로 막대를 채운다 — 업데이트 진행 창과 같은 셈. '모든 사용자'면 관리자 확인 안내)
//      3) 바로 가기 · 마무리 — 바로 가기 확인, 푼 파일 지움 → '설치가 끝났어요' + [날씨 CG 실행]·[닫기]
//  · 조용한 설치(인자에 /S — 앱 자동 업데이트·업데이트 진행 창·시험이 '/S --updated [--force-run]'·'/S /D=…'·'/allusers' 로 부른다):
//      창 없이 풀고 받은 명령줄 꼬리를 한 글자도 안 바꾸고 품은 NSIS 에 넘겨 끝날 때까지 기다린 뒤 그 종료 코드를 그대로 돌려준다(/D= 는 NSIS 규칙대로 마지막·따옴표 없이).
//      겉 프로그램 자체 문제의 종료 코드: 10 = 풀 자리 없음·쓰기 실패, 11 = 품은 파일 확인값 다름, 12 = 실행 못 함. 기록 %TEMP%\wcg-setup\setup.log.
//  · --check=<json>: 창 없이 스스로 점검(XAML·글꼴 3·품은 파일 크기·sha256·아이콘)만 하고 끝(빌드가 부른다).
// 인자(창): [--shots=<캡처 폴더 — 시험>] [--log=<기록 파일>] [/D=<설치 자리 — 미리 채움, 마지막>]
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using Microsoft.Win32;

namespace WeatherCGSetup
{
    // ---------- 명령줄 ----------
    static class Cmd
    {
        // 프로그램 경로를 뺀 명령줄 꼬리 — 받은 그대로(따옴표·공백·/D= 포함) 품은 NSIS 에 넘긴다
        public static string Tail(string cl)
        {
            cl = cl ?? "";
            int i = 0;
            while (i < cl.Length && char.IsWhiteSpace(cl[i])) i++;
            if (i < cl.Length && cl[i] == '"')
            {
                int j = cl.IndexOf('"', i + 1);
                i = j < 0 ? cl.Length : j + 1;
            }
            while (i < cl.Length && !char.IsWhiteSpace(cl[i])) i++;
            while (i < cl.Length && char.IsWhiteSpace(cl[i])) i++;
            return cl.Substring(i);
        }
        // NSIS 와 같은 기준 — '/S' 낱말(대소문자 그대로)이 있으면 조용한 설치
        public static bool Silent(string[] args)
        {
            foreach (string a in args) if (a == "/S") return true;
            return false;
        }
        public static string Opt(string[] args, string k)
        {
            foreach (string a in args)
                if (a != null && a.StartsWith("--" + k + "=", StringComparison.OrdinalIgnoreCase))
                {
                    string v = a.Substring(k.Length + 3).Trim().Trim('"');
                    return v.Length > 0 ? v : null;
                }
            return null;
        }
        // /D=<자리> — NSIS 규칙대로 맨 끝(따옴표 없이, 공백 포함)
        public static string DirArg(string tail)
        {
            Match m = Regex.Match(tail ?? "", @"(?:^|\s)/D=(.+)$");
            return m.Success ? m.Groups[1].Value.Trim().Trim('"') : null;
        }
        public static string Full(string p)
        {
            if (p == null) return null;
            try { return System.IO.Path.GetFullPath(p); } catch (Exception) { return null; }
        }
    }

    // ---------- 기록 ----------
    static class Log
    {
        public static string File;
        public static void Write(string m)
        {
            try
            {
                string f = File ?? System.IO.Path.Combine(Payload.Root, "setup.log");
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(f));
                var fi = new FileInfo(f);
                if (fi.Exists && fi.Length > 1048576) fi.Delete();   // 너무 길면 새로
                System.IO.File.AppendAllText(f, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " [" + Process.GetCurrentProcess().Id + "] " + m + Environment.NewLine, new UTF8Encoding(false));
            }
            catch (Exception) { }
        }
    }

    // ---------- 품은 NSIS 설치 파일 ----------
    sealed class PayloadException : Exception
    {
        public readonly int Code;
        public readonly string Hint;
        public PayloadException(int code, string msg, string hint) : base(msg) { Code = code; Hint = hint; }
    }

    static class Payload
    {
        public const string ResName = "WeatherCGSetup.payload.exe";
        public const int CodeSpace = 10, CodeSha = 11, CodeRun = 12;
        public static string Root { get { return System.IO.Path.Combine(System.IO.Path.GetTempPath(), "wcg-setup"); } }

        // 하루 넘게 남은 옛 풀기 폴더(겉 프로그램이 도중에 꺼진 것) 정리 — 이름 꼴 <pid>-<시각> 만
        public static void CleanOld(bool fontsToo)
        {
            try
            {
                if (!Directory.Exists(Root)) return;
                foreach (string d in Directory.GetDirectories(Root))
                {
                    if (!Regex.IsMatch(System.IO.Path.GetFileName(d), @"^\d+-\d+$")) continue;
                    try { if (Directory.GetLastWriteTimeUtc(d) < DateTime.UtcNow.AddDays(-1)) Directory.Delete(d, true); } catch (Exception) { }
                }
                // 창이 푼 글꼴(약 8MB)도 하루 지나면 — 조용한 설치 때만(창은 그 글꼴을 쓰는 중)
                string fonts = System.IO.Path.Combine(Root, "ui-fonts");
                try { if (fontsToo && Directory.Exists(fonts) && Directory.GetCreationTimeUtc(fonts) < DateTime.UtcNow.AddDays(-1)) Directory.Delete(fonts, true); } catch (Exception) { }
            }
            catch (Exception) { }
        }
        public static string NewWorkDir()
        {
            string d = System.IO.Path.Combine(Root, Process.GetCurrentProcess().Id + "-" + DateTime.UtcNow.Ticks);
            Directory.CreateDirectory(d);
            return d;
        }
        // 풀기 — 크기·sha256 을 빌드 때 값과 맞춰 본다. progress(0~1) 는 다른 스레드에서 부른다
        public static string Extract(string workDir, Action<double> progress)
        {
            var asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream(ResName))
            {
                if (s == null || s.Length != SetupInfo.PayloadSize)
                    throw new PayloadException(CodeSha, "설치 파일 안에 든 설치 본체가 없거나 크기가 달라요 — 파일이 손상됐어요.", "설치 파일을 다시 받아 주세요.");
                try
                {
                    var drive = new DriveInfo(System.IO.Path.GetPathRoot(workDir));
                    if (drive.AvailableFreeSpace < s.Length + (64L << 20))
                        throw new PayloadException(CodeSpace, string.Format("임시 폴더 드라이브({0})에 빈 공간이 모자라요 — 약 {1}MB 가 필요해요.", drive.Name.TrimEnd('\\'), (s.Length >> 20) + 64),
                            "드라이브 공간을 비운 뒤 [다시 시도]를 눌러 주세요.");
                }
                catch (PayloadException) { throw; }
                catch (Exception) { }
                string file = System.IO.Path.Combine(workDir, SetupInfo.InnerName);
                string got;
                try
                {
                    using (var sha = SHA256.Create())
                    using (var f = new FileStream(file, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20))
                    {
                        var buf = new byte[1 << 20];
                        long done = 0, len = Math.Max(1, s.Length);
                        int n;
                        var sw = Stopwatch.StartNew();
                        long last = -1000;
                        while ((n = s.Read(buf, 0, buf.Length)) > 0)
                        {
                            sha.TransformBlock(buf, 0, n, null, 0);
                            f.Write(buf, 0, n);
                            done += n;
                            if (progress != null && sw.ElapsedMilliseconds - last > 60) { last = sw.ElapsedMilliseconds; progress((double)done / len); }
                        }
                        sha.TransformFinalBlock(buf, 0, 0);
                        got = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                    }
                }
                catch (IOException ex)
                {
                    TryDelete(file);
                    throw new PayloadException(CodeSpace, "설치 파일을 임시 폴더에 풀지 못했어요: " + ex.Message, "드라이브 공간·보안 프로그램을 확인한 뒤 [다시 시도]를 눌러 주세요.");
                }
                catch (UnauthorizedAccessException ex)
                {
                    TryDelete(file);
                    throw new PayloadException(CodeSpace, "설치 파일을 임시 폴더에 풀지 못했어요: " + ex.Message, "보안 프로그램이 막았을 수 있어요. [다시 시도]를 눌러 주세요.");
                }
                if (got != SetupInfo.PayloadSha256)
                {
                    TryDelete(file);
                    throw new PayloadException(CodeSha, "설치 파일이 손상됐어요(안에 든 설치 본체의 확인값이 달라요).", "설치 파일을 다시 받아 주세요. 또 그러면 담당자에게 알려 주세요.");
                }
                if (progress != null) progress(1);
                return file;
            }
        }

        public static void Remove(string workDir)
        {
            if (workDir == null) return;
            for (int i = 0; i < 12; i++)
            {
                try { if (Directory.Exists(workDir)) Directory.Delete(workDir, true); return; }
                catch (Exception) { Thread.Sleep(250); }
            }
            Log.Write("풀기 폴더를 못 지움(다음 실행 때 정리): " + workDir);
        }
        static void TryDelete(string f) { try { File.Delete(f); } catch (Exception) { } }
    }

    // ---------- 조용한 설치(/S) — 창 없이 그대로 넘기기 ----------
    static class Silent
    {
        public static int Run(string tail)
        {
            Log.Write(string.Format("조용한 설치 — {0} {1}{2}, 인자: {3}", SetupInfo.Product, SetupInfo.Version, SetupInfo.Variant.Length > 0 ? " (" + SetupInfo.Variant + ")" : "", tail));
            Payload.CleanOld(true);
            string work = null, inner;
            var sw = Stopwatch.StartNew();
            try
            {
                work = Payload.NewWorkDir();
                inner = Payload.Extract(work, null);
            }
            catch (PayloadException ex) { Log.Write("풀기 실패(" + ex.Code + "): " + ex.Message); Payload.Remove(work); return ex.Code; }
            catch (Exception ex) { Log.Write("풀기 실패: " + ex.Message); Payload.Remove(work); return Payload.CodeSpace; }
            Log.Write("풀기 " + sw.ElapsedMilliseconds + "ms → " + inner);
            int code;
            try
            {
                var psi = new ProcessStartInfo(inner, tail) { UseShellExecute = false, WorkingDirectory = work };
                Process p;
                try { p = Process.Start(psi); }
                catch (Win32Exception ex)
                {
                    if (ex.NativeErrorCode != 740) throw;   // 관리자 권한이 필요한 exe — 셸로(관리자 확인 창)
                    psi.UseShellExecute = true;
                    p = Process.Start(psi);
                }
                if (p == null) throw new Exception("실행 안 됨");
                Log.Write("설치 본체 실행 pid " + p.Id + " — " + sw.ElapsedMilliseconds + "ms");
                p.WaitForExit();
                code = p.ExitCode;
                p.Dispose();
            }
            catch (Exception ex) { Log.Write("실행 실패: " + ex.Message); code = Payload.CodeRun; }
            finally
            {
                Payload.Remove(work);
            }
            Log.Write("끝 — 종료 코드 " + code + ", " + sw.ElapsedMilliseconds + "ms");
            return code;
        }
    }

    // ---------- 지금 깔린 것 ----------
    sealed class Installed
    {
        public string Dir;        // 등록된 설치 자리(없으면 null)
        public string Version;    // 그 자리 exe 판(못 읽으면 null)
        public bool PerMachine;   // '모든 사용자' 설치(HKLM 에만 등록) — electron-builder 설치 화면(installer.nsh customInstallMode)과 같은 기준

        public static Installed Read()
        {
            string m = RegDir(RegistryHive.LocalMachine), u = RegDir(RegistryHive.CurrentUser);
            var r = new Installed();
            if (u != null) r.Dir = u;
            else if (m != null) { r.Dir = m; r.PerMachine = true; }
            if (r.Dir != null) r.Version = Util.ExeVersion(System.IO.Path.Combine(r.Dir, SetupInfo.ExeName), 1);
            return r;
        }
        // electron-builder multiUser.nsh — Software\<APP_GUID> 의 InstallLocation(64비트 보기 — 설치 프로그램이 SetRegView 64)
        static string RegDir(RegistryHive hive)
        {
            try
            {
                using (RegistryKey root = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64))
                using (RegistryKey k = root.OpenSubKey(@"Software\" + SetupInfo.Guid))
                {
                    string s = k == null ? null : k.GetValue("InstallLocation") as string;
                    return string.IsNullOrWhiteSpace(s) ? null : s.Trim().TrimEnd('\\');
                }
            }
            catch (Exception) { return null; }
        }
        public static string DefaultDir
        {
            get { return System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", SetupInfo.DirName); }
        }
    }

    // ---------- 윈도 함수 ----------
    static class Native
    {
        [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        public static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);
    }

    // 폴더 고르기(윈도 탐색기식 — IFileOpenDialog FOS_PICKFOLDERS). 못 쓰면 옛 폴더 찾아보기 창
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogCo { }
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    static class FolderPicker
    {
        // 고른 폴더 경로, 취소면 null
        public static string Pick(Window owner, string start, string title)
        {
            IntPtr hwnd = new WindowInteropHelper(owner).Handle;
            try
            {
                var dlg = (IFileDialog)new FileOpenDialogCo();
                try
                {
                    const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
                    dlg.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
                    dlg.SetTitle(title);
                    dlg.SetOkButtonLabel("이 폴더에 설치");
                    if (start != null)
                    {
                        try { IShellItem si; Native.SHCreateItemFromParsingName(start, IntPtr.Zero, typeof(IShellItem).GUID, out si); dlg.SetFolder(si); } catch (Exception) { }
                    }
                    int hr = dlg.Show(hwnd);
                    if (hr != 0) return null;   // 취소(0x800704C7) 등
                    IShellItem res; dlg.GetResult(out res);
                    string path; res.GetDisplayName(0x80058000 /* SIGDN_FILESYSPATH */, out path);
                    return path;
                }
                finally { Marshal.ReleaseComObject(dlg); }
            }
            catch (Exception ex)
            {
                Log.Write("탐색기식 폴더 고르기 실패 — 옛 창: " + ex.Message);
                using (var f = new System.Windows.Forms.FolderBrowserDialog { Description = title, SelectedPath = start ?? "", ShowNewFolderButton = true })
                    return f.ShowDialog() == System.Windows.Forms.DialogResult.OK ? f.SelectedPath : null;
            }
        }
    }

    // ---------- 단계 실패 ----------
    sealed class StepFail : Exception
    {
        public readonly int Step, RetryFrom;
        public readonly bool Retry;
        public readonly string Hint;
        public StepFail(int step, string msg, bool retry, int retryFrom, string hint) : base(msg)
        { Step = step; Retry = retry; RetryFrom = retryFrom; Hint = hint; }
    }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            string check = Cmd.Opt(args, "check");
            if (check != null) return SelfCheck(Cmd.Full(check), Cmd.Full(Cmd.Opt(args, "fonts-dir")));
            string log = Cmd.Full(Cmd.Opt(args, "log"));
            if (log != null) Log.File = log;
            string tail = Cmd.Tail(Environment.CommandLine);
            if (Cmd.Silent(args)) return Silent.Run(tail);

            AppDomain.CurrentDomain.UnhandledException += (s, e) => Log.Write("처리 못 한 예외: " + e.ExceptionObject);
            var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
            SetupUi ui = null;
            app.DispatcherUnhandledException += (s, e) => { e.Handled = true; if (ui != null) ui.Crashed(e.Exception); };
            ui = new SetupUi(Cmd.Full(Cmd.Opt(args, "shots")), Cmd.DirArg(tail));
            app.Run(ui.Win);
            return ui.ExitCode;
        }

        // 창 없이 점검 — XAML·글꼴('Wanted Sans NP' 3)·품은 설치 본체(크기·sha256)·아이콘. 결과 JSON 을 --check 파일에
        static int SelfCheck(string outFile, string fontsDir)
        {
            bool xaml = false, payload = false, icon = false; int fonts = 0; string family = "", err = "";
            long bytes = 0;
            try
            {
                var w = SetupUi.LoadWindow();
                xaml = w != null;
                foreach (string n in SetupUi.Names) if (w.FindName(n) == null) { xaml = false; err += "XAML 이름 없음: " + n + " "; }
                string dir = fontsDir ?? System.IO.Path.Combine(System.IO.Path.GetDirectoryName(outFile), "wcg-setup-check-fonts");
                foreach (string f in SetupUi.ExtractFonts(dir))
                {
                    var g = new GlyphTypeface(new Uri(f));
                    if (g.FamilyNames.Values.Contains(SetupUi.FontName)) { fonts++; family = SetupUi.FontName; }
                }
                if (fontsDir == null) { try { Directory.Delete(dir, true); } catch (Exception) { } }
                icon = SetupUi.LoadIcon() != null;
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(Payload.ResName))
                {
                    if (s != null)
                    {
                        bytes = s.Length;
                        using (var sha = SHA256.Create())
                            payload = bytes == SetupInfo.PayloadSize && BitConverter.ToString(sha.ComputeHash(s)).Replace("-", "").ToLowerInvariant() == SetupInfo.PayloadSha256;
                    }
                }
            }
            catch (Exception ex) { err += ex.Message; }
            bool ok = xaml && fonts == 3 && payload && icon;
            string ver = FileVersionInfo.GetVersionInfo(Assembly.GetExecutingAssembly().Location).FileVersion;
            Func<string, string> J = (v) => "\"" + (v ?? "").Replace("\\", "\\\\").Replace("\"", "'") + "\"";
            string json = "{\"ok\":" + (ok ? "true" : "false") + ",\"xaml\":" + (xaml ? "true" : "false") + ",\"fonts\":" + fonts + ",\"family\":" + J(family)
                + ",\"payload\":" + (payload ? "true" : "false") + ",\"payloadBytes\":" + bytes + ",\"icon\":" + (icon ? "true" : "false")
                + ",\"version\":" + J(SetupInfo.Version) + ",\"fileVersion\":" + J(ver) + ",\"product\":" + J(SetupInfo.Product) + ",\"variant\":" + J(SetupInfo.Variant)
                + ",\"inner\":" + J(SetupInfo.InnerName) + ",\"clr\":" + J(Environment.Version.ToString()) + ",\"error\":" + J(err.Trim()) + "}";
            try { File.WriteAllText(outFile, json, new UTF8Encoding(false)); } catch (Exception) { return 3; }
            return ok ? 0 : 1;
        }
    }

    // ---------- 창 ----------
    sealed class SetupUi
    {
        public const string FontName = "Wanted Sans NP";
        public static readonly string[] Names = { "Card", "Head", "CloseX", "AppIcon", "TitleText", "SubText", "ReadyPage", "StateBox", "StateDot", "StateTitle", "StateText",
            "DirFrame", "DirBox", "BrowseBtn", "DirHint", "RunBox", "RunText", "InstallBtn", "CancelBtn", "WorkPage", "Steps", "Track", "Bar", "Percent", "Status", "Note",
            "EndPanel", "EndText", "EndHint", "EndCloseBtn", "EndMainBtn" };
        const int StepCount = 4;
        // 막대에서 단계마다 차지하는 몫(시작 지점) — 0 풀기 · 1 닫기 · 2 설치(가장 김) · 3 마무리 · 끝 = 1
        static readonly double[] StepAt = { 0.0, 0.12, 0.17, 0.95, 1.0 };
        // 설치 단계에서 지난 시간만으로 채우는 몫의 끝(단계 안 0~1) — 나머지는 설치 폴더 파일 변화로만(업데이트 진행 창과 같음)
        const double TimeShare = 0.5;
        const int CloseTimeoutSec = 120, InstallTimeoutSec = 600;

        public readonly Window Win;
        public int ExitCode = 2;   // 0 = 설치 끝, 1 = 문제로 멈춘 뒤 닫음, 2 = 설치 안 하고 닫음
        readonly string _shots, _p;
        readonly Installed _inst;
        readonly bool _perMachine;
        readonly Border _head, _bar, _track, _stateBox, _stateDot, _dirFrame, _runBox;
        readonly TextBlock _title, _sub, _stateTitle, _stateText, _dirHint, _runText, _percent, _status, _note, _endText, _endHint;
        readonly TextBox _dirBox;
        readonly StackPanel _ready, _work, _stepsPanel, _endPanel;
        readonly Button _closeX, _browse, _install, _cancel, _endClose, _endMain;
        readonly List<StepRow> _steps = new List<StepRow>();
        TextBlock _adminHint;
        readonly DispatcherTimer _runTimer;
        int _current = -1, _shotN;
        double _target, _shown;
        bool _running, _ok, _runCheckBusy;
        string _dir, _workDir, _inner;
        StepFail _lastFail;
        readonly Stopwatch _clock = Stopwatch.StartNew();

        sealed class StepRow { public Border Dot; public TextBlock Num; public System.Windows.Shapes.Path Check, Cross; public Ellipse Ring; public TextBlock Label; }

        Brush R(string key) { return (Brush)Win.FindResource(key); }
        static Brush Hex(string c) { return (Brush)new BrushConverter().ConvertFromString(c); }
        object F(string n) { return Win.FindName(n); }

        public SetupUi(string shots, string dirArg)
        {
            _shots = shots;
            _p = SetupInfo.Product;
            Win = LoadWindow();
            _head = (Border)F("Head"); _bar = (Border)F("Bar"); _track = (Border)F("Track");
            _stateBox = (Border)F("StateBox"); _stateDot = (Border)F("StateDot"); _dirFrame = (Border)F("DirFrame"); _runBox = (Border)F("RunBox");
            _title = (TextBlock)F("TitleText"); _sub = (TextBlock)F("SubText"); _stateTitle = (TextBlock)F("StateTitle"); _stateText = (TextBlock)F("StateText");
            _dirHint = (TextBlock)F("DirHint"); _runText = (TextBlock)F("RunText"); _percent = (TextBlock)F("Percent"); _status = (TextBlock)F("Status");
            _note = (TextBlock)F("Note"); _endText = (TextBlock)F("EndText"); _endHint = (TextBlock)F("EndHint");
            _dirBox = (TextBox)F("DirBox");
            _ready = (StackPanel)F("ReadyPage"); _work = (StackPanel)F("WorkPage"); _stepsPanel = (StackPanel)F("Steps"); _endPanel = (StackPanel)F("EndPanel");
            _closeX = (Button)F("CloseX"); _browse = (Button)F("BrowseBtn"); _install = (Button)F("InstallBtn"); _cancel = (Button)F("CancelBtn");
            _endClose = (Button)F("EndCloseBtn"); _endMain = (Button)F("EndMainBtn");

            Win.Title = _p + " 설치";
            try { Win.FontFamily = LoadFont(System.IO.Path.Combine(Payload.Root, "ui-fonts")); }
            catch (Exception ex) { Log.Write("글꼴 못 읽음 — 맑은 고딕: " + ex.Message); Win.FontFamily = new FontFamily("Malgun Gothic"); }
            ImageSource ico = LoadIcon();
            if (ico != null) { ((Image)F("AppIcon")).Source = ico; Win.Icon = ico; }

            _title.Text = _p + " 설치";
            _sub.Text = "버전 " + SetupInfo.Version + (SetupInfo.Variant.Length > 0 ? " · 설치 시험판" : "") + " · SBS 날씨 CG 메이커";

            // 지금 깔린 것 → 상태 상자·설치 자리
            _inst = Installed.Read();
            _perMachine = _inst.PerMachine;
            string start = dirArg ?? _inst.Dir ?? Installed.DefaultDir;
            try { start = System.IO.Path.GetFullPath(start).TrimEnd('\\'); } catch (Exception) { }
            _dirBox.Text = start;
            RenderState();
            DirHint(null);
            _dirBox.TextChanged += delegate { DirHint(null); };

            // 단계
            AddStep("설치 파일 풀기");
            AddStep(_p + " 닫기");
            AddStep(_p + " 설치");
            AddStep("바로 가기 · 마무리");
            _adminHint = new TextBlock { Text = "관리자 확인 창이 뜨면 [예]를 눌러 주세요.", FontSize = 12.5, Foreground = R("T.AccentText"),
                                         Margin = new Thickness(36, -6, 0, 12), Visibility = Visibility.Collapsed, TextWrapping = TextWrapping.Wrap };
            _stepsPanel.Children.Insert(_stepsPanel.Children.IndexOf(_steps[2].Label.Parent as UIElement) + 1, _adminHint);

            _track.SizeChanged += delegate { DrawBar(); };
            var tick = new DispatcherTimer(DispatcherPriority.Render, Win.Dispatcher) { Interval = TimeSpan.FromMilliseconds(33) };
            tick.Tick += delegate { Ease(); };
            tick.Start();

            Win.MouseLeftButtonDown += (s, e) => { if (e.ButtonState == MouseButtonState.Pressed) { try { Win.DragMove(); } catch (InvalidOperationException) { } } };
            Win.Closing += OnClosing;
            _cancel.IsCancel = true;
            _closeX.Click += delegate { Win.Close(); };
            _cancel.Click += delegate { Win.Close(); };
            _browse.Click += delegate { Browse(); };
            _install.Click += delegate { StartInstall(); };
            _endClose.Click += delegate { Win.Close(); };
            _endMain.Click += delegate { if (_ok) LaunchAndClose(); else Retry(); };

            // 켜져 있는 날씨 CG — 설치 전 화면에서 1.5초마다
            _runTimer = new DispatcherTimer(DispatcherPriority.Background, Win.Dispatcher) { Interval = TimeSpan.FromMilliseconds(1500) };
            _runTimer.Tick += delegate { CheckRunning(); };
            _runTimer.Start();

            Win.ContentRendered += OnShown;
            Log.Write(string.Format("창 — {0} {1}{2}, 깔린 것: {3}{4}{5}", _p, SetupInfo.Version, SetupInfo.Variant.Length > 0 ? " (" + SetupInfo.Variant + ")" : "",
                _inst.Dir ?? "없음", _inst.Version != null ? " " + _inst.Version : "", _perMachine ? " — 모든 사용자" : ""));
        }

        // ---------- XAML · 글꼴 · 아이콘 ----------
        public static Window LoadWindow()
        {
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("WeatherCGSetup.SetupWindow.xaml"))
                return (Window)XamlReader.Load(s);
        }
        public static List<string> ExtractFonts(string dir)
        {
            Directory.CreateDirectory(dir);
            var asm = Assembly.GetExecutingAssembly();
            var outList = new List<string>();
            foreach (string name in asm.GetManifestResourceNames())
            {
                const string pre = "WeatherCGSetup.fonts.";
                if (!name.StartsWith(pre) || !name.EndsWith(".ttf", StringComparison.OrdinalIgnoreCase)) continue;
                string file = System.IO.Path.Combine(dir, name.Substring(pre.Length));
                using (Stream s = asm.GetManifestResourceStream(name))
                {
                    if (!File.Exists(file) || new FileInfo(file).Length != s.Length)
                    {
                        string tmp = file + "." + Process.GetCurrentProcess().Id + ".tmp";
                        using (var f = File.Create(tmp)) s.CopyTo(f);
                        if (File.Exists(file)) File.Delete(file);
                        File.Move(tmp, file);
                    }
                }
                outList.Add(file);
            }
            return outList;
        }
        static FontFamily LoadFont(string dir)
        {
            List<string> files = ExtractFonts(dir);
            if (files.Count == 0) throw new Exception("담긴 글꼴 없음");
            return new FontFamily(new Uri(dir.TrimEnd('\\') + "\\"), "./#" + FontName + ", Malgun Gothic");
        }
        public static ImageSource LoadIcon()
        {
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("WeatherCGSetup.icon.png"))
                {
                    if (s == null) return null;
                    var b = new BitmapImage();
                    b.BeginInit(); b.CacheOption = BitmapCacheOption.OnLoad; b.StreamSource = s; b.EndInit(); b.Freeze();
                    return b;
                }
            }
            catch (Exception) { return null; }
        }

        // ---------- 설치 전 화면 ----------
        void RenderState()
        {
            string v = SetupInfo.Version, old = _inst.Version;
            int cmp = old == null ? -2 : Util.CompareVer(old, v);
            string btn;
            if (_inst.Dir == null || old == null)
            {
                _stateTitle.Text = "처음 설치해요";
                _stateText.Text = string.Format("{0} {1}{2} 이 PC에 깔아요. 바탕화면과 시작 메뉴에 바로 가기를 만들어요.", _p, v, Util.Eul(v));
                btn = "설치";
            }
            else if (cmp < 0)
            {
                _stateTitle.Text = string.Format("{0} → {1} 업데이트", old, v);
                _stateText.Text = string.Format("지금 깔린 {0}{1} {2}{3} 바꿔요. 작업·배치·설정은 그대로예요.", old, Util.Eul(old), v, Util.Euro(v));
                btn = "업데이트";
            }
            else if (cmp == 0)
            {
                _stateTitle.Text = string.Format("이미 {0}{1} 깔려 있어요", v, Util.Ga(v));
                _stateText.Text = "다시 설치하면 프로그램 파일을 새로 깔아요. 작업·배치·설정은 그대로예요.";
                btn = "다시 설치";
            }
            else
            {
                _stateTitle.Text = string.Format("더 새 판 {0}{1} 깔려 있어요", old, Util.Ga(old));
                _stateText.Text = string.Format("설치하면 낮은 판 {0}{1} 바뀌어요. 작업·배치·설정은 그대로예요.", v, Util.Euro(v));
                btn = "낮은 판으로 바꾸기";
                _stateDot.Background = R("T.Warn");
                _stateBox.Background = Hex("#14FFB020");
                _stateBox.BorderBrush = Hex("#38FFB020");
            }
            _install.Content = btn;
            Log.Write("설치 전 화면 — " + _stateTitle.Text + " · 단추 " + btn);
        }
        // 설치 자리 밑 한 줄 — 오류(err)면 빨갛게
        void DirHint(string err)
        {
            if (err != null)
            {
                _dirHint.Text = err;
                _dirHint.Foreground = R("T.Danger");
                _dirFrame.BorderBrush = R("T.Danger");
                return;
            }
            _dirFrame.BorderBrush = R("T.Outline");
            string t = _perMachine ? "모든 사용자용으로 깔린 자리예요. 설치할 때 관리자 확인 창이 뜨면 [예]를 눌러 주세요."
                                   : "관리자 권한 없이 이 사용자 계정에 깔아요.";
            if (_inst.Dir != null && !Util.SamePath(_dirBox.Text, _inst.Dir))
                t += " 원래 자리(" + _inst.Dir + ")의 판은 지우고 이 자리에 깔아요.";
            _dirHint.Text = t;
            _dirHint.Foreground = _perMachine ? R("T.AccentText") : R("T.Muted");
        }
        void Browse()
        {
            string start = Util.NearestExisting(_dirBox.Text);
            string got = FolderPicker.Pick(Win, start, "설치할 폴더를 고르세요");
            if (got == null) return;
            try { _dirBox.Text = ResolveTarget(got); } catch (Exception) { _dirBox.Text = got; }
            Log.Write("설치 자리 고름: " + _dirBox.Text);
        }
        // 다른 파일이 든 폴더에 섞어 깔지 않는다 — 비어 있지 않은데 날씨 CG 가 아닌 폴더(또는 드라이브 맨 위)면 그 밑 '<설치 폴더 이름>'
        string ResolveTarget(string dir)
        {
            dir = (dir ?? "").Trim().Trim('"');
            if (dir.Length < 3 || !System.IO.Path.IsPathRooted(dir) || dir.StartsWith(@"\\")) throw new ArgumentException("자리");
            dir = System.IO.Path.GetFullPath(dir).TrimEnd('\\');
            if (dir.Length <= 2) return dir + "\\" + SetupInfo.DirName;   // C: → C:\weathercg-desktop
            if (Directory.Exists(dir) && Directory.EnumerateFileSystemEntries(dir).Any()
                && !File.Exists(System.IO.Path.Combine(dir, SetupInfo.ExeName)) && !Util.SamePath(dir, _inst.Dir))
                dir = System.IO.Path.Combine(dir, SetupInfo.DirName);
            return dir;
        }
        async void CheckRunning()
        {
            if (_runCheckBusy || _running || _ok) return;
            _runCheckBusy = true;
            try
            {
                int n = await Task.Run(() => Util.AppProcesses().Count);
                if (_ready.Visibility != Visibility.Visible) return;
                if (n > 0)
                {
                    _runText.Text = string.Format("{0}{1} 켜져 있어요. [{2}]{3} 누르면 앱에 닫기를 요청해요 — 저장하겠냐고 물으면 답해 주세요.", _p, Util.Ga(_p), _install.Content, Util.Eul(Convert.ToString(_install.Content)));
                    _runBox.Visibility = Visibility.Visible;
                }
                else _runBox.Visibility = Visibility.Collapsed;
            }
            finally { _runCheckBusy = false; }
        }

        void OnShown(object sender, EventArgs e)
        {
            Win.ContentRendered -= OnShown;
            CheckRunning();   // 처음 한 번(생성자에서 부르면 await 뒤가 UI 스레드가 아니다 — 창이 뜬 뒤에)
            ShotLater("ready", 900);
        }

        void StartInstall()
        {
            if (_running) return;
            string dir;
            try { dir = ResolveTarget(_dirBox.Text); }
            catch (Exception) { DirHint("설치 위치가 올바르지 않아요 — 내 PC의 폴더를 골라 주세요."); _dirBox.Focus(); return; }
            if (!_perMachine && !Util.CanWrite(dir))
            {
                DirHint("이 자리에는 쓸 수 없어요(관리자 권한이 필요한 폴더일 수 있어요) — 다른 곳을 골라 주세요.");
                _dirBox.Focus();
                return;
            }
            _dir = dir;
            _dirBox.Text = dir;
            _runTimer.Stop();
            _ready.Visibility = Visibility.Collapsed;
            _work.Visibility = Visibility.Visible;
            _title.Text = _p + " 설치하는 중";
            Log.Write("설치 시작 — 자리 " + _dir + (_perMachine ? " (모든 사용자)" : ""));
            Run(0);
        }

        // ---------- 단계 그리기(업데이트 진행 창과 같은 그림) ----------
        void AddStep(string name)
        {
            var row = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
            var dot = new Border { Width = 24, Height = 24, CornerRadius = new CornerRadius(12), Background = R("T.SurfaceHi") };
            var num = new TextBlock { Text = (_steps.Count + 1).ToString(), FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = R("T.Muted"),
                                      HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var check = new System.Windows.Shapes.Path { Data = Geometry.Parse("M7,12.4 L10.6,16 L17.2,8.6"), Stroke = Brushes.White, StrokeThickness = 2.4,
                                   StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, StrokeLineJoin = PenLineJoin.Round,
                                   Width = 24, Height = 24, Visibility = Visibility.Collapsed };
            var cross = new System.Windows.Shapes.Path { Data = Geometry.Parse("M8.2,8.2 L15.8,15.8 M15.8,8.2 L8.2,15.8"), Stroke = Brushes.White, StrokeThickness = 2.4,
                                   StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, Width = 24, Height = 24, Visibility = Visibility.Collapsed };
            var ring = new Ellipse { Width = 24, Height = 24, StrokeThickness = 2.5, Stroke = R("T.Accent"), StrokeDashArray = new DoubleCollection { 6, 4 },
                                     Visibility = Visibility.Collapsed, RenderTransformOrigin = new Point(0.5, 0.5), RenderTransform = new RotateTransform() };
            var g = new Grid();
            g.Children.Add(dot); g.Children.Add(num); g.Children.Add(check); g.Children.Add(cross); g.Children.Add(ring);
            DockPanel.SetDock(g, Dock.Left);
            var label = new TextBlock { Text = name, FontSize = 14, Foreground = R("T.Muted"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 0, 0) };
            row.Children.Add(g);
            row.Children.Add(label);
            _stepsPanel.Children.Add(row);
            _steps.Add(new StepRow { Dot = dot, Num = num, Check = check, Cross = cross, Ring = ring, Label = label });
        }
        void Step(int i)
        {
            if (i <= _current) return;
            for (int k = Math.Max(0, _current); k < i && k < _steps.Count; k++) Done(k);
            _current = i;
            _adminHint.Visibility = i == 2 && _perMachine ? Visibility.Visible : Visibility.Collapsed;
            if (i >= _steps.Count) return;
            var s = _steps[i];
            s.Dot.Background = Brushes.Transparent;
            s.Num.Foreground = R("T.Fg");
            s.Label.Foreground = R("T.Fg");
            s.Label.FontWeight = FontWeights.SemiBold;
            s.Ring.Visibility = Visibility.Visible;
            ((RotateTransform)s.Ring.RenderTransform).BeginAnimation(RotateTransform.AngleProperty,
                new DoubleAnimation(0, 360, TimeSpan.FromSeconds(1.1)) { RepeatBehavior = RepeatBehavior.Forever });
            Log.Write("단계 " + i + " 시작 — " + s.Label.Text);
            ShotLater("step" + i, 500);
        }
        void StopRing(StepRow s) { s.Ring.Visibility = Visibility.Collapsed; ((RotateTransform)s.Ring.RenderTransform).BeginAnimation(RotateTransform.AngleProperty, null); }
        void Done(int k)
        {
            var s = _steps[k];
            StopRing(s);
            s.Dot.Background = R("T.Ok");
            s.Num.Visibility = Visibility.Collapsed; s.Cross.Visibility = Visibility.Collapsed; s.Check.Visibility = Visibility.Visible;
            s.Label.Foreground = R("T.Fg");
            s.Label.FontWeight = FontWeights.Normal;
        }
        void Failed(int k)
        {
            if (k < 0 || k >= _steps.Count) return;
            var s = _steps[k];
            StopRing(s);
            s.Dot.Background = R("T.Danger");
            s.Num.Visibility = Visibility.Collapsed; s.Check.Visibility = Visibility.Collapsed; s.Cross.Visibility = Visibility.Visible;
            s.Label.Foreground = R("T.Danger");
        }
        void ResetFrom(int k)
        {
            for (int i = k; i < _steps.Count; i++)
            {
                var s = _steps[i];
                StopRing(s);
                s.Dot.Background = R("T.SurfaceHi");
                s.Num.Visibility = Visibility.Visible; s.Num.Foreground = R("T.Muted");
                s.Check.Visibility = Visibility.Collapsed; s.Cross.Visibility = Visibility.Collapsed;
                s.Label.Foreground = R("T.Muted"); s.Label.FontWeight = FontWeights.Normal;
            }
            _current = k - 1;
            _target = _shown = StepAt[k];
            DrawBar();
        }

        // ---------- 막대 ----------
        void Target(int step, double f)
        {
            f = Math.Max(0, Math.Min(1, f));
            double t = StepAt[step] + (StepAt[step + 1] - StepAt[step]) * f;
            if (step < StepCount) t = Math.Min(t, 0.99);
            if (t > _target) _target = t;
        }
        void Ease()
        {
            if (Math.Abs(_target - _shown) < 0.0005) _shown = _target;
            else _shown += (_target - _shown) * 0.16;
            DrawBar();
        }
        void DrawBar()
        {
            _bar.Width = Math.Max(0, Math.Min(1, _shown)) * _track.ActualWidth;
            _percent.Text = Math.Floor(_shown * 100 + 1e-9) + "%";
        }
        void Status(string s) { _status.Text = s; }

        // ---------- 흐름 ----------
        async void Run(int start)
        {
            _running = true;
            _lastFail = null;
            _closeX.IsEnabled = false;
            try
            {
                if (start <= 0) await StepExtract();
                if (start <= 1) await StepClose();
                if (start <= 2) await StepInstall();
                await StepFinish();
                Finish();
            }
            catch (StepFail f) { Fail(f); }
            catch (Exception ex)
            {
                int at = Math.Max(0, Math.Min(_current, StepCount - 1));
                Fail(new StepFail(at, "예상하지 못한 문제로 멈췄어요: " + ex.Message, true, at == 2 ? 1 : at, null));
            }
        }

        // 0) 품은 설치 본체 풀기(+ 확인값)
        async Task StepExtract()
        {
            Step(0);
            Status("설치 파일을 푸는 중…");
            Payload.Remove(_workDir);   // 다시 시도면 새로 푼다(1~2초 — 그사이 바뀌었을 수 있는 것을 안 믿음)
            var sw = Stopwatch.StartNew();
            try
            {
                _inner = await Task.Run(() =>
                {
                    Payload.CleanOld(false);
                    _workDir = Payload.NewWorkDir();
                    return Payload.Extract(_workDir, (f) => Win.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        Target(0, f);
                        Status("설치 파일을 푸는 중… " + (int)(f * 100) + "%");
                    })));
                });
            }
            catch (PayloadException ex)
            {
                Log.Write("풀기 실패(" + ex.Code + "): " + ex.Message);
                _inner = null;
                throw new StepFail(0, ex.Message, ex.Code != Payload.CodeSha, 0, ex.Hint);
            }
            Log.Write("풀기 끝 — " + sw.ElapsedMilliseconds + "ms, 크기·sha256 맞음");
            Target(0, 1);
            Status("설치 파일이 온전해요.");
        }

        // 1) 켜져 있는 날씨 CG 닫기 — 창에 닫기만 요청(저장 묻기는 앱이). 강제로 끄지 않는다
        async Task StepClose()
        {
            Step(1);
            List<int> ids = await Task.Run(() => Util.AppProcesses());
            if (ids.Count == 0) { Target(1, 1); Status(_p + Util.Ga(_p) + " 켜져 있지 않아요."); return; }
            Log.Write("켜진 앱 " + ids.Count + "개 — 닫기 요청");
            Status(_p + Util.Eul(_p) + " 닫는 중… 저장하겠냐고 물으면 답해 주세요.");
            await Task.Run(() =>
            {
                foreach (int id in ids)
                {
                    try { using (var p = Process.GetProcessById(id)) p.CloseMainWindow(); } catch (Exception) { }
                }
            });
            var sw = Stopwatch.StartNew();
            while ((await Task.Run(() => Util.AppProcesses())).Count > 0)
            {
                if (sw.Elapsed.TotalSeconds > CloseTimeoutSec)
                {
                    Log.Write("앱이 안 닫힘 — " + (int)sw.Elapsed.TotalSeconds + "초");
                    throw new StepFail(1, _p + Util.Ga(_p) + " 닫히지 않아 설치를 멈췄어요.", true, 1,
                        _p + "에서 작업을 저장하고 창을 모두 닫은 뒤 [다시 시도]를 눌러 주세요.");
                }
                Target(1, 1 - Math.Exp(-sw.Elapsed.TotalSeconds / 4));
                await Task.Delay(300);
            }
            Log.Write("앱 닫힘 — " + sw.ElapsedMilliseconds + "ms");
            Target(1, 1);
            Status(_p + Util.Eul(_p) + " 닫았어요.");
        }

        // 2) 설치 — 품은 NSIS 를 조용히(/S) + 이 사용자/모든 사용자 + 자리(/D= — 마지막)
        async Task StepInstall()
        {
            Step(2);
            Status(_p + Util.Eul(_p) + " 설치하는 중…");
            if (_inner == null || !File.Exists(_inner)) throw new StepFail(2, "풀어 둔 설치 파일이 없어졌어요.", true, 0, null);
            Dictionary<string, long> snap = await Task.Run(() => Util.Snapshot(_dir));
            var gone = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var fresh = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string args = "/S " + (_perMachine ? "/allusers" : "/currentuser") + " /D=" + _dir;
            var psi = new ProcessStartInfo(_inner, args) { UseShellExecute = false, WorkingDirectory = System.IO.Path.GetDirectoryName(_inner) };
            try { Win.Activate(); } catch (Exception) { }
            Native.AllowSetForegroundWindow(-1);   // 관리자 확인 창이 앞으로 오게
            Process p;
            try
            {
                try { p = Process.Start(psi); }
                catch (Win32Exception ex)
                {
                    if (ex.NativeErrorCode != 740) throw;
                    psi.UseShellExecute = true;
                    p = Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                throw new StepFail(2, "설치 프로그램을 실행하지 못했어요 — 보안 프로그램이 막았을 수 있어요. (" + ex.Message + ")", true, 0, "[다시 시도]를 눌러 주세요. 그래도 안 되면 담당자에게 알려 주세요.");
            }
            if (p == null) throw new StepFail(2, "설치 프로그램을 실행하지 못했어요.", true, 0, null);
            Log.Write(string.Format("설치 본체 실행({0}) pid {1} — 파일 {2}개 보는 중", args, p.Id, snap.Count));
            double expect = Math.Max(8, Math.Min(60, SetupInfo.PayloadSize / (12.0 * 1048576)));
            var sw = Stopwatch.StartNew();
            var work = Stopwatch.StartNew();   // 막대용 — 관리자 확인 창을 기다린 시간은 뺀다
            double frac = 0;
            bool midShot = false, sawAdmin = false;
            while (!p.HasExited)
            {
                await Task.Delay(300);
                bool admin = _perMachine && await Task.Run(() => Util.ConsentUp());
                bool adminUp = admin && work.IsRunning, adminDown = !admin && !work.IsRunning;
                if (adminUp) work.Stop();
                if (adminDown) work.Start();
                double act = await Task.Run(() => Util.Activity(_dir, snap, gone, fresh));
                double t = work.Elapsed.TotalSeconds;
                frac = Math.Max(frac, Math.Min(0.96, Math.Max((1 - Math.Exp(-t / (expect / 2.2))) * TimeShare, act * 0.96)));
                Target(2, frac);
                if (adminUp) { Log.Write("관리자 확인 창이 뜸"); if (!sawAdmin) { sawAdmin = true; ShotLater("admin-wait", 300); } }
                if (adminDown) Log.Write("관리자 확인 창이 닫힘");
                Status(admin ? "관리자 확인 창에서 [예]를 눌러 주세요…" : string.Format("{0}{1} 설치하는 중… ({2}초)", _p, Util.Eul(_p), (int)sw.Elapsed.TotalSeconds));
                if (!midShot && t > 3) { midShot = true; ShotLater("install-progress", 0); }
                if (sw.Elapsed.TotalSeconds > InstallTimeoutSec)
                {
                    Log.Write("설치 시간 초과");
                    throw new StepFail(2, "설치가 10분 넘게 끝나지 않아요 — 설치 프로그램이 아직 돌고 있을 수 있어요.", false, 0,
                        "잠시 뒤 바탕화면의 " + _p + " 아이콘으로 켜 보세요. 안 켜지면 담당자에게 알려 주세요.");
                }
            }
            int code = -1;
            try { code = p.ExitCode; } catch (Exception) { }
            p.Dispose();
            Log.Write(string.Format("설치 본체 끝 — 종료 코드 {0}, {1}ms, 바뀐 파일 {2}·지워졌던 파일 {3} / {4}{5}", code, sw.ElapsedMilliseconds, fresh.Count, gone.Count, snap.Count,
                sawAdmin ? ", 관리자 확인 창을 봄" : ""));
            if (code != 0)
                throw new StepFail(2, "설치 프로그램이 오류로 끝났어요(종료 코드 " + code + ").", true, 1, InstallHint());
            string v = await Task.Run(() => Util.ExeVersion(System.IO.Path.Combine(_dir, SetupInfo.ExeName), 8));
            if (v == null)
                throw new StepFail(2, "설치가 끝났는데 " + _p + " 파일을 찾지 못했어요(" + _dir + ").", true, 1, InstallHint());
            if (v != SetupInfo.Version)
            {
                Log.Write("깔린 판 " + v + " ≠ " + SetupInfo.Version);
                throw new StepFail(2, string.Format("설치가 끝났는데 {0} 버전이 깔리지 않았어요(지금 {1}).", SetupInfo.Version, v), true, 1, InstallHint());
            }
            Target(2, 1);
            Status(_p + " " + v + Util.Ga(v) + " 깔렸어요.");
        }
        string InstallHint()
        {
            if (_perMachine) return "관리자 확인 창에서 [아니요]를 누르셨다면 [다시 시도]를 누르고 [예]를 눌러 주세요. 그래도 안 되면 담당자에게 알려 주세요.";
            return "[다시 시도]로 다시 설치해 보세요. 그래도 안 되면 담당자에게 알려 주세요.";
        }

        // 3) 바로 가기 확인 · 푼 파일 지우기
        bool _desk, _menu;
        async Task StepFinish()
        {
            Step(3);
            Status("바로 가기를 확인하는 중…");
            string lnk = _p + ".lnk";
            Func<Environment.SpecialFolder, bool> has = (sf) => { try { return File.Exists(System.IO.Path.Combine(Environment.GetFolderPath(sf), lnk)); } catch (Exception) { return false; } };
            _desk = has(Environment.SpecialFolder.DesktopDirectory) || has(Environment.SpecialFolder.CommonDesktopDirectory);
            _menu = has(Environment.SpecialFolder.Programs) || has(Environment.SpecialFolder.CommonPrograms);
            Target(3, 0.5);
            string wd = _workDir;
            await Task.Run(() => Payload.Remove(wd));
            _workDir = null; _inner = null;
            Log.Write("바로 가기 — 바탕화면 " + (_desk ? "있음" : "없음") + " · 시작 메뉴 " + (_menu ? "있음" : "없음"));
            Target(3, 1);
        }

        void Finish()
        {
            Step(StepCount);
            _target = _shown = 1;
            DrawBar();
            _running = false;
            _ok = true;
            ExitCode = 0;
            Tone("설치가 끝났어요", "#144ADE80", "#264ADE80", "T.Fg");   // 앱의 초록 머리(--pop-hd-green)
            Status("설치가 끝났어요.");
            _note.Visibility = Visibility.Collapsed;
            string v = SetupInfo.Version;
            _endText.Text = string.Format("{0} {1}{2} 깔았어요.", _p, v, Util.Eul(v));
            string where = _desk && _menu ? "바탕화면과 시작 메뉴의" : _desk ? "바탕화면의" : _menu ? "시작 메뉴의" : null;
            _endHint.Text = (where != null ? string.Format("{0} '{1}'{2} 켤 수 있어요. ", where, _p, Util.Euro(_p)) : "") + "작업·배치·설정은 그대로예요.\n설치 위치: " + _dir;
            _endMain.Content = _p + " 실행";
            _endMain.Visibility = Visibility.Visible;
            _endClose.Content = "닫기";
            _endPanel.Visibility = Visibility.Visible;
            _closeX.IsEnabled = true;
            Log.Write("끝 — 전체 " + _clock.ElapsedMilliseconds + "ms");
            ShotLater("done", 700);
            _endMain.Focus();
        }

        void Fail(StepFail f)
        {
            _lastFail = f;
            _running = false;
            Failed(f.Step);
            _adminHint.Visibility = Visibility.Collapsed;
            Tone("설치하지 못했어요", "#17FF786E", "#29FF786E", "T.Danger");   // 앱의 빨간 머리(--pop-hd-red)
            Status("설치를 멈췄어요.");
            _endText.Text = f.Message;
            _endHint.Text = f.Hint ?? "";
            _endHint.Visibility = string.IsNullOrEmpty(f.Hint) ? Visibility.Collapsed : Visibility.Visible;
            _endMain.Content = "다시 시도";
            _endMain.Visibility = f.Retry ? Visibility.Visible : Visibility.Collapsed;
            _endClose.Content = "닫기";
            _note.Visibility = Visibility.Collapsed;
            _endPanel.Visibility = Visibility.Visible;
            _closeX.IsEnabled = true;
            ExitCode = 1;
            Log.Write(string.Format("문제 — 단계 {0}: {1} · 안내: {2} · 다시 시도 {3}", f.Step, f.Message, f.Hint ?? "(없음)", f.Retry ? "있음" : "없음"));
            ShotLater("fail-step" + f.Step, 500);
        }
        public void Crashed(Exception ex)
        {
            Log.Write("예외: " + ex);
            if (_running) Fail(new StepFail(Math.Max(0, _current), "예상하지 못한 문제로 멈췄어요: " + ex.Message, false, 0, "창을 닫고 설치 파일을 다시 실행해 주세요."));
        }
        void Retry()
        {
            if (_running || _lastFail == null) return;
            int from = _lastFail.RetryFrom;
            Log.Write("다시 시도 — 단계 " + from + "부터");
            _endPanel.Visibility = Visibility.Collapsed;
            _endHint.Visibility = Visibility.Visible;
            _note.Visibility = Visibility.Visible;
            _title.Text = _p + " 설치하는 중";
            Tone(null, "#146AA8FF", "#216AA8FF", "T.Fg");
            ResetFrom(from);
            Run(from);
        }
        void LaunchAndClose()
        {
            string exe = System.IO.Path.Combine(_dir, SetupInfo.ExeName);
            try
            {
                var psi = new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = _dir };
                foreach (string k in psi.EnvironmentVariables.Keys.Cast<string>().ToList())
                    if (k.StartsWith("WCG_", StringComparison.OrdinalIgnoreCase) || k.StartsWith("ELECTRON_", StringComparison.OrdinalIgnoreCase)) psi.EnvironmentVariables.Remove(k);
                Native.AllowSetForegroundWindow(-1);
                using (Process p = Process.Start(psi)) { if (p != null) Log.Write("앱 실행 pid " + p.Id); }
                Win.Close();
            }
            catch (Exception ex)
            {
                Log.Write("앱 실행 실패: " + ex.Message);
                _endHint.Text = _p + Util.Eul(_p) + " 켜지 못했어요(" + ex.Message + "). 바탕화면 아이콘으로 켜 주세요.";
            }
        }

        void Tone(string title, string head, string line, string titleBrush)
        {
            if (title != null) _title.Text = title;
            _title.Foreground = R(titleBrush);
            _head.Background = Hex(head);
            _head.BorderBrush = Hex(line);
        }

        void OnClosing(object s, CancelEventArgs e)
        {
            if (_running) { e.Cancel = true; return; }   // 설치하는 동안은 닫지 않는다(Alt+F4·작업 표시줄)
            _runTimer.Stop();
            Payload.Remove(_workDir);
            Log.Write("창 닫음 — 종료 코드 " + ExitCode);
        }

        // ---------- 시험 캡처(--shots) ----------
        void ShotLater(string tag, int ms)
        {
            if (_shots == null) return;
            int n = ++_shotN;
            var t = new DispatcherTimer(DispatcherPriority.Background, Win.Dispatcher) { Interval = TimeSpan.FromMilliseconds(Math.Max(1, ms)) };
            t.Tick += delegate { t.Stop(); SaveShot(n, tag); };
            t.Start();
        }
        void SaveShot(int n, string tag)
        {
            try
            {
                Directory.CreateDirectory(_shots);
                string name = string.Format("{0:00}-{1}", n, tag);
                var src = PresentationSource.FromVisual(Win);
                double sx = src != null ? src.CompositionTarget.TransformToDevice.M11 : 1, sy = src != null ? src.CompositionTarget.TransformToDevice.M22 : 1;
                int w = (int)Math.Ceiling(Win.ActualWidth * sx), h = (int)Math.Ceiling(Win.ActualHeight * sy);
                var rtb = new RenderTargetBitmap(w, h, 96 * sx, 96 * sy, PixelFormats.Pbgra32);
                rtb.Render(Win);
                var enc = new PngBitmapEncoder();
                enc.Frames.Add(BitmapFrame.Create(rtb));
                using (var f = File.Create(System.IO.Path.Combine(_shots, name + ".png"))) enc.Save(f);
                var card = (FrameworkElement)F("Card");
                Point at = card.TranslatePoint(new Point(0, 0), Win);
                int cw = (int)Math.Ceiling(card.ActualWidth * sx), ch = (int)Math.Ceiling(card.ActualHeight * sy);
                using (var bmp = new System.Drawing.Bitmap(cw, ch))
                {
                    using (var g = System.Drawing.Graphics.FromImage(bmp))
                        g.CopyFromScreen((int)Math.Round((Win.Left + at.X) * sx), (int)Math.Round((Win.Top + at.Y) * sy), 0, 0, new System.Drawing.Size(cw, ch));
                    bmp.Save(System.IO.Path.Combine(_shots, name + "-screen.png"), System.Drawing.Imaging.ImageFormat.Png);
                }
                Log.Write("캡처 " + name);
            }
            catch (Exception ex) { Log.Write("캡처 실패 " + tag + ": " + ex.Message); }
        }
    }

    // ---------- 도우미 ----------
    static class Util
    {
        public static bool SamePath(string a, string b)
        {
            if (a == null || b == null) return false;
            try { return string.Equals(System.IO.Path.GetFullPath(a.Trim()).TrimEnd('\\'), System.IO.Path.GetFullPath(b.Trim()).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase); }
            catch (Exception) { return false; }
        }
        // 같은 세션에서 도는 날씨 CG(설치판 exe 이름) 프로세스 — NSIS 가 조용한 설치 때 이름으로 끄는 것과 같은 범위(이 사용자)
        public static List<int> AppProcesses()
        {
            var ids = new List<int>();
            int session = Process.GetCurrentProcess().SessionId;
            Process[] ps;
            try { ps = Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(SetupInfo.ExeName)); } catch (Exception) { return ids; }
            foreach (Process p in ps)
            {
                try { if (p.SessionId == session) ids.Add(p.Id); } catch (Exception) { }
                finally { p.Dispose(); }
            }
            return ids;
        }
        // 관리자 확인 창(UAC — consent.exe)이 떠 있나
        public static bool ConsentUp()
        {
            try
            {
                Process[] ps = Process.GetProcessesByName("consent");
                foreach (Process p in ps) p.Dispose();
                return ps.Length > 0;
            }
            catch (Exception) { return false; }
        }
        public static Dictionary<string, long> Snapshot(string dir)
        {
            var d = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (!Directory.Exists(dir)) return d;
                foreach (string f in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                {
                    try { var fi = new FileInfo(f); d[f.Substring(dir.Length)] = fi.Length ^ fi.LastWriteTimeUtc.Ticks; } catch (Exception) { }
                }
            }
            catch (Exception) { }
            return d;
        }
        // 설치가 얼마나 지나갔나(0~1) — 덮어 설치면 옛 판 파일이 사라진 것(35%)·새로 놓인 것(65%), 처음 설치면 놓인 파일 / 앱 파일 수(빌드가 셈)
        public static double Activity(string dir, Dictionary<string, long> snap, HashSet<string> gone, HashSet<string> fresh)
        {
            Dictionary<string, long> now = Snapshot(dir);
            foreach (string k in snap.Keys) if (!now.ContainsKey(k)) gone.Add(k);
            foreach (KeyValuePair<string, long> kv in now)
            {
                long old;
                if (!snap.TryGetValue(kv.Key, out old) || old != kv.Value || gone.Contains(kv.Key)) fresh.Add(kv.Key);
            }
            if (snap.Count == 0) return Math.Min(1, (double)fresh.Count / Math.Max(20, SetupInfo.AppFiles));
            int n0 = Math.Max(20, snap.Count);
            return Math.Min(1, (0.35 * Math.Min(gone.Count, n0) + 0.65 * Math.Min(fresh.Count, n0)) / n0);
        }
        // exe 파일 판(x.y.z — 제품 판 또는 파일 판의 앞 셋), 못 읽으면 null
        public static string ExeVersion(string file, int tries)
        {
            for (int i = 0; i < tries; i++)
            {
                try
                {
                    if (File.Exists(file))
                    {
                        var vi = FileVersionInfo.GetVersionInfo(file);
                        foreach (string s in new[] { vi.ProductVersion, vi.FileVersion })
                        {
                            Match m = Regex.Match(s ?? "", @"^\s*(\d{1,5})\.(\d{1,5})\.(\d{1,5})");
                            if (m.Success) return int.Parse(m.Groups[1].Value) + "." + int.Parse(m.Groups[2].Value) + "." + int.Parse(m.Groups[3].Value);
                        }
                    }
                }
                catch (Exception) { }
                if (i + 1 < tries) Thread.Sleep(400);
            }
            return null;
        }
        public static int CompareVer(string a, string b)
        {
            try { return new Version(a).CompareTo(new Version(b)); } catch (Exception) { return -1; }
        }
        // 가장 가까운 있는 폴더(폴더 고르기 시작 자리)
        public static string NearestExisting(string dir)
        {
            try
            {
                string d = System.IO.Path.GetFullPath((dir ?? "").Trim().Trim('"'));
                while (d != null && !Directory.Exists(d)) d = System.IO.Path.GetDirectoryName(d);
                return d;
            }
            catch (Exception) { return null; }
        }
        // 그 자리(또는 가장 가까운 있는 위 폴더)에 이 사용자가 파일을 만들 수 있나
        public static bool CanWrite(string dir)
        {
            string d = NearestExisting(dir);
            if (d == null) return false;
            string f = System.IO.Path.Combine(d, ".wcg-write-test-" + Process.GetCurrentProcess().Id);
            try
            {
                using (new FileStream(f, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose)) { }
                return true;
            }
            catch (Exception) { return false; }
        }
        // 받침 — 한글 끝 글자, 숫자(영·일·삼·육·칠·팔), 영어 글자(L·M·N·R)
        public static bool Batchim(string w)
        {
            w = (w ?? "").TrimEnd();
            if (w.Length == 0) return false;
            char c = w[w.Length - 1];
            if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 != 0;
            if (c >= '0' && c <= '9') return "013678".IndexOf(c) >= 0;
            return "LMNRlmnr".IndexOf(c) >= 0;
        }
        public static string Ga(string w) { return Batchim(w) ? "이" : "가"; }
        public static string Eul(string w) { return Batchim(w) ? "을" : "를"; }
        // '(으)로' — 받침이 없거나 ㄹ 받침이면 '로'
        public static string Euro(string w)
        {
            w = (w ?? "").TrimEnd();
            if (w.Length == 0) return "로";
            char c = w[w.Length - 1];
            if (c >= 0xAC00 && c <= 0xD7A3) { int j = (c - 0xAC00) % 28; return j == 0 || j == 8 ? "로" : "으로"; }
            if (c >= '0' && c <= '9') return "036".IndexOf(c) >= 0 ? "으로" : "로";
            return "MNmn".IndexOf(c) >= 0 ? "으로" : "로";
        }
    }
}

// 날씨 CG 업데이트 진행 창(WeatherCG-Update.exe) — 앱이 꺼진 뒤에도 '지금 무엇을 하는지' 보여 주는 작은 창(2026-10-13 사용자 요청:
// '업데이트 중간에 아무것도 안 떠서 갑자기 꺼진 느낌' → 영상 플레이어(NewsPlayer) 설치 프로그램의 업데이트 창을 그대로 옮김).
// MODULES.md 10장 '앱 업데이트 — 진행 창'. 빌드는 tools/build-update-ui.cjs(.NET Framework 4 csc — C# 5 문법만), 설치판 안 자리는 desktop\helper\WeatherCG-Update.exe(asar 밖).
//
// 흐름(desktop/updater.js 가 설치 파일을 %TEMP%\wcg-update 로 받아 sha256 을 확인한 뒤, 이 exe 를 같은 임시 폴더로 복사해 띄운다 —
// 설치 폴더 안 파일을 잡고 있으면 설치 프로그램이 그 폴더를 바꾸지 못한다):
//  0) 날씨 CG 닫기   — 앱(--pid)이 끝나고, 같은 exe(--app) 로 도는 프로세스가 하나도 없을 때까지(최대 60초 — 안 닫히면 멈춤, 앱은 그대로)
//  1) 새 버전 확인   — 설치 파일(--setup)의 크기·sha256 을 다시 본다. 확인한 뒤 설치가 끝날 때까지 그 파일을 쓰기·지우기 못 하게 열어 둔다
//  2) 새 버전 설치   — 설치 파일을 /S --updated 로 실행해 끝날 때까지(조용한 설치는 진행률을 안 주니 지난 시간·설치 폴더 파일 변화로 막대를 채우되
//                      끝나기 전엔 100% 를 안 보인다). 종료 코드가 0 이 아니거나, 끝났는데 exe 판이 --to 가 아니면 문제
//                      ('모든 사용자' 설치면 관리자 확인 창 안내 — 거기서 [아니요]면 판이 그대로라 여기서 알아챈다)
//  3) 마무리 · 새 버전 실행 — 설치된 앱을 이 창이 직접 켜고(--force-run 은 안 씀 — 두 번 켜지지 않게) 그 창이 실제로 보일 때까지
//  → 머리가 초록 '업데이트가 끝났어요', 잠깐 뒤 창이 닫힌다. 문제면 빨강 + 까닭 + [다시 시도]/[예전 판 그대로 켜기]/[닫기].
//  도는 중에는 창을 닫을 수 없다(Alt+F4·작업 표시줄 — 설치 도중 끊기지 않게).
// 인자: --pid= --app=<앱 exe> --product=<제품 이름> --from= --to= [--rollback] --setup=<설치 파일> --sha256= --size= [--ready=<파일>] [--log=<파일>]
//       [--fonts-dir=<글꼴 풀 곳>] [--shots=<캡처 폴더 — 시험>] [--per-machine — 시험: 관리자 안내 보이기] [--close-timeout= --install-timeout= --launch-timeout=(초)] [--done-hold=(ms)]
//       --check=<결과 json> = 창 없이 스스로 점검(XAML·글꼴)만 하고 끝(설치판 점검기 tools/check-installed.cjs·빌드가 부른다).
// 종료 코드: 0 = 업데이트 끝, 1 = 문제로 멈춘 뒤 닫음, 2 = 인자가 틀림(앱이 아닌 곳에서 실행).
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
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;

[assembly: AssemblyTitle("날씨 CG 업데이트")]
[assembly: AssemblyDescription("날씨 CG 업데이트 진행 창")]
[assembly: AssemblyCompany("SBS")]
[assembly: AssemblyProduct("날씨 CG")]
[assembly: AssemblyCopyright("SBS")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace WeatherCGUpdate
{
    // ---------- 인자 ----------
    sealed class Opts
    {
        public int Pid;
        public string App, Product, From, To, Setup, Sha256, Ready, Log, Shots, FontsDir, Check;
        public long Size;
        public bool Rollback, ForcePerMachine;
        public int CloseTimeoutSec = 60, InstallTimeoutSec = 600, LaunchTimeoutSec = 60, DoneHoldMs = 1800;

        public static Opts Parse(string[] args)
        {
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string a in args)
            {
                if (a == null || !a.StartsWith("--")) continue;
                int i = a.IndexOf('=');
                if (i < 0) d[a.Substring(2)] = "1"; else d[a.Substring(2, i - 2)] = a.Substring(i + 1);
            }
            var o = new Opts();
            string v;
            if (d.TryGetValue("pid", out v)) int.TryParse(v, out o.Pid);
            o.App = Full(Get(d, "app"));
            o.Product = Get(d, "product") ?? "날씨 CG";
            o.From = Ver(Get(d, "from"));
            o.To = Ver(Get(d, "to"));
            o.Setup = Full(Get(d, "setup"));
            o.Sha256 = (Get(d, "sha256") ?? "").Trim().ToLowerInvariant();
            if (d.TryGetValue("size", out v)) long.TryParse(v, out o.Size);
            o.Ready = Full(Get(d, "ready"));
            o.Log = Full(Get(d, "log"));
            o.Shots = Full(Get(d, "shots"));
            o.FontsDir = Full(Get(d, "fonts-dir"));
            o.Check = Full(Get(d, "check"));
            o.Rollback = d.ContainsKey("rollback");
            o.ForcePerMachine = d.ContainsKey("per-machine");
            o.CloseTimeoutSec = Num(d, "close-timeout", o.CloseTimeoutSec, 1, 3600);
            o.InstallTimeoutSec = Num(d, "install-timeout", o.InstallTimeoutSec, 1, 7200);
            o.LaunchTimeoutSec = Num(d, "launch-timeout", o.LaunchTimeoutSec, 1, 3600);
            o.DoneHoldMs = Num(d, "done-hold", o.DoneHoldMs, 0, 60000);
            return o;
        }
        static string Get(Dictionary<string, string> d, string k) { string v; return d.TryGetValue(k, out v) && v.Trim().Length > 0 ? v.Trim().Trim('"') : null; }
        static int Num(Dictionary<string, string> d, string k, int def, int min, int max) { string v; int n; return d.TryGetValue(k, out v) && int.TryParse(v, out n) && n >= min && n <= max ? n : def; }
        static string Full(string p) { if (p == null) return null; try { return System.IO.Path.GetFullPath(p); } catch (Exception) { return null; } }
        static string Ver(string v) { return v != null && Regex.IsMatch(v, @"^\d{1,5}\.\d{1,5}\.\d{1,5}$") ? v : null; }

        // 업데이트에 꼭 있어야 하는 것 — 앱 exe 경로·설치 파일·sha256(64자)
        public bool Valid { get { return App != null && Setup != null && Regex.IsMatch(Sha256 ?? "", "^[0-9a-f]{64}$"); } }
        public string InstallDir { get { return System.IO.Path.GetDirectoryName(App); } }
    }

    // ---------- 윈도 함수 ----------
    static class Native
    {
        public const uint SYNCHRONIZE = 0x00100000, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000, WAIT_OBJECT_0 = 0;
        [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern uint WaitForSingleObject(IntPtr h, uint ms);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);
        [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);

        public static string ImagePath(IntPtr h)
        {
            var sb = new StringBuilder(1024);
            int n = sb.Capacity;
            return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString(0, n) : null;
        }
        public static string ImagePathOf(int pid)
        {
            IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return null;
            try { return ImagePath(h); } finally { CloseHandle(h); }
        }
    }

    // ---------- 단계 실패 ----------
    sealed class StepFail : Exception
    {
        public readonly int Step, RetryFrom;
        public readonly bool Retry;
        public readonly string Hint, RetryLabel;
        public StepFail(int step, string msg, bool retry, int retryFrom, string hint, string retryLabel) : base(msg)
        { Step = step; Retry = retry; RetryFrom = retryFrom; Hint = hint; RetryLabel = retryLabel; }
    }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            Opts o = Opts.Parse(args);
            if (o.Check != null) return SelfCheck(o);
            if (!o.Valid)
            {
                MessageBox.Show("이 프로그램은 날씨 CG 앱이 업데이트할 때 띄우는 진행 창이에요.\n앱의 설정(렌치) 메뉴 '앱 업데이트'에서 업데이트해 주세요.", "날씨 CG 업데이트",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return 2;
            }
            var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
            UpdateUi ui = null;
            app.DispatcherUnhandledException += (s, e) => { e.Handled = true; if (ui != null) ui.Crashed(e.Exception); };
            ui = new UpdateUi(o);
            app.Run(ui.Win);
            return ui.ExitCode;
        }

        // 창 없이 점검 — XAML 을 읽고 글꼴을 풀어 'Wanted Sans NP' 로 열리는지. 결과 JSON 을 --check 파일에
        static int SelfCheck(Opts o)
        {
            bool xaml = false; int fonts = 0; string family = "", err = "";
            try
            {
                var w = UpdateUi.LoadWindow();
                xaml = w != null && w.FindName("Steps") is StackPanel && w.FindName("Bar") is Border && w.FindName("RetryBtn") is Button;
                string dir = o.FontsDir ?? System.IO.Path.Combine(System.IO.Path.GetDirectoryName(o.Check), "wcg-update-check-fonts");
                foreach (string f in UpdateUi.ExtractFonts(dir))
                {
                    var g = new GlyphTypeface(new Uri(f));
                    if (g.FamilyNames.Values.Contains(UpdateUi.FontName)) { fonts++; family = UpdateUi.FontName; }
                }
                if (o.FontsDir == null) { try { Directory.Delete(dir, true); } catch (Exception) { } }
            }
            catch (Exception ex) { err = ex.Message; }
            bool ok = xaml && fonts == 3;
            string ver = FileVersionInfo.GetVersionInfo(Assembly.GetExecutingAssembly().Location).FileVersion;
            string json = "{\"ok\":" + (ok ? "true" : "false") + ",\"xaml\":" + (xaml ? "true" : "false") + ",\"fonts\":" + fonts
                + ",\"family\":\"" + family + "\",\"version\":\"" + ver + "\",\"clr\":\"" + Environment.Version + "\",\"error\":\"" + err.Replace("\\", "\\\\").Replace("\"", "'") + "\"}";
            try { File.WriteAllText(o.Check, json, new UTF8Encoding(false)); } catch (Exception) { return 3; }
            return ok ? 0 : 1;
        }
    }

    // ---------- 창 ----------
    sealed class UpdateUi
    {
        public const string FontName = "Wanted Sans NP";
        const int StepCount = 4;
        // 막대에서 단계마다 차지하는 몫(시작 지점) — 0 닫기 · 1 확인 · 2 설치(가장 김) · 3 새 버전 실행 · 끝 = 1
        static readonly double[] StepAt = { 0.0, 0.05, 0.15, 0.92, 1.0 };

        public readonly Window Win;
        public int ExitCode = 1;
        readonly Opts _o;
        readonly string _p;   // 제품 이름
        readonly bool _perMachine;
        readonly StackPanel _stepsPanel;
        readonly Border _head, _bar, _track;
        readonly TextBlock _title, _version, _percent, _status, _note, _errText, _errHint;
        readonly StackPanel _errPanel;
        readonly Button _closeX, _closeBtn, _retryBtn, _oldBtn;
        readonly List<StepRow> _steps = new List<StepRow>();
        TextBlock _adminHint;
        int _current = -1;
        double _target, _shown;
        bool _running = true, _appClosed;
        IntPtr _appHandle = IntPtr.Zero;
        FileStream _setupLock;
        StepFail _lastFail;
        int _shotN;
        readonly Stopwatch _clock = Stopwatch.StartNew();

        sealed class StepRow { public Border Dot; public TextBlock Num; public System.Windows.Shapes.Path Check, Cross; public Ellipse Ring; public TextBlock Label; }

        Brush R(string key) { return (Brush)Win.FindResource(key); }

        public UpdateUi(Opts o)
        {
            _o = o;
            _p = o.Product;
            _perMachine = o.ForcePerMachine || UnderProgramFiles(o.InstallDir);
            Win = LoadWindow();
            _stepsPanel = (StackPanel)Win.FindName("Steps");
            _head = (Border)Win.FindName("Head");
            _bar = (Border)Win.FindName("Bar");
            _track = (Border)Win.FindName("Track");
            _title = (TextBlock)Win.FindName("TitleText");
            _version = (TextBlock)Win.FindName("VersionText");
            _percent = (TextBlock)Win.FindName("Percent");
            _status = (TextBlock)Win.FindName("Status");
            _note = (TextBlock)Win.FindName("Note");
            _errPanel = (StackPanel)Win.FindName("ErrorPanel");
            _errText = (TextBlock)Win.FindName("ErrorText");
            _errHint = (TextBlock)Win.FindName("ErrorHint");
            _closeX = (Button)Win.FindName("CloseX");
            _closeBtn = (Button)Win.FindName("CloseBtn");
            _retryBtn = (Button)Win.FindName("RetryBtn");
            _oldBtn = (Button)Win.FindName("OldBtn");
            Win.Title = _p + " 업데이트";

            try { Win.FontFamily = LoadFont(o.FontsDir ?? System.IO.Path.Combine(System.IO.Path.GetTempPath(), "wcg-update", "ui-fonts")); }
            catch (Exception ex) { Log("글꼴 못 읽음 — 맑은 고딕: " + ex.Message); Win.FontFamily = new FontFamily("Malgun Gothic"); }

            _title.Text = o.Rollback ? "이전 버전으로 되돌리는 중" : "업데이트 설치 중";
            string from = o.From ?? "", to = o.To ?? "";
            _version.Text = _p + " " + (from.Length > 0 && to.Length > 0 && from != to ? from + " → " + to : to) + (o.Rollback ? " 되돌리기" : "");
            _note.Text = "작업·배치·설정은 그대로예요. 끝나면 " + (o.Rollback ? "이전" : "새") + " 버전이 켜지고 이 창은 저절로 닫혀요.";
            string what = o.Rollback ? "이전 버전" : "새 버전";
            AddStep(_p + " 닫기");
            AddStep(what + " 확인");
            AddStep(what + " 설치");
            AddStep("마무리 · " + what + " 실행");
            // 관리자 확인 안내(설치 단계 밑 — '모든 사용자' 설치일 때 그 단계에서만)
            _adminHint = new TextBlock { Text = "관리자 확인 창이 뜨면 [예]를 눌러 주세요.", FontSize = 12.5, Foreground = R("T.AccentText"),
                                         Margin = new Thickness(36, -6, 0, 12), Visibility = Visibility.Collapsed, TextWrapping = TextWrapping.Wrap };
            _stepsPanel.Children.Insert(_stepsPanel.Children.IndexOf(_steps[2].Label.Parent as UIElement) + 1, _adminHint);

            _track.SizeChanged += delegate { DrawBar(); };
            var tick = new DispatcherTimer(DispatcherPriority.Render, Win.Dispatcher) { Interval = TimeSpan.FromMilliseconds(33) };
            tick.Tick += delegate { Ease(); };
            tick.Start();

            Win.MouseLeftButtonDown += (s, e) => { if (e.ButtonState == MouseButtonState.Pressed) { try { Win.DragMove(); } catch (InvalidOperationException) { } } };
            Win.Closing += OnClosing;
            _closeX.Click += delegate { Win.Close(); };
            _closeBtn.Click += delegate { Win.Close(); };
            _retryBtn.Click += delegate { Retry(); };
            _oldBtn.Click += delegate { LaunchOld(); };
            // 앱 프로세스는 처음에 잡아 둔다(꺼진 뒤 같은 번호를 다른 프로그램이 받아도 헷갈리지 않게) — 그 번호가 이 앱 exe 가 아니면 이미 꺼진 것으로 본다
            if (o.Pid > 0)
            {
                IntPtr h = Native.OpenProcess(Native.SYNCHRONIZE | Native.PROCESS_QUERY_LIMITED_INFORMATION, false, o.Pid);
                if (h != IntPtr.Zero)
                {
                    string img = Native.ImagePath(h);
                    if (img != null && SamePath(img, o.App)) _appHandle = h; else Native.CloseHandle(h);
                }
            }
            Win.ContentRendered += OnShown;
            Log(string.Format("시작 — {0} {1} → {2}{3}, 앱 pid {4}{5}, 설치 폴더 {6}{7}", _p, from, to, o.Rollback ? " (되돌리기)" : "", o.Pid,
                _appHandle != IntPtr.Zero ? "" : "(이미 꺼짐)", o.InstallDir, _perMachine ? " — 모든 사용자 설치(관리자 확인)" : ""));
        }

        // ---------- XAML · 글꼴 ----------
        public static Window LoadWindow()
        {
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("WeatherCGUpdate.UpdateWindow.xaml"))
                return (Window)XamlReader.Load(s);
        }
        // exe 에 담은 글꼴(fonts\*.ttf)을 dir 에 푼다(같은 크기면 그대로) → 푼 파일 경로들
        public static List<string> ExtractFonts(string dir)
        {
            Directory.CreateDirectory(dir);
            var asm = Assembly.GetExecutingAssembly();
            var outList = new List<string>();
            foreach (string name in asm.GetManifestResourceNames())
            {
                const string pre = "WeatherCGUpdate.fonts.";
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

        // ---------- 단계 그리기 ----------
        void AddStep(string name)
        {
            var row = new DockPanel { Margin = new Thickness(0, 0, 0, 12) };
            var dot = new Border { Width = 24, Height = 24, CornerRadius = new CornerRadius(12), Background = R("T.SurfaceHi") };
            var num = new TextBlock { Text = (_steps.Count + 1).ToString(), FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = R("T.Muted"),
                                      HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            // 끝난 단계 = 흰 체크, 문제 = 흰 X (글꼴 기호 대신 선 — 어느 윈도에서나 같게)
            var check = new System.Windows.Shapes.Path { Data = Geometry.Parse("M7,12.4 L10.6,16 L17.2,8.6"), Stroke = Brushes.White, StrokeThickness = 2.4,
                                   StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, StrokeLineJoin = PenLineJoin.Round,
                                   Width = 24, Height = 24, Visibility = Visibility.Collapsed };
            var cross = new System.Windows.Shapes.Path { Data = Geometry.Parse("M8.2,8.2 L15.8,15.8 M15.8,8.2 L8.2,15.8"), Stroke = Brushes.White, StrokeThickness = 2.4,
                                   StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, Width = 24, Height = 24, Visibility = Visibility.Collapsed };
            // 지금 단계의 도는 고리
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
        // i 앞 단계는 끝, i 는 지금(앞으로만 간다)
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
            Log("단계 " + i + " 시작 — " + s.Label.Text);
            ShotLater("step" + i, 600);
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
        // 다시 시도 — k 부터 아직 안 한 모양으로
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
        // 단계 안 몫 f(0~1) → 막대 목표. 끝(1.0)은 Finish 만 준다 — 그 전엔 99% 를 넘지 않는다
        void Target(int step, double f)
        {
            f = Math.Max(0, Math.Min(1, f));
            double t = StepAt[step] + (StepAt[step + 1] - StepAt[step]) * f;
            if (step < StepCount) t = Math.Min(t, 0.99);
            if (t > _target) _target = t;   // 앞으로만
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
        void OnShown(object sender, EventArgs e)
        {
            Win.ContentRendered -= OnShown;
            // 앱에게 '창이 떴다'고 알린다(앱은 이걸 본 뒤에 꺼진다 — desktop/updater.js startUi)
            if (_o.Ready != null)
            {
                try
                {
                    string tmp = _o.Ready + ".tmp";
                    File.WriteAllText(tmp, Process.GetCurrentProcess().Id.ToString(), new UTF8Encoding(false));
                    if (File.Exists(_o.Ready)) File.Delete(_o.Ready);
                    File.Move(tmp, _o.Ready);
                    Log("창이 뜸 — 앱에 알림");
                }
                catch (Exception ex) { Log("알림 파일 못 씀: " + ex.Message); }
            }
            Run(0);
        }

        async void Run(int start)
        {
            _running = true;
            _lastFail = null;
            try
            {
                if (start <= 0) await StepClose();
                if (start <= 1) await StepVerify();
                if (start <= 2) await StepInstall();
                await StepLaunch();
                Finish();
            }
            catch (StepFail f) { Fail(f); }
            catch (Exception ex)
            {
                int at = Math.Max(0, Math.Min(_current, StepCount - 1));
                Fail(new StepFail(at, "예상하지 못한 문제로 멈췄어요: " + ex.Message, true, at == 2 ? 1 : at, null, null));   // 설치는 확인부터 다시
            }
        }

        // 0) 앱 닫기 — 그 pid 가 끝나고 같은 exe 프로세스가 다 사라질 때까지
        async Task StepClose()
        {
            Step(0);
            Status(_p + Ga(_p) + " 닫히길 기다리는 중…");
            var sw = Stopwatch.StartNew();
            Task<bool> wait = Task.Run(() => WaitAppClosed(_o.CloseTimeoutSec * 1000));
            while (!wait.IsCompleted) { Target(0, 1 - Math.Exp(-sw.Elapsed.TotalSeconds / 1.2)); await Task.WhenAny(wait, Task.Delay(120)); }
            if (!wait.Result)
                throw new StepFail(0, _p + Ga(_p) + " 닫히지 않아 업데이트를 멈췄어요. 앱은 지금 판 그대로예요.", true, 0,
                    _p + "의 창을 모두 닫은 뒤 [다시 시도]를 눌러 주세요.", null);
            _appClosed = true;
            Log(string.Format("앱 닫힘 — {0}ms", sw.ElapsedMilliseconds));
            Target(0, 1);
            Status(_p + Eul(_p) + " 닫았어요.");
        }
        bool WaitAppClosed(int ms)
        {
            var sw = Stopwatch.StartNew();
            if (_appHandle != IntPtr.Zero)
            {
                uint r = Native.WaitForSingleObject(_appHandle, (uint)ms);
                if (r == Native.WAIT_OBJECT_0) { Native.CloseHandle(_appHandle); _appHandle = IntPtr.Zero; }
            }
            while (AppProcesses().Count > 0)
            {
                if (sw.ElapsedMilliseconds > ms) return false;
                Thread.Sleep(250);
            }
            return _appHandle == IntPtr.Zero;
        }
        // 같은 exe(--app 경로)로 도는 프로세스 번호들 — 이름이 같아도 다른 폴더(사용자의 다른 설치)는 안 센다
        List<int> AppProcesses()
        {
            var ids = new List<int>();
            Process[] ps;
            try { ps = Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(_o.App)); } catch (Exception) { return ids; }
            foreach (Process p in ps)
            {
                try { string img = Native.ImagePathOf(p.Id); if (img != null && SamePath(img, _o.App)) ids.Add(p.Id); }
                catch (Exception) { }
                finally { p.Dispose(); }
            }
            return ids;
        }

        // 1) 설치 파일 확인 — 크기·sha256. 맞으면 설치가 끝날 때까지 쓰기·지우기를 막고 열어 둔다
        async Task StepVerify()
        {
            Step(1);
            Status("설치 파일을 확인하는 중…");
            ReleaseSetup();
            FileStream fs;
            try { fs = new FileStream(_o.Setup, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20, FileOptions.SequentialScan); }
            catch (FileNotFoundException) { throw new StepFail(1, "설치 파일을 찾지 못했어요 — 임시 폴더에서 지워졌을 수 있어요.", false, 1, "앱을 다시 켜고 설정(렌치) 메뉴 '앱 업데이트'에서 다시 해 주세요.", null); }
            catch (Exception ex) { throw new StepFail(1, "설치 파일을 열지 못했어요: " + ex.Message, true, 1, null, null); }
            long len = fs.Length;
            if (_o.Size > 0 && len != _o.Size) { fs.Dispose(); throw ShaFail(); }
            string got;
            try
            {
                got = await Task.Run(() =>
                {
                    using (var sha = SHA256.Create())
                    {
                        var buf = new byte[1 << 20];
                        long done = 0; int n; long lastTick = 0;
                        var sw = Stopwatch.StartNew();
                        while ((n = fs.Read(buf, 0, buf.Length)) > 0)
                        {
                            sha.TransformBlock(buf, 0, n, null, 0);
                            done += n;
                            if (sw.ElapsedMilliseconds - lastTick > 80)
                            {
                                lastTick = sw.ElapsedMilliseconds;
                                long d = done;
                                Win.Dispatcher.BeginInvoke(new Action(() => { Target(1, (double)d / Math.Max(1, len)); Status("설치 파일을 확인하는 중… " + (int)(100.0 * d / Math.Max(1, len)) + "%"); }));
                            }
                        }
                        sha.TransformFinalBlock(buf, 0, 0);
                        return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                    }
                });
            }
            catch (Exception ex) { fs.Dispose(); throw new StepFail(1, "설치 파일을 읽지 못했어요: " + ex.Message, true, 1, null, null); }
            if (got != _o.Sha256) { fs.Dispose(); throw ShaFail(); }
            _setupLock = fs;
            Log("설치 파일 확인 — 크기·sha256 맞음");
            Target(1, 1);
            Status("설치 파일이 받은 것과 같아요.");
        }
        StepFail ShaFail()
        {
            Log("설치 파일 확인값이 다름");
            return new StepFail(1, "설치 파일이 받은 것과 달라요(크기·확인값 불일치) — 설치하지 않았어요.", false, 1, "앱을 다시 켜고 업데이트를 다시 해 주세요. 또 그러면 담당자에게 알려 주세요.", null);
        }
        void ReleaseSetup() { if (_setupLock != null) { try { _setupLock.Dispose(); } catch (Exception) { } _setupLock = null; } }

        // 2) 설치 — /S --updated(조용히·앱 데이터와 바로 가기 지킴). 끝날 때까지 지난 시간·설치 폴더 변화로 막대
        async Task StepInstall()
        {
            Step(2);
            string what = _o.Rollback ? "이전 버전" : "새 버전";
            Status(what + Eul(what) + " 설치하는 중…");
            Dictionary<string, long> snap = await Task.Run(() => Snapshot(_o.InstallDir));
            int n0 = Math.Max(20, snap.Count);
            var gone = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var fresh = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Process p;
            var psi = new ProcessStartInfo(_o.Setup, "/S --updated") { UseShellExecute = false, WorkingDirectory = System.IO.Path.GetDirectoryName(_o.Setup) };
            try
            {
                try { p = Process.Start(psi); }
                catch (Win32Exception ex)
                {
                    if (ex.NativeErrorCode != 740) throw;   // 관리자 권한이 필요한 exe — 셸로(관리자 확인 창)
                    psi.UseShellExecute = true;
                    p = Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                ReleaseSetup();
                throw new StepFail(2, "설치 프로그램을 실행하지 못했어요 — 보안 프로그램이 막았을 수 있어요. (" + ex.Message + ")", true, 1, OldHint(), null);
            }
            if (p == null) { ReleaseSetup(); throw new StepFail(2, "설치 프로그램을 실행하지 못했어요.", true, 1, OldHint(), null); }
            Log(string.Format("설치 프로그램 실행(/S --updated) pid {0} — 파일 {1}개 보는 중", p.Id, snap.Count));
            // 예상 시간: 설치 파일 크기로(약 12MB/초, 8~60초) — 시간만으로는 88% 까지만 채운다(거짓 100% 금지)
            double expect = Math.Max(8, Math.Min(60, (_o.Size > 0 ? _o.Size : 180L << 20) / (12.0 * 1048576)));
            var sw = Stopwatch.StartNew();
            double frac = 0;
            bool midShot = false;
            while (!p.HasExited)
            {
                await Task.Delay(300);
                double act = await Task.Run(() => Activity(_o.InstallDir, snap, gone, fresh, n0));
                double t = sw.Elapsed.TotalSeconds;
                frac = Math.Max(frac, Math.Min(0.96, Math.Max((1 - Math.Exp(-t / (expect / 2.2))) * 0.88, act * 0.96)));
                Target(2, frac);
                Status(string.Format("{0}{1} 설치하는 중… ({2}초)", what, Eul(what), (int)t));
                if (!midShot && t > 3) { midShot = true; ShotLater("install-progress", 0); }
                if (t > _o.InstallTimeoutSec)
                {
                    ReleaseSetup();
                    Log("설치 시간 초과 — " + (int)t + "초");
                    throw new StepFail(2, string.Format("설치가 {0} 넘게 끝나지 않아요 — 설치 프로그램이 아직 돌고 있을 수 있어요.", Dur(_o.InstallTimeoutSec)), false, 1,
                        "잠시 뒤 바탕화면의 " + _p + " 아이콘으로 켜 보세요. 안 켜지면 담당자에게 알려 주세요.", null);
                }
            }
            int code = -1;
            try { code = p.ExitCode; } catch (Exception) { }
            ReleaseSetup();
            Log(string.Format("설치 프로그램 끝 — 종료 코드 {0}, {1}ms, 바뀐 파일 {2}·지워졌던 파일 {3} / {4}", code, sw.ElapsedMilliseconds, fresh.Count, gone.Count, snap.Count));
            if (code != 0)
                throw new StepFail(2, "설치 프로그램이 오류로 끝났어요(종료 코드 " + code + ").", true, 1, OldHint(), null);
            // '모든 사용자' 설치는 관리자 권한으로 다시 뜬 같은 설치 파일(안쪽)이 실제로 깐다 — 그것도 끝날 때까지(최대 10분)
            var swIn = Stopwatch.StartNew();
            while (await Task.Run(() => SetupRunning()))
            {
                if (swIn.Elapsed.TotalSeconds > _o.InstallTimeoutSec) break;
                Target(2, frac = Math.Max(frac, Math.Min(0.96, frac + 0.002)));
                Status(string.Format("{0}{1} 설치하는 중… ({2}초)", what, Eul(what), (int)sw.Elapsed.TotalSeconds));
                await Task.Delay(400);
            }
            // 깔린 판 — 설치 프로그램이 막 놓은 파일은 잠깐 못 읽을 때가 있어 몇 번
            string v = await Task.Run(() => ExeVersion(_o.App, 8));
            if (v == null)
                throw new StepFail(2, what + " 파일을 찾지 못했어요(" + System.IO.Path.GetFileName(_o.App) + ").", true, 1, "바탕화면의 " + _p + " 아이콘으로 켜 보세요.", null);
            if (_o.To != null && v != _o.To)
            {
                Log("깔린 판 " + v + " ≠ " + _o.To);
                throw new StepFail(2, string.Format("설치가 끝났는데 {0} 버전이 깔리지 않았어요(지금 {1}).", _o.To, v), true, 1,
                    (_perMachine ? "관리자 확인 창에서 [아니요]를 누르셨다면 [다시 시도]를 누르고 [예]를 눌러 주세요. " : "") + OldHint(), null);
            }
            Target(2, 1);
            Status(what + Ga(what) + " 깔렸어요.");
        }
        // 같은 설치 파일(--setup 경로)로 도는 프로세스가 있나 — 관리자 권한으로 다시 뜬 안쪽 설치(제한된 조회 권한으로도 경로는 읽힌다)
        bool SetupRunning()
        {
            Process[] ps;
            try { ps = Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(_o.Setup)); } catch (Exception) { return false; }
            bool any = false;
            foreach (Process p in ps)
            {
                try { string img = Native.ImagePathOf(p.Id); if (img != null && SamePath(img, _o.Setup)) any = true; }
                catch (Exception) { }
                finally { p.Dispose(); }
            }
            return any;
        }
        // 설치 폴더 파일 목록(상대 경로 → 크기·고친 시각 묶음)
        static Dictionary<string, long> Snapshot(string dir)
        {
            var d = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (string f in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                {
                    try { var fi = new FileInfo(f); d[f.Substring(dir.Length)] = fi.Length ^ fi.LastWriteTimeUtc.Ticks; } catch (Exception) { }
                }
            }
            catch (Exception) { }
            return d;
        }
        // 설치가 얼마나 지나갔나(0~1) — 처음 목록에서 한 번이라도 사라진 파일(옛 판 지우기)·새로 생기거나 바뀐 파일(새 판 놓기)
        static double Activity(string dir, Dictionary<string, long> snap, HashSet<string> gone, HashSet<string> fresh, int n0)
        {
            Dictionary<string, long> now = Snapshot(dir);
            foreach (string k in snap.Keys) if (!now.ContainsKey(k)) gone.Add(k);
            foreach (KeyValuePair<string, long> kv in now)
            {
                long old;
                if (!snap.TryGetValue(kv.Key, out old) || old != kv.Value || gone.Contains(kv.Key)) fresh.Add(kv.Key);
            }
            return Math.Min(1, (0.35 * Math.Min(gone.Count, n0) + 0.65 * Math.Min(fresh.Count, n0)) / n0);
        }

        // 3) 새 버전 실행 — 이 창이 켜고(한 번만) 그 창이 보일 때까지
        async Task StepLaunch()
        {
            Step(3);
            string what = _o.Rollback ? "이전 버전" : "새 버전";
            Status(what + Eul(what) + " 켜는 중…");
            var sw = Stopwatch.StartNew();
            Process p;
            try { p = LaunchApp("--updated"); }
            catch (Exception ex)
            {
                throw new StepFail(3, what + Eul(what) + " 켜지 못했어요: " + ex.Message, true, 3, "바탕화면의 " + _p + " 아이콘으로 켜도 돼요.", "다시 켜기");
            }
            Log("새 앱 실행 pid " + p.Id);
            bool seen = await WaitVisible(p, _o.LaunchTimeoutSec * 1000, (t) => Target(3, 1 - Math.Exp(-t / 3.0)));
            if (!seen)
            {
                Log("새 앱 창이 안 보임 — " + sw.ElapsedMilliseconds + "ms");
                throw new StepFail(3, what + Eul(what) + " 켜지 못했어요 — " + Dur(_o.LaunchTimeoutSec) + " 안에 창이 뜨지 않았어요.", true, 3,
                    "바탕화면의 " + _p + " 아이콘으로 켜도 돼요. 설치는 끝났어요.", "다시 켜기");
            }
            Log("새 앱 창이 보임 — " + sw.ElapsedMilliseconds + "ms");
            string v = _o.To ?? "";
            Status(v.Length > 0 ? string.Format("{0} {1}{2} 켰어요.", what, v, Eul(v)) : what + Eul(what) + " 켰어요.");
        }
        // 설치된 앱 켜기 — 업데이트를 부른 앱의 시험용 환경 변수(점검 모드 등)는 넘기지 않는다
        Process LaunchApp(string args)
        {
            var psi = new ProcessStartInfo(_o.App, args) { UseShellExecute = false, WorkingDirectory = _o.InstallDir };
            foreach (string k in psi.Environment.Keys.ToList())
                if (k.StartsWith("WCG_", StringComparison.OrdinalIgnoreCase) || k.StartsWith("ELECTRON_", StringComparison.OrdinalIgnoreCase)) psi.Environment.Remove(k);
            Native.AllowSetForegroundWindow(-1);   // 새 앱 창이 앞으로 오게(이 창이 앞에 있을 때 넘겨줌)
            return Process.Start(psi);
        }
        // p 의 창이 보이면 true. p 가 곧바로 끝나면(이미 켜진 같은 앱이 있어 그쪽으로 넘김) 같은 exe 의 보이는 창을 찾는다
        async Task<bool> WaitVisible(Process p, int ms, Action<double> tick)
        {
            var sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < ms)
            {
                await Task.Delay(250);
                if (tick != null) tick(sw.Elapsed.TotalSeconds);
                bool vis = await Task.Run(() =>
                {
                    try { p.Refresh(); if (!p.HasExited && p.MainWindowHandle != IntPtr.Zero && Native.IsWindowVisible(p.MainWindowHandle)) return true; }
                    catch (Exception) { }
                    try
                    {
                        if (!p.HasExited) return false;
                    }
                    catch (Exception) { }
                    foreach (int id in AppProcesses())
                    {
                        try { using (var q = Process.GetProcessById(id)) if (q.MainWindowHandle != IntPtr.Zero && Native.IsWindowVisible(q.MainWindowHandle)) return true; }
                        catch (Exception) { }
                    }
                    return false;
                });
                if (vis) return true;
            }
            return false;
        }

        void Finish()
        {
            Step(StepCount);
            _target = _shown = 1;
            DrawBar();
            _note.Text = "이 창은 곧 저절로 닫혀요.";
            Tone(_o.Rollback ? "되돌리기가 끝났어요" : "업데이트가 끝났어요", "#144ADE80", "#264ADE80", "T.Fg");   // 앱의 초록 머리(--pop-hd-green)
            _running = false;
            ExitCode = 0;
            Log("끝 — 전체 " + _clock.ElapsedMilliseconds + "ms");
            ShotLater("done", 500);
            var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(_o.DoneHoldMs + (_o.Shots != null ? 700 : 0)) };
            t.Tick += delegate { t.Stop(); Win.Close(); };
            t.Start();
        }

        void Fail(StepFail f)
        {
            _lastFail = f;
            _running = false;
            ReleaseSetup();
            Failed(f.Step);
            _adminHint.Visibility = Visibility.Collapsed;
            Tone(_o.Rollback ? "되돌리지 못했어요" : "업데이트하지 못했어요", "#17FF786E", "#29FF786E", "T.Danger");   // 앱의 빨간 머리(--pop-hd-red)
            Status(_o.Rollback ? "되돌리기를 멈췄어요." : "업데이트를 멈췄어요.");
            _errText.Text = f.Message;
            _errHint.Text = f.Hint ?? "";
            _errHint.Visibility = string.IsNullOrEmpty(f.Hint) ? Visibility.Collapsed : Visibility.Visible;
            _retryBtn.Content = f.RetryLabel ?? "다시 시도";
            _retryBtn.Visibility = f.Retry ? Visibility.Visible : Visibility.Collapsed;
            _oldBtn.Visibility = OldIntact() && f.Step >= 1 && f.Step <= 2 ? Visibility.Visible : Visibility.Collapsed;
            _oldBtn.Content = "예전 판 그대로 켜기";
            _closeBtn.IsEnabled = _retryBtn.IsEnabled = _oldBtn.IsEnabled = true;
            _note.Visibility = Visibility.Collapsed;
            _errPanel.Visibility = Visibility.Visible;
            _closeX.Visibility = Visibility.Visible;
            Log(string.Format("문제 — 단계 {0}: {1}", f.Step, f.Message));
            ShotLater("fail-step" + f.Step, 500);
        }
        // 예상 못 한 예외(창 코드) — 문제 화면으로
        public void Crashed(Exception ex)
        {
            Log("예외: " + ex);
            if (_running) Fail(new StepFail(Math.Max(0, _current), "예상하지 못한 문제로 멈췄어요: " + ex.Message, false, 0, OldHint(), null));
        }
        string OldHint() { return OldIntact() ? "[예전 판 그대로 켜기]로 지금까지 쓰던 판을 켤 수 있어요." : null; }
        // 옛 판이 그대로 있나 — 앱이 닫혔고, 앱 exe 가 있고 그 판이 --from 이면
        bool OldIntact()
        {
            if (!_appClosed || _o.From == null) return false;
            return ExeVersion(_o.App, 1) == _o.From;
        }

        void Retry()
        {
            if (_running || _lastFail == null) return;
            int from = _lastFail.RetryFrom;
            Log("다시 시도 — 단계 " + from + "부터");
            _errPanel.Visibility = Visibility.Collapsed;
            _closeX.Visibility = Visibility.Collapsed;
            _note.Visibility = Visibility.Visible;
            _title.Text = _o.Rollback ? "이전 버전으로 되돌리는 중" : "업데이트 설치 중";
            Tone(null, "#146AA8FF", "#216AA8FF", "T.Fg");
            ResetFrom(from);
            Run(from);
        }
        async void LaunchOld()
        {
            if (_running) return;
            _running = true;
            _closeBtn.IsEnabled = _retryBtn.IsEnabled = _oldBtn.IsEnabled = false;
            Status("예전 판" + (_o.From != null ? "(" + _o.From + ")" : "") + "을 켜는 중…");
            Log("예전 판 켜기");
            bool ok = false;
            try { ok = await WaitVisible(LaunchApp(""), 30000, null); } catch (Exception ex) { Log("예전 판 못 켬: " + ex.Message); }
            _running = false;
            if (ok) { Win.Close(); return; }
            _errText.Text = "예전 판도 켜지 못했어요.";
            _errHint.Text = "바탕화면의 " + _p + " 아이콘으로 켜 주세요.";
            _errHint.Visibility = Visibility.Visible;
            _oldBtn.Visibility = Visibility.Collapsed;
            _closeBtn.IsEnabled = _retryBtn.IsEnabled = true;
        }

        void Tone(string title, string head, string line, string titleBrush)
        {
            if (title != null) _title.Text = title;
            _title.Foreground = R(titleBrush);
            _head.Background = (Brush)new BrushConverter().ConvertFromString(head);
            _head.BorderBrush = (Brush)new BrushConverter().ConvertFromString(line);
        }

        void OnClosing(object s, CancelEventArgs e)
        {
            if (_running) { e.Cancel = true; return; }   // Alt+F4·작업 표시줄 — 파일을 바꾸는 동안은 안 됨
            ReleaseSetup();
            if (_appHandle != IntPtr.Zero) { Native.CloseHandle(_appHandle); _appHandle = IntPtr.Zero; }
            Log("창 닫음 — 종료 코드 " + ExitCode);
        }

        // ---------- 시험 캡처(--shots) ----------
        void ShotLater(string tag, int ms)
        {
            if (_o.Shots == null) return;
            int n = ++_shotN;
            var t = new DispatcherTimer(DispatcherPriority.Background, Win.Dispatcher) { Interval = TimeSpan.FromMilliseconds(Math.Max(1, ms)) };
            t.Tick += delegate { t.Stop(); SaveShot(n, tag); };
            t.Start();
        }
        void SaveShot(int n, string tag)
        {
            try
            {
                Directory.CreateDirectory(_o.Shots);
                string name = string.Format("{0:00}-{1}", n, tag);
                var src = PresentationSource.FromVisual(Win);
                double sx = src != null ? src.CompositionTarget.TransformToDevice.M11 : 1, sy = src != null ? src.CompositionTarget.TransformToDevice.M22 : 1;
                int w = (int)Math.Ceiling(Win.ActualWidth * sx), h = (int)Math.Ceiling(Win.ActualHeight * sy);
                // 창 그림(투명 바탕 그대로)
                var rtb = new RenderTargetBitmap(w, h, 96 * sx, 96 * sy, PixelFormats.Pbgra32);
                rtb.Render(Win);
                var enc = new PngBitmapEncoder();
                enc.Frames.Add(BitmapFrame.Create(rtb));
                using (var f = File.Create(System.IO.Path.Combine(_o.Shots, name + ".png"))) enc.Save(f);
                // 실제 화면(카드 자리만 — 정말 떠 있는지. 뒤 화면은 담지 않게)
                var card = (FrameworkElement)Win.FindName("Card");
                Point at = card.TranslatePoint(new Point(0, 0), Win);
                int cw = (int)Math.Ceiling(card.ActualWidth * sx), ch = (int)Math.Ceiling(card.ActualHeight * sy);
                using (var bmp = new System.Drawing.Bitmap(cw, ch))
                {
                    using (var g = System.Drawing.Graphics.FromImage(bmp))
                        g.CopyFromScreen((int)Math.Round((Win.Left + at.X) * sx), (int)Math.Round((Win.Top + at.Y) * sy), 0, 0, new System.Drawing.Size(cw, ch));
                    bmp.Save(System.IO.Path.Combine(_o.Shots, name + "-screen.png"), System.Drawing.Imaging.ImageFormat.Png);
                }
                Log("캡처 " + name);
            }
            catch (Exception ex) { Log("캡처 실패 " + tag + ": " + ex.Message); }
        }

        // ---------- 도우미 ----------
        void Log(string m)
        {
            if (_o.Log == null) return;
            try { File.AppendAllText(_o.Log, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + m + Environment.NewLine, new UTF8Encoding(false)); } catch (Exception) { }
        }
        static bool SamePath(string a, string b)
        {
            try { return string.Equals(System.IO.Path.GetFullPath(a).TrimEnd('\\'), System.IO.Path.GetFullPath(b).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase); }
            catch (Exception) { return false; }
        }
        static bool UnderProgramFiles(string dir)
        {
            if (string.IsNullOrEmpty(dir)) return false;
            var roots = new List<string> { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                                           Environment.GetEnvironmentVariable("ProgramW6432") };
            foreach (string r in roots)
                if (!string.IsNullOrEmpty(r) && (dir.TrimEnd('\\') + "\\").StartsWith(r.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
        // exe 파일 판(x.y.z — 제품 판 또는 파일 판의 앞 셋), 못 읽으면 null
        static string ExeVersion(string file, int tries)
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
        static string Dur(int sec) { return sec >= 60 && sec % 60 == 0 ? (sec / 60) + "분" : sec + "초"; }
        // 받침이 있나 — 한글 끝 글자, 숫자(영·일·삼·육·칠·팔), 영어 글자(L·M·N·R) 소리로
        static bool Batchim(string w)
        {
            w = (w ?? "").TrimEnd();
            if (w.Length == 0) return false;
            char c = w[w.Length - 1];
            if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 != 0;
            if (c >= '0' && c <= '9') return "013678".IndexOf(c) >= 0;
            return "LMNRlmnr".IndexOf(c) >= 0;
        }
        static string Ga(string w) { return Batchim(w) ? "이" : "가"; }
        static string Eul(string w) { return Batchim(w) ? "을" : "를"; }
    }
}

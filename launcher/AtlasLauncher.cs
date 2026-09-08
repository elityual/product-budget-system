using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class AtlasLauncher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string title = "AtlasLauncher-" + Hash(root);
        bool ownsMutex;
        using (var mutex = new System.Threading.Mutex(true, title, out ownsMutex))
            {
                if (!ownsMutex)
                {
                    IntPtr existing = Native.FindWindow(null, title);
                    if (existing != IntPtr.Zero) { Native.ShowWindow(existing, 9); Native.SetForegroundWindow(existing); }
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LauncherForm(root, title));
        }
    }

    private static string Hash(string value)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").Substring(0, 16);
    }

    private sealed class LauncherForm : Form
    {
        private readonly string root, title;
        private readonly Label status;
        private readonly Button open, stop;
        private Process server;
        private int port = 8765;
        private bool closing;
        private bool stopping;
        private volatile bool ready;
        private string launcherId;
        private readonly StringBuilder errors = new StringBuilder();

        public LauncherForm(string root, string title)
        {
            this.root = root; this.title = title; Text = title; Width = 440; Height = 170;
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false; StartPosition = FormStartPosition.CenterScreen;
            status = new Label { Left = 18, Top = 18, Width = 390, Height = 42, Text = "Iniciando servidor..." };
            open = new Button { Left = 18, Top = 78, Width = 180, Height = 32, Text = "Abrir navegador", Enabled = false };
            stop = new Button { Left = 210, Top = 78, Width = 180, Height = 32, Text = "Parar servidor", Enabled = false };
            open.Click += (s, e) => OpenBrowser();
            stop.Click += async (s, e) => { await StopServer(); };
            FormClosing += async (s, e) => {
                if (closing) return;
                e.Cancel = true;
                await StopServer();
                closing = true; Close();
            };
            Controls.AddRange(new Control[] { status, open, stop });
            Shown += async (s, e) => await StartAsync();
        }

        private async Task StartAsync()
        {
            string failure = null;
            try
            {
                if (!File.Exists(Path.Combine(root, "server.js")) || !File.Exists(Path.Combine(root, "package.json")))
                    throw new Exception("server.js e package.json precisam estar na mesma pasta do EXE.");
                string node = FindNode();
                if (node == null) throw new Exception("Node.js 24 ou superior não foi encontrado. Instale Node.js e tente novamente.");
                if (!HasSupportedNode(node)) throw new Exception("O launcher exige Node.js 24 ou superior.");
                string configured = Environment.GetEnvironmentVariable("PORT");
                int parsed;
                if (!String.IsNullOrWhiteSpace(configured) && Int32.TryParse(configured, out parsed)) port = parsed;
                if (port < 1 || port > 65535) throw new Exception("PORT deve estar entre 1 e 65535.");
                var probe = new System.Net.Sockets.TcpListener(IPAddress.Loopback, port);
                try { probe.Start(); }
                catch { throw new Exception("A porta " + port + " já está ocupada. Encerre o servidor anterior na janela que o iniciou. Este launcher não está conectado a ele."); }
                finally { probe.Stop(); }
                launcherId = Guid.NewGuid().ToString("N");
                server = new Process { StartInfo = new ProcessStartInfo(node, "server.js") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true } };
                server.StartInfo.EnvironmentVariables["ATLAS_LAUNCHER_ID"] = launcherId;
                server.OutputDataReceived += (s, e) => { if (e.Data == "ATLAS_READY:" + launcherId) ready = true; };
                server.ErrorDataReceived += (s, e) => { if (e.Data != null) lock (errors) { if (errors.Length < 12000) errors.AppendLine(e.Data); } };
                server.Start();
                server.BeginOutputReadLine(); server.BeginErrorReadLine();
                status.Text = "Aguardando o servidor local...";
                for (int i = 0; i < 60; i++) {
                    if (stopping || closing) return;
                    if (server.HasExited) throw new Exception("O servidor não iniciou. " + errors.ToString());
                    if (ready) {
                        status.Text = "Servidor ativo em http://127.0.0.1:" + port + ".";
                        open.Enabled = true; stop.Enabled = true; OpenBrowser();
                        var owned = server;
                        await Task.Run(() => owned.WaitForExit());
                        if (!stopping && !closing) { open.Enabled = false; stop.Enabled = false; status.Text = "Servidor encerrado. Reabra o launcher para iniciar novamente."; }
                        return;
                    }
                    await Task.Delay(250);
                }
                throw new Exception("O servidor não respondeu em 15 segundos. Verifique se a porta " + port + " está livre.");
            }
            catch (Exception error) { failure = error.Message; }
            if (failure != null) { await StopServer(); if (!closing) { status.Text = failure; MessageBox.Show(this, failure, "Atlas", MessageBoxButtons.OK, MessageBoxIcon.Error); } }
        }

        private async Task<bool> IsReady()
        {
            try { var request = WebRequest.CreateHttp("http://127.0.0.1:" + port + "/api/status"); request.Timeout = 300; using (var response = (HttpWebResponse)await request.GetResponseAsync()) return (int)response.StatusCode == 200; }
            catch { return false; }
        }

        private string FindNode()
        {
            string candidate = Environment.GetEnvironmentVariable("NODE_EXE");
            if (!String.IsNullOrEmpty(candidate) && File.Exists(candidate)) return candidate;
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string folder in path.Split(Path.PathSeparator)) { string file = Path.Combine(folder.Trim(), "node.exe"); if (File.Exists(file)) return file; }
            return null;
        }

        private bool HasSupportedNode(string node)
        {
            using (var check = Process.Start(new ProcessStartInfo(node, "--version") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true }))
            {
                string version = check.StandardOutput.ReadToEnd().Trim(); check.WaitForExit(2000);
                Version parsed;
                return Version.TryParse(version.TrimStart('v'), out parsed) && parsed.Major >= 24;
            }
        }

        private void OpenBrowser() { Process.Start(new ProcessStartInfo("http://127.0.0.1:" + port + "/") { UseShellExecute = true }); }

        private async Task StopServer()
        {
            if (stopping) { while (stopping) await Task.Delay(100); return; }
            stopping = true;
            open.Enabled = false; stop.Enabled = false;
            try {
                if (server != null && !server.HasExited) {
                    status.Text = "Encerrando servidor e aguardando backups...";
                    server.StandardInput.WriteLine("shutdown"); server.StandardInput.Flush();
                    await Task.Run(() => server.WaitForExit());
                }
                status.Text = "Servidor encerrado.";
            } finally { stopping = false; }
        }
    }

    private static class Native
    {
        [System.Runtime.InteropServices.DllImport("user32.dll")] internal static extern IntPtr FindWindow(string a, string b);
        [System.Runtime.InteropServices.DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr h);
        [System.Runtime.InteropServices.DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr h, int n);
    }
}

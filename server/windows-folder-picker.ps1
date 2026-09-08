$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class AtlasFolderPickerNative
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    public static bool PromoteDialog(IntPtr owner, uint processId)
    {
        bool promoted = false;
        EnumWindows(delegate(IntPtr window, IntPtr parameter)
        {
            uint candidateProcessId;
            GetWindowThreadProcessId(window, out candidateProcessId);
            if (window == owner || candidateProcessId != processId || !IsWindowVisible(window)) return true;

            SetWindowPos(window, new IntPtr(-1), 0, 0, 0, 0, 0x0043);
            SetForegroundWindow(window);
            promoted = true;
            return false;
        }, IntPtr.Zero);
        return promoted;
    }
}
'@

$owner = New-Object System.Windows.Forms.Form
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$owner.Opacity = 0
$owner.TopMost = $true
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$owner.Location = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position).WorkingArea.Location
$owner.Size = [System.Drawing.Size]::new(1, 1)

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50
$timer.Add_Tick({
    if ([AtlasFolderPickerNative]::PromoteDialog($owner.Handle, [uint32]$PID)) {
        $timer.Stop()
    }
})

try {
    $owner.Show()
    $owner.Activate()
    $timer.Start()
    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Write($dialog.SelectedPath)
    }
}
finally {
    $timer.Stop()
    $timer.Dispose()
    $dialog.Dispose()
    $owner.Close()
    $owner.Dispose()
}

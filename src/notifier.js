/**
 * 零依赖跨平台系统弹窗通知。
 *  - Windows (win32): powershell.exe -EncodedCommand 调用 WinRT ToastNotification（气泡）
 *  - macOS  (darwin) : osascript display notification
 *  - Linux  (linux)  : notify-send（libnotify）
 * 对外接口:
 *   buildCommand(opts) -> { platform, cmd, args, description } | null  // 纯函数，可无头测试
 *   notify(opts)       -> Promise<void>   // fire-and-forget，永不 reject
 *   notifySync(opts)   -> Promise<{code}> // 等待子进程退出（供 CLI --wait）
 */
import { spawn } from "node:child_process";

export const PLATFORM = process.platform;

function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWindowsCommand(opts) {
  const title = String(opts.title || "DSH");
  const message = String(opts.message || "");
  // 直接以字符串构造 toast XML 再 LoadXml：DOM 拼接后再取 OuterXml 在部分环境会
  // 因 0xC00CE558 解析失败，字符串方式稳定。（仅 Windows PowerShell 5.1 可加载 WinRT 类型）
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "try {",
    "  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    "  $xml = '<toast><visual><binding template=''ToastText02''><text>' + " + psQuote(xmlEscape(title)) + " + '</text><text>' + " + psQuote(xmlEscape(message)) + " + '</text></binding></visual></toast>'",
    "  $toastXml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    "  $toastXml.LoadXml($xml)",
    "  $notification = New-Object Windows.UI.Notifications.ToastNotification $toastXml",
    "  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($notification) | Out-Null",
    "} catch { }"
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return {
    platform: "win32",
    cmd: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    description: "PowerShell WinRT Toast 气泡"
  };
}

function buildMacCommand(opts) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const title = String(opts.title || "DSH");
  const message = String(opts.message || "");
  let script = 'display notification "' + esc(message) + '" with title "' + esc(title) + '"';
  if (opts.sound) script += ' sound name "default"';
  return { platform: "darwin", cmd: "osascript", args: ["-e", script], description: "osascript display notification" };
}

function buildLinuxCommand(opts) {
  const args = ["-a", String(opts.appName || "DSH"), "-t", String(opts.timeoutMs || 8000), String(opts.title || "DSH"), String(opts.message || "")];
  if (opts.sound) args.push("-h", "string:x-canonical-private-synchronous:sound");
  return { platform: "linux", cmd: "notify-send", args, description: "notify-send" };
}

export function buildCommand(opts) {
  opts = opts || {};
  if (PLATFORM === "win32") return buildWindowsCommand(opts);
  if (PLATFORM === "darwin") return buildMacCommand(opts);
  if (PLATFORM === "linux") return buildLinuxCommand(opts);
  return null;
}

function launch(opts, wait) {
  return new Promise((resolve) => {
    let cmd;
    try {
      cmd = buildCommand(opts || {});
    } catch (err) {
      console.error("[dsh-task-notifier] buildCommand error:", err);
      return resolve({ code: -1 });
    }
    if (!cmd) {
      console.warn("[dsh-task-notifier] unsupported platform:", PLATFORM);
      return resolve({ code: -2 });
    }
    try {
      const child = spawn(cmd.cmd, cmd.args, { detached: !wait, stdio: "ignore", windowsHide: true });
      if (!wait) {
        child.on("error", (err) => console.error("[dsh-task-notifier] spawn error:", cmd.cmd, err.message));
        child.on("close", (code) => { if (code !== 0) console.warn("[dsh-task-notifier] exit code", code, "for", cmd.cmd); });
        child.unref();
        return resolve({ code: 0, dispatched: true });
      }
      child.on("error", (err) => { console.error("[dsh-task-notifier] spawn error:", cmd.cmd, err.message); resolve({ code: -1 }); });
      child.on("close", (code) => resolve({ code: code ?? 0 }));
    } catch (err) {
      console.error("[dsh-task-notifier] notify error:", err);
      resolve({ code: -1 });
    }
  });
}

/** fire-and-forget：立即 resolve，永不 reject。失败只记日志。 */
export function notify(opts) {
  return launch(opts, false).then(() => undefined);
}

/** 等待子进程退出（CLI --wait 用）。 */
export function notifySync(opts) {
  return launch(opts, true);
}

#!/usr/bin/env node
/**
 * dsh-task-notifier CLI：手动弹出一条系统通知。
 * 用法:
 *   node bin/notify.js --title "标题" --message "内容" [--sound] [--wait] [--timeout 8000]
 * 退出码：0 成功派发/发送，1 参数或构造失败。
 */
import { buildCommand, notify, notifySync } from "../src/notifier.js";

function parseArgs(argv) {
  const opts = { title: "DSH", message: "", sound: false, wait: false, timeoutMs: 8000, appName: "DSH Task Notifier" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--title") opts.title = String(argv[++i] ?? "");
    else if (a === "--message" || a === "-m") opts.message = String(argv[++i] ?? "");
    else if (a === "--sound") opts.sound = true;
    else if (a === "--wait") opts.wait = true;
    else if (a === "--timeout") { const n = Number(argv[++i]); if (Number.isFinite(n)) opts.timeoutMs = n; }
    else if (a === "--app") opts.appName = String(argv[++i] ?? opts.appName);
    else if (a === "--help" || a === "-h") { opts.help = true; }
    else if (a.startsWith("--title=")) opts.title = a.slice(8);
    else if (a.startsWith("--message=")) opts.message = a.slice(10);
    else if (a.startsWith("--timeout=")) { const n = Number(a.slice(10)); if (Number.isFinite(n)) opts.timeoutMs = n; }
  }
  return opts;
}

const HELP = "用法: node bin/notify.js --title <标题> --message <内容> [--sound] [--wait] [--timeout <ms>] [--app <appName>]";

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); process.exit(0); }
  const cmd = buildCommand(opts);
  if (!cmd) { console.error("[dsh-task-notifier] 当前平台不支持:", process.platform); process.exit(1); }
  console.log("[dsh-task-notifier] platform=" + cmd.platform + " cmd=" + cmd.cmd + " (" + cmd.description + ")");
  if (opts.wait) {
    const r = await notifySync(opts);
    console.log("[dsh-task-notifier] 已等待退出, code=" + r.code);
    process.exit(r.code === 0 ? 0 : 1);
  }
  await notify(opts);
  console.log("[dsh-task-notifier] 通知已派发 (fire-and-forget)");
  process.exit(0);
})();

/**
 * 模拟 task.completed / task.failed / task.confirmationRequired 三个逻辑事件，
 * 验证弹窗通知命令构造；有桌面环境时真实发送。
 * 无头环境（Linux 无 DISPLAY/WAYLAND_DISPLAY，或 DSH_NOTIFIER_DRY_RUN=1）自动 dry-run，只验证命令构造。
 */
import { buildCommand, notify, PLATFORM } from "../src/notifier.js";

const CASES = [
  { event: "task.completed", payload: { taskId: "demo-001", title: "示例任务：构建发布", summary: "测试通过，已打包" } },
  { event: "task.failed", payload: { taskId: "demo-002", title: "示例任务：构建发布", error: "exit code 1" } },
  { event: "task.confirmationRequired", payload: { taskId: "demo-003", title: "高权限任务", summary: "需要人工确认权限绑定" } }
];

function fmtArgs(args) {
  return args.map((a) => (a.length > 100 ? a.slice(0, 100) + "…<len=" + a.length + ">" : a)).join(" ");
}

const headless = PLATFORM === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const dryRun = process.env.DSH_NOTIFIER_DRY_RUN === "1" || headless;

let constructed = 0;
let sent = 0;
let sendFailed = 0;
console.log("== dsh-task-notifier simulate ==");
console.log("platform:", PLATFORM, "| node:", process.version);
console.log("mode:", dryRun ? "DRY-RUN（无头环境或 DSH_NOTIFIER_DRY_RUN=1，仅验证命令构造）" : "LIVE（真实发送）");

for (const c of CASES) {
  const title = "[" + c.event + "] " + c.payload.title;
  const message = JSON.stringify(c.payload);
  const opts = { title, message, timeoutMs: 8000, appName: "DSH Task Notifier" };
  const cmd = buildCommand(opts);
  if (!cmd) {
    console.log("[FAIL] " + c.event + ": 当前平台 " + PLATFORM + " 不支持");
    continue;
  }
  constructed++;
  console.log("[OK]   " + c.event);
  console.log("       cmd: " + cmd.cmd + " " + fmtArgs(cmd.args));
  if (!dryRun) {
    try {
      await notify(opts);
      sent++;
      console.log("       -> 通知已派发（fire-and-forget）");
    } catch (err) {
      sendFailed++;
      console.log("       -> 发送失败（仅记日志，不影响退出码）: " + err.message);
    }
  }
}
console.log("== 结果: 命令构造成功 " + constructed + "/" + CASES.length + "，真实发送 " + sent + "，发送失败 " + sendFailed + "，dryRun=" + dryRun + " ==");
process.exit(constructed === CASES.length ? 0 : 1);

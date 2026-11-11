/**
 * DSH 任务通知插件入口（cordis 宿主插件，ESM）。
 *
 * 真实事件接缝（DSH 0.2.2-rc.1 宿主）：
 *  - 任务看板扩展 API：ctx.inject(["taskBoard"], scope => scope.taskBoard.registerExtension({
 *      id, apiVersion: 1,
 *      start(caps) {
 *        caps.events.onExecutionSettled(ev => ...)  // { taskId, executionId, outcome: succeeded|failed|cancelled, error? }
 *        caps.events.onStatusChanged(ev => ...)     // { taskId, status, previous }  status: backlog|todo|running|done|failed
 *      }
 *    }))
 *  - 待确认：ctx.on("session/event", (session, event) => ...)，其中 event.type === "approval/asked"
 *
 * 逻辑事件名（配置开关沿用需求约定）：
 *   task.completed            <- onExecutionSettled outcome=succeeded（及 status -> done）
 *   task.failed               <- onExecutionSettled outcome=failed/cancelled（及 status -> failed）
 *   task.confirmationRequired <- session event approval/asked
 *
 * 全部通知为 fire-and-forget：任何失败只记日志，绝不抛出；同一逻辑事件 3 秒内去重。
 */
import { loadConfig } from "./config.js";
import { notify } from "./notifier.js";

export const name = "dsh-task-notifier";

export const EVENT_MAP = {
  "task.completed": { key: "completed", label: "任务完成" },
  "task.failed": { key: "failed", label: "任务失败" },
  "task.confirmationRequired": { key: "confirmationRequired", label: "待确认" }
};

const lastSentAt = new Map(); // eventName -> timestamp（毫秒）

function formatMessage(payload) {
  const p = payload || {};
  const parts = [];
  if (p.title) parts.push(String(p.title));
  if (p.summary) parts.push(String(p.summary));
  else if (p.error) parts.push(String(p.error));
  if (p.taskId) parts.push("id: " + p.taskId);
  parts.push(new Date().toLocaleString());
  return parts.join(" | ");
}

/** fire-and-forget：不阻塞主流程；任何失败只记日志，绝不抛出。 */
function fire(eventName, payload, cfg) {
  try {
    if (!cfg.enabled) return;
    const meta = EVENT_MAP[eventName];
    if (!meta || !cfg.events[meta.key]) return;
    const now = Date.now();
    const last = lastSentAt.get(eventName) ?? 0;
    if (now - last < cfg.dedupeMs) return; // 3 秒去重
    lastSentAt.set(eventName, now);
    const title = "[" + meta.label + "]" + (payload && payload.title ? " " + payload.title : "");
    notify({
      title,
      message: formatMessage(payload),
      sound: cfg.sound,
      timeoutMs: cfg.timeoutMs,
      appName: cfg.appName
    }).catch((err) => console.error("[dsh-task-notifier] notify failed:", err));
  } catch (err) {
    console.error("[dsh-task-notifier] handler error:", err);
  }
}

export function apply(ctx, config) {
  const cfg = loadConfig(config || (globalThis.__DSH_NOTIFIER_CONFIG__ || {}));
  const disposers = [];

  // 1) 任务看板扩展：任务完成 / 失败
  if (typeof ctx.inject === "function") {
    try {
      const releaseInject = ctx.inject(["taskBoard"], (scope) => {
        const release = scope.taskBoard.registerExtension({
          id: "dsh-task-notifier",
          apiVersion: 1,
          start(caps) {
            caps.events.onExecutionSettled((ev) => {
              const task = caps.tasks.get(ev.taskId);
              const payload = { taskId: ev.taskId, executionId: ev.executionId, title: task?.title, error: ev.error };
              if (ev.outcome === "succeeded") fire("task.completed", payload, cfg);
              else fire("task.failed", payload, cfg); // failed / cancelled
            });
            caps.events.onStatusChanged((ev) => {
              const task = caps.tasks.get(ev.taskId);
              const payload = { taskId: ev.taskId, title: task?.title, previous: ev.previous };
              if (ev.status === "done") fire("task.completed", payload, cfg);
              else if (ev.status === "failed") fire("task.failed", payload, cfg);
            });
          },
          stop() {}
        });
        return () => release();
      });
      if (typeof releaseInject === "function") disposers.push(releaseInject);
    } catch (err) {
      console.warn("[dsh-task-notifier] taskBoard 服务不可用，跳过看板事件订阅:", err instanceof Error ? err.message : String(err));
    }
  } else {
    console.warn("[dsh-task-notifier] 当前宿主不支持 ctx.inject，跳过看板事件订阅");
  }

  // 2) 待确认：会话事件 approval/asked（人类审批请求）
  try {
    const off = ctx.on("session/event", (session, event) => {
      if (event && event.type === "approval/asked") {
        fire("task.confirmationRequired", {
          sessionId: session?.id,
          title: "需要人工确认",
          summary: event.data?.tool ? "工具: " + String(event.data.tool) : "权限审批请求"
        }, cfg);
      }
    });
    if (typeof off === "function") disposers.push(off);
  } catch (err) {
    console.warn("[dsh-task-notifier] session/event 订阅失败:", err instanceof Error ? err.message : String(err));
  }

  console.log("[dsh-task-notifier] 已激活 (task.completed / task.failed / task.confirmationRequired, dedupe=" + cfg.dedupeMs + "ms)");
  return () => { for (const d of disposers.splice(0)) { try { d(); } catch { /* log-only */ } } };
}

export { fire as handleEvent };

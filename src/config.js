// 默认配置。宿主传入 apply(ctx, config) 的 roster 行配置可通过 loadConfig(overrides) 覆盖。
export const DEFAULT_CONFIG = {
  enabled: true,
  events: {
    completed: true,               // 逻辑事件 task.completed
    failed: true,                  // 逻辑事件 task.failed
    confirmationRequired: true     // 逻辑事件 task.confirmationRequired
  },
  sound: false,
  timeoutMs: 8000,
  dedupeMs: 3000,                  // 同一逻辑事件 3 秒内去重
  appName: "DSH Task Notifier"
};

export function loadConfig(overrides) {
  const cfg = structuredClone(DEFAULT_CONFIG);
  if (overrides && typeof overrides === "object") {
    if (typeof overrides.enabled === "boolean") cfg.enabled = overrides.enabled;
    if (typeof overrides.sound === "boolean") cfg.sound = overrides.sound;
    if (Number.isFinite(overrides.timeoutMs)) cfg.timeoutMs = overrides.timeoutMs;
    if (Number.isFinite(overrides.dedupeMs)) cfg.dedupeMs = overrides.dedupeMs;
    if (overrides.appName) cfg.appName = String(overrides.appName);
    if (overrides.events && typeof overrides.events === "object") {
      for (const k of Object.keys(cfg.events)) {
        if (typeof overrides.events[k] === "boolean") cfg.events[k] = overrides.events[k];
      }
    }
  }
  return cfg;
}

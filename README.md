# DSH Task Notifier

DSH 插件：在任务 **完成 / 失败 / 待确认** 时弹出系统通知（桌面气泡）。零依赖、跨平台。

| 平台 | 实现 |
| --- | --- |
| Windows | `powershell.exe -EncodedCommand` 调用 WinRT `ToastNotification` 气泡 |
| macOS | `osascript display notification` |
| Linux | `notify-send`（libnotify） |

## 事件接缝（DSH 0.2.2-rc.1 真实宿主 API）

插件为 cordis 宿主插件（ESM，`export const name` + `export function apply(ctx, config)`）：

| 逻辑事件 | 宿主来源 |
| --- | --- |
| `task.completed` | `taskBoard` 扩展 `caps.events.onExecutionSettled`（outcome=succeeded）及 `onStatusChanged`（status=done） |
| `task.failed` | `onExecutionSettled`（outcome=failed/cancelled）及 `onStatusChanged`（status=failed） |
| `task.confirmationRequired` | `ctx.on("session/event")` 中 `event.type === "approval/asked"` |

订阅方式：`ctx.inject(["taskBoard"], scope => scope.taskBoard.registerExtension({ id: "dsh-task-notifier", apiVersion: 1, start(caps) { caps.events.onExecutionSettled(...); caps.events.onStatusChanged(...) } }))`。

通知为 fire-and-forget，失败只记日志，不会阻塞主流程；同一逻辑事件按 `dedupeMs`（默认 3000ms）去重。

## 安装

1. 把本目录复制到 `<dsh-home>/plugins/dsh-task-notifier`（本机为 `D:\AI\dsh-data\dsh-home\plugins\dsh-task-notifier`）。
2. 在桌面 profile（`D:\AI\dsh-data\dsh-home\profiles\desktop\package.json`）中：
   - `dependencies` 增加 `"dsh-task-notifier": "link:D:/AI/dsh-data/dsh-home/plugins/dsh-task-notifier"`
   - `dsh.profile.bundles` 增加 `"dsh-task-notifier"`
3. 在 profile 目录执行 `pnpm install`（或 `dsh plugin --profile desktop add <路径>`），使 node_modules 中生成 link。
   插件自带的 `cordis.patch.yml`（`dsh.bundle.patch`）会把 `task-notifier` 行插入 loader 树。

## 配置（roster 行 config / dsh.plugin.json configSchema）

```json
{
  "enabled": true,
  "sound": false,
  "timeoutMs": 8000,
  "dedupeMs": 3000,
  "events": { "completed": true, "failed": true, "confirmationRequired": true }
}
```

## 测试 / 模拟

```bash
node test/simulate.js                          # 有桌面环境时真实发送三条通知
DSH_NOTIFIER_DRY_RUN=1 node test/simulate.js    # 无头环境：仅验证命令构造
node bin/notify.js --title 测试 --message 内容 --sound --wait   # CLI 手动弹一条
```

`test/simulate.js` 退出码 0 表示三个逻辑事件的通知命令均构造成功。

## 打包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pack.ps1
# 生成 <桌面>/dsh-task-notifier-1.0.0.zip
```

## 故障排查

- Windows 无弹窗：确认 `powershell.exe` 可用且系统通知未被禁用；脚本内已 `SilentlyContinue`。
- Linux 无弹窗：确认安装了 `notify-send` 且存在 DISPLAY/WAYLAND_DISPLAY。
- 无头（SSH/CI）：属正常，`test/simulate.js` 会自动 dry-run。
- 插件未激活：控制台会打印 `taskBoard 服务不可用` 等警告；确认任务看板总开关已打开。

## 许可

MIT License，见 LICENSE。

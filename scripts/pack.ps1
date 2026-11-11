# 打包 dsh-task-notifier 为 zip（排除 .git / node_modules），输出到插件目录的上一级。
# 用法:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pack.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = '1.0.0'
$zip = Join-Path (Split-Path -Parent $root) "dsh-task-notifier-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$items = @(
  'dsh.plugin.json', 'package.json', 'README.md', 'LICENSE', '.gitignore', 'cordis.patch.yml',
  'src', 'bin', 'test', 'scripts'
) | ForEach-Object { Join-Path $root $_ }
Compress-Archive -Path $items -DestinationPath $zip -Force
$size = (Get-Item $zip).Length
Write-Output "已生成: $zip ($size 字节)"

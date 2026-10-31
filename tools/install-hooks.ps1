# install-hooks.ps1 — 装 pre-push 钩子：推送前自动跑 preflight
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hookDir = Join-Path $root ".git/hooks"
$sh = @"
#!/bin/sh
# 推送前自检；失败则阻止推送（--no-verify 可跳过）
pwsh -NoProfile -File "`$(git rev-parse --show-toplevel)/tools/preflight.ps1" || {
  echo ""
  echo "preflight 失败：修复后再推，或 git push --no-verify 强推"
  exit 1
}
"@
New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
$path = Join-Path $hookDir "pre-push"
[System.IO.File]::WriteAllText($path, $sh, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "✅ 已安装 $path"
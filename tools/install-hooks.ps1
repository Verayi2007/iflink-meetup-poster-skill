# install-hooks.ps1 — 装 pre-push 钩子：推送前自动跑 preflight
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hookDir = Join-Path $root ".git/hooks"
$sh = @"
#!/bin/sh
# 推送前自检；失败则阻止推送（git push --no-verify 可跳过）
# 优先 pwsh(PowerShell 7)，没有就退回 Windows PowerShell 5.1
if command -v pwsh >/dev/null 2>&1; then
  PS=pwsh
else
  PS=powershell
fi
"`$PS" -NoProfile -ExecutionPolicy Bypass -File "`$(git rev-parse --show-toplevel)/tools/preflight.ps1" || {
  echo ""
  echo "preflight 失败：修复后再推，或 git push --no-verify 强推"
  exit 1
}
"@
New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
$path = Join-Path $hookDir "pre-push"
[System.IO.File]::WriteAllText($path, $sh, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "✅ 已安装 $path"
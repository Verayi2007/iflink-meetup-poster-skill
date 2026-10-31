#!/usr/bin/env pwsh
# preflight.ps1 — 提交前自检（等价于 CI 里跑的那几步）
# 用法：pwsh tools/preflight.ps1   或由 .git/hooks/pre-push 自动调用

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sk = Join-Path $root ".dsh/skills/iflink-meetup-poster"
$fail = 0

function Step($name, $block) {
    Write-Host ""
    Write-Host "── $name " -NoNewline -ForegroundColor DarkGray
    try { & $block; Write-Host "✅" -ForegroundColor Green }
    catch { Write-Host "❌ $($_.Exception.Message)" -ForegroundColor Red; $script:fail++ }
}

Step "版本号一致性" {
    $v = (Select-String -Path (Join-Path $sk "SKILL.md") -Pattern 'version:\s*"([0-9]+\.[0-9]+\.[0-9]+)"').Matches[0].Groups[1].Value
    if (-not $v) { throw "SKILL.md 缺少 metadata.version" }
    if (-not (Select-String -Path (Join-Path $root "README.md") -Pattern ([regex]::Escape($v)) -Quiet)) { throw "README 徽章版本 $v 与 SKILL.md 不一致" }
    Write-Host "   version=$v" -ForegroundColor DarkGray
}

Step "Node 语法" {
    node --check (Join-Path $sk "scripts/build-prompt.mjs")
    node --check (Join-Path $sk "scripts/new-spec.mjs")
}

Step "模板 spec 校验" {
    $out = node (Join-Path $sk "scripts/build-prompt.mjs") (Join-Path $sk "templates/sample-a-original.json") --check-only 2>&1
    if (($out -join "`n") -notmatch "0 error") { throw "sample-a 校验未通过" }
}

Step "技能自检（模板/基线/渲染/色板）" {
    $out = python (Join-Path $sk "scripts/selftest.py") 2>&1
    if ($LASTEXITCODE -ne 0) { throw (($out | Select-Object -Last 3) -join " / ") }
}

Write-Host ""
if ($fail -gt 0) { Write-Host "❌ 预检失败 $fail 项，已阻止提交" -ForegroundColor Red; exit 1 }
Write-Host "✅ 预检通过" -ForegroundColor Green
exit 0
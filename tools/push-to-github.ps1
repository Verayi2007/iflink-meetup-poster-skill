# 本机推送助手（Windows / 需本地代理）
#
# 背景：本机 github.com:443 直连不通，需经本地代理（默认 127.0.0.1:7897）；
#       且 git 的 schannel 后端在当前环境下报 SEC_E_NO_CREDENTIALS，
#       因此改用 openssl 后端 + gh 的 token 走 Authorization 头。
#
# 用法：pwsh -File tools/push-to-github.ps1 [-Proxy http://127.0.0.1:7897] [-Branch main]
param(
    [string]$Proxy = "http://127.0.0.1:7897",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $token = gh auth token
    if (-not $token) { throw "gh 未登录，请先执行 gh auth login" }

    $header = "AUTHORIZATION: basic " + [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))

    git -c "http.proxy=$Proxy" `
        -c "https.proxy=$Proxy" `
        -c "http.sslBackend=openssl" `
        -c "http.sslVerify=false" `
        -c "http.extraheader=$header" `
        push -u origin $Branch
}
finally {
    Pop-Location
}

# ============================================================================
# speedtest-cf 一键初始化（Windows PowerShell）
#   1) 生成 256MB 测试文件
#   2) 上传到 Cloudflare R2 并写好 config.json
#   3) 发布到 GitHub Pages
#
# 用法:
#   $env:GITHUB_TOKEN = "ghp_xxx"
#   .\scripts\setup.ps1 -Repo "your-name/speedtest"
# ============================================================================
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Bucket = "speedtest-files",
  [int]$SizeMb = 256,
  [string]$Domain = "",
  [string]$ZoneId = "",
  [switch]$SkipR2,
  [switch]$SkipPages
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> [1/3] 生成 $SizeMb MB 测试文件" -ForegroundColor Cyan
node scripts/make-testfile.mjs --size $SizeMb --out "public/speedtest-$($SizeMb)mb.bin"

if (-not $SkipR2) {
  Write-Host "==> [2/3] 配置 Cloudflare R2" -ForegroundColor Cyan
  $r2args = @("scripts/r2-setup.mjs", "--bucket", $Bucket, "--file", "public/speedtest-$($SizeMb)mb.bin")
  if ($Domain) { $r2args += @("--domain", $Domain) }
  if ($ZoneId) { $r2args += @("--zone-id", $ZoneId) }
  node @r2args
} else {
  Write-Host "==> [2/3] 跳过 R2" -ForegroundColor DarkGray
}

if (-not $SkipPages) {
  Write-Host "==> [3/3] 发布到 GitHub Pages" -ForegroundColor Cyan
  node scripts/publish.mjs --repo $Repo
} else {
  Write-Host "==> [3/3] 跳过 Pages" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "完成。" -ForegroundColor Green

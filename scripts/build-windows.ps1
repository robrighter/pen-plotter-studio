# Build the standalone Windows app (.msi + .exe installers).
# Run this in PowerShell on the WINDOWS host (not inside WSL).
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch all
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch x64
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch arm64
#
# Prereqs (see BUILD-WINDOWS.md): Node.js, Rust (MSVC toolchain),
# Visual Studio C++ Build Tools, WebView2 runtime.

param(
  [ValidateSet("all", "x64", "arm64")]
  [string]$Arch = "all",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Have($name) { $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

function TargetForArch($arch) {
  switch ($arch) {
    "x64" { "x86_64-pc-windows-msvc" }
    "arm64" { "aarch64-pc-windows-msvc" }
    default { throw "Unsupported arch: $arch" }
  }
}

function LabelForArch($arch) {
  switch ($arch) {
    "x64" { "Intel/AMD x64" }
    "arm64" { "Windows ARM64" }
    default { throw "Unsupported arch: $arch" }
  }
}

Write-Host "== Checking prerequisites ==" -ForegroundColor Cyan
$ok = $true
foreach ($cmd in @("node", "npm", "cargo", "rustc")) {
  if (Have $cmd) {
    Write-Host ("  [ok]  {0} -> {1}" -f $cmd, (& $cmd --version 2>$null | Select-Object -First 1))
  } else {
    Write-Host "  [MISSING] $cmd" -ForegroundColor Red
    $ok = $false
  }
}

# The MSVC linker must be reachable (comes with VS C++ Build Tools).
if (Have "link") {
  Write-Host "  [ok]  MSVC linker (link.exe) found"
} else {
  Write-Host "  [warn] link.exe not on PATH. Run this from a 'Developer PowerShell for VS'," -ForegroundColor Yellow
  Write-Host "         or install 'Desktop development with C++' (VS Build Tools)." -ForegroundColor Yellow
}

if (-not $ok) {
  Write-Host "`nInstall the missing tools (see BUILD-WINDOWS.md) and re-run." -ForegroundColor Red
  exit 1
}

# Warn about building over a \\wsl$ UNC path (slow + occasionally flaky for Rust).
$root = (Resolve-Path "$PSScriptRoot\..").Path
if ($root -like "\\wsl*" -or $root -like "\\\\wsl*") {
  Write-Host "`n[warn] You're building from a WSL network path:" -ForegroundColor Yellow
  Write-Host "       $root" -ForegroundColor Yellow
  Write-Host "       Copy the project to a native Windows path (e.g. C:\dev) first for a" -ForegroundColor Yellow
  Write-Host "       faster, more reliable build. See BUILD-WINDOWS.md." -ForegroundColor Yellow
}

Set-Location $root
if (-not $SkipInstall) {
  Write-Host "`n== Installing JS dependencies ==" -ForegroundColor Cyan
  npm install
}

$arches = if ($Arch -eq "all") { @("x64", "arm64") } else { @($Arch) }

foreach ($archName in $arches) {
  $target = TargetForArch $archName
  $label = LabelForArch $archName

  Write-Host "`n== Ensuring Rust target: $target ==" -ForegroundColor Cyan
  rustup target add $target

  Write-Host "`n== Building $label ($target) ==" -ForegroundColor Cyan
  npm run tauri -- build --target $target

  $release = Join-Path $root "src-tauri\target\$target\release"
  $bundle = Join-Path $release "bundle"

  Write-Host "`n== $label build complete ==" -ForegroundColor Green
  Write-Host "Installers are in:" -ForegroundColor Green
  Write-Host "  $bundle\msi\   (.msi)"
  Write-Host "  $bundle\nsis\  (.exe setup)"
  Write-Host "Standalone exe:"
  Write-Host "  $release\pen-plotter-app.exe"
}

Write-Host "`n== Done ==" -ForegroundColor Green

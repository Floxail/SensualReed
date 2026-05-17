# build-apk.ps1 — Bundle JS + build debug APK + copy to project root
# Usage: powershell -ExecutionPolicy Bypass -File tools\build-apk.ps1
# Run from: C:\Users\Floxa\Downloads\BookLovense  (project root)

$ErrorActionPreference = "Stop"

$ROOT       = Split-Path -Parent $PSScriptRoot          # BookLovense/
$APP_DIR    = Join-Path $ROOT "SensualRead"
$ANDROID    = Join-Path $APP_DIR "android"
$ASSETS_DIR = Join-Path $ANDROID "app\src\main\assets"
$RES_DIR    = Join-Path $ANDROID "app\src\main\res"
$APK_SRC    = Join-Path $ANDROID "app\build\outputs\apk\debug\app-debug.apk"

# --- 1. Read version from SettingsScreen.tsx ---
$SETTINGS = Join-Path $APP_DIR "src\screens\SettingsScreen.tsx"
$match = Select-String -Path $SETTINGS -Pattern 'value="Version (\d+\.\d+)"' | Select-Object -First 1
if (-not $match) {
    Write-Error "Could not find version string in SettingsScreen.tsx"
    exit 1
}
$VERSION = $match.Matches[0].Groups[1].Value
$APK_DEST = Join-Path $ROOT "SensualRead-v$VERSION.apk"
Write-Host "Building version: v$VERSION" -ForegroundColor Cyan

# --- 2. Ensure assets dir exists ---
if (-not (Test-Path $ASSETS_DIR)) {
    New-Item -ItemType Directory -Path $ASSETS_DIR -Force | Out-Null
}

# --- 3. Bundle JS ---
Write-Host "`n[1/3] Bundling JS..." -ForegroundColor Yellow
Set-Location $APP_DIR
& npx react-native bundle `
    --platform android `
    --dev false `
    --entry-file index.js `
    --bundle-output "$ASSETS_DIR\index.android.bundle" `
    --assets-dest $RES_DIR
if ($LASTEXITCODE -ne 0) { Write-Error "JS bundle failed"; exit 1 }

# --- 4. Gradle assembleDebug ---
Write-Host "`n[2/3] Running Gradle assembleDebug..." -ForegroundColor Yellow
Set-Location $ANDROID
& .\gradlew assembleDebug
if ($LASTEXITCODE -ne 0) { Write-Error "Gradle build failed"; exit 1 }

# --- 5. Copy APK to project root ---
Write-Host "`n[3/3] Copying APK to project root..." -ForegroundColor Yellow
Copy-Item -Path $APK_SRC -Destination $APK_DEST -Force
Write-Host "`nDone: $APK_DEST" -ForegroundColor Green

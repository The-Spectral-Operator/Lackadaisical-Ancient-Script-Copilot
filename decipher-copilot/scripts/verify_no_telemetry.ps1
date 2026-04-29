# Verify No Telemetry - Static grep for forbidden domains/patterns
# Run as part of build to enforce zero-telemetry guarantee

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$forbidden = @(
    "googleapis.com",
    "mixpanel.com",
    "segment.io",
    "sentry.io",
    "datadoghq.com",
    "analytics",
    "ga4",
    "posthog.com",
    "amplitude.com",
    "cloud.ollama.com",
    "0.0.0.0",
    "telemetry",
    "tracking",
    "qwen",
    "deepseek",
    "baichuan"
)

$failed = $false
$files = Get-ChildItem -Path $Root -Recurse -Include *.js,*.mjs,*.ts,*.c,*.cpp,*.h,*.hpp,*.html,*.css -File |
    Where-Object { $_.FullName -notmatch "node_modules|\.git|dist|build" }

foreach ($pattern in $forbidden) {
    $matches = $files | Select-String -Pattern $pattern -SimpleMatch
    if ($matches) {
        Write-Host "FAIL: Found forbidden pattern '$pattern':" -ForegroundColor Red
        foreach ($m in $matches) {
            Write-Host "  $($m.Path):$($m.LineNumber)" -ForegroundColor Yellow
        }
        $failed = $true
    }
}

if ($failed) {
    Write-Host "`nTelemetry check FAILED - build blocked" -ForegroundColor Red
    exit 1
} else {
    Write-Host "Telemetry check PASSED - no forbidden patterns found" -ForegroundColor Green
}

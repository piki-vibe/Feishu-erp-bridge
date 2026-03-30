$ErrorActionPreference = 'Stop'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$ocrProcesses = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match 'ocr_service\.(app|worker)'
  }

if (-not $ocrProcesses) {
  Write-Host 'No running OCR service found'
  exit 0
}

foreach ($process in $ocrProcesses) {
  Write-Host "Stopping OCR process: PID=$($process.ProcessId) Path=$($process.ExecutablePath)"
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host 'OCR service stopped'

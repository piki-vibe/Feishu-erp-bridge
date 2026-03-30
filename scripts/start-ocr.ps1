$ErrorActionPreference = 'Stop'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
$port = 5000

if (-not (Test-Path $pythonExe)) {
  throw "OCR Python not found: $pythonExe"
}

function Get-OcrProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'ocr_service\.(app|worker)'
    }
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 15
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $Port } |
      Select-Object -First 1
    if ($listener) {
      return $listener
    }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $deadline)

  return $null
}

$existingListeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq $port }

if ($existingListeners) {
  $ocrProcesses = Get-OcrProcesses
  $listenerPids = @($existingListeners | Select-Object -ExpandProperty OwningProcess)
  $runningOcr = $ocrProcesses | Where-Object { $listenerPids -contains $_.ProcessId }

  if ($runningOcr) {
    Write-Host "OCR service already running. PID: $($runningOcr.ProcessId -join ', ') Port: $port"
    exit 0
  }
}

$staleOcrProcesses = Get-OcrProcesses
foreach ($process in $staleOcrProcesses) {
  Write-Host "Cleaning stale OCR process: PID=$($process.ProcessId) Path=$($process.ExecutablePath)"
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$env:OCR_PORT = "$port"
$env:OCR_SERVER_THREADS = '4'
$env:OCR_CPU_THREADS = '2'
$env:OCR_KEEP_MODEL_LOADED = 'false'
$env:OCR_PROCESS_ISOLATED = 'true'
$env:OCR_SINGLE_INSTANCE = 'true'
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
$env:OPENBLAS_NUM_THREADS = '2'
$env:NUMEXPR_NUM_THREADS = '2'

$process = Start-Process `
  -FilePath $pythonExe `
  -ArgumentList '-m', 'ocr_service.app' `
  -WorkingDirectory $projectRoot `
  -PassThru

try {
  $process.PriorityClass = 'BelowNormal'
} catch {
  Write-Warning "Failed to set OCR process priority: $($_.Exception.Message)"
}

$listener = Wait-ForPort -Port $port
if (-not $listener) {
  throw "OCR service startup timed out. Port $port is not listening"
}

Write-Host "OCR service started: http://127.0.0.1:$port PID=$($process.Id) Priority=$($process.PriorityClass)"

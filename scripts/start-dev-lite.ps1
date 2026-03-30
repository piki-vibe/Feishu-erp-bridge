$ErrorActionPreference = 'Stop'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$viteCli = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'

if (-not (Test-Path $viteCli)) {
  throw "Vite CLI not found: $viteCli"
}

function Start-LowPriorityProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [int]$Port
  )

  $listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port } |
    Select-Object -First 1

  if ($listener) {
    Write-Host "$Name already running. Port: $Port PID: $($listener.OwningProcess)"
    return
  }

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $WorkingDirectory `
    -PassThru

  try {
    $process.PriorityClass = 'BelowNormal'
  } catch {
    Write-Warning "Failed to set $Name priority: $($_.Exception.Message)"
  }

  Write-Host "$Name started. PID: $($process.Id)"
}

$env:ENABLE_HTTP_LOG = 'false'
$env:ENABLE_VERBOSE_LOG = 'false'
$env:ENABLE_INFO_LOG = 'false'
$env:ENABLE_TASK_DEBUG_LOG = 'false'

& (Join-Path $PSScriptRoot 'start-ocr.ps1')

Start-LowPriorityProcess `
  -Name 'backend' `
  -FilePath $nodeExe `
  -ArgumentList @('server/server.js') `
  -WorkingDirectory $projectRoot `
  -Port 3001

Start-LowPriorityProcess `
  -Name 'frontend' `
  -FilePath $nodeExe `
  -ArgumentList @($viteCli, '--host', '0.0.0.0') `
  -WorkingDirectory $projectRoot `
  -Port 5173

Write-Host 'Lite mode startup complete'
Write-Host 'Frontend: http://127.0.0.1:5173'
Write-Host 'Backend : http://127.0.0.1:3001'
Write-Host 'OCR     : http://127.0.0.1:5000'

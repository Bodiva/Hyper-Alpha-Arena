<#
.SYNOPSIS
  Start the local Hyper Alpha Arena development stack with configurable ports.

.EXAMPLE
  .\scripts\start-dev.ps1 -StartDockerDeps

.EXAMPLE
  .\scripts\start-dev.ps1 -SkipFrontend -BackendPort 8802
#>
[CmdletBinding()]
param(
  [string]$EnvFile = ".env",
  [string]$BackendHost = "127.0.0.1",
  [int]$BackendPort = 20088,
  [string]$FrontendHost = "0.0.0.0",
  [int]$FrontendPort = 20080,
  [string]$LogsDir = ".codex-run",
  [string]$DockerAppContainerName = "hyper-arena-app",
  [switch]$StartDockerDeps,
  [switch]$RecreateDockerDeps,
  [switch]$SkipDockerDeps,
  [switch]$SkipBackend,
  [switch]$SkipFrontend,
  [switch]$UseStaticFrontend,
  [switch]$NoReload,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $Root "backend"
$RuntimeDir = Join-Path $Root $LogsDir
$LogDir = Join-Path $RuntimeDir "logs"
New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogDir | Out-Null
Set-Location $Root

function Write-Step {
  param([string]$Message)
  Write-Host "[start-dev] $Message"
}

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      return
    }
    $index = $line.IndexOf("=")
    if ($index -lt 1) {
      return
    }

    $name = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, "Process"))) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Set-LocalEnvDefault {
  param(
    [string]$Name,
    [string]$LocalValue,
    [string[]]$ComposeValues = @()
  )

  $current = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($current) -or ($ComposeValues -contains $current)) {
    [Environment]::SetEnvironmentVariable($Name, $LocalValue, "Process")
  }
}

function Set-EncryptionKeyFromDockerApp {
  param([string]$ContainerName)

  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("HYPERLIQUID_ENCRYPTION_KEY", "Process"))) {
    return
  }

  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerCommand) {
    return
  }

  try {
    $running = & $dockerCommand.Source inspect -f "{{.State.Running}}" $ContainerName 2>$null
    if (($LASTEXITCODE -ne 0) -or ($running -ne "true")) {
      return
    }

    $key = & $dockerCommand.Source exec $ContainerName sh -lc "test -s /app/data/.encryption_key && cat /app/data/.encryption_key" 2>$null
    if (($LASTEXITCODE -eq 0) -and -not [string]::IsNullOrWhiteSpace($key)) {
      [Environment]::SetEnvironmentVariable("HYPERLIQUID_ENCRYPTION_KEY", $key.Trim(), "Process")
      Write-Step "loaded backend encryption key from Docker app data volume"
    }
  } catch {
    Write-Step "Docker app encryption key was not available; saved encrypted credentials may need to be re-entered"
  }
}

function Resolve-RequiredCommand {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw "Missing required command: $($Candidates -join ' or ')"
}

function Assert-PortFree {
  param([int]$Port, [string]$Name)

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $listeners) {
    return
  }

  $owners = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  $processes = $owners | ForEach-Object {
    $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
    if ($process) {
      "$($process.ProcessName)($($process.Id))"
    } else {
      "pid:$($_)"
    }
  }
  throw "$Name port $Port is already in use by $($processes -join ', '). Choose another port."
}

function Start-LoggedProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  $stdout = Join-Path $LogDir "$Name.out.log"
  $stderr = Join-Path $LogDir "$Name.err.log"
  $pidFile = Join-Path $RuntimeDir "$Name.pid"
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  Set-Content -Path $pidFile -Value $process.Id
  Write-Step "$Name started, pid=$($process.Id), logs=$stdout"
  return @{
    Process = $process
    Stdout = $stdout
    Stderr = $stderr
  }
}

function Wait-Http {
  param(
    [string]$Name,
    [string]$Url,
    [object]$StartedProcess,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($StartedProcess -and $StartedProcess.Process.HasExited) {
      Write-Step "$Name exited before becoming healthy. Last stderr:"
      Get-Content -Path $StartedProcess.Stderr -Tail 60 -ErrorAction SilentlyContinue
      throw "$Name failed to start."
    }

    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Step "$Name ready: $Url"
        return
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  Write-Step "$Name did not pass health check within ${TimeoutSeconds}s. Logs are under $LogDir"
}

$resolvedEnvFile = Join-Path $Root $EnvFile
Import-DotEnv -Path $resolvedEnvFile

if (-not $PSBoundParameters.ContainsKey("BackendPort")) {
  $configuredBackendPort = [Environment]::GetEnvironmentVariable("ALPHATRACE_BACKEND_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($configuredBackendPort)) {
    $configuredBackendPort = [Environment]::GetEnvironmentVariable("BACKEND_PORT", "Process")
  }
  if (-not [string]::IsNullOrWhiteSpace($configuredBackendPort)) {
    $BackendPort = [int]$configuredBackendPort
  }
}
if (-not $PSBoundParameters.ContainsKey("FrontendPort")) {
  $configuredFrontendPort = [Environment]::GetEnvironmentVariable("ALPHATRACE_FRONTEND_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($configuredFrontendPort)) {
    $configuredFrontendPort = [Environment]::GetEnvironmentVariable("FRONTEND_PORT", "Process")
  }
  if (-not [string]::IsNullOrWhiteSpace($configuredFrontendPort)) {
    $FrontendPort = [int]$configuredFrontendPort
  }
}

$localLogPath = Join-Path (Join-Path $Root "logs") "backend-runtime.log"
$localDataPath = Join-Path (Join-Path $Root "data") "test"
$postgresPort = [Environment]::GetEnvironmentVariable("POSTGRES_PORT", "Process")
if ([string]::IsNullOrWhiteSpace($postgresPort)) {
  $postgresPort = "25532"
  [Environment]::SetEnvironmentVariable("POSTGRES_PORT", $postgresPort, "Process")
}
$mysqlPort = [Environment]::GetEnvironmentVariable("ALPHA_TRACE_MYSQL_PORT", "Process")
if ([string]::IsNullOrWhiteSpace($mysqlPort)) {
  $mysqlPort = "23307"
  [Environment]::SetEnvironmentVariable("ALPHA_TRACE_MYSQL_PORT", $mysqlPort, "Process")
}
$clickhouseHttpPort = [Environment]::GetEnvironmentVariable("ALPHA_TRACE_CLICKHOUSE_HTTP_PORT", "Process")
if ([string]::IsNullOrWhiteSpace($clickhouseHttpPort)) {
  $clickhouseHttpPort = "28123"
  [Environment]::SetEnvironmentVariable("ALPHA_TRACE_CLICKHOUSE_HTTP_PORT", $clickhouseHttpPort, "Process")
}
$clickhouseNativePort = [Environment]::GetEnvironmentVariable("ALPHA_TRACE_CLICKHOUSE_NATIVE_PORT", "Process")
if ([string]::IsNullOrWhiteSpace($clickhouseNativePort)) {
  $clickhouseNativePort = "29000"
  [Environment]::SetEnvironmentVariable("ALPHA_TRACE_CLICKHOUSE_NATIVE_PORT", $clickhouseNativePort, "Process")
}

Set-LocalEnvDefault "DATABASE_URL" "postgresql://alpha_user:alpha_pass@localhost:$postgresPort/alpha_arena" @(
  "postgresql://alpha_user:alpha_pass@postgres:5432/alpha_arena",
  "postgresql://alpha_user:alpha_pass@localhost:5432/alpha_arena",
  "postgresql://alpha_user:alpha_pass@localhost:25432/alpha_arena"
)
Set-LocalEnvDefault "SNAPSHOT_DATABASE_URL" "postgresql://alpha_user:alpha_pass@localhost:$postgresPort/alpha_snapshots" @(
  "postgresql://alpha_user:alpha_pass@postgres:5432/alpha_snapshots",
  "postgresql://alpha_user:alpha_pass@localhost:5432/alpha_snapshots",
  "postgresql://alpha_user:alpha_pass@localhost:25432/alpha_snapshots"
)
Set-LocalEnvDefault "ALPHA_TRACE_MYSQL_DATABASE_URL" "mysql+pymysql://alpha_user:alpha_pass@localhost:$mysqlPort/alpha_trace?charset=utf8mb4" @("mysql+pymysql://alpha_user:alpha_pass@mysql:3306/alpha_trace?charset=utf8mb4")
Set-LocalEnvDefault "ALPHA_TRACE_AGENT_RUN_STORE" "mysql" @("json")
Set-LocalEnvDefault "ALPHA_TRACE_DOMAIN_STORE" "mysql" @("json")
Set-LocalEnvDefault "ALPHA_TRACE_CLICKHOUSE_URL" "http://localhost:$clickhouseHttpPort" @("http://clickhouse:8123")
Set-LocalEnvDefault "ALPHA_TRACE_CLICKHOUSE_USER" "alpha_user"
Set-LocalEnvDefault "ALPHA_TRACE_CLICKHOUSE_PASSWORD" "alpha_pass"
Set-LocalEnvDefault "ALPHATRACE_BACKEND_LOG_PATH" $localLogPath @("/app/logs/backend-runtime.log")
Set-LocalEnvDefault "ALPHA_TRACE_FILE_IMPORT_DIR" $localDataPath @("/app/data/test")
Set-LocalEnvDefault "VITE_ALPHA_TRACE_API_MODE" "real"
Set-LocalEnvDefault "PYTHONUTF8" "1"
Set-LocalEnvDefault "PYTHONIOENCODING" "utf-8"
Set-EncryptionKeyFromDockerApp -ContainerName $DockerAppContainerName

$proxyHost = $BackendHost
if ($proxyHost -eq "0.0.0.0") {
  $proxyHost = "127.0.0.1"
}
$backendBaseUrl = "http://${proxyHost}:$BackendPort"
[Environment]::SetEnvironmentVariable("VITE_ALPHA_TRACE_API_PROXY_TARGET", $backendBaseUrl, "Process")

if ($StartDockerDeps -and -not $SkipDockerDeps) {
  $dockerPath = Resolve-RequiredCommand @("docker")
  Write-Step "starting docker dependencies: postgres, mysql, clickhouse"
  $composeArgs = @("compose", "up", "-d")
  if ($RecreateDockerDeps) {
    $composeArgs += "--force-recreate"
  }
  $composeArgs += @("postgres", "mysql", "clickhouse")
  & $dockerPath $composeArgs
}

$backendStarted = $null
if (-not $SkipBackend) {
  Assert-PortFree -Port $BackendPort -Name "Backend"
  $uvPath = Resolve-RequiredCommand @("uv")

  if (-not $SkipInstall) {
    Write-Step "syncing backend dependencies"
    Push-Location $BackendDir
    try {
      & $uvPath sync --quiet
    } finally {
      Pop-Location
    }
  }

  $backendArgs = @("run", "uvicorn", "main:app", "--host", $BackendHost, "--port", [string]$BackendPort)
  if (-not $NoReload) {
    $backendArgs += @("--reload", "--reload-dir", $BackendDir, "--reload-exclude", ".venv")
  }
  $backendStarted = Start-LoggedProcess -Name "backend" -FilePath $uvPath -Arguments $backendArgs -WorkingDirectory $BackendDir
}

$frontendStarted = $null
if (-not $SkipFrontend -and -not $UseStaticFrontend) {
  Assert-PortFree -Port $FrontendPort -Name "Frontend"
  $pnpmPath = Resolve-RequiredCommand @("pnpm.cmd", "pnpm")
  $frontendArgs = @("--dir", "frontend", "exec", "vite", "--host", $FrontendHost, "--port", [string]$FrontendPort)
  $frontendStarted = Start-LoggedProcess -Name "frontend" -FilePath $pnpmPath -Arguments $frontendArgs -WorkingDirectory $Root
}

if ($backendStarted) {
  Wait-Http -Name "backend" -Url "$backendBaseUrl/api/health" -StartedProcess $backendStarted -TimeoutSeconds 60
}

if ($frontendStarted) {
  Wait-Http -Name "frontend" -Url "http://127.0.0.1:$FrontendPort/dashboard" -StartedProcess $frontendStarted -TimeoutSeconds 45
}

Write-Step "done"
if ($backendStarted) {
  Write-Host "Backend:  $backendBaseUrl"
}
if ($frontendStarted) {
  Write-Host "Frontend: http://localhost:$FrontendPort/dashboard#research-assistant-lab"
}
if ($UseStaticFrontend -and $backendStarted) {
  Write-Host "Static UI: $backendBaseUrl/dashboard#research-assistant-lab"
}

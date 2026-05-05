param(
    [string]$BaseUrl = "http://127.0.0.1:8805/api",
    [switch]$SkipHttp
)

$ErrorActionPreference = "Stop"

$endpoints = @(
    "/alpha-trace/agent-runs/runtime/config",
    "/alpha-trace/agent-runs/runtime/model-providers",
    "/alpha-trace/agent-runs/runtime/tools",
    "/alpha-trace/agent-runs/runtime/integrations",
    "/alpha-trace/agent-runs/runtime/tasks",
    "/alpha-trace/agent-runs/runners/status",
    "/alpha-trace/agent-runs/runners/capabilities",
    "/alpha-trace/agent-runs/runners/adapter-matrix",
    "/alpha-trace/agent-runs/runners/flows",
    "/alpha-trace/agent-runs/runners/flows/alphatrace_native",
    "/alpha-trace/data-sources/api-catalog"
)

Write-Host "AlphaTrace abstraction endpoint smoke"
Write-Host "BaseUrl: $BaseUrl"
Write-Host "Endpoint count: $($endpoints.Count)"

if ($SkipHttp) {
    Write-Host "SkipHttp enabled; endpoint list syntax validated."
    exit 0
}

$failures = @()
foreach ($endpoint in $endpoints) {
    $url = "$BaseUrl$endpoint"
    try {
        $response = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 20
        if ($null -eq $response) {
            throw "empty response"
        }
        Write-Host "OK $endpoint"
    } catch {
        $message = $_.Exception.Message
        Write-Host "FAIL $endpoint :: $message"
        $failures += [pscustomobject]@{ endpoint = $endpoint; error = $message }
    }
}

if ($failures.Count -gt 0) {
    $failures | ConvertTo-Json -Depth 4
    throw "AlphaTrace abstraction endpoint smoke failed for $($failures.Count) endpoint(s)."
}

Write-Host "AlphaTrace abstraction endpoint smoke passed."

param(
  [string]$BaseUrl = "http://127.0.0.1:8805/api",
  [Parameter(Mandatory = $true)]
  [string]$RunId,
  [switch]$FailOnViolation
)

$ErrorActionPreference = "Stop"

$normalizedBaseUrl = $BaseUrl.TrimEnd("/")
$eventsUrl = "$normalizedBaseUrl/alpha-trace/agent-runs/$RunId/events"

try {
  $response = Invoke-RestMethod -Uri $eventsUrl -Method Get -TimeoutSec 20
  if ($response -is [array]) {
    $events = @($response | ForEach-Object { $_ })
  } elseif ($response.PSObject.Properties.Name -contains "events") {
    $events = @($response.events | ForEach-Object { $_ })
  } elseif ($response.PSObject.Properties.Name -contains "items") {
    $events = @($response.items | ForEach-Object { $_ })
  } else {
    $events = @($response)
  }
} catch {
  Write-Error "Failed to load runtime events for run $RunId from $eventsUrl. $($_.Exception.Message)"
  exit 1
}

$violations = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[object]

function Add-Issue {
  param(
    [string]$Severity,
    [object]$Event,
    [string]$Rule,
    [string]$Message
  )

  $issue = [pscustomobject]@{
    Severity = $Severity
    Sequence = $Event.sequence
    EventId = $Event.eventId
    Type = $Event.type
    Agent = $Event.agentName
    Rule = $Rule
    Message = $Message
  }

  if ($Severity -eq "violation") {
    $script:violations.Add($issue) | Out-Null
  } else {
    $script:warnings.Add($issue) | Out-Null
  }
}

function Has-Field {
  param([object]$Payload, [string]$Name)
  if ($null -eq $Payload -or -not ($Payload.PSObject.Properties.Name -contains $Name)) {
    return $false
  }
  $value = $Payload.$Name
  if ($null -eq $value) {
    return $false
  }
  if ($value -is [string]) {
    return $value.Trim() -ne ""
  }
  return $true
}

foreach ($event in $events) {
  $payload = $event.payload

  if ($event.type -eq "agent.run.started") {
    if (-not (Has-Field $payload "contractVersion")) {
      Add-Issue -Severity "warning" -Event $event -Rule "run_started_contract_version" -Message "agent.run.started should include payload.contractVersion."
    }
    if (-not (Has-Field $payload "dagNodes")) {
      Add-Issue -Severity "warning" -Event $event -Rule "run_started_dag_nodes" -Message "agent.run.started should include payload.dagNodes."
    } else {
      foreach ($node in @($payload.dagNodes)) {
        if (-not (Has-Field $node "stepId")) {
          Add-Issue -Severity "violation" -Event $event -Rule "dag_node_step_id" -Message "DAG node is missing stepId."
        }
        if (-not (Has-Field $node "dependsOn")) {
          Add-Issue -Severity "warning" -Event $event -Rule "dag_node_depends_on" -Message "DAG node is missing dependsOn."
        }
      }
    }
  }

  if ($event.type -in @("tool.called", "tool.result")) {
    foreach ($required in @("stepId", "progress", "toolName")) {
      if (-not (Has-Field $payload $required)) {
        Add-Issue -Severity "violation" -Event $event -Rule "tool_event_required_payload" -Message "$($event.type) is missing payload.$required."
      }
    }
  }

  if (Has-Field $payload "toolContract") {
    $contract = $payload.toolContract
    foreach ($required in @("toolName", "displayName", "category", "source", "authMode", "timeoutPolicy", "outputClass")) {
      if (-not (Has-Field $contract $required)) {
        Add-Issue -Severity "violation" -Event $event -Rule "tool_contract_required_payload" -Message "payload.toolContract is missing $required."
      }
    }
    if ((Has-Field $payload "toolName") -and (Has-Field $contract "toolName") -and "$($payload.toolName)" -ne "$($contract.toolName)") {
      Add-Issue -Severity "violation" -Event $event -Rule "tool_contract_name_match" -Message "payload.toolName does not match payload.toolContract.toolName."
    }
  }

  $stepAwareTypes = @("agent.started", "agent.completed", "agent.failed", "reasoning.chunk", "debate.message", "risk.warning", "report.generated", "decision.updated", "evidence.linked")
  if ($event.type -in $stepAwareTypes) {
    $hasContract = Has-Field $payload "contractVersion"
    $hasStep = Has-Field $payload "stepId"
    if ($hasContract -and -not $hasStep) {
      Add-Issue -Severity "violation" -Event $event -Rule "contracted_event_step_id" -Message "Contracted event is missing payload.stepId."
    } elseif (-not $hasStep -and $event.agentName -notin @("Qwen Output Mapper", "Evidence Validator", "Evidence Support Scorer")) {
      Add-Issue -Severity "warning" -Event $event -Rule "legacy_event_step_id" -Message "Step-aware event has no payload.stepId; this may be legacy mapper output."
    }

    if ($hasContract -and -not (Has-Field $payload "progress")) {
      Add-Issue -Severity "warning" -Event $event -Rule "contracted_event_progress" -Message "Contracted event should include payload.progress."
    }
  }
}

$summary = [pscustomobject]@{
  RunId = $RunId
  Events = $events.Count
  Violations = $violations.Count
  Warnings = $warnings.Count
}

Write-Output $summary

if ($violations.Count -gt 0) {
  Write-Output ""
  Write-Output "Violations:"
  $violations | Format-Table -AutoSize
}

if ($warnings.Count -gt 0) {
  Write-Output ""
  Write-Output "Warnings:"
  $warnings | Select-Object -First 30 | Format-Table -AutoSize
  if ($warnings.Count -gt 30) {
    Write-Output ("... {0} more warnings omitted" -f ($warnings.Count - 30))
  }
}

if ($FailOnViolation -and $violations.Count -gt 0) {
  exit 1
}

exit 0

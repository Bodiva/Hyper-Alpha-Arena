import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentRunProgressStep, AgentRunProgressSummary, AgentRunStepStatus } from "@/shared/lib/runtime-step-mapper";
import LiveAgentOutputPanel from "@/shared/ui/LiveAgentOutputPanel";

interface AgentRunProgressCardProps {
  progress: AgentRunProgressSummary;
  runStatus?: string;
  runtimeStatus?: string;
  className?: string;
}

const STEP_STATUS_LABEL: Record<AgentRunStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const STEP_STATUS_BADGE: Record<AgentRunStepStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

const StepRow = ({ step }: { step: AgentRunProgressStep }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 rounded border bg-background p-2">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{step.label}</p>
        {step.summary ? <p className="truncate text-muted-foreground">{step.summary}</p> : null}
      </div>
      <Badge variant={STEP_STATUS_BADGE[step.status]}>{STEP_STATUS_LABEL[step.status]}</Badge>
    </div>
    <LiveAgentOutputPanel step={step} />
  </div>
);

const AgentRunProgressCard = ({ progress, runStatus, runtimeStatus, className = "" }: AgentRunProgressCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const progressColor = progress.hasFailed ? "bg-destructive" : progress.percent >= 100 ? "bg-emerald-600" : "bg-blue-600";

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Agent Run Progress</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs">
              {runStatus ? <Badge variant={progress.hasFailed ? "destructive" : "outline"}>Run: {runStatus}</Badge> : null}
              {runtimeStatus ? <Badge variant={runtimeStatus === "ERROR" ? "destructive" : runtimeStatus === "RUNNING" ? "secondary" : "outline"}>Stream: {runtimeStatus}</Badge> : null}
              <Badge variant={progress.hasFailed ? "destructive" : progress.percent >= 100 ? "default" : "secondary"}>
                {progress.completedCount}/{progress.totalSteps} completed
              </Badge>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "收起详情" : "展开详情"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-foreground">{progress.percent}%</p>
            <p className="text-muted-foreground">当前步骤：{progress.currentStep}</p>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${Math.max(progress.percent, progress.percent > 0 ? 8 : 2)}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-muted-foreground">
          <p>最近完成：{progress.lastCompletedStep}</p>
          <p className="md:col-span-2 truncate">最新事件：{progress.latestEventText}</p>
        </div>

        {progress.hasFailed && progress.failureMessage ? (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            {progress.failureMessage}
          </div>
        ) : null}

        {expanded ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch gap-3">
            <div className="flex h-full flex-col space-y-2">
              <p className="font-medium">步骤状态</p>
              {progress.steps.map((step) => (
                <StepRow key={step.stepId} step={step} />
              ))}
            </div>
            <div className="flex h-full min-h-0 flex-col space-y-2">
              <p className="font-medium">最近事件</p>
              <div className="min-h-[24rem] flex-1 overflow-auto rounded border bg-muted/10 p-2">
                {progress.recentEvents.length ? (
                  <div className="space-y-2">
                    {progress.recentEvents.slice(0, 20).map((event) => (
                      <div key={event.eventId} className="rounded border bg-background p-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline">{event.type}</Badge>
                          <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{event.agentName ? `${event.agentName}: ` : ""}{event.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无 runtime event。</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default AgentRunProgressCard;


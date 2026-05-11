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
  pending: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
};

const STEP_STATUS_BADGE: Record<AgentRunStepStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

const RUNTIME_STATUS_LABEL: Record<string, string> = {
  IDLE: "就绪",
  QUEUED: "等待中",
  RUNNING: "运行中",
  COMPLETED: "已完成",
  STOPPED: "已停止",
  ERROR: "错误",
  FAILED: "失败",
};

const RUNTIME_EVENT_TYPE_LABEL: Record<string, string> = {
  "agent.run.started": "任务开始",
  "agent.run.completed": "任务完成",
  "agent.run.failed": "任务失败",
  "agent.started": "Agent 开始",
  "agent.completed": "Agent 完成",
  "agent.failed": "Agent 失败",
  "tool.called": "工具调用",
  "tool.result": "工具结果",
  "reasoning.chunk": "推理输出",
  "report.generated": "报告生成",
  "debate.message": "观点讨论",
  "risk.warning": "风险提示",
  "decision.updated": "决策更新",
  "evidence.linked": "证据关联",
  "metric.updated": "指标更新",
  "live.output": "实时输出",
  "metric.updated.summary": "指标汇总",
};

const AGENT_NAME_LABEL: Record<string, string> = {
  System: "系统",
  "Market Analyst": "市场分析员",
  "Bull Researcher": "正方研究员",
  "Bear Researcher": "反方研究员",
  "Research Manager": "研究经理",
  "Risk Manager": "风险经理",
  "Portfolio Manager": "组合经理",
  Trader: "交易观点",
};

const formatRuntimeStatus = (status: string): string => RUNTIME_STATUS_LABEL[status] ?? status;
const formatRuntimeEventType = (type: string): string => RUNTIME_EVENT_TYPE_LABEL[type] ?? type;
const formatAgentName = (name?: string): string => (name ? AGENT_NAME_LABEL[name] ?? name : "");

const stepProgress = (step: AgentRunProgressStep): number => {
  const value = step.status === "completed" ? 100 : step.status === "pending" ? 0 : Math.max(step.progress ?? 10, step.status === "failed" ? 100 : 10);
  return Math.max(0, Math.min(100, Math.round(value)));
};

const StepRow = ({ step }: { step: AgentRunProgressStep }) => (
  <div className="space-y-2">
    <div className="rounded border bg-background p-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{step.label}</p>
          {step.summary ? <p className="truncate text-muted-foreground">{step.summary}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{stepProgress(step)}%</Badge>
          <Badge variant={STEP_STATUS_BADGE[step.status]}>{STEP_STATUS_LABEL[step.status]}</Badge>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${step.status === "failed" ? "bg-destructive" : step.status === "completed" ? "bg-emerald-600" : "bg-blue-600"}`}
          style={{ width: `${Math.max(stepProgress(step), step.status === "pending" ? 0 : 6)}%` }}
        />
      </div>
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
            <CardTitle className="text-base">任务运行进度</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs">
              {runStatus ? <Badge variant={progress.hasFailed ? "destructive" : "outline"}>任务：{runStatus}</Badge> : null}
              {runtimeStatus ? <Badge variant={runtimeStatus === "ERROR" ? "destructive" : runtimeStatus === "RUNNING" ? "secondary" : "outline"}>事件流：{formatRuntimeStatus(runtimeStatus)}</Badge> : null}
              <Badge variant={progress.hasFailed ? "destructive" : progress.percent >= 100 ? "default" : "secondary"}>
                已完成 {progress.completedCount}/{progress.totalSteps}
              </Badge>
              <Badge variant={progress.hasFailed ? "destructive" : progress.percent >= 100 ? "default" : "secondary"}>
                进度 {progress.percent}%
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
            <p className="font-medium text-foreground">整体进度 {progress.percent}%</p>
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
                          <Badge variant="outline">{formatRuntimeEventType(event.type)}</Badge>
                          <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{event.agentName ? `${formatAgentName(event.agentName)}：` : ""}{event.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无运行事件。</p>
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


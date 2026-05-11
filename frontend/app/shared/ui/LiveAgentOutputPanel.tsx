import { Badge } from "@/components/ui/badge";
import type { AgentRunProgressStep } from "@/shared/lib/runtime-step-mapper";
import StructuredReportView from "@/shared/ui/StructuredReportView";

interface LiveAgentOutputPanelProps {
  step: AgentRunProgressStep;
}

const STATUS_LABEL: Record<AgentRunProgressStep["status"], string> = {
  pending: "等待中",
  running: "输出中",
  completed: "已完成",
  failed: "失败",
};

const STATUS_VARIANT: Record<AgentRunProgressStep["status"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

const WAITING_TEXT: Record<AgentRunProgressStep["stepId"], string> = {
  evidence_retrieval: "等待证据检索开始。",
  market_view: "等待证据检索完成后生成市场观点。",
  bull_view: "等待市场观点完成，正方观点启动后会在这里实时输出。",
  bear_view: "等待市场观点完成，反方观点启动后会在这里实时输出。",
  risk_review: "等待正方 / 反方逻辑评审完成。",
  final_decision: "等待风险复核完成。",
};

const RUNNING_TEXT: Record<AgentRunProgressStep["stepId"], string> = {
  evidence_retrieval: "证据检索已开始，正在等待检索结果。",
  market_view: "市场分析员已开始，正在等待模型输出。",
  bull_view: "正方研究员已进入并行评审，正在等待模型输出。",
  bear_view: "反方研究员已进入并行评审，正在等待模型输出。",
  risk_review: "风险分析员已开始，正在等待风险复核输出。",
  final_decision: "组合经理已开始，正在等待最终决策输出。",
};

const getFallbackText = (step: AgentRunProgressStep): string => {
  if (step.status === "failed") return step.summary ?? `${step.label}失败。`;
  if (step.status === "completed") return step.summary ?? `${step.label}已完成。`;
  if (step.status === "running") return step.summary ? `${step.summary}\n${RUNNING_TEXT[step.stepId]}` : RUNNING_TEXT[step.stepId];
  return WAITING_TEXT[step.stepId];
};

const LiveAgentOutputPanel = ({ step }: LiveAgentOutputPanelProps) => {
  const hasOutput = Boolean(step.liveOutput?.trim());
  const fallbackText = getFallbackText(step);
  return (
    <div className="rounded border bg-background p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{step.label}</p>
          <p className="truncate text-muted-foreground">{step.summary ?? "等待实时输出"}</p>
        </div>
        <Badge variant={STATUS_VARIANT[step.status]}>{STATUS_LABEL[step.status]}</Badge>
      </div>
      <div className="max-h-44 overflow-auto rounded bg-muted/30 p-2">
        {hasOutput ? (
          <StructuredReportView text={step.liveOutput} compact />
        ) : (
          <StructuredReportView text={fallbackText} compact />
        )}
      </div>
    </div>
  );
};

export default LiveAgentOutputPanel;

import { Badge } from "@/components/ui/badge";
import type { AgentRunProgressStep } from "@/shared/lib/runtime-step-mapper";
import StructuredReportView from "@/shared/ui/StructuredReportView";

interface LiveAgentOutputPanelProps {
  step: AgentRunProgressStep;
}

const STATUS_LABEL: Record<AgentRunProgressStep["status"], string> = {
  pending: "waiting",
  running: "streaming",
  completed: "completed",
  failed: "failed",
};

const STATUS_VARIANT: Record<AgentRunProgressStep["status"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

const WAITING_TEXT: Record<AgentRunProgressStep["stepId"], string> = {
  evidence_retrieval: "Waiting for evidence retrieval to start.",
  market_view: "Waiting for retrieved evidence before Market View.",
  bull_view: "Waiting for Market View. Bull track will stream here when it starts.",
  bear_view: "Waiting for Market View. Bear track will stream here when it starts.",
  risk_review: "Blocked until Bull / Bear logical tracks finish.",
  final_decision: "Blocked until Risk Review finishes.",
};

const RUNNING_TEXT: Record<AgentRunProgressStep["stepId"], string> = {
  evidence_retrieval: "Evidence retrieval has started. Waiting for retrieval result.",
  market_view: "Market Analyst has started. Waiting for model output chunks.",
  bull_view: "Bull Researcher has started on the parallel review track. Waiting for model output chunks.",
  bear_view: "Bear Researcher has started on the parallel review track. Waiting for model output chunks.",
  risk_review: "Risk Analyst has started. Waiting for risk review output chunks.",
  final_decision: "Portfolio Manager has started. Waiting for final decision output.",
};

const getFallbackText = (step: AgentRunProgressStep): string => {
  if (step.status === "failed") return step.summary ?? `${step.label} failed.`;
  if (step.status === "completed") return step.summary ?? `${step.label} completed.`;
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
          <p className="truncate text-muted-foreground">{step.summary ?? "Waiting for stream"}</p>
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

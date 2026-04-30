import { Badge } from "@/components/ui/badge";
import type { AgentStatus } from "@/entities/agent/model";
import type { AgentExecutionProgress } from "@/shared/lib/agent-progress";

interface AgentProgressCardProps {
  item: AgentExecutionProgress;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE: "等待中",
  RUNNING: "进行中",
  COMPLETED: "已完成",
  FAILED: "失败",
};

const STATUS_BADGE: Record<AgentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  IDLE: "outline",
  RUNNING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
};

const progressColor = (status: AgentStatus): string => {
  if (status === "FAILED") return "bg-destructive";
  if (status === "COMPLETED") return "bg-emerald-600";
  if (status === "RUNNING") return "bg-blue-600";
  return "bg-muted-foreground/40";
};

const NODE_LABEL: Record<string, string> = {
  evidence_retrieval: "Evidence Retrieval",
  market_view: "Market View",
  bull_view: "Bull View",
  bear_view: "Bear View",
  risk_review: "Risk Review",
  final_decision: "Final Decision",
};

const AgentProgressCard = ({ item }: AgentProgressCardProps) => {
  return (
    <div className="rounded border bg-background p-2 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.agent.name}</p>
          <p className="truncate text-muted-foreground">{item.currentStep}</p>
        </div>
        <Badge variant={item.blocked ? "outline" : STATUS_BADGE[item.status]}>
          {item.blocked ? "blocked" : STATUS_LABEL[item.status]}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline">{NODE_LABEL[item.nodeId] ?? item.nodeId}</Badge>
        <Badge variant={item.trackLabel === "Parallel Review Track" ? "secondary" : "outline"}>{item.trackLabel}</Badge>
        {item.isLiveOutput ? <Badge variant="secondary">streaming</Badge> : null}
        {item.dependsOn.length ? (
          <span className="text-[11px] text-muted-foreground">
            depends on {item.dependsOn.map((nodeId) => NODE_LABEL[nodeId] ?? nodeId).join(" + ")}
          </span>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>进度</span>
          <span>{item.progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressColor(item.status)}`} style={{ width: `${Math.max(item.progress, item.progress > 0 ? 6 : 2)}%` }} />
        </div>
      </div>

      <div className="rounded bg-muted/30 p-2 text-[11px] text-muted-foreground">
        <p className="truncate">
          {item.blocked
            ? "等待上游节点完成"
            : item.isLiveOutput
              ? "正在接收输出，正文见 Agent Debate Panel / Report 区域"
              : item.progress >= 100
                ? "输出已归档到 Report / Decision 区域"
                : "等待该 Agent 的运行事件"}
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">报告: {item.reportCount}</p>
    </div>
  );
};

export default AgentProgressCard;


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
  evidence_retrieval: "证据检索",
  market_view: "市场观点",
  bull_view: "正方观点",
  bear_view: "反方观点",
  risk_review: "风险复核",
  final_decision: "最终决策",
};

const TRACK_LABEL: Record<string, string> = {
  "Parallel Review Track": "并行评审",
  "After Bull / Bear": "正反观点之后",
  "After Risk Review": "风险复核之后",
  "Logical Agent Flow": "逻辑执行链",
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
          {item.blocked ? "等待上游" : STATUS_LABEL[item.status]}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline">{NODE_LABEL[item.nodeId] ?? item.nodeId}</Badge>
        <Badge variant={item.trackLabel === "Parallel Review Track" ? "secondary" : "outline"}>
          {TRACK_LABEL[item.trackLabel] ?? item.trackLabel}
        </Badge>
        {item.isLiveOutput ? <Badge variant="secondary">实时输出</Badge> : null}
        {item.dependsOn.length ? (
          <span className="text-[11px] text-muted-foreground">
            依赖 {item.dependsOn.map((nodeId) => NODE_LABEL[nodeId] ?? nodeId).join(" + ")}
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
              ? "正在接收输出，正文见观点面板或报告区域"
              : item.progress >= 100
                ? "输出已归档到报告或决策区域"
                : "等待该 Agent 的运行事件"}
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">报告: {item.reportCount}</p>
    </div>
  );
};

export default AgentProgressCard;


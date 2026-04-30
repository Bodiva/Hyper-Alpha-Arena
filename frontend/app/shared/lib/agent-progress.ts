import type { Agent, AgentEvent, AgentReport, AgentRun } from "@/entities/agent/model";
import type { AgentRuntimeEvent } from "@/entities/agent/runtime-events";

export interface AgentExecutionProgress {
  agent: Agent;
  status: Agent["status"];
  progress: number;
  nodeId: AgentFlowNodeId;
  dependsOn: AgentFlowNodeId[];
  blocked: boolean;
  trackLabel: string;
  currentStep: string;
  latestSummaryMarkdown: string;
  isLiveOutput: boolean;
  reportCount: number;
  hasFailure: boolean;
}

export type AgentFlowNodeId =
  | "evidence_retrieval"
  | "market_view"
  | "bull_view"
  | "bear_view"
  | "risk_review"
  | "final_decision";

const FLOW_DEPENDENCIES: Record<AgentFlowNodeId, AgentFlowNodeId[]> = {
  evidence_retrieval: [],
  market_view: ["evidence_retrieval"],
  bull_view: ["market_view"],
  bear_view: ["market_view"],
  risk_review: ["bull_view", "bear_view"],
  final_decision: ["risk_review"],
};

const normalize = (value: unknown): string => String(value ?? "").toLowerCase();

const payloadRecord = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) return event.payload as Record<string, unknown>;
  return {};
};

const payloadText = (event: AgentRuntimeEvent): string => {
  const payload = payloadRecord(event);
  return [payload.toolName, payload.title, payload.summary, payload.content, payload.error]
    .filter(Boolean)
    .map(String)
    .join(" ");
};

const eventMatchesAgent = (event: AgentRuntimeEvent, agent: Agent): boolean => {
  const agentName = normalize(agent.name);
  const agentRole = normalize(agent.role);
  const text = normalize(`${event.agentName ?? ""} ${payloadText(event)} ${event.type}`);

  if (event.agentId && event.agentId === agent.agentId) return true;
  if (event.agentName && normalize(event.agentName) === agentName) return true;

  if (agentName.includes("market") || agentRole.includes("market")) return text.includes("market view") || text.includes("market analyst");
  if (agentName.includes("bull") || agentRole.includes("bull")) return text.includes("bull view") || text.includes("bull researcher") || text.includes("stance bull");
  if (agentName.includes("bear") || agentRole.includes("bear")) return text.includes("bear view") || text.includes("bear researcher") || text.includes("stance bear");
  if (agentName.includes("risk") || agentRole.includes("risk")) return text.includes("risk review") || text.includes("risk analyst") || event.type === "risk.warning";
  if (agentName.includes("portfolio") || agentRole.includes("portfolio")) return text.includes("final decision") || text.includes("portfolio manager") || event.type === "decision.updated" || event.type === "agent.run.completed";

  return false;
};

const reportMatchesAgent = (report: AgentReport, agent: Agent): boolean => {
  const text = normalize(`${report.agentId} ${report.agentName} ${report.title} ${report.summary}`);
  const agentName = normalize(agent.name);
  const agentRole = normalize(agent.role);

  if (report.agentId === agent.agentId) return true;
  if (text.includes(agentName)) return true;
  if (agentName.includes("market") || agentRole.includes("market")) return text.includes("market view");
  if (agentName.includes("bull") || agentRole.includes("bull")) return text.includes("bull view");
  if (agentName.includes("bear") || agentRole.includes("bear")) return text.includes("bear view");
  if (agentName.includes("risk") || agentRole.includes("risk")) return text.includes("risk review");
  return false;
};

const summarizeAgentEvent = (event: AgentEvent): string => {
  switch (event.type) {
    case "tool.called":
      return `正在调用工具：\`${event.toolName}\``;
    case "tool.result":
      return `工具返回：${event.summary}`;
    case "reasoning.chunk":
      return event.content;
    case "report.generated":
      return `已生成报告：**${event.title}**`;
    case "debate.message":
      return event.content;
    case "risk.warning":
      return `**${event.level} risk**\n\n${event.content}`;
    case "decision.updated":
      return `决策已更新，置信度 ${Math.round(event.confidence * 100)}%。`;
    case "agent.started":
      return "Agent 已开始运行。";
    case "agent.completed":
      return "Agent 已完成。";
    case "agent.failed":
      return `Agent 失败：${event.error}`;
    default:
      return "Agent event updated.";
  }
};

const summarizeRuntimeEvent = (event: AgentRuntimeEvent): string => {
  const payload = payloadRecord(event);
  if (typeof payload.content === "string") return payload.content;
  if (typeof payload.summary === "string") return payload.summary;
  if (typeof payload.title === "string") return `已生成报告：**${payload.title}**`;
  if (typeof payload.error === "string") return `运行失败：${payload.error}`;
  if (typeof payload.toolName === "string") return event.type === "tool.called" ? `正在调用工具：\`${payload.toolName}\`` : `工具返回：\`${payload.toolName}\``;
  return event.type;
};

const inferBaseStep = (agent: Agent): string => {
  const name = normalize(agent.name);
  const role = normalize(agent.role);
  if (name.includes("market") || role.includes("market")) return "等待 Market View";
  if (name.includes("bull") || role.includes("bull")) return "等待 Bull View 并行评审";
  if (name.includes("bear") || role.includes("bear")) return "等待 Bear View 并行评审";
  if (name.includes("risk") || role.includes("risk")) return "等待 Risk Review";
  if (name.includes("portfolio") || role.includes("portfolio")) return "等待 Final Decision";
  return "等待执行";
};

const inferNodeId = (agent: Agent): AgentFlowNodeId => {
  const text = normalize(`${agent.name} ${agent.role}`);
  if (text.includes("bull")) return "bull_view";
  if (text.includes("bear")) return "bear_view";
  if (text.includes("risk")) return "risk_review";
  if (text.includes("portfolio")) return "final_decision";
  return "market_view";
};

const inferTrackLabel = (nodeId: AgentFlowNodeId): string => {
  if (nodeId === "bull_view" || nodeId === "bear_view") return "Parallel Review Track";
  if (nodeId === "risk_review") return "After Bull / Bear";
  if (nodeId === "final_decision") return "After Risk Review";
  return "Logical Agent Flow";
};

const waitingSummaryForNode = (nodeId: AgentFlowNodeId): string => {
  switch (nodeId) {
    case "bull_view":
      return "**Bull Researcher 已在 Agent Panel 中预备。**\n\n- 等待 Market View 完成后进入 Parallel Review Track\n- 启动后会在这里显示 Bull View 的实时输出\n- 当前不声称 TradingAgents 真实并行，仅展示 AlphaTrace 逻辑 DAG";
    case "bear_view":
      return "**Bear Researcher 已在 Agent Panel 中预备。**\n\n- 等待 Market View 完成后进入 Parallel Review Track\n- 启动后会在这里显示 Bear View 的实时输出\n- 当前不声称 TradingAgents 真实并行，仅展示 AlphaTrace 逻辑 DAG";
    case "risk_review":
      return "等待 Bull / Bear 两条逻辑评审轨道完成后进入 Risk Review。";
    case "final_decision":
      return "等待 Risk Review 完成后，由 Portfolio Manager 汇总形成 Final Decision。";
    case "market_view":
      return "等待 Evidence Retrieval 完成后进入 Market View。";
    case "evidence_retrieval":
      return "准备检索与本次 Agent Run 相关的证据。";
    default:
      return "等待上游步骤完成。";
  }
};

const queuedSummaryForNode = (nodeId: AgentFlowNodeId): string => {
  switch (nodeId) {
    case "bull_view":
      return "**Bull Researcher 已进入并行评审队列。**\n\n- Market View 已完成或正在交接\n- 正在等待 `qwen.bull_view` 输出首段内容\n- 输出到达后会替换为实时 Bull View";
    case "bear_view":
      return "**Bear Researcher 已进入并行评审队列。**\n\n- Market View 已完成或正在交接\n- 正在等待 `qwen.bear_view` 输出首段内容\n- 输出到达后会替换为实时 Bear View";
    case "risk_review":
      return "Risk Analyst 已进入队列，等待 Bull / Bear 结果汇总。";
    case "final_decision":
      return "Portfolio Manager 已进入队列，等待 Risk Review 结果。";
    case "market_view":
      return "Market Analyst 已进入队列，等待 `qwen.market_view` 输出。";
    case "evidence_retrieval":
      return "Evidence Retrieval 已进入队列，等待检索结果。";
    default:
      return "Agent 已进入执行队列。";
  }
};

const inferRunningStep = (agent: Agent, latestText: string): string => {
  const text = normalize(`${agent.name} ${agent.role} ${latestText}`);
  if (text.includes("market")) return "正在生成 Market View";
  if (text.includes("bull")) return "正在生成 Bull View";
  if (text.includes("bear")) return "正在生成 Bear View";
  if (text.includes("risk")) return "正在执行 Risk Review";
  if (text.includes("decision") || text.includes("portfolio") || text.includes("建议")) return "正在形成 Final Decision";
  if (text.includes("evidence")) return "正在提取证据";
  return "正在执行 Agent 任务";
};

const inferCompletedStep = (agent: Agent): string => {
  const text = normalize(`${agent.name} ${agent.role}`);
  if (text.includes("market")) return "已完成 Market View";
  if (text.includes("bull")) return "已完成 Bull View";
  if (text.includes("bear")) return "已完成 Bear View";
  if (text.includes("risk")) return "已完成 Risk Review";
  if (text.includes("portfolio")) return "已完成 Final Decision";
  return "已完成";
};

const progressFromRuntimeEvents = (agent: Agent, events: AgentRuntimeEvent[], reports: AgentReport[]): number => {
  const matching = events.filter((event) => eventMatchesAgent(event, agent));
  const text = normalize(matching.map((event) => `${event.type} ${payloadText(event)}`).join(" "));
  const hasReport = reports.some((report) => reportMatchesAgent(report, agent));

  if (matching.some((event) => event.type === "agent.failed" || event.type === "agent.run.failed")) return 100;
  if (matching.some((event) => event.type === "agent.completed" || event.type === "agent.run.completed") || hasReport) return 100;
  if (matching.some((event) => event.type === "decision.updated")) return 85;
  if (matching.some((event) => event.type === "report.generated")) return 90;
  if (matching.some((event) => event.type === "risk.warning" || event.type === "debate.message")) return 75;
  if (text.includes("tool.result")) return 65;
  if (text.includes("tool.called") || matching.some((event) => event.type === "reasoning.chunk")) return 45 + Math.min(matching.length * 4, 30);
  if (matching.some((event) => event.type === "agent.started")) return 15;
  return 0;
};

const streamingTextForNode = (events: AgentRuntimeEvent[], nodeId: AgentFlowNodeId): string => {
  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((event) => {
      if (event.type !== "reasoning.chunk") return false;
      const payload = payloadRecord(event);
      return payload.streaming === true && payload.stepId === nodeId && typeof payload.content === "string";
    })
    .map((event) => String(payloadRecord(event).content ?? ""))
    .join("");
};

const hasPendingFinalDecision = (run: AgentRun): boolean => {
  return run.finalDecision.confidence <= 0 && normalize(run.finalDecision.thesis).includes("still executing");
};

export const buildAgentExecutionProgress = ({ run, runtimeEvents }: { run: AgentRun; runtimeEvents: AgentRuntimeEvent[] }): AgentExecutionProgress[] => {
  const baseItems = run.agents.map((agent) => {
    const nodeId = inferNodeId(agent);
    const matchingRuntimeEvents = runtimeEvents.filter((event) => eventMatchesAgent(event, agent));
    const matchingRunEvents = run.events.filter((event) => "agentId" in event && event.agentId === agent.agentId);
    const matchingReports = run.reports.filter((report) => reportMatchesAgent(report, agent));
    const latestRuntimeEvent = [...matchingRuntimeEvents].sort((a, b) => b.sequence - a.sequence)[0];
    const latestRunEvent = [...matchingRunEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const latestReport = [...matchingReports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const hasFailure = agent.status === "FAILED" || matchingRuntimeEvents.some((event) => event.type === "agent.failed" || event.type === "agent.run.failed") || matchingRunEvents.some((event) => event.type === "agent.failed");
    const liveOutput = streamingTextForNode(runtimeEvents, nodeId);

    let progress = Math.max(
      progressFromRuntimeEvents(agent, runtimeEvents, run.reports),
      agent.status === "COMPLETED" ? 100 : agent.status === "FAILED" ? 100 : agent.status === "RUNNING" ? 40 : 0,
    );

    if (run.status === "COMPLETED" && agent.status === "RUNNING") progress = Math.max(progress, 100);

    const finalDecisionSummary = nodeId === "final_decision" && !hasPendingFinalDecision(run) ? run.finalDecision.thesis : "";
    const isRunningLive = Boolean(liveOutput.trim()) && progress < 100;
    const latestSummaryMarkdown = isRunningLive
      ? liveOutput
      : latestReport
        ? latestReport.summary
        : finalDecisionSummary
          ? finalDecisionSummary
          : liveOutput.trim()
            ? liveOutput
            : latestRuntimeEvent
              ? summarizeRuntimeEvent(latestRuntimeEvent)
              : latestRunEvent
                ? summarizeAgentEvent(latestRunEvent)
                : progress > 0 || agent.status === "RUNNING"
                  ? queuedSummaryForNode(nodeId)
                  : waitingSummaryForNode(nodeId);

    const status = hasFailure ? "FAILED" : progress >= 100 ? "COMPLETED" : agent.status;
    const currentStep = hasFailure
      ? "执行失败"
      : progress >= 100
        ? inferCompletedStep(agent)
        : progress > 0
          ? inferRunningStep(agent, latestSummaryMarkdown)
          : inferBaseStep(agent);

    return {
      agent: { ...agent, status },
      status,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      nodeId,
      dependsOn: FLOW_DEPENDENCIES[nodeId],
      blocked: false,
      trackLabel: inferTrackLabel(nodeId),
      currentStep,
      latestSummaryMarkdown,
      isLiveOutput: isRunningLive,
      reportCount: matchingReports.length,
      hasFailure,
    };
  });

  const progressByNode = new Map<AgentFlowNodeId, number>();
  baseItems.forEach((item) => {
    progressByNode.set(item.nodeId, Math.max(progressByNode.get(item.nodeId) ?? 0, item.progress));
  });

  const evidenceDone = runtimeEvents.some((event) => {
    const text = normalize(`${event.type} ${payloadText(event)}`);
    return (event.type === "tool.result" || event.type === "evidence.linked") && text.includes("evidence");
  });
  progressByNode.set("evidence_retrieval", evidenceDone ? 100 : progressByNode.get("evidence_retrieval") ?? 0);

  return baseItems.map((item) => {
    const blocked = item.dependsOn.some((nodeId) => (progressByNode.get(nodeId) ?? 0) < 100);
    if (!blocked) return item;
    return {
      ...item,
      status: item.status === "COMPLETED" ? item.status : "IDLE",
      currentStep: `Waiting for ${item.dependsOn.join(" + ")}`,
      isLiveOutput: false,
      blocked: true,
      latestSummaryMarkdown: waitingSummaryForNode(item.nodeId),
    };
  });
};

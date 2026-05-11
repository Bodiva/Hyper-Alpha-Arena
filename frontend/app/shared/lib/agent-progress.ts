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
  | "research_manager"
  | "risk_review"
  | "final_decision";

const FLOW_DEPENDENCIES: Record<AgentFlowNodeId, AgentFlowNodeId[]> = {
  evidence_retrieval: [],
  market_view: ["evidence_retrieval"],
  bull_view: ["market_view"],
  bear_view: ["market_view"],
  research_manager: ["bull_view", "bear_view"],
  risk_review: ["research_manager"],
  final_decision: ["risk_review"],
};

const normalize = (value: unknown): string => String(value ?? "").toLowerCase().replace(/[_-]+/g, " ");

const payloadRecord = (event: AgentRuntimeEvent): Record<string, unknown> => {
  if (typeof event.payload === "object" && event.payload !== null) return event.payload as Record<string, unknown>;
  return {};
};

const payloadText = (event: AgentRuntimeEvent): string => {
  const payload = payloadRecord(event);
  return [payload.stepId, payload.sectionHint, payload.toolName, payload.title, payload.summary, payload.content, payload.error]
    .filter(Boolean)
    .map(String)
    .join(" ");
};

const eventStepId = (event: AgentRuntimeEvent): AgentFlowNodeId | undefined => {
  const payload = payloadRecord(event);
  const step = normalize(payload.stepId ?? payload.sectionHint);
  if (step.includes("evidence retrieval")) return "evidence_retrieval";
  if (step.includes("market view")) return "market_view";
  if (step.includes("bull view")) return "bull_view";
  if (step.includes("bear view")) return "bear_view";
  if (step.includes("research manager")) return "research_manager";
  if (step.includes("risk review")) return "risk_review";
  if (step.includes("final decision")) return "final_decision";
  return undefined;
};

const eventProgress = (event: AgentRuntimeEvent): number | undefined => {
  const progress = payloadRecord(event).progress;
  return typeof progress === "number" && Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : undefined;
};

const eventMatchesAgent = (event: AgentRuntimeEvent, agent: Agent): boolean => {
  const agentName = normalize(agent.name);
  const agentRole = normalize(agent.role);
  const nodeId = inferNodeId(agent);
  const text = normalize(`${event.agentName ?? ""} ${payloadText(event)} ${event.type}`);

  if (event.agentId && event.agentId === agent.agentId) return true;
  if (event.agentName && normalize(event.agentName) === agentName) return true;
  if (eventStepId(event) === nodeId) return true;

  if (agentName.includes("market") || agentRole.includes("market")) return text.includes("market view") || text.includes("market analyst");
  if (agentName.includes("bull") || agentRole.includes("bull")) return text.includes("bull view") || text.includes("bull researcher") || text.includes("stance bull");
  if (agentName.includes("bear") || agentRole.includes("bear")) return text.includes("bear view") || text.includes("bear researcher") || text.includes("stance bear");
  if (agentName.includes("research manager") || agentRole.includes("research manager")) return text.includes("research manager");
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
  if (agentName.includes("research manager") || agentRole.includes("research manager")) return text.includes("research manager");
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
      return `**${event.level} 风险**\n\n${event.content}`;
    case "decision.updated":
      return `决策已更新，置信度 ${Math.round(event.confidence * 100)}%。`;
    case "agent.started":
      return "Agent 已开始运行。";
    case "agent.completed":
      return "Agent 已完成。";
    case "agent.failed":
      return `Agent 失败：${event.error}`;
    default:
      return "Agent 事件已更新。";
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
  if (name.includes("market") || role.includes("market")) return "等待市场观点";
  if (name.includes("bull") || role.includes("bull")) return "等待正方并行评审";
  if (name.includes("bear") || role.includes("bear")) return "等待反方并行评审";
  if (name.includes("research manager") || role.includes("research manager")) return "等待研究归纳";
  if (name.includes("risk") || role.includes("risk")) return "等待风险复核";
  if (name.includes("portfolio") || role.includes("portfolio")) return "等待最终决策";
  return "等待执行";
};

const inferNodeId = (agent: Agent): AgentFlowNodeId => {
  const text = normalize(`${agent.name} ${agent.role}`);
  if (text.includes("bull")) return "bull_view";
  if (text.includes("bear")) return "bear_view";
  if (text.includes("research manager")) return "research_manager";
  if (text.includes("risk")) return "risk_review";
  if (text.includes("portfolio")) return "final_decision";
  return "market_view";
};

const inferTrackLabel = (nodeId: AgentFlowNodeId): string => {
  if (nodeId === "bull_view" || nodeId === "bear_view") return "Parallel Review Track";
  if (nodeId === "research_manager") return "After Bull / Bear";
  if (nodeId === "risk_review") return "After Bull / Bear";
  if (nodeId === "final_decision") return "After Risk Review";
  return "Logical Agent Flow";
};

const waitingSummaryForNode = (nodeId: AgentFlowNodeId): string => {
  switch (nodeId) {
    case "bull_view":
      return "**正方研究员已准备。**\n\n- 等待市场观点完成后进入并行评审\n- 启动后会在这里显示正方观点的实时输出\n- 当前展示 AlphaTrace 逻辑 DAG";
    case "bear_view":
      return "**反方研究员已准备。**\n\n- 等待市场观点完成后进入并行评审\n- 启动后会在这里显示反方观点的实时输出\n- 当前展示 AlphaTrace 逻辑 DAG";
    case "risk_review":
      return "等待研究经理完成观点收敛后进入风险复核。";
    case "research_manager":
      return "等待正方 / 反方两条逻辑评审轨道完成后进入风险复核。";
    case "final_decision":
      return "等待风险复核完成后，由组合经理汇总形成最终决策。";
    case "market_view":
      return "等待证据检索完成后进入市场观点。";
    case "evidence_retrieval":
      return "准备检索与本次 Agent Run 相关的证据。";
    default:
      return "等待上游步骤完成。";
  }
};

const queuedSummaryForNode = (nodeId: AgentFlowNodeId): string => {
  switch (nodeId) {
    case "bull_view":
      return "**正方研究员已进入并行评审队列。**\n\n- 市场观点已完成或正在交接\n- 正在等待 `qwen.bull_view` 输出首段内容\n- 输出到达后会替换为实时正方观点";
    case "bear_view":
      return "**反方研究员已进入并行评审队列。**\n\n- 市场观点已完成或正在交接\n- 正在等待 `qwen.bear_view` 输出首段内容\n- 输出到达后会替换为实时反方观点";
    case "risk_review":
      return "风险分析员已进入队列，等待研究归纳结果。";
    case "research_manager":
      return "研究经理已进入队列，等待正方 / 反方结果汇总。";
    case "final_decision":
      return "组合经理已进入队列，等待风险复核结果。";
    case "market_view":
      return "市场分析员已进入队列，等待 `qwen.market_view` 输出。";
    case "evidence_retrieval":
      return "证据检索已进入队列，等待检索结果。";
    default:
      return "Agent 已进入执行队列。";
  }
};

const inferRunningStep = (agent: Agent, latestText: string): string => {
  const text = normalize(`${agent.name} ${agent.role} ${latestText}`);
  if (text.includes("market")) return "正在生成市场观点";
  if (text.includes("bull")) return "正在生成正方观点";
  if (text.includes("bear")) return "正在生成反方观点";
  if (text.includes("research manager")) return "正在归纳研究分歧";
  if (text.includes("risk")) return "正在执行风险复核";
  if (text.includes("decision") || text.includes("portfolio") || text.includes("建议")) return "正在形成最终决策";
  if (text.includes("evidence")) return "正在提取证据";
  return "正在执行 Agent 任务";
};

const inferCompletedStep = (agent: Agent): string => {
  const text = normalize(`${agent.name} ${agent.role}`);
  if (text.includes("market")) return "已完成市场观点";
  if (text.includes("bull")) return "已完成正方观点";
  if (text.includes("bear")) return "已完成反方观点";
  if (text.includes("research manager")) return "已完成研究归纳";
  if (text.includes("risk")) return "已完成风险复核";
  if (text.includes("portfolio")) return "已完成最终决策";
  return "已完成";
};

const progressFromRuntimeEvents = (agent: Agent, events: AgentRuntimeEvent[], reports: AgentReport[]): number => {
  const matching = events.filter((event) => eventMatchesAgent(event, agent));
  const text = normalize(matching.map((event) => `${event.type} ${payloadText(event)}`).join(" "));
  const hasReport = reports.some((report) => reportMatchesAgent(report, agent));
  const maxPayloadProgress = Math.max(0, ...matching.map((event) => eventProgress(event) ?? 0));

  if (matching.some((event) => event.type === "agent.failed" || event.type === "agent.run.failed")) return 100;
  if (matching.some((event) => event.type === "agent.completed" || event.type === "agent.run.completed") || hasReport) return 100;
  if (matching.some((event) => event.type === "decision.updated")) return 85;
  if (matching.some((event) => event.type === "report.generated")) return 90;
  if (matching.some((event) => event.type === "risk.warning" || event.type === "debate.message")) return 75;
  if (maxPayloadProgress > 0) return maxPayloadProgress;
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

    const runtimeProgress = progressFromRuntimeEvents(agent, runtimeEvents, run.reports);
    let progress = Math.max(
      runtimeProgress,
      agent.status === "COMPLETED" ? 100 : agent.status === "FAILED" ? 100 : runtimeProgress > 0 && agent.status === "RUNNING" ? 40 : 0,
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
  runtimeEvents.forEach((event) => {
    const nodeId = eventStepId(event);
    const progress = eventProgress(event);
    if (nodeId && progress !== undefined) {
      progressByNode.set(nodeId, Math.max(progressByNode.get(nodeId) ?? 0, progress));
    }
  });

  const evidenceDone = runtimeEvents.some((event) => {
    const text = normalize(`${event.type} ${payloadText(event)}`);
    return eventStepId(event) === "evidence_retrieval" && ((eventProgress(event) ?? 0) >= 100 || ((event.type === "tool.result" || event.type === "evidence.linked") && text.includes("evidence")));
  });
  progressByNode.set("evidence_retrieval", evidenceDone ? 100 : progressByNode.get("evidence_retrieval") ?? 0);

  return baseItems.map((item) => {
    const blocked = item.progress <= 0 && item.dependsOn.some((nodeId) => (progressByNode.get(nodeId) ?? 0) < 100);
    if (!blocked) return item;
    return {
      ...item,
      status: item.status === "COMPLETED" ? item.status : "IDLE",
      currentStep: `等待 ${item.dependsOn.join(" + ")}`,
      isLiveOutput: false,
      blocked: true,
      latestSummaryMarkdown: waitingSummaryForNode(item.nodeId),
    };
  });
};

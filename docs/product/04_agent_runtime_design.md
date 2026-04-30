# 04 Agent Runtime 前端设计

## 设计目标

将 TradingAgents 的多 Agent 协同过程产品化表达。

不要把它做成纯终端日志，而是做成一个用户可理解、可追溯、可复盘的 Agent Run Detail 页面。

## 页面结构

```txt
顶部：任务目标 / 资产 / 时间 / 模型 / 状态 / 操作按钮

左侧：Agent Progress
  - Analyst Team
  - Research Team
  - Strategy Team
  - Risk Team
  - Portfolio Manager

中间：研究过程
  - Current Report
  - Agent Debate
  - Final Decision

右侧：上下文与证据
  - Tool Calls
  - Evidence Used
  - Data Context

底部：Runtime Metrics
  - Tool Calls
  - LLM Calls
  - Generated Reports
  - Duration
  - Cost / Tokens（可选）
```

## Agent 分组

### Analyst Team

- Market Analyst
- Macro Analyst
- ETF / Fund Analyst
- Futures Analyst
- News Analyst
- Flow Analyst

### Research Team

- Bull Researcher
- Bear Researcher
- Research Manager

### Strategy Team

- Allocation Agent
- Timing Agent
- Strategy Agent

### Risk Team

- Drawdown Analyst
- Liquidity Analyst
- Concentration Analyst
- Scenario Analyst

### Portfolio Team

- Portfolio Manager

## Agent Event 类型

```ts
type AgentEvent =
  | { type: "agent.started"; runId: string; agentName: string; timestamp: string }
  | { type: "agent.completed"; runId: string; agentName: string; timestamp: string }
  | { type: "agent.failed"; runId: string; agentName: string; error: string; timestamp: string }
  | { type: "tool.called"; runId: string; agentName: string; toolName: string; args: Record<string, unknown>; timestamp: string }
  | { type: "tool.result"; runId: string; agentName: string; toolName: string; summary: string; evidenceIds?: string[]; timestamp: string }
  | { type: "reasoning.chunk"; runId: string; agentName: string; content: string; timestamp: string }
  | { type: "report.generated"; runId: string; agentName: string; reportId: string; title: string; timestamp: string }
  | { type: "debate.message"; runId: string; agentName: string; stance: "bull" | "bear" | "neutral"; content: string; timestamp: string }
  | { type: "risk.warning"; runId: string; agentName: string; level: "low" | "medium" | "high"; content: string; timestamp: string }
  | { type: "decision.updated"; runId: string; action: string; confidence: number; timestamp: string };
```

## Final Decision 结构

- 建议动作：增配 / 减配 / 持有 / 观察 / 暂不配置
- 适用周期：短期 / 中期 / 长期
- 置信度
- 核心逻辑
- 主要证据
- 反方观点
- 主要风险
- 触发条件
- 失效条件
- 后续观察指标

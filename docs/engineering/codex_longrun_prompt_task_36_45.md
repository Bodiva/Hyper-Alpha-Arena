# Codex 长程执行提示词：AlphaTrace Task 36-45

你现在要继续推进 AlphaTrace，但必须避免无限扩展。  
本轮只围绕“AlphaTrace MVP 收口”执行 Task 36-45，做到 Task 45 后停止，不要继续新增任务。

---

## 当前项目状态

AlphaTrace 已完成：
- Qwen 异步 submit
- SSE runtime events
- Live Output
- 打字机式输出
- Bull / Bear 后端并行调用
- Evidence seed 注入
- JSON store 持久化
- Asset / Evidence / Strategy / Portfolio Store/API real mode
- AgentRunDetail 可观察、可复盘
- 仍未接 TradingAgents
- 未接外部搜索 / 实时行情
- 未写真实 DB

---

## 执行原则

1. 每次只执行一个 Task。
2. Task 完成后必须运行：
   - 后端相关 `python -m py_compile`
   - 前端 `cd frontend && pnpm build`
   - 如有 API endpoint，使用 TestClient 或 curl 验证
3. 不要修改旧 Hyper Alpha Arena 业务页面。
4. 不要接 TradingAgents，除非执行到 Task 44 且只做设计和 stub。
5. 不要接真实交易。
6. 不要接外部搜索引擎或实时行情。
7. 不要写真实 DB，除非任务明确要求，但本清单内不要求真实 DB。
8. 不要引入大型依赖。
9. 不要改 Docker / package.json，除非任务明确要求。
10. mock mode 必须保持可用。
11. real mode 的变更必须有友好错误提示。
12. 如果某个任务阻塞，记录阻塞原因，继续下一个不依赖该阻塞的任务。
13. 每个 Task 完成后更新对应文档。
14. 所有运行态验证结果汇总到：
    `docs/engineering/14_runtime_validation_report.md`

---

## 任务清单

请按以下顺序执行：

1. Task 36：Portfolio Diagnosis Agent Task
2. Task 37：Decision Store/API 与 Decision Attribution real mode
3. Task 38：Leaderboard real mode 最小接入
4. Task 39：Agent Runtime 稳定性与错误兜底
5. Task 40：AlphaTrace Demo 闭环整理
6. Task 41：AlphaTrace 窄屏 / 移动端 Market View 布局
7. Task 42：Qwen 输出 JSON 结构化增强
8. Task 43：Evidence 引用校验
9. Task 44：TradingAgents Adapter 设计，不做真实接入
10. Task 45：AlphaTrace MVP 收口与版本冻结

如果当前目标仍是“大模型 + Agent Runtime 调通验证”，可以优先执行：
- Task 36
- Task 37
- Task 39
- Task 40

Task 38、41、42、43、44、45 可按顺序继续。

---

## 每个 Task 完成后必须输出

1. 当前完成的是哪个 Task。
2. 修改了哪些文件。
3. 是否修改旧业务页面。
4. 是否接 TradingAgents。
5. 是否接外部数据源 / 实时行情 / 真实交易。
6. 是否写真实 DB。
7. py_compile 是否通过。
8. pnpm build 是否通过。
9. 运行态验证结果。
10. 风险 / 未完成项。
11. 下一步应该执行哪个 Task。

---

## 硬停止规则

做到 Task 45 后停止继续扩功能。  
如果你发现必须新增任务，先写入“后续 Roadmap 建议”，不要直接实现。

Task 45 完成后输出：
- AlphaTrace MVP 状态总结
- 已知限制
- 后续 Roadmap
- 是否建议进入下一阶段

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Network,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react'
import {
  researchPromptWorkspaceApi,
  type PromptTemplate,
  type PromptWorkspaceApi,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { pollAiStream } from '@/lib/pollAiStream'

type ResearchRoleId =
  | 'evidence_retriever'
  | 'market_analyst'
  | 'bull_researcher'
  | 'bear_researcher'
  | 'research_manager'
  | 'risk_analyst'
  | 'portfolio_manager'

interface ResearchRolePromptManagerProps {
  api?: PromptWorkspaceApi
}

interface ResearchRoleDefinition {
  id: ResearchRoleId
  name: string
  team: string
  mission: string
  dependsOn: ResearchRoleId[]
  defaultSkills: string[]
  optionalSkills: string[]
  tools: string[]
  outputContract: string[]
  reviewFocus: string[]
}

const ROLE_PROMPT_MARKER = 'alpha_trace_role_prompt'
const LOCAL_ROLE_PROMPT_STORAGE_KEY = 'alphatrace.research.rolePrompts'

const RESEARCH_ROLES: ResearchRoleDefinition[] = [
  {
    id: 'evidence_retriever',
    name: '证据检索员',
    team: '证据层',
    mission: '围绕研究问题检索、去重和整理可引用证据，优先使用 AlphaTrace 已接入数据，再用 Bocha 等外部搜索补充时效信息。',
    dependsOn: [],
    defaultSkills: ['evidence_search', 'source_ranking', 'fact_extraction', 'evidence_deduplication'],
    optionalSkills: ['data_catalog_lookup', 'clickhouse_query', 'bocha_search'],
    tools: ['evidence_center', 'data_catalog', 'clickhouse_reader', 'bocha_search', 'agent_run_evidence_refs'],
    outputContract: ['evidence_ids', 'source_quality', 'fact_table', 'conflict_notes', 'missing_evidence'],
    reviewFocus: ['内部数据优先', '不编造来源', '标明证据时间', '区分事实与推断'],
  },
  {
    id: 'market_analyst',
    name: '市场分析师',
    team: '分析层',
    mission: '解释资产、行业、宏观和风格状态，形成中性基准观点，并给出关键变量、监测指标和证据强度。',
    dependsOn: ['evidence_retriever'],
    defaultSkills: ['market_regime_analysis', 'cross_asset_reading', 'factor_exposure', 'data_quality_check'],
    optionalSkills: ['macro_calendar', 'flow_analysis', 'clickhouse_context_reading'],
    tools: ['asset_snapshot', 'market_data', 'clickhouse_reader', 'data_catalog', 'factor_library'],
    outputContract: ['base_view', 'drivers', 'key_metrics', 'regime_label', 'uncertainties'],
    reviewFocus: ['先给基准观点', '区分周期', '证据链可追溯', '避免直接给交易结论'],
  },
  {
    id: 'bull_researcher',
    name: '多头研究员',
    team: '辩论层',
    mission: '从正向收益、估值修复、催化剂、资金行为和风险补偿角度构建多头论证。',
    dependsOn: ['evidence_retriever', 'market_analyst'],
    defaultSkills: ['upside_case_building', 'catalyst_mapping', 'valuation_sensitivity', 'confirmation_check'],
    optionalSkills: ['scenario_upside', 'position_sizing_hint', 'bocha_event_scan'],
    tools: ['evidence_center', 'asset_snapshot', 'strategy_radar', 'bocha_search', 'agent_run_detail'],
    outputContract: ['bull_thesis', 'upside_drivers', 'catalysts', 'validation_checks', 'invalidation_signals'],
    reviewFocus: ['只论证多头视角', '明确假设条件', '列出需要验证的数据', '不忽略证据质量'],
  },
  {
    id: 'bear_researcher',
    name: '空头研究员',
    team: '辩论层',
    mission: '从下行风险、估值压缩、流动性冲击、政策扰动和反身性风险角度构建反方论证。',
    dependsOn: ['evidence_retriever', 'market_analyst'],
    defaultSkills: ['downside_case_building', 'risk_event_mapping', 'drawdown_diagnosis', 'contradiction_search'],
    optionalSkills: ['stress_scenario', 'liquidity_warning', 'bocha_risk_scan'],
    tools: ['evidence_center', 'runtime_logs', 'risk_dashboard', 'bocha_search', 'portfolio_workspace'],
    outputContract: ['bear_thesis', 'downside_drivers', 'risk_triggers', 'stress_cases', 'invalidation_points'],
    reviewFocus: ['主动寻找反证', '不重复多头观点', '给出触发条件', '说明风险时效性'],
  },
  {
    id: 'research_manager',
    name: '研究经理',
    team: '决策层',
    mission: '综合市场、多头和空头观点，形成可复盘的投资假设、置信度、分歧点、证据缺口和后续验证计划。',
    dependsOn: ['market_analyst', 'bull_researcher', 'bear_researcher'],
    defaultSkills: ['debate_synthesis', 'confidence_scoring', 'research_plan', 'evidence_gap_analysis'],
    optionalSkills: ['decision_attribution', 'hypothesis_tracking', 'agent_run_replay'],
    tools: ['agent_run_detail', 'decision_attribution', 'evidence_center', 'data_catalog'],
    outputContract: ['synthesis', 'confidence', 'key_disagreements', 'open_questions', 'next_research_tasks'],
    reviewFocus: ['保留关键分歧', '说明取舍理由', '给出置信度来源', '不要越权下单'],
  },
  {
    id: 'risk_analyst',
    name: '风险分析师',
    team: '风控层',
    mission: '检查组合风险、流动性、集中度、回撤、相关性和极端情景，对研究结论给出风险修正与硬约束。',
    dependsOn: ['research_manager'],
    defaultSkills: ['portfolio_risk_review', 'liquidity_check', 'stress_test', 'concentration_analysis'],
    optionalSkills: ['drawdown_budgeting', 'correlation_review', 'agent_run_risk_replay'],
    tools: ['portfolio_workspace', 'risk_dashboard', 'scenario_lab', 'decision_store', 'agent_run_detail'],
    outputContract: ['risk_flags', 'stress_results', 'risk_adjustments', 'guardrails', 'review_triggers'],
    reviewFocus: ['明确硬性约束', '区分风险与不确定性', '给出可执行护栏', '指出无法量化的风险'],
  },
  {
    id: 'portfolio_manager',
    name: '组合经理',
    team: '执行层',
    mission: '把研究结论和风险修正转化为组合建议、目标权重、再平衡节奏、执行条件和事后复核清单。',
    dependsOn: ['research_manager', 'risk_analyst'],
    defaultSkills: ['portfolio_construction', 'rebalance_planning', 'execution_rules', 'decision_mapping'],
    optionalSkills: ['turnover_control', 'cash_buffer_management', 'strategy_linking'],
    tools: ['portfolio_workspace', 'strategy_lab', 'decision_store', 'agent_run_detail'],
    outputContract: ['portfolio_action', 'target_weight', 'execution_conditions', 'post_trade_checks', 'related_decisions'],
    reviewFocus: ['不绕过风险护栏', '说明仓位变化', '给出暂停或复核条件', '区分研究建议与自动交易'],
  },
]

const ROLE_BY_ID = new Map(RESEARCH_ROLES.map((role) => [role.id, role]))

const createRoleDescription = (role: ResearchRoleDefinition) =>
  `${ROLE_PROMPT_MARKER}; role_id:${role.id}; team:${role.team}; canonical_role_prompt:true`

const formatRoleName = (role: ResearchRoleDefinition) => `投研角色 · ${role.name}`

const includesText = (source: string | null | undefined, target: string) =>
  String(source || '').toLowerCase().includes(target.toLowerCase())

const isTemplateForRole = (template: PromptTemplate, role: ResearchRoleDefinition) => {
  const roleKey = role.id.replace(/_/g, '-')
  return (
    includesText(template.description, `role_id:${role.id}`) ||
    template.key === `research_role_${role.id}` ||
    template.key === `local_research_role_${role.id}` ||
    includesText(template.key, role.id) ||
    includesText(template.key, roleKey) ||
    includesText(template.name, role.name)
  )
}

const getTemplateRoleId = (template: PromptTemplate): ResearchRoleId | null => {
  const role = RESEARCH_ROLES.find((item) => isTemplateForRole(template, item))
  return role?.id || null
}

const findTemplateForRole = (templates: PromptTemplate[], role: ResearchRoleDefinition) => {
  return templates.find((template) => isTemplateForRole(template, role))
}

const formatList = (items: string[]) => (items.length > 0 ? items.join(', ') : '无')

const CURRENT_DATA_CONTEXT = [
  '- {asset_context}: AlphaTrace 资产目录、标的画像、价格/估值/行业/风格暴露、K 线入口和数据质量说明。',
  '- {market_context}: ClickHouse/数据目录可选数据源中的行情、宏观、指数、费率、成交与因子上下文；必须说明采样窗口和缺失字段。',
  '- {evidence_context}: Evidence Center、AgentRun evidence_refs、静态种子证据和 Bocha 外部搜索补充；必须保留 evidence_id、来源、时间和可信度。',
  '- {portfolio_context}: Portfolio Workspace 的持仓、权重、风险指标、调仓建议、关联决策和组合约束。',
  '- {prior_role_outputs}: 上游角色输出、AgentRun 报告片段、正反方分歧、风险提示和最终配置观察。',
  '- {decision_context}: Decision Store 中按 assetId/portfolioId 关联的历史结论、置信度、观察周期和使用证据。',
  '- {risk_preference}: 用户风险偏好、回撤容忍度、配置边界、基准和不能越过的风控条件。',
]

const ROLE_DEEP_GUIDANCE: Record<ResearchRoleId, string[]> = {
  evidence_retriever: [
    '按“内部结构化数据 > AgentRun 已落库证据 > Bocha 外部搜索 > 未验证线索”排序。',
    '合并重复证据，指出冲突证据，并给出 missing_evidence，不要把搜索摘要当作已验证事实。',
    '输出 fact_table 时每行包含 claim、evidence_id、source、time、reliability、limitation。',
  ],
  market_analyst: [
    '用短中长期分层解释市场状态：趋势、估值、流动性、宏观、风格和情绪至少覆盖其中三类。',
    '当 ClickHouse 数据窗口不足或字段缺失时，明确标注 low_data_confidence。',
    '输出 base_view 时只形成中性基准观点，不直接给增配/减配动作。',
  ],
  bull_researcher: [
    '只构建正方论证，但必须标注每条乐观假设依赖的数据条件和触发催化剂。',
    '使用 evidence_context 支撑 upside_drivers，不允许把愿景、口号或单条新闻当作强证据。',
    '给出 validation_checks 和 invalidation_signals，便于研究经理与风控复核。',
  ],
  bear_researcher: [
    '主动寻找与正方相反或削弱正方的证据，包括政策、估值、资金、流动性和技术破位。',
    '区分“已经发生的风险”“正在发酵的风险”“只是尾部情景的风险”。',
    'stress_cases 必须说明触发条件、影响路径和需要监控的数据字段。',
  ],
  research_manager: [
    '综合时保留关键分歧，不用平均化语言掩盖证据冲突。',
    '置信度来自证据数量、证据质量、数据新鲜度、正反方一致性和风险可控性。',
    'next_research_tasks 必须能被下一次 AgentRun 或人工复核直接执行。',
  ],
  risk_analyst: [
    '风险复核优先看组合层面：集中度、流动性、回撤预算、相关性、极端情景和风险偏好一致性。',
    'guardrails 要给出可检查条件，例如最大权重、暂停条件、复核频率、触发阈值。',
    '对无法量化的风险使用 qualitative_risk 标记，避免伪精确。',
  ],
  portfolio_manager: [
    '组合动作必须引用研究经理结论和风险护栏，不允许绕过 risk_analyst。',
    'target_weight 需要给出 fromWeight、toWeight、调整方向、节奏和暂停条件。',
    '明确这是投研配置建议，不是自动交易指令；需要后续人工或系统风控确认。',
  ],
}

const createDefaultPrompt = (role: ResearchRoleDefinition) => {
  const dependsOn = role.dependsOn
    .map((id) => ROLE_BY_ID.get(id)?.name || id)
    .join('、') || '无上游角色'
  const deepGuidance = ROLE_DEEP_GUIDANCE[role.id]

  return [
    `你是 AlphaTrace 投研团队中的「${role.name}」。`,
    '',
    '## 角色定位',
    role.mission,
    `你属于「${role.team}」，只完成本角色职责；不要替其他角色越权给最终组合动作。`,
    '',
    '## 上游依赖与协作边界',
    dependsOn,
    '- 如果上游输出缺失，先列出缺口，并用“待验证”标记，不要编造上游结论。',
    '- 如果发现上游证据冲突，必须保留冲突并说明影响，而不是强行合并为单一观点。',
    '',
    '## 当前可用数据与变量',
    '- {task_type}: 当前任务类型',
    '- {question}: 用户研究问题',
    ...CURRENT_DATA_CONTEXT,
    '',
    '## 数据使用优先级',
    '1. 优先使用 AlphaTrace 内部结构化数据：资产目录、ClickHouse/数据目录、Evidence Center、AgentRun、Decision Store、Portfolio Workspace。',
    '2. Bocha 外部搜索只用于补充时效事件、新闻和公开资料；必须说明来源、日期和可靠性，不能替代内部数据。',
    '3. 当内部数据与外部搜索冲突时，以内部已落库数据为主，并把冲突写入 conflict_notes 或 uncertainties。',
    '4. 不把接口错误、字段名、模型解析失败或 runId 当作用户可用结论。',
    '',
    '## 深度工作方法',
    `- 默认能力：${formatList(role.defaultSkills)}`,
    `- 可选能力：${formatList(role.optionalSkills)}`,
    `- 可调用工具：${formatList(role.tools)}`,
    '- 先确认输入是否足够；如果证据不足，明确列出缺口，不要补造数据或虚构 evidence_id。',
    '- 每个事实判断都尽量绑定 evidence_id、来源、数据窗口或时间戳。',
    '- 区分“事实”“推断”“假设”“建议”，不要把推断包装成事实。',
    ...deepGuidance.map((item) => `- ${item}`),
    '- 形成结论前做一次自检：证据是否足够、周期是否一致、风险偏好是否匹配、是否存在反证。',
    '',
    '## 输出契约',
    role.outputContract.map((item) => `- ${item}: 必须输出，字段名保持稳定，便于下游角色和页面消费。`).join('\n'),
    '',
    '## 审核重点',
    role.reviewFocus.map((item) => `- ${item}`).join('\n'),
    '',
    '## 风险与合规约束',
    '- 不输出“确定盈利”“无风险”“必须买卖”等确定性交易表达。',
    '- 涉及配置或仓位时，只表达研究建议，必须说明需要风控或组合经理复核。',
    '- 对低置信度、样本不足、过期证据、来源不明的数据必须降权。',
    '- 不暴露内部 API 路径、密钥、后端函数名或模型供应商异常。',
    '',
    '## 输出格式',
    '请用结构化中文 Markdown 输出，标题保持稳定：',
    '1. 结论摘要',
    '2. 数据与证据',
    '3. 推理链条',
    '4. 反证、风险与失效条件',
    '5. 输出契约字段',
    '6. 下一步验证',
    '',
    '## 自检清单',
    '- 是否引用了真实 evidence_id、来源或时间？',
    '- 是否说明了内部数据和 Bocha 外部搜索的边界？',
    '- 是否区分事实、推断、假设和建议？',
    '- 是否遵守本角色边界和上游依赖？',
    '- 是否输出了下游可消费的稳定字段？',
  ].join('\n')
}

const createOptimizationRequest = (
  role: ResearchRoleDefinition,
  currentPrompt: string,
  userInstruction: string,
) => [
  '请优化下面的 AlphaTrace 投研角色提示词。',
  '',
  '要求：',
  '- 只输出优化后的完整提示词，不要解释过程。',
  '- 保留投研角色边界，不要写成交易下单机器人。',
  '- 结合当前 AlphaTrace 已接入能力：资产目录、ClickHouse/数据目录、Evidence Center、AgentRun、Decision Store、Portfolio Workspace、Bocha 外部搜索。',
  '- 参考原项目 AI Prompt Generator 的思路：明确角色、输入变量、数据优先级、工作流程、风险约束、输出格式和自检清单。',
  '- 强化证据引用、事实/推断区分、上游依赖和输出契约。',
  '- 不要删除已有变量占位符，必要时补充投研变量。',
  '',
  `角色：${role.name}`,
  `团队：${role.team}`,
  `职责：${role.mission}`,
  `上游依赖：${role.dependsOn.map((id) => ROLE_BY_ID.get(id)?.name || id).join('、') || '无'}`,
  `工具边界：${formatList(role.tools)}`,
  `输出契约：${formatList(role.outputContract)}`,
  `当前数据上下文：${CURRENT_DATA_CONTEXT.join(' ')}`,
  `角色深度要求：${ROLE_DEEP_GUIDANCE[role.id].join(' ')}`,
  '',
  userInstruction.trim() ? `用户补充要求：${userInstruction.trim()}` : '用户补充要求：按专业投研团队角色提示词优化。',
  '',
  '当前提示词：',
  currentPrompt,
].join('\n')

const createFallbackOptimizedPrompt = (
  role: ResearchRoleDefinition,
  currentPrompt: string,
  userInstruction: string,
) => {
  const upstream = role.dependsOn.map((id) => ROLE_BY_ID.get(id)?.name || id).join('、') || '无'
  const deepGuidance = ROLE_DEEP_GUIDANCE[role.id]
  const instructionLine = userInstruction.trim()
    ? `\n## 本次优化要求\n${userInstruction.trim()}\n`
    : ''

  return [
    `你是 AlphaTrace 投研团队中的「${role.name}」。`,
    '',
    '## 角色边界',
    role.mission,
    `你属于「${role.team}」，只完成本角色职责；不要替其他角色下最终组合或交易结论。`,
    '',
    '## 上游依赖',
    upstream,
    '如果上游输出缺失，先列出缺口，并用“待验证”标记，不要编造数据。',
    '',
    '## 当前可用数据与变量',
    '- {task_type}: 当前任务类型',
    '- {question}: 用户研究问题',
    ...CURRENT_DATA_CONTEXT,
    instructionLine,
    '## 数据使用优先级',
    '1. 优先使用 AlphaTrace 内部结构化数据：资产目录、ClickHouse/数据目录、Evidence Center、AgentRun、Decision Store、Portfolio Workspace。',
    '2. Bocha 外部搜索只用于补充时效事件、新闻和公开资料；必须说明来源、日期和可靠性。',
    '3. 内外部证据冲突时，保留冲突并说明影响，不强行得出高置信结论。',
    '',
    '## 工作流程',
    '1. 先判断输入是否足够，列出缺失数据和不可验证假设。',
    '2. 提取与本角色相关的事实证据，并标注 evidence_id、来源或时间戳。',
    '3. 分离事实、推断、假设和建议，不把推断写成事实。',
    '4. 按角色职责完成分析，主动指出反证、失效条件和需要复核的变量。',
    '5. 输出必须能被下游角色直接消费，字段名称保持稳定。',
    '',
    '## 本角色深度要求',
    deepGuidance.map((item) => `- ${item}`).join('\n'),
    '',
    '## 可用能力与工具',
    `- 默认能力：${formatList(role.defaultSkills)}`,
    `- 可选能力：${formatList(role.optionalSkills)}`,
    `- 工具边界：${formatList(role.tools)}`,
    '',
    '## 输出契约',
    role.outputContract.map((item) => `- ${item}: 必须给出清晰字段和值。`).join('\n'),
    '',
    '## 风险与合规约束',
    '- 不生成虚假来源、虚假价格、虚假财务数据或不存在的证据 ID。',
    '- 不输出“确定盈利”“无风险”等绝对化表述。',
    '- 涉及组合动作时，只给本角色允许范围内的建议，并声明需要风控或组合经理复核。',
    '- 对低置信度判断必须说明原因和验证路径。',
    '',
    '## 输出格式',
    '请用中文 Markdown 输出，固定包含：',
    '1. 结论摘要',
    '2. 关键证据',
    '3. 推理链条',
    '4. 反证与风险',
    '5. 输出契约字段',
    '6. 下一步验证',
    '',
    '## 自检清单',
    '- 是否引用了证据 ID、来源或时间？',
    '- 是否区分事实、推断、假设和建议？',
    '- 是否遵守本角色边界？',
    '- 是否保留所有必要变量占位符？',
    '- 是否能被下游角色直接使用？',
    '',
    '## 原始提示词参考',
    currentPrompt,
  ].filter(Boolean).join('\n')
}

const readLocalRoleTemplates = (): PromptTemplate[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_ROLE_PROMPT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.key && item.templateText) : []
  } catch {
    return []
  }
}

const writeLocalRoleTemplates = (templates: PromptTemplate[]) => {
  if (typeof window === 'undefined') return
  const roleTemplates = templates.filter((template) => getTemplateRoleId(template))
  window.localStorage.setItem(LOCAL_ROLE_PROMPT_STORAGE_KEY, JSON.stringify(roleTemplates))
}

const mergeRemoteAndLocalTemplates = (remoteTemplates: PromptTemplate[], localTemplates: PromptTemplate[]) => {
  const next = [...remoteTemplates]
  localTemplates.forEach((localTemplate) => {
    const roleId = getTemplateRoleId(localTemplate)
    if (!roleId || next.some((template) => isTemplateForRole(template, ROLE_BY_ID.get(roleId)!))) return
    next.push(localTemplate)
  })
  return next
}

const createLocalRoleTemplate = (
  role: ResearchRoleDefinition,
  templateText: string,
  existing?: PromptTemplate | null,
): PromptTemplate => {
  const now = new Date().toISOString()
  const roleIndex = RESEARCH_ROLES.findIndex((item) => item.id === role.id)
  return {
    id: existing?.id || -(roleIndex + 1),
    key: `local_research_role_${role.id}`,
    name: formatRoleName(role),
    description: `${createRoleDescription(role)}; storage:local`,
    templateText,
    systemTemplateText: existing?.systemTemplateText || '',
    isSystem: 'false',
    isDeleted: 'false',
    createdBy: existing?.createdBy || 'local-role-matrix',
    updatedBy: 'local-role-matrix',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

export default function ResearchRolePromptManager({
  api = researchPromptWorkspaceApi,
}: ResearchRolePromptManagerProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<ResearchRoleId>('market_analyst')
  const [templateDraft, setTemplateDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [storageMode, setStorageMode] = useState<'remote' | 'local'>('remote')
  const [statusNote, setStatusNote] = useState('')
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('结合 AlphaTrace 当前资产目录、ClickHouse/数据目录、Evidence Center、AgentRun、Decision Store、Portfolio Workspace 和 Bocha 外部搜索能力，强化证据引用、数据优先级、输出契约、风险约束和角色边界。')
  const [aiResult, setAiResult] = useState('')
  const [aiResultSource, setAiResultSource] = useState<'research-ai' | 'local' | null>(null)
  const [aiOptimizing, setAiOptimizing] = useState(false)
  const loadedOnceRef = useRef(false)

  const roleTemplates = useMemo(() => {
    const next = new Map<ResearchRoleId, PromptTemplate>()
    RESEARCH_ROLES.forEach((role) => {
      const template = findTemplateForRole(templates, role)
      if (template) next.set(role.id, template)
    })
    return next
  }, [templates])

  const selectedRole = ROLE_BY_ID.get(selectedRoleId) || RESEARCH_ROLES[0]
  const selectedTemplate = roleTemplates.get(selectedRole.id) || null
  const missingRoleCount = RESEARCH_ROLES.length - roleTemplates.size
  const savedRoleCount = roleTemplates.size

  useEffect(() => {
    if (loadedOnceRef.current) return
    loadedOnceRef.current = true
    void loadTemplates()
  }, [])

  useEffect(() => {
    setTemplateDraft(selectedTemplate?.templateText || createDefaultPrompt(selectedRole))
  }, [selectedRole.id, selectedTemplate?.id])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const data = await api.getPromptTemplates()
      const localTemplates = readLocalRoleTemplates()
      setTemplates(mergeRemoteAndLocalTemplates(data.templates, localTemplates))
      setStorageMode('remote')
      setStatusNote('')
    } catch (error) {
      const localTemplates = readLocalRoleTemplates()
      setTemplates(localTemplates)
      setStorageMode('local')
      setStatusNote('远端投研提示词服务不可用，当前使用本地草稿。')
    } finally {
      setLoading(false)
    }
  }

  const upsertRoleTemplate = async (role: ResearchRoleDefinition, templateText: string) => {
    const existing = roleTemplates.get(role.id) || findTemplateForRole(templates, role)
    const saveLocal = () => createLocalRoleTemplate(role, templateText, existing)

    if (storageMode === 'local' || existing?.key.startsWith('local_research_role_')) {
      return saveLocal()
    }

    try {
      if (!existing) {
        return await api.createPromptTemplate({
          name: formatRoleName(role),
          description: createRoleDescription(role),
          templateText,
          createdBy: 'research-role-matrix',
        })
      }

      await api.updatePromptTemplateName(existing.id, {
        name: formatRoleName(role),
        description: createRoleDescription(role),
        updatedBy: 'research-role-matrix',
      })
      return await api.updatePromptTemplate(existing.key, {
        templateText,
        description: createRoleDescription(role),
        updatedBy: 'research-role-matrix',
      })
    } catch {
      setStorageMode('local')
      setStatusNote('远端投研提示词服务不可用，本次修改已保存为本地草稿。')
      return saveLocal()
    }
  }

  const mergeSavedTemplate = (saved: PromptTemplate, current: PromptTemplate[]) => {
    const savedRoleId = getTemplateRoleId(saved)
    const withoutSavedRole = current.filter((item) => {
      if (item.id === saved.id) return false
      return savedRoleId ? getTemplateRoleId(item) !== savedRoleId : true
    })
    const next = [saved, ...withoutSavedRole]
    writeLocalRoleTemplates(next)
    return next
  }

  const handleSaveSelected = async () => {
    setSaving(true)
    try {
      const saved = await upsertRoleTemplate(selectedRole, templateDraft)
      setTemplates((current) => mergeSavedTemplate(saved, current))
      toast.success(
        saved.key.startsWith('local_research_role_')
          ? `${selectedRole.name}提示词已保存到本地草稿`
          : `${selectedRole.name}提示词已保存`,
      )
    } catch (error) {
      console.error('Failed to save research role prompt', error)
      toast.error('保存角色提示词失败')
    } finally {
      setSaving(false)
    }
  }

  const handleInitializeMissing = async () => {
    setInitializing(true)
    try {
      const existingTemplates = new Map(roleTemplates)
      const createdOrUpdated: PromptTemplate[] = []
      for (const role of RESEARCH_ROLES) {
        if (existingTemplates.has(role.id)) continue
        const created = await upsertRoleTemplate(role, createDefaultPrompt(role))
        createdOrUpdated.push(created)
      }
      if (createdOrUpdated.length > 0) {
        setTemplates((current) => {
          const merged = createdOrUpdated.reduce((acc, template) => mergeSavedTemplate(template, acc), current)
          writeLocalRoleTemplates(merged)
          return merged
        })
        toast.success(
          storageMode === 'local'
            ? `已在本地初始化 ${createdOrUpdated.length} 个角色提示词`
            : `已初始化 ${createdOrUpdated.length} 个角色提示词`,
        )
      } else {
        toast.success('角色提示词已完整')
      }
    } catch (error) {
      console.error('Failed to initialize research role prompts', error)
      toast.error('初始化角色提示词失败')
    } finally {
      setInitializing(false)
    }
  }

  const handleResetDraft = () => {
    setTemplateDraft(createDefaultPrompt(selectedRole))
    toast.success('已套用默认角色模板，保存后生效')
  }

  const runResearchAiOptimization = async (requestText: string) => {
    const response = await fetch('/api/research-ai/insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lang: 'zh',
        context: {
          purpose: 'optimize_research_role_prompt',
          prompt: requestText,
          selectedRole: selectedRole.name,
          selectedRoleId: selectedRole.id,
        },
        selected_event: {
          type: 'prompt_optimization',
          title: `优化${selectedRole.name}提示词`,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Research AI unavailable: ${response.status}`)
    }

    const data = await response.json()
    const taskId = data.task_id as string | undefined
    if (!taskId) {
      throw new Error('Research AI did not return a task id')
    }

    const contentParts: string[] = []
    let latestContent = ''
    await pollAiStream(taskId, {
      interval: 700,
      maxDuration: 90_000,
      onChunk: (chunk) => {
        const content = chunk.data?.content || chunk.data?.message || chunk.data?.text
        if (typeof content === 'string' && content.trim()) {
          if (content.startsWith(latestContent)) {
            latestContent = content
          } else {
            contentParts.push(content)
          }
        }
      },
    })

    const result = (latestContent || contentParts.join('')).trim()
    if (!result) {
      throw new Error('Research AI returned an empty prompt')
    }
    return result
  }

  const handleAiOptimize = async () => {
    setAiOptimizing(true)
    setAiResult('')
    setAiResultSource(null)
    const requestText = createOptimizationRequest(selectedRole, templateDraft, aiInstruction)
    try {
      const result = await runResearchAiOptimization(requestText)
      setAiResult(result)
      setAiResultSource('research-ai')
      toast.success('AI 优化稿已生成')
    } catch (error) {
      const result = createFallbackOptimizedPrompt(selectedRole, templateDraft, aiInstruction)
      setAiResult(result)
      setAiResultSource('local')
      toast.success('已生成本地优化稿，可直接应用')
    } finally {
      setAiOptimizing(false)
    }
  }

  const handleApplyAiResult = () => {
    if (!aiResult.trim()) return
    setTemplateDraft(aiResult)
    setAiDialogOpen(false)
    toast.success('已应用优化稿，保存后生效')
  }

  const isDirty = selectedTemplate ? selectedTemplate.templateText !== templateDraft : templateDraft.trim().length > 0

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">投研提示词</p>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">角色提示词矩阵</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            每个提示词对应投研团队中的一个角色，按“证据检索、市场分析、正反方辩论、研究综合、风控、组合执行”的链路维护。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{savedRoleCount}/{RESEARCH_ROLES.length} 已配置</Badge>
          <Badge variant={storageMode === 'remote' ? 'default' : 'outline'}>
            {storageMode === 'remote' ? '远端同步' : '本地草稿'}
          </Badge>
          <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={handleInitializeMissing} disabled={initializing || missingRoleCount === 0}>
            <Wand2 className="mr-2 h-4 w-4" />
            初始化缺失角色
          </Button>
        </div>
      </div>
      {statusNote ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {statusNote}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(440px,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              投研团队角色
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[650px]">
              <div className="space-y-1 p-2">
                {RESEARCH_ROLES.map((role) => {
                  const hasTemplate = roleTemplates.has(role.id)
                  const active = role.id === selectedRole.id
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full rounded-md border px-3 py-3 text-left transition ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-transparent hover:border-border hover:bg-muted/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{role.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{role.team}</div>
                        </div>
                        {hasTemplate ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <CircleDashed className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{role.mission}</p>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b px-5 py-4">
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="whitespace-nowrap text-lg">{selectedRole.name}</CardTitle>
                  <Badge variant={selectedTemplate ? 'default' : 'secondary'}>
                    {selectedTemplate ? '已落库' : '未初始化'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{selectedRole.mission}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAiResult('')
                    setAiResultSource(null)
                    setAiDialogOpen(true)
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 优化提示词
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetDraft}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  套用默认
                </Button>
                <Button size="sm" onClick={handleSaveSelected} disabled={saving || !isDirty}>
                  <Save className="mr-2 h-4 w-4" />
                  保存角色提示词
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">模板名称</div>
                <div className="mt-1 truncate text-sm font-medium">
                  {selectedTemplate?.name || formatRoleName(selectedRole)}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">上游依赖</div>
                <div className="mt-1 truncate text-sm font-medium">
                  {selectedRole.dependsOn.map((id) => ROLE_BY_ID.get(id)?.name || id).join('、') || '无'}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">模板 Key</div>
                <div className="mt-1 truncate text-sm font-medium">{selectedTemplate?.key || '保存后生成'}</div>
              </div>
            </div>

            <Textarea
              value={templateDraft}
              onChange={(event) => setTemplateDraft(event.target.value)}
              className="min-h-[520px] resize-y font-mono text-sm leading-6"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">角色契约</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 text-sm">
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">默认能力</div>
                <div className="flex flex-wrap gap-2">
                  {selectedRole.defaultSkills.map((item) => (
                    <Badge key={item} variant="secondary">{item}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">可选能力</div>
                <div className="flex flex-wrap gap-2">
                  {selectedRole.optionalSkills.map((item) => (
                    <Badge key={item} variant="outline">{item}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">工具边界</div>
                <ul className="space-y-2 text-muted-foreground">
                  {selectedRole.tools.map((tool) => (
                    <li key={tool} className="rounded-md border bg-muted/30 px-3 py-2">{tool}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">输出结构</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
              {selectedRole.outputContract.map((item) => (
                <div key={item} className="rounded-md border bg-muted/30 px-3 py-2">{item}</div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">全局约束</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
              <div className="rounded-md border bg-muted/30 px-3 py-2">必须引用证据 ID、来源或时间戳。</div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">证据不足时输出缺口，不生成虚假事实。</div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">角色只完成自己的职责，不越权替其他角色下结论。</div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">交易和组合动作必须经过风控与组合经理角色。</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>AI 优化提示词</DialogTitle>
            <DialogDescription>
              参考原项目 AI Prompt Generator 的工作流，为当前投研角色生成更完整的提示词。后台不可用时会生成本地优化稿。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-sm font-semibold">{selectedRole.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{selectedRole.mission}</div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">优化要求</div>
                <Textarea
                  value={aiInstruction}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  className="min-h-[180px] resize-y text-sm leading-6"
                  placeholder="例如：强化证据引用，输出 JSON 字段，压缩冗余说明，增加风控检查。"
                />
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                <div className="font-semibold text-foreground">优化会保留：</div>
                <div>角色边界、上游依赖、工具范围、输出契约、变量占位符和证据约束。</div>
              </div>
              <Button onClick={handleAiOptimize} disabled={aiOptimizing} className="w-full">
                {aiOptimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {aiOptimizing ? '正在优化...' : '生成优化稿'}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-muted-foreground">优化结果</div>
                {aiResultSource ? (
                  <Badge variant={aiResultSource === 'research-ai' ? 'default' : 'outline'}>
                    {aiResultSource === 'research-ai' ? 'Research AI' : '本地优化稿'}
                  </Badge>
                ) : null}
              </div>
              <Textarea
                value={aiResult}
                onChange={(event) => setAiResult(event.target.value)}
                className="min-h-[420px] resize-y font-mono text-sm leading-6"
                placeholder="点击“生成优化稿”后，这里会显示优化后的完整提示词。"
                spellCheck={false}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              关闭
            </Button>
            <Button onClick={handleApplyAiResult} disabled={!aiResult.trim()}>
              应用到当前角色
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

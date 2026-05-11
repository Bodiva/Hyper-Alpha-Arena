import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Clipboard,
  Copy,
  ExternalLink,
  Layers3,
  Network,
  Route,
  ServerCog,
  SlidersHorizontal,
} from 'lucide-react'
import ResearchRolePromptManager from '@/components/prompt/ResearchRolePromptManager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { navigateTo } from '@/shared/lib/navigation'

export type ResearchAssistantConfigTab = 'prompts' | 'templates' | 'runtime'

interface ResearchRuntimeConfigPageProps {
  initialTab?: ResearchAssistantConfigTab
}

interface PortEndpoint {
  name: string
  method: string
  base: string
  path: string
  status: 'active' | 'tunnel' | 'legacy' | 'optional'
  description: string
  actionUrl?: string
}

const CONFIG_STEPS = [
  {
    title: '角色提示词',
    description: '市场、正反方、风控和综述边界。',
    icon: Network,
  },
  {
    title: '运行模板',
    description: '沉淀可复用的投研任务入口。',
    icon: Layers3,
  },
  {
    title: '运行环境',
    description: '页面链路、API 代理、隧道和日志。',
    icon: ServerCog,
  },
]

const RUN_TEMPLATES = [
  {
    name: '单标的中期配置研究',
    runType: 'asset_research',
    agents: '市场分析、正反方、风险复核、研究经理',
    output: '重要结论、证据图谱、研究报告草稿',
  },
  {
    name: 'ETF 初筛与横向对比',
    runType: 'etf_screening',
    agents: '资产筛选、量化分析、流动性分析、Review',
    output: 'ETF 对比表、候选池、排除理由',
  },
  {
    name: '策略卡片生成',
    runType: 'strategy_generation',
    agents: '策略构造、量化分析、风险经理、Review',
    output: '策略卡、触发条件、失效条件',
  },
  {
    name: '组合风险复核',
    runType: 'risk_review',
    agents: '组合分析、风险经理、Review',
    output: '敞口诊断、集中度风险、调整建议',
  },
]

const PORT_ENDPOINTS: PortEndpoint[] = [
  {
    name: 'AlphaTrace 前端',
    method: 'HTTP',
    base: '$local',
    path: 'http://127.0.0.1:20080/index.html',
    status: 'active',
    description: '当前 20080 版本页面入口，浏览器只看这套。',
    actionUrl: 'http://127.0.0.1:20080/index.html',
  },
  {
    name: '20080 内部 API 代理',
    method: 'PROXY',
    base: '20080',
    path: '/api',
    status: 'active',
    description: '浏览器仍访问 20080，Vite 在本机内部转发到后端进程。',
  },
  {
    name: '内部后端进程',
    method: 'INTERNAL',
    base: 'backend',
    path: 'http://127.0.0.1:20082/api',
    status: 'active',
    description: '仅供 20080 代理调用，不作为浏览器页面入口。',
  },
  {
    name: '数据仓库 HTTP 隧道',
    method: 'HTTP',
    base: '$local',
    path: '127.0.0.1:18123 -> ECS 127.0.0.1:18123',
    status: 'tunnel',
    description: '连接云上投研数据仓库的必需隧道。',
  },
  {
    name: '数据仓库 Native 隧道',
    method: 'TCP',
    base: '$local',
    path: '127.0.0.1:19000 -> ECS 127.0.0.1:19000',
    status: 'optional',
    description: '仅需要 Native TCP 客户端时开启。',
  },
  {
    name: '旧后端环境',
    method: 'HTTP',
    base: '$local',
    path: 'http://127.0.0.1:8802/api',
    status: 'legacy',
    description: '旧数据仓库来源，不用于当前 20080 版本。',
  },
]

const TUNNEL_COMMANDS = [
  {
    name: '数据仓库 HTTP 隧道',
    command: 'ssh -N -L 18123:127.0.0.1:18123 root@120.27.194.30',
    note: '投研数据查询前必须保持此命令运行。',
  },
  {
    name: 'HTTP + Native TCP 隧道',
    command: 'ssh -N -L 18123:127.0.0.1:18123 -L 19000:127.0.0.1:19000 root@120.27.194.30',
    note: '需要 Native 协议客户端时使用。',
  },
]

const statusMeta: Record<PortEndpoint['status'], { label: string; className: string }> = {
  active: {
    label: '当前使用',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  tunnel: {
    label: 'SSH 隧道',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  optional: {
    label: '可选',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  legacy: {
    label: '旧环境',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
}

const copyText = async (text: string) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  await navigator.clipboard.writeText(text)
}

const PortMethodBadge = ({ method }: { method: string }) => (
  <span className="inline-flex h-6 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700">
    {method}
  </span>
)

const PortStatusBadge = ({ status }: { status: PortEndpoint['status'] }) => {
  const meta = statusMeta[status]
  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

const ConfigFlow = () => (
  <div className="grid gap-2 lg:grid-cols-3">
    {CONFIG_STEPS.map((step, index) => {
      const Icon = step.icon
      return (
        <div key={step.title} className="rounded-md border bg-background px-3 py-3">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                <p className="truncate text-sm font-semibold text-foreground">{step.title}</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
            </div>
          </div>
        </div>
      )
    })}
  </div>
)

const RunTemplateMatrix = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold">运行模板</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        先把投研助手最常用任务沉淀为模板。当前只做前端配置入口，后续再接入模板保存和 AgentRun submit。
      </p>
    </div>
    <div className="grid gap-3 xl:grid-cols-2">
      {RUN_TEMPLATES.map((template) => (
        <div key={template.runType} className="rounded-md border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{template.name}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{template.runType}</p>
            </div>
            <Badge variant="secondary">MVP 模板</Badge>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-md bg-muted/35 p-3">
              <p className="text-xs text-muted-foreground">Runtime Agent Team</p>
              <p className="mt-1 leading-5">{template.agents}</p>
            </div>
            <div className="rounded-md bg-muted/35 p-3">
              <p className="text-xs text-muted-foreground">默认产物</p>
              <p className="mt-1 leading-5">{template.output}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const PortManagementTable = () => (
  <div className="overflow-hidden rounded-md border bg-background">
    <div className="grid grid-cols-[220px_minmax(0,1fr)_160px] border-b bg-muted/25 px-3 py-3 text-sm font-semibold text-foreground">
      <div>服务名</div>
      <div>请求路径 / 端口映射</div>
      <div>操作</div>
    </div>
    <div className="divide-y">
      {PORT_ENDPOINTS.map((endpoint) => (
        <div
          key={endpoint.name}
          className="grid grid-cols-[220px_minmax(0,1fr)_160px] items-center gap-3 px-3 py-3 text-sm"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{endpoint.name}</p>
              <PortStatusBadge status={endpoint.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{endpoint.description}</p>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PortMethodBadge method={endpoint.method} />
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{endpoint.base}</span>
              <span className="break-all font-mono text-sm">{endpoint.path}</span>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                title="复制路径"
                onClick={() => void copyText(endpoint.path)}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {endpoint.actionUrl ? (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => window.open(endpoint.actionUrl, '_blank', 'noopener,noreferrer')}
              >
                打开
              </button>
            ) : null}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigateTo('/runtime-logs')}>
              日志
            </button>
            <button type="button" className="font-medium text-destructive hover:underline">
              停用
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const TunnelCommandTable = () => (
  <div className="overflow-hidden rounded-md border bg-background">
    <div className="grid grid-cols-[220px_minmax(0,1fr)_120px] border-b bg-muted/25 px-3 py-3 text-sm font-semibold">
      <div>名称</div>
      <div>命令</div>
      <div>操作</div>
    </div>
    <div className="divide-y">
      {TUNNEL_COMMANDS.map((item) => (
        <div key={item.name} className="grid grid-cols-[220px_minmax(0,1fr)_120px] items-center gap-3 px-3 py-3 text-sm">
          <div>
            <p className="font-semibold">{item.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
          </div>
          <code className="break-all rounded-md bg-muted px-2 py-2 text-xs">{item.command}</code>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyText(item.command)}>
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>
        </div>
      ))}
    </div>
  </div>
)

const RuntimeOpsPanel = ({ activePortCount }: { activePortCount: number }) => (
  <div className="space-y-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold">运行环境</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          当前浏览器入口固定为 20080。后端、数据仓库隧道和日志查询都在这里核对。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{activePortCount} 个当前链路端口</Badge>
        <Badge variant="outline">投研数据仓库</Badge>
      </div>
    </div>

    <PortManagementTable />

    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      当前页面入口只认 <span className="font-mono">http://127.0.0.1:20080/index.html</span>。如果页面又连接到旧数据仓库，说明
      20080 的内部 API 代理目标被改回旧环境。
    </div>

    <div className="space-y-3">
      <div>
        <p className="font-semibold">数据仓库隧道</p>
        <p className="mt-1 text-xs text-muted-foreground">云上数据仓库不开放公网端口，只走本机 SSH 隧道。</p>
      </div>
      <TunnelCommandTable />
    </div>

    <div className="rounded-md border bg-muted/20 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold">运行日志查询</p>
          <p className="mt-1 text-sm text-muted-foreground">查看投研运行日志、后端调用记录和任务执行状态。</p>
        </div>
        <Button className="gap-2" onClick={() => navigateTo('/runtime-logs')}>
          <ExternalLink className="h-4 w-4" />
          打开日志页
        </Button>
      </div>
    </div>
  </div>
)

export default function ResearchRuntimeConfigPage({ initialTab = 'prompts' }: ResearchRuntimeConfigPageProps) {
  const [activeTab, setActiveTab] = useState<ResearchAssistantConfigTab>(initialTab)
  const activePortCount = useMemo(
    () => PORT_ENDPOINTS.filter((endpoint) => endpoint.status === 'active' || endpoint.status === 'tunnel').length,
    [],
  )

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  return (
    <div className="h-full w-full overflow-auto bg-muted/20 p-4 md:p-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <section className="rounded-lg border bg-background p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-semibold tracking-normal">投研助手配置</h1>
                <Badge variant="secondary">Research Runtime</Badge>
              </div>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                集中维护投研助手的角色提示词、任务模板和运行环境。后台执行器、结构化数据读取和证据筛选由服务侧统一托管。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => void copyText('http://127.0.0.1:20080/index.html')}
              >
                <Clipboard className="h-4 w-4" />
                复制 20080 入口
              </Button>
              <Button size="sm" className="gap-2" onClick={() => navigateTo('/research/assistant-lab')}>
                <Route className="h-4 w-4" />
                打开投研助手
              </Button>
            </div>
          </div>
        </section>

        <Card>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ResearchAssistantConfigTab)}>
              <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">配置链路</h2>
                  <p className="mt-1 text-xs text-muted-foreground">按提示词、模板、环境三类维护，减少入口跳转。</p>
                </div>
                <TabsList>
                  <TabsTrigger value="prompts" className="gap-2">
                    <Network className="h-4 w-4" />
                    角色提示词
                  </TabsTrigger>
                  <TabsTrigger value="templates" className="gap-2">
                    <Layers3 className="h-4 w-4" />
                    运行模板
                  </TabsTrigger>
                  <TabsTrigger value="runtime" className="gap-2">
                    <Activity className="h-4 w-4" />
                    运行环境
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="prompts" className="m-0">
                <ResearchRolePromptManager />
              </TabsContent>

              <TabsContent value="templates" className="m-0 space-y-5 p-5">
                <ConfigFlow />
                <RunTemplateMatrix />
              </TabsContent>

              <TabsContent value="runtime" className="m-0 p-5">
                <RuntimeOpsPanel activePortCount={activePortCount} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

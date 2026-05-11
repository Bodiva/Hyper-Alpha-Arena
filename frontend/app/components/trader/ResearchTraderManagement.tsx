import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Bot, CheckCircle2, Plus, RefreshCw, Save, Trash2, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiRequest, type TradingAccount } from '@/lib/api'

const API_BASE = '/alpha-trace/research-workbench'
const LOCAL_TRADERS_STORAGE_KEY = 'alphatrace.research.traders'

interface ResearchRoleSeed {
  roleId: string
  name: string
  team: string
  model: string
  description: string
}

type ResearchTradingAccount = TradingAccount & {
  roleId?: string
  team?: string
  description?: string
  storage?: 'remote' | 'local'
}

const ROLE_SEEDS: ResearchRoleSeed[] = [
  {
    roleId: 'evidence_retriever',
    name: '证据检索员',
    team: '证据层',
    model: 'qwen-plus',
    description: '检索、去重和整理可引用证据，为后续角色提供 evidence_id、来源和可信度。',
  },
  {
    roleId: 'market_analyst',
    name: '市场分析师',
    team: '分析层',
    model: 'qwen-plus',
    description: '解释资产、行业和宏观市场状态，形成中性基准观点。',
  },
  {
    roleId: 'bull_researcher',
    name: '多头研究员',
    team: '辩论层',
    model: 'qwen-plus',
    description: '从正向收益、估值修复、催化剂和风险补偿角度构建多头论证。',
  },
  {
    roleId: 'bear_researcher',
    name: '空头研究员',
    team: '辩论层',
    model: 'qwen-plus',
    description: '从下行风险、流动性冲击和反证角度构建反方论证。',
  },
  {
    roleId: 'research_manager',
    name: '研究经理',
    team: '决策层',
    model: 'qwen-plus',
    description: '综合多方观点，形成投资假设、置信度、分歧点和验证计划。',
  },
  {
    roleId: 'risk_analyst',
    name: '风险分析师',
    team: '风控层',
    model: 'qwen-plus',
    description: '检查组合风险、流动性、集中度、回撤和极端情景。',
  },
  {
    roleId: 'portfolio_manager',
    name: '组合经理',
    team: '执行层',
    model: 'qwen-plus',
    description: '把研究结论和风险修正转化为组合建议、仓位动作和执行条件。',
  },
]

const toLocalTrader = (seed: ResearchRoleSeed, index: number): ResearchTradingAccount => ({
  id: -(index + 1),
  user_id: 1,
  name: seed.name,
  model: seed.model,
  base_url: '',
  api_key: '',
  initial_capital: 0,
  current_cash: 0,
  frozen_cash: 0,
  account_type: 'RESEARCH_ROLE',
  is_active: true,
  auto_trading_enabled: false,
  show_on_dashboard: true,
  avatar_preset_id: null,
  roleId: seed.roleId,
  team: seed.team,
  description: seed.description,
  storage: 'local',
})

const createCustomLocalTrader = (name: string, model: string): ResearchTradingAccount => ({
  id: Date.now(),
  user_id: 1,
  name,
  model,
  base_url: '',
  api_key: '',
  initial_capital: 0,
  current_cash: 0,
  frozen_cash: 0,
  account_type: 'RESEARCH_ROLE',
  is_active: true,
  auto_trading_enabled: false,
  show_on_dashboard: true,
  avatar_preset_id: null,
  roleId: `custom_${Date.now()}`,
  team: '自定义',
  description: '自定义投研角色。',
  storage: 'local',
})

const readLocalTraders = (): ResearchTradingAccount[] => {
  if (typeof window === 'undefined') return ROLE_SEEDS.map(toLocalTrader)
  try {
    const raw = window.localStorage.getItem(LOCAL_TRADERS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    // fall through to defaults
  }
  return ROLE_SEEDS.map(toLocalTrader)
}

const writeLocalTraders = (traders: ResearchTradingAccount[]) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_TRADERS_STORAGE_KEY, JSON.stringify(traders))
}

const normalizeRemoteTrader = (trader: TradingAccount): ResearchTradingAccount => ({
  ...trader,
  roleId: trader.name.toLowerCase().replace(/\s+/g, '_'),
  team: '远端角色',
  description: '来自投研 workbench 服务的角色配置。',
  storage: 'remote',
})

export default function ResearchTraderManagement() {
  const [traders, setTraders] = useState<ResearchTradingAccount[]>([])
  const [name, setName] = useState('')
  const [model, setModel] = useState('qwen-plus')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [storageMode, setStorageMode] = useState<'remote' | 'local'>('remote')
  const [statusNote, setStatusNote] = useState('')
  const loadedOnceRef = useRef(false)

  const configuredRoleIds = useMemo(
    () => new Set(traders.map((trader) => trader.roleId).filter(Boolean)),
    [traders],
  )
  const missingRoleCount = ROLE_SEEDS.filter((role) => !configuredRoleIds.has(role.roleId)).length

  const switchToLocal = (note = '投研 workbench 服务不可用，当前使用本地角色配置。') => {
    const localTraders = readLocalTraders()
    setTraders(localTraders)
    setStorageMode('local')
    setStatusNote(note)
  }

  const loadTraders = async () => {
    setLoading(true)
    try {
      const response = await apiRequest(`${API_BASE}/traders`)
      const remoteTraders = (await response.json()) as TradingAccount[]
      setTraders(remoteTraders.map(normalizeRemoteTrader))
      setStorageMode('remote')
      setStatusNote('')
    } catch {
      switchToLocal()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedOnceRef.current) return
    loadedOnceRef.current = true
    void loadTraders()
  }, [])

  const persistLocal = (next: ResearchTradingAccount[]) => {
    setTraders(next)
    writeLocalTraders(next)
  }

  const initializeStandardRoles = () => {
    const existing = new Map(traders.map((trader) => [trader.roleId, trader]))
    const additions = ROLE_SEEDS
      .filter((seed) => !existing.has(seed.roleId))
      .map((seed, index) => toLocalTrader(seed, traders.length + index))
    const next = [...additions, ...traders]
    persistLocal(next)
    setStorageMode('local')
    setStatusNote('已在本地初始化标准投研团队角色。')
    toast.success(`已初始化 ${additions.length} 个投研角色`)
  }

  const createTrader = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('请输入角色名称')
      return
    }

    if (storageMode === 'local') {
      const created = createCustomLocalTrader(trimmedName, model.trim() || 'qwen-plus')
      persistLocal([created, ...traders])
      setName('')
      toast.success('投研角色已保存到本地')
      return
    }

    try {
      const response = await apiRequest(`${API_BASE}/traders`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, model }),
      })
      const created = normalizeRemoteTrader(await response.json())
      setTraders((prev) => [created, ...prev])
      setName('')
      toast.success('投研角色已创建')
    } catch {
      const created = createCustomLocalTrader(trimmedName, model.trim() || 'qwen-plus')
      const next = [created, ...readLocalTraders()]
      persistLocal(next)
      setStorageMode('local')
      setStatusNote('远端创建失败，角色已保存为本地配置。')
      setName('')
      toast.success('投研角色已保存到本地')
    }
  }

  const updateTrader = async (trader: ResearchTradingAccount) => {
    setSavingId(trader.id)
    if (storageMode === 'local' || trader.storage === 'local' || trader.id < 0) {
      persistLocal(traders.map((item) => (item.id === trader.id ? { ...trader, storage: 'local' } : item)))
      toast.success('投研角色已保存到本地')
      setSavingId(null)
      return
    }

    try {
      const response = await apiRequest(`${API_BASE}/traders/${trader.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trader.name, model: trader.model }),
      })
      const updated = normalizeRemoteTrader(await response.json())
      setTraders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      toast.success('投研角色已保存')
    } catch {
      persistLocal(traders.map((item) => (item.id === trader.id ? { ...trader, storage: 'local' } : item)))
      setStorageMode('local')
      setStatusNote('远端保存失败，本次修改已保存为本地配置。')
      toast.success('投研角色已保存到本地')
    } finally {
      setSavingId(null)
    }
  }

  const deleteTrader = async (trader: ResearchTradingAccount) => {
    if (!confirm('删除这个投研角色？')) return

    if (storageMode === 'local' || trader.storage === 'local' || trader.id < 0) {
      persistLocal(traders.filter((item) => item.id !== trader.id))
      toast.success('投研角色已删除')
      return
    }

    try {
      await apiRequest(`${API_BASE}/traders/${trader.id}`, { method: 'DELETE' })
      setTraders((prev) => prev.filter((item) => item.id !== trader.id))
      toast.success('投研角色已删除')
    } catch {
      persistLocal(traders.filter((item) => item.id !== trader.id))
      setStorageMode('local')
      setStatusNote('远端删除失败，已切换到本地配置。')
      toast.success('已从本地配置中移除')
    }
  }

  return (
    <div className="h-full w-full overflow-auto p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">投研 AI 交易员</h1>
            <p className="text-muted-foreground">
              这里管理投研团队角色，不触发交易，也不写入旧账户表。角色应与“投研提示词”中的角色提示词一一对应。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={storageMode === 'remote' ? 'default' : 'outline'}>
              {storageMode === 'remote' ? '远端同步' : '本地配置'}
            </Badge>
            <Badge variant="secondary">{traders.length} 个角色</Badge>
            <Button size="sm" variant="outline" onClick={loadTraders} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
            <Button size="sm" onClick={initializeStandardRoles} disabled={missingRoleCount === 0}>
              <Wand2 className="mr-2 h-4 w-4" />
              初始化标准角色
            </Button>
          </div>
        </div>

        {statusNote ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {statusNote}
          </div>
        ) : null}

        <div className="grid min-h-[26rem] gap-6 lg:grid-cols-[22rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">新增自定义角色</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：行业轮动分析师" />
              <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="qwen-plus" />
              <Button onClick={createTrader} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                创建角色
              </Button>
              <div className="space-y-2 pt-3">
                <div className="text-xs font-medium text-muted-foreground">标准团队</div>
                {ROLE_SEEDS.map((role) => (
                  <button
                    key={role.roleId}
                    type="button"
                    onClick={() => {
                      setName(role.name)
                      setModel(role.model)
                    }}
                    className="w-full rounded-md border px-3 py-2 text-left text-xs transition hover:bg-muted"
                  >
                    <div className="font-medium">{role.name}</div>
                    <div className="mt-1 text-muted-foreground">{role.team}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">投研角色列表</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="text-sm text-muted-foreground">正在加载...</div>
              ) : traders.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-dashed text-sm text-muted-foreground">
                  <Bot className="h-8 w-8" />
                  <div>暂无投研角色。</div>
                  <Button size="sm" onClick={initializeStandardRoles}>
                    初始化标准角色
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {traders.map((trader) => (
                    <div
                      key={trader.id}
                      className="grid gap-3 rounded-md border p-3 xl:grid-cols-[auto_minmax(14rem,1fr)_12rem_auto]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{trader.team || '投研角色'}</Badge>
                          <Badge variant={trader.storage === 'local' || trader.id < 0 ? 'outline' : 'default'}>
                            {trader.storage === 'local' || trader.id < 0 ? '本地' : '远端'}
                          </Badge>
                          {configuredRoleIds.has(trader.roleId || '') ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : null}
                        </div>
                        <Input
                          value={trader.name}
                          onChange={(event) =>
                            setTraders((prev) =>
                              prev.map((item) => (item.id === trader.id ? { ...item, name: event.target.value } : item)),
                            )
                          }
                        />
                        <p className="text-xs leading-5 text-muted-foreground">{trader.description}</p>
                      </div>
                      <Input
                        value={trader.model ?? ''}
                        onChange={(event) =>
                          setTraders((prev) =>
                            prev.map((item) => (item.id === trader.id ? { ...item, model: event.target.value } : item)),
                          )
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => updateTrader(trader)}
                          disabled={savingId === trader.id}
                          title="保存"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => deleteTrader(trader)} title="删除">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

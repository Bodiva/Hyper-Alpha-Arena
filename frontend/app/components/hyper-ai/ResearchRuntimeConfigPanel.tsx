import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import StrategyPanel from '@/components/portfolio/StrategyPanel'
import SamplingSettingsCard from '@/components/trader/SamplingSettingsCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAccounts, type TradingAccount } from '@/lib/api'

export const researchRuntimeStorageKeys = {
  accountId: 'alphatrace.researchRuntime.accountId',
  dataSourceId: 'alphatrace.researchRuntime.dataSourceId',
  dataSourceLabel: 'alphatrace.researchRuntime.dataSourceLabel',
}

export interface ResearchRuntimeContext {
  accountId: number | null
  accountName: string | null
  accountModel: string | null
  dataSourceId: string | null
  dataSourceLabel: string
}

export default function ResearchRuntimeConfigPanel() {
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(() => {
    const stored = window.localStorage.getItem(researchRuntimeStorageKeys.accountId)
    const parsed = stored ? Number(stored) : NaN
    return Number.isFinite(parsed) ? parsed : null
  })
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(() =>
    window.localStorage.getItem(researchRuntimeStorageKeys.dataSourceId),
  )
  const [selectedDataSourceLabel, setSelectedDataSourceLabel] = useState(
    () => window.localStorage.getItem(researchRuntimeStorageKeys.dataSourceLabel) || '未选择数据源',
  )

  useEffect(() => {
    let cancelled = false
    setAccountsLoading(true)
    setAccountsError(null)

    getAccounts()
      .then((items) => {
        if (cancelled) return
        setAccounts(items)
        setSelectedAccountId((current) => {
          if (current && items.some((account) => account.id === current)) return current
          return items[0]?.id ?? null
        })
      })
      .catch((error) => {
        if (cancelled) return
        setAccounts([])
        setSelectedAccountId(null)
        setAccountsError(error instanceof Error ? error.message : 'AI 交易员加载失败')
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    if (selectedAccountId) {
      window.localStorage.setItem(researchRuntimeStorageKeys.accountId, String(selectedAccountId))
    }
  }, [selectedAccountId])

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  const selectedStrategyId = selectedAccount
    ? `ai_trader_account_${selectedAccount.id}_strategy`
    : 'strategy_etf_rotation_001'
  const selectedStrategyLabel = selectedAccount
    ? `${selectedAccount.name}${selectedAccount.model ? ` (${selectedAccount.model})` : ''}`
    : '默认 ETF 轮动策略'

  const handleDataSourceChange = useCallback((value: string, label: string) => {
    setSelectedDataSourceId(value)
    setSelectedDataSourceLabel(label || value)
    window.localStorage.setItem(researchRuntimeStorageKeys.dataSourceId, value)
    window.localStorage.setItem(researchRuntimeStorageKeys.dataSourceLabel, label || value)
  }, [])

  const contextSummary = useMemo<ResearchRuntimeContext>(() => ({
    accountId: selectedAccount?.id ?? null,
    accountName: selectedAccount?.name ?? null,
    accountModel: selectedAccount?.model ?? null,
    dataSourceId: selectedDataSourceId,
    dataSourceLabel: selectedDataSourceLabel,
  }), [selectedAccount, selectedDataSourceId, selectedDataSourceLabel])

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">投研运行能力配置</h2>
            <Badge variant="outline">供投研助手使用</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            配置全局数据采样窗口、AI 交易员策略上下文、数据源、信号池和触发间隔。投研助手提交任务时会读取这里保存的上下文。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={accountsLoading}
        >
          <RefreshCw className={`h-4 w-4 ${accountsLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        <SamplingSettingsCard />

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-md border bg-muted/10 p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">策略上下文</p>
              <Badge variant="outline">AI Trader</Badge>
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>当前投研任务使用所选 AI 交易员的策略配置作为运行上下文。</p>
              <p>可在右侧调整数据源、信号池、触发间隔和启停状态。</p>
              <p>全局采样深度会影响投研 Agent 读取的短周期市场记忆。</p>
            </div>
            <div className="mt-4 rounded-md bg-background p-3 text-xs">
              <p className="text-muted-foreground">当前策略</p>
              <p className="mt-1 break-words font-medium text-foreground">{selectedStrategyLabel}</p>
              <p className="mt-2 break-all text-muted-foreground">strategyId: {selectedStrategyId}</p>
            </div>
            <div className="mt-3 rounded-md bg-background p-3 text-xs">
              <p className="text-muted-foreground">当前数据源</p>
              <p className="mt-1 break-words font-medium text-foreground">{contextSummary.dataSourceLabel}</p>
              <p className="mt-2 break-all text-muted-foreground">dataSourceId: {contextSummary.dataSourceId ?? '未选择'}</p>
            </div>
            {accountsError ? (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {accountsError}
              </div>
            ) : null}
          </div>

          <div className="h-[560px] min-h-0 rounded-md border bg-background p-4">
            {selectedAccount ? (
              <StrategyPanel
                accountId={selectedAccount.id}
                accountName={selectedAccount.name}
                refreshKey={refreshKey}
                accounts={accounts}
                accountsLoading={accountsLoading}
                onAccountChange={setSelectedAccountId}
                executionVenueMode="dataSource"
                onExecutionVenueChange={handleDataSourceChange}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {accountsLoading ? '正在加载 AI 交易员...' : '暂无 AI 交易员，无法配置策略上下文。'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

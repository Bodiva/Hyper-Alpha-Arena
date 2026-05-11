import { useEffect, useState } from 'react'
import { Activity, CircleDollarSign } from 'lucide-react'
import { useCurrentExchangeInfo } from '@/contexts/ExchangeContext'
import { getClickHouseOverviewAsync } from '@/entities/data-source/api'
import {
  defaultHyperAiProfile,
  getHyperAiProfileAsync,
  getHyperAiToolsAsync,
} from '@/entities/settings/api'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { httpClient } from '@/shared/api/http-client'
import { PRODUCT_NAME } from '@/shared/lib/product-branding'
import LanguageToggle from '@/shared/ui/LanguageToggle'

interface Account {
  id: number
  user_id: number
  name: string
  account_type: string
  initial_capital: number
  current_cash: number
  frozen_cash: number
}

interface HeaderProps {
  title?: string
  subtitle?: string
  currentAccount?: Account | null
  showAccountSelector?: boolean
  showExchangeStatus?: boolean
  showRuntimeStatus?: boolean
}

type RuntimeServiceStatus = 'unknown' | 'ready' | 'missing'

interface RuntimeServiceState {
  status: RuntimeServiceStatus
  latencyMs: number | null
}

interface RuntimeStatusState {
  qwen: RuntimeServiceState
  bocha: RuntimeServiceState
  clickhouse: RuntimeServiceState
  openclaw: RuntimeServiceState
}

interface OpenClawStatusResponse {
  configured: boolean
  ws_url?: string | null
  session_key?: string | null
  device_key_path?: string | null
}

const emptyRuntimeService = (): RuntimeServiceState => ({
  status: 'unknown',
  latencyMs: null,
})

const measureRuntimeCall = async <T,>(call: () => Promise<T>) => {
  const startedAt = performance.now()
  try {
    const value = await call()
    return {
      result: { status: 'fulfilled' as const, value },
      latencyMs: Math.round(performance.now() - startedAt),
    }
  } catch (reason) {
    return {
      result: { status: 'rejected' as const, reason },
      latencyMs: Math.round(performance.now() - startedAt),
    }
  }
}

const formatRuntimeLatency = (latencyMs: number | null) => {
  if (latencyMs === null) return '...'
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`
  return `${latencyMs}ms`
}

const getOpenClawStatusAsync = () =>
  httpClient.get<OpenClawStatusResponse>(ENDPOINTS.openClawStatus, { timeoutMs: 5000 })

export default function Header({
  title = PRODUCT_NAME,
  subtitle: _subtitle,
  currentAccount,
  showAccountSelector = false,
  showExchangeStatus = false,
  showRuntimeStatus = true,
}: HeaderProps) {
  const currentExchangeInfo = useCurrentExchangeInfo()
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusState>({
    qwen: emptyRuntimeService(),
    bocha: emptyRuntimeService(),
    clickhouse: emptyRuntimeService(),
    openclaw: emptyRuntimeService(),
  })

  useEffect(() => {
    if (!showRuntimeStatus) return
    let cancelled = false
    let intervalId: number | undefined

    const refreshRuntimeStatus = () => {
      Promise.all([
        measureRuntimeCall(getHyperAiProfileAsync),
        measureRuntimeCall(getHyperAiToolsAsync),
        measureRuntimeCall(getClickHouseOverviewAsync),
        measureRuntimeCall(getOpenClawStatusAsync),
      ])
      .then(([profileProbe, toolsProbe, clickHouseProbe, openClawProbe]) => {
        if (cancelled) return
        const profile = profileProbe.result.status === 'fulfilled' ? profileProbe.result.value : defaultHyperAiProfile
        const tools = toolsProbe.result.status === 'fulfilled' ? toolsProbe.result.value.tools ?? [] : []
        const qwenHasKey = Boolean(profile.llm_api_key_available)
        const qwenReady = Boolean(
          profile.llm_configured &&
            qwenHasKey &&
            String(profile.llm_provider ?? '').toLowerCase() === 'qwen',
        )
        const bochaTool = tools.find((tool) => tool.name === 'bocha')
        const bochaReady = Boolean(bochaTool?.configured || bochaTool?.api_key_available)
        const clickHouseReady = Boolean(
          clickHouseProbe.result.status === 'fulfilled' && clickHouseProbe.result.value.status === 'OK',
        )
        const openClawReady = Boolean(
          openClawProbe.result.status === 'fulfilled' && openClawProbe.result.value.configured,
        )
        setRuntimeStatus({
          qwen: { status: qwenReady ? 'ready' : 'missing', latencyMs: profileProbe.latencyMs },
          bocha: { status: bochaReady ? 'ready' : 'missing', latencyMs: toolsProbe.latencyMs },
          clickhouse: { status: clickHouseReady ? 'ready' : 'missing', latencyMs: clickHouseProbe.latencyMs },
          openclaw: { status: openClawReady ? 'ready' : 'missing', latencyMs: openClawProbe.latencyMs },
        })
      })
      .catch(() => {
        if (cancelled) return
        setRuntimeStatus({
          qwen: { status: 'missing', latencyMs: null },
          bocha: { status: 'missing', latencyMs: null },
          clickhouse: { status: 'missing', latencyMs: null },
          openclaw: { status: 'missing', latencyMs: null },
        })
      })
    }

    refreshRuntimeStatus()
    intervalId = window.setInterval(refreshRuntimeStatus, 30000)

    return () => {
      cancelled = true
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
      }
    }
  }, [showRuntimeStatus])

  const runtimeDotClass = (status: RuntimeServiceStatus) => {
    if (status === 'ready') return 'bg-emerald-500'
    if (status === 'missing') return 'bg-amber-500'
    return 'bg-slate-300'
  }

  const renderRuntimeService = (label: string, service: RuntimeServiceState, description: string) => (
    <span className="inline-flex items-center gap-1" title={`${description} · ${formatRuntimeLatency(service.latencyMs)}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${runtimeDotClass(service.status)}`} />
      <span className="font-medium text-foreground">{label}</span>
      <span className="tabular-nums text-muted-foreground">{formatRuntimeLatency(service.latencyMs)}</span>
    </span>
  )

  return (
    <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3 py-2 md:px-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showRuntimeStatus ? (
            <div className="hidden items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
              {renderRuntimeService('QW', runtimeStatus.qwen, 'Qwen 配置接口时延')}
              {renderRuntimeService('BC', runtimeStatus.bocha, 'Bocha 工具配置接口时延')}
              {renderRuntimeService('CK', runtimeStatus.clickhouse, 'ClickHouse 概览接口时延')}
              {renderRuntimeService('OC', runtimeStatus.openclaw, 'OpenClaw Gateway 状态接口时延')}
            </div>
          ) : null}
          {showExchangeStatus ? (
            <div className="hidden items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span>{currentExchangeInfo?.name || 'Hyperliquid'}</span>
            </div>
          ) : null}
          {showAccountSelector && currentAccount ? (
            <div className="hidden items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
              <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-[180px] truncate">{currentAccount.name}</span>
            </div>
          ) : null}
          <LanguageToggle />
        </div>
      </div>

    </header>
  )
}

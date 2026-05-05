import { useEffect, useState } from 'react'
import { Activity, CircleDollarSign } from 'lucide-react'
import { useCurrentExchangeInfo } from '@/contexts/ExchangeContext'
import { getRuntimeCredentialStatus } from '@/entities/settings/api'
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

export default function Header({
  title = PRODUCT_NAME,
  subtitle: _subtitle,
  currentAccount,
  showAccountSelector = false,
  showExchangeStatus = false,
  showRuntimeStatus = true,
}: HeaderProps) {
  const currentExchangeInfo = useCurrentExchangeInfo()
  const [runtimeStatus, setRuntimeStatus] = useState({
    qwen: 'unknown' as 'unknown' | 'ready' | 'missing',
    bocha: 'unknown' as 'unknown' | 'ready' | 'missing',
  })

  useEffect(() => {
    if (!showRuntimeStatus) return
    let cancelled = false
    getRuntimeCredentialStatus()
      .then((status) => {
        if (cancelled) return
        const qwenHasKey = Boolean(status.profile.llm_api_key_available)
        const qwenReady = Boolean(
          status.profile.llm_configured &&
            qwenHasKey &&
            String(status.profile.llm_provider ?? '').toLowerCase() === 'qwen',
        )
        const bochaTool = status.tools.find((tool) => tool.name === 'bocha')
        const bochaReady = Boolean(bochaTool?.configured || bochaTool?.api_key_available)
        setRuntimeStatus({
          qwen: qwenReady ? 'ready' : 'missing',
          bocha: bochaReady ? 'ready' : 'missing',
        })
      })
      .catch(() => {
        if (cancelled) return
        setRuntimeStatus({ qwen: 'missing', bocha: 'missing' })
      })
    return () => {
      cancelled = true
    }
  }, [showRuntimeStatus])

  const runtimeDotClass = (status: 'unknown' | 'ready' | 'missing') => {
    if (status === 'ready') return 'bg-emerald-500'
    if (status === 'missing') return 'bg-amber-500'
    return 'bg-slate-300'
  }

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
              <span className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${runtimeDotClass(runtimeStatus.qwen)}`} />
                QW
              </span>
              <span className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${runtimeDotClass(runtimeStatus.bocha)}`} />
                BC
              </span>
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

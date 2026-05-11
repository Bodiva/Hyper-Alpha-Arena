import { useEffect, useMemo, useState } from 'react'
import { Info, Lock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFeatures } from '@/contexts/FeatureContext'

interface SamplingPoolSymbolStatus {
  sample_count: number
  max_samples?: number
  target_reached?: boolean
  latest_price?: number | null
  latest_time?: string | null
  oldest_time?: string | null
  coverage_seconds?: number
  price_change_percent?: number | null
}

export default function SamplingSettingsCard() {
  const { t } = useTranslation()
  const { entitlements, loading: featuresLoading } = useFeatures()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [samplingDepth, setSamplingDepth] = useState(10)
  const [samplingInterval, setSamplingInterval] = useState(18)
  const [samplingStatus, setSamplingStatus] = useState<Record<string, SamplingPoolSymbolStatus>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  const maxAllowedDepth = entitlements.maxSamplingDepth
  const statusRows = useMemo(
    () => Object.entries(samplingStatus).sort(([a], [b]) => a.localeCompare(b)).slice(0, 6),
    [samplingStatus],
  )

  const fetchGlobalConfig = async () => {
    const response = await fetch('/api/config/global-sampling')
    if (!response.ok) {
      throw new Error('Failed to fetch global sampling configuration')
    }
    const data = await response.json()
    setSamplingDepth(data.sampling_depth || 10)
    setSamplingInterval(data.sampling_interval || 18)
  }

  const fetchSamplingStatus = async () => {
    const response = await fetch('/api/sampling/pool-status')
    if (!response.ok) {
      throw new Error('Failed to fetch sampling pool status')
    }
    setSamplingStatus(await response.json())
  }

  const loadSamplingSettings = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      await Promise.all([fetchGlobalConfig(), fetchSamplingStatus()])
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '采样运行时配置加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSamplingSettings()
  }, [])

  const handleSave = async () => {
    if (samplingDepth > maxAllowedDepth) {
      toast.error(`Local entitlement allows up to ${maxAllowedDepth} sampling points.`)
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/config/global-sampling', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampling_depth: samplingDepth }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to save sampling configuration')
      }

      await response.json()
      toast.success('AI sampling depth saved')
      await loadSamplingSettings()
    } catch (error) {
      console.error('Failed to save sampling configuration:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save sampling configuration')
    } finally {
      setSaving(false)
    }
  }

  if (loading || featuresLoading) {
    return (
      <Card>
        <CardHeader className="py-4">
          <CardTitle>{t('trader.aiSamplingRuntime', 'AI Sampling Runtime')}</CardTitle>
          <CardDescription>{t('common.loading', 'Loading...')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="min-w-0">
            <CardTitle>{t('trader.aiSamplingRuntime', 'AI Sampling Runtime')}</CardTitle>
            <CardDescription>
              {t('trader.aiSamplingRuntimeDesc', 'Global short-term market memory passed into AI Trader decisions.')}
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">{t('trader.globalRuntime', 'Global runtime')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pb-4 lg:grid-cols-[1fr_280px_1.2fr]">
        {loadError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 lg:col-span-3">
            采样运行时暂不可用，已保留本地默认值。后端恢复后点击刷新即可重新读取。错误：{loadError}
          </div>
        ) : null}
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('trader.samplingDepth', 'Sampling Depth')}</span>
            <span className="text-sm text-muted-foreground">{samplingDepth} points</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[10, 20, 30, 40, 50, 60].map((depth) => (
              <Button
                key={depth}
                variant={samplingDepth === depth ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSamplingDepth(depth)}
                className="h-8 px-2 text-xs"
              >
                {depth}
                {depth > maxAllowedDepth && <Lock className="ml-1 h-3 w-3" />}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || samplingDepth > maxAllowedDepth} size="sm">
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
            {samplingDepth > maxAllowedDepth && (
              <span className="text-xs text-muted-foreground">
                {t('trader.depthLimitHint', 'Increase HAA_MAX_SAMPLING_DEPTH to enable this value.')}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Info className="h-3.5 w-3.5" />
            {t('trader.currentWindow', 'Current Window')}
          </div>
          <div>{t('trader.samplingInterval', 'Interval')}: {samplingInterval}s</div>
          <div>{t('trader.dataCoverage', 'Data coverage')}: {((samplingDepth * samplingInterval) / 60).toFixed(1)}m</div>
          <div>{t('trader.entitlementLimit', 'Entitlement limit')}: {maxAllowedDepth}</div>
        </div>

        <div className="min-w-0 rounded-md border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{t('trader.samplingPoolStatus', 'Sampling Pool Status')}</div>
            <Button variant="outline" size="sm" onClick={loadSamplingSettings} disabled={saving}>
              {t('common.refresh', 'Refresh')}
            </Button>
          </div>
          {statusRows.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {statusRows.map(([symbol, status]) => (
                <div key={symbol} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-xs">
                  <span className="shrink-0 font-medium">{symbol}</span>
                  <span className="min-w-0 truncate text-right text-muted-foreground">
                    {status.sample_count}/{status.max_samples ?? samplingDepth}
                    {status.coverage_seconds ? ` · ${(status.coverage_seconds / 60).toFixed(1)}m` : ''}
                    {typeof status.price_change_percent === 'number' ? ` · ${status.price_change_percent.toFixed(2)}%` : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t('trader.noSamplingDataYet', 'No live sampling data yet. It will appear after market polling starts.')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

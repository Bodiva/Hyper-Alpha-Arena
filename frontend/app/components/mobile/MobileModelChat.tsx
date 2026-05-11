import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Database, Loader2, Send } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getArenaModelChat, getModelChatSnapshots, ArenaModelChatEntry, ModelChatSnapshots } from '@/lib/api'
import {
  listDatasetBindingsAsync,
  listImportedFileBatchesAsync,
  type DatasetBinding,
  type ImportedFileBatch,
} from '@/entities/data-source/api'
import { submitAgentRunAsync } from '@/entities/agent/api'
import { navigateTo } from '@/shared/lib/navigation'
import { useTradingMode } from '@/contexts/TradingModeContext'
import { getModelLogo } from '@/components/portfolio/logoAssets'
import { formatDateTime } from '@/lib/dateTime'
import ExchangeIcon from '@/components/exchange/ExchangeIcon'
import { ExchangeId, EXCHANGE_DISPLAY_NAMES } from '@/lib/types/exchange'

const formatDate = (value?: string | null) => formatDateTime(value, { style: 'short' })

export default function MobileModelChat() {
  const { t } = useTranslation()
  const { tradingMode } = useTradingMode()
  const [entries, setEntries] = useState<ArenaModelChatEntry[]>([])
  const [datasets, setDatasets] = useState<ImportedFileBatch[]>([])
  const [datasetBindings, setDatasetBindings] = useState<DatasetBinding[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('')
  const [question, setQuestion] = useState('')
  const [submittingQuestion, setSubmittingQuestion] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [expandedChat, setExpandedChat] = useState<number | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const snapshotCache = useRef<Map<number, ModelChatSnapshots>>(new Map())
  const [loadingSnapshots, setLoadingSnapshots] = useState<Set<number>>(new Set())
  const [detailEntry, setDetailEntry] = useState<{ entry: ArenaModelChatEntry; section: string } | null>(null)

  useEffect(() => {
    if (tradingMode === 'testnet' || tradingMode === 'mainnet') {
      loadEntries()
    }
  }, [tradingMode])

  useEffect(() => {
    let cancelled = false
    setLoadingDatasets(true)
    Promise.all([listImportedFileBatchesAsync(), listDatasetBindingsAsync({ activeOnly: true })])
      .then(([batchResponse, bindingResponse]) => {
        if (cancelled) return
        const nextDatasets = batchResponse.items || []
        setDatasets(nextDatasets)
        setDatasetBindings(bindingResponse.items || [])
        setSelectedDatasetId((current) => current || nextDatasets[0]?.importId || '')
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to load ClickHouse datasets:', error)
        setDatasets([])
        setDatasetBindings([])
      })
      .finally(() => {
        if (!cancelled) setLoadingDatasets(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const data = await getArenaModelChat({ trading_mode: tradingMode, limit: 50 })
      setEntries(data.entries || [])
    } catch (error) {
      console.error('Failed to load model chat:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSnapshots = async (entryId: number) => {
    if (snapshotCache.current.has(entryId)) return
    setLoadingSnapshots(prev => new Set(prev).add(entryId))
    try {
      const snapshots = await getModelChatSnapshots(entryId)
      snapshotCache.current.set(entryId, snapshots)
    } catch (error) {
      console.error('Failed to load snapshots:', error)
    } finally {
      setLoadingSnapshots(prev => {
        const next = new Set(prev)
        next.delete(entryId)
        return next
      })
    }
  }

  const getSnapshotData = (entry: ArenaModelChatEntry): Partial<ModelChatSnapshots> => {
    return snapshotCache.current.get(entry.id) || {}
  }

  const toggleSection = (entryId: number, section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [`${entryId}-${section}`]: !prev[`${entryId}-${section}`]
    }))
  }

  const isSectionExpanded = (entryId: number, section: string) => {
    return !!expandedSections[`${entryId}-${section}`]
  }

  const getOperationStyle = (operation?: string) => {
    const op = (operation || '').toUpperCase()
    if (op === 'BUY') return 'bg-emerald-100 text-emerald-800'
    if (op === 'SELL') return 'bg-red-100 text-red-800'
    if (op === 'CLOSE') return 'bg-blue-100 text-blue-800'
    if (op === 'HOLD') return 'bg-gray-200 text-gray-800'
    return 'bg-orange-100 text-orange-800'
  }

  const selectedDataset = datasets.find((item) => item.importId === selectedDatasetId)
  const selectedBinding = datasetBindings.find((item) => item.datasetId === selectedDatasetId)
  const selectedAssetSymbol = selectedBinding?.dataSymbol || selectedBinding?.assetSymbol || selectedDataset?.assetSymbol

  const submitResearchQuestion = async () => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || submittingQuestion) return

    setSubmittingQuestion(true)
    setSubmitError(null)
    try {
      const run = await submitAgentRunAsync({
        assetId: selectedBinding?.assetId || 'asset_etf_510300',
        portfolioId: 'portfolio_etf_core_001',
        strategyId: 'strategy_etf_rotation_001',
        taskType: 'single_asset_analysis',
        question: trimmedQuestion,
        horizon: 'medium_term',
        riskPreference: 'balanced',
        evidenceScope: {
          includeNews: true,
          includeReports: true,
          includeMacro: true,
          includeMarketSnapshot: true,
        },
        runnerConfig: {
          runnerType: 'qwen',
          modelProvider: 'qwen',
          modelName: 'qwen-plus',
          enableStreaming: true,
          extraParams: {
            enableResearchTools: true,
            ...(selectedDatasetId
              ? {
                  dataContext: {
                    source: 'catalog',
                    datasetId: selectedDatasetId,
                    assetSymbol: selectedAssetSymbol,
                  },
                }
              : {}),
          },
        },
      })
      setQuestion('')
      navigateTo(`/agent-lab/runs/${encodeURIComponent(run.runId)}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '提交投研任务失败')
    } finally {
      setSubmittingQuestion(false)
    }
  }

  // Detail view for full content
  if (detailEntry) {
    const { entry, section } = detailEntry
    const snapshots = getSnapshotData(entry)
    const content = section === 'prompt' ? snapshots.prompt_snapshot
      : section === 'reasoning' ? snapshots.reasoning_snapshot
      : snapshots.decision_snapshot
    const title = section === 'prompt' ? t('feed.userPrompt', 'USER PROMPT')
      : section === 'reasoning' ? t('feed.chainOfThought', 'CHAIN OF THOUGHT')
      : t('feed.tradingDecisions', 'TRADING DECISIONS')

    return (
      <div className="flex flex-col h-full pb-16">
        <div className="flex items-center gap-2 p-3 border-b">
          <Button variant="ghost" size="sm" onClick={() => setDetailEntry(null)} className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium text-sm">{title}</span>
        </div>
        <ScrollArea className="flex-1 p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
            {content || t('feed.noContent', 'No content available')}
          </pre>
        </ScrollArea>
      </div>
    )
  }

  // List view with accordion interaction
  return (
    <div className="flex flex-col h-full pb-16">
      <div className="shrink-0 border-b bg-background p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">投研数据源</span>
            <Badge variant="outline">ClickHouse</Badge>
          </div>
          <span className="text-[11px] text-muted-foreground">K 线保持原逻辑</span>
        </div>
        <Select value={selectedDatasetId || '__none__'} onValueChange={(value) => setSelectedDatasetId(value === '__none__' ? '' : value)}>
          <SelectTrigger className="h-9 bg-background">
            <SelectValue placeholder={loadingDatasets ? '正在读取 ClickHouse 数据...' : '选择 ClickHouse 数据集'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">不绑定数据集</SelectItem>
            {datasets.map((dataset) => (
              <SelectItem key={dataset.importId} value={dataset.importId}>
                {dataset.assetSymbol || dataset.assetName || dataset.sourceName} · {dataset.rows} 行
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="rounded-md border bg-muted/25 p-2 text-[11px] text-muted-foreground">
          {selectedDataset ? (
            <div className="space-y-1">
              <p className="break-all text-foreground">{selectedDataset.importId}</p>
              <p>
                {selectedDataset.minTradeDate || '-'} 至 {selectedDataset.maxTradeDate || '-'} · {selectedDataset.fileName}
              </p>
            </div>
          ) : (
            <p>{loadingDatasets ? '正在读取数据目录...' : '当前未绑定数据集，提交时仅使用默认准备数据和 Bocha。'}</p>
          )}
        </div>
        <div className="space-y-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-h-[76px] resize-none text-sm"
            placeholder="输入投研问题，会使用上面选择的 ClickHouse 数据集提交给 Agent..."
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submitResearchQuestion()
              }
            }}
          />
          {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}
          <Button className="w-full gap-2" onClick={() => void submitResearchQuestion()} disabled={submittingQuestion || !question.trim()}>
            {submittingQuestion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submittingQuestion ? '提交中' : '提交投研对话'}
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : tradingMode !== 'testnet' && tradingMode !== 'mainnet' ? (
        <div className="text-center text-muted-foreground py-8 px-4 text-sm">
          {t('modelChat.hyperliquidOnly', 'Only available in Hyperliquid mode')}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 px-4 text-sm">
          {t('modelChat.noDecisions', 'No decisions yet')}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {entries.map((entry) => {
              const isExpanded = expandedChat === entry.id
              const modelLogo = getModelLogo(entry.account_name || entry.model)
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="w-full text-left border rounded bg-muted/30 p-3 space-y-2"
                  onClick={() => {
                    if (expandedChat === entry.id) {
                      setExpandedChat(null)
                      setExpandedSections(prev => {
                        const next = { ...prev }
                        Object.keys(next).forEach(k => { if (k.startsWith(`${entry.id}-`)) delete next[k] })
                        return next
                      })
                    } else {
                      setExpandedChat(entry.id)
                      loadSnapshots(entry.id)
                    }
                  }}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {modelLogo && <img src={modelLogo.src} alt={modelLogo.alt} className="h-5 w-5 rounded-full" />}
                      <span className="font-semibold text-foreground">{entry.account_name}</span>
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/80">
                        <ExchangeIcon exchangeId={(entry.exchange || 'hyperliquid') as ExchangeId} size={12} />
                        <span className="text-[10px] font-medium text-slate-200">
                          {EXCHANGE_DISPLAY_NAMES[(entry.exchange || 'hyperliquid') as ExchangeId]}
                        </span>
                      </div>
                    </div>
                    <span>{formatDate(entry.decision_time)}</span>
                  </div>
                  {/* Operation row */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getOperationStyle(entry.operation)}`}>
                      {(entry.operation || 'UNKNOWN').toUpperCase()}
                    </span>
                    {entry.symbol && <span className="font-semibold">{entry.symbol}</span>}
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      entry.signal_trigger_id ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {entry.signal_trigger_id ? t('feed.signalPoolTrigger', 'Signal Pool') : t('feed.scheduledTrigger', 'Scheduled')}
                    </span>
                  </div>
                  {/* Reason */}
                  <div className="text-xs text-muted-foreground">
                    {isExpanded ? entry.reason : `${entry.reason?.slice(0, 120) || ''}${(entry.reason?.length || 0) > 120 ? '…' : ''}`}
                  </div>
                  {/* Expanded sections */}
                  {isExpanded && <ExpandedSections entry={entry} />}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )

  function ExpandedSections({ entry }: { entry: ArenaModelChatEntry }) {
    const snapshots = getSnapshotData(entry)
    const isLoadingEntry = loadingSnapshots.has(entry.id)
    const sections = [
      { label: t('feed.userPrompt', 'USER PROMPT'), section: 'prompt', content: snapshots.prompt_snapshot },
      { label: t('feed.chainOfThought', 'CHAIN OF THOUGHT'), section: 'reasoning', content: snapshots.reasoning_snapshot },
      { label: t('feed.tradingDecisions', 'TRADING DECISIONS'), section: 'decision', content: snapshots.decision_snapshot },
    ]
    return (
      <div className="space-y-2 pt-2" onClick={e => e.stopPropagation()}>
        {entry.prompt_template_name && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('feed.promptTemplate', 'Prompt Template')}:</span>
            <span className="px-2 py-0.5 rounded bg-muted font-medium">{entry.prompt_template_name}</span>
          </div>
        )}
        {sections.map(({ label, section, content }) => {
          const open = isSectionExpanded(entry.id, section)
          const showLoading = isLoadingEntry && !content
          return (
            <div key={section} className="border rounded bg-background/60">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground"
                onClick={() => toggleSection(entry.id, section)}
              >
                <span className="flex items-center gap-2">
                  <span>{open ? '▼' : '▶'}</span>
                  {label}
                </span>
                <span className="text-[10px]">{open ? t('feed.hideDetails', 'Hide') : t('feed.showDetails', 'Show')}</span>
              </button>
              {open && (
                <div className="border-t bg-muted/40 px-3 py-2 text-xs">
                  {showLoading ? (
                    <div className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />{t('feed.loading', 'Loading...')}</div>
                  ) : content ? (
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] line-clamp-6">{content}</pre>
                  ) : (
                    <span className="text-muted-foreground">{t('feed.noContent', 'No content')}</span>
                  )}
                  {content && (
                    <button
                      type="button"
                      className="mt-2 text-[10px] text-primary underline"
                      onClick={() => setDetailEntry({ entry, section })}
                    >
                      {t('feed.viewFull', 'View full content')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }
}

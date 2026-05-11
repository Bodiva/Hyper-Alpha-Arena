import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Copy, Loader2, PlugZap, Trash2, XCircle } from 'lucide-react'

export interface OpenClawBridgeStatus {
  configured: boolean
  env_token_configured: boolean
  webhook_path: string
  config?: {
    platform: string
    bot_username?: string | null
    bot_app_id?: string | null
    status?: string
    has_token?: boolean
  } | null
}

interface OpenClawIntegrationModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  status: OpenClawBridgeStatus | null
}

const DEFAULT_WEBHOOK_PATH = '/api/bot/openclaw/webhook'

export default function OpenClawIntegrationModal({
  open,
  onClose,
  onSaved,
  status,
}: OpenClawIntegrationModalProps) {
  const { t } = useTranslation()
  const [bridgeToken, setBridgeToken] = useState('')
  const [agentId, setAgentId] = useState('ecs-openclaw')
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setBridgeToken('')
      setAgentId(status?.config?.bot_app_id || 'ecs-openclaw')
      setError(null)
      setCopied(null)
    }
  }, [open, status?.config?.bot_app_id])

  const webhookUrl = useMemo(() => {
    const path = status?.webhook_path || DEFAULT_WEBHOOK_PATH
    if (typeof window === 'undefined') return path
    return `${window.location.origin}${path}`
  }, [status?.webhook_path])

  const curlExample = useMemo(() => {
    return [
      `curl -X POST "${webhookUrl}"`,
      '  -H "Content-Type: application/json"',
      '  -H "Authorization: Bearer <bridge-token>"',
      '  -d "{\\"message\\":\\"帮我看一下 BTC 当前风险\\",\\"chat_id\\":\\"openclaw-chat-001\\",\\"user\\":{\\"id\\":\\"u1\\",\\"username\\":\\"alice\\"}}"',
    ].join(' \\\n')
  }, [webhookUrl])

  const handleCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1600)
  }

  const handleConnect = async () => {
    const token = bridgeToken.trim()
    if (token.length < 16) {
      setError(t('bot.openclaw.tokenRequired', 'Bridge token must be at least 16 characters.'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/bot/openclaw/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bridge_token: token,
          agent_id: agentId.trim() || 'ecs-openclaw',
        }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) {
        setError(data.detail || data.error || 'Connection failed')
        return
      }
      setBridgeToken('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/bot/openclaw/disconnect', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        setError(data.detail || data.error || 'Disconnect failed')
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setDisconnecting(false)
    }
  }

  const configured = Boolean(status?.configured)
  const statusLabel = status?.env_token_configured
    ? t('bot.openclaw.envConfigured', 'Configured by environment')
    : configured
      ? t('bot.connected', 'Connected')
      : t('bot.openclaw.notConfigured', 'Not configured')

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl overflow-x-hidden sm:max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" />
            {t('bot.openclaw.title', 'OpenClaw Bridge')}
          </DialogTitle>
          <DialogDescription>
            {t('bot.openclaw.desc', 'Let your ECS OpenClaw deployment forward external channel messages into Hyper AI or the Research Assistant.')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4 py-2">
          <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <span className={`h-2.5 w-2.5 rounded-full ${configured ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{statusLabel}</p>
              <p className="text-xs text-muted-foreground">
                {status?.config?.bot_app_id || 'ecs-openclaw'}
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <label className="text-sm font-medium">{t('bot.openclaw.webhookUrl', 'Webhook URL')}</label>
            <div className="flex min-w-0 gap-2">
              <Input value={webhookUrl} readOnly className="min-w-0 flex-1 font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => void handleCopy('url', webhookUrl)}>
                {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <label className="text-sm font-medium">{t('bot.openclaw.agentId', 'Agent ID')}</label>
              <Input value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="ecs-openclaw" className="min-w-0" />
            </div>
            <div className="min-w-0 space-y-2">
              <label className="text-sm font-medium">{t('bot.openclaw.bridgeToken', 'Bridge Token')}</label>
              <Input
                type="password"
                value={bridgeToken}
                onChange={(event) => setBridgeToken(event.target.value)}
                placeholder={configured ? t('bot.openclaw.updateToken', 'Enter a new token to update') : 'long random shared secret'}
                autoComplete="off"
                className="min-w-0 font-mono text-sm"
              />
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">{t('bot.openclaw.curlExample', 'ECS-side call example')}</label>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void handleCopy('curl', curlExample)}>
                {copied === 'curl' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {t('common.copy', 'Copy')}
              </Button>
            </div>
            <pre className="max-h-40 w-full min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs">
              {curlExample}
            </pre>
          </div>

          {status?.env_token_configured ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t('bot.openclaw.envNote', 'This bridge is configured by ALPHATRACE_OPENCLAW_BRIDGE_TOKEN. Updating here saves a database token, but the environment token continues to take precedence until removed.')}
            </p>
          ) : null}

          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {configured && !status?.env_token_configured ? (
              <Button type="button" variant="outline" onClick={() => void handleDisconnect()} disabled={disconnecting || saving}>
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('bot.disconnect', 'Disconnect')}
              </Button>
            ) : null}
            <Button type="button" className="ml-auto" onClick={() => void handleConnect()} disabled={saving || disconnecting}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {configured ? t('bot.openclaw.update', 'Update Bridge') : t('bot.openclaw.connect', 'Connect OpenClaw')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

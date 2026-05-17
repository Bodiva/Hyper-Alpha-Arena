import { FormEvent, useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

const getErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return '请求失败，请稍后重试'
  try {
    const parsed = JSON.parse(error.message)
    if (typeof parsed?.detail === 'string') return parsed.detail
  } catch {
    // Use the raw message below.
  }
  return error.message || '请求失败，请稍后重试'
}

export default function LoginPage() {
  const { login, register, registrationEnabled } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const canRegister = registrationEnabled
  const activeMode = mode === 'register' && canRegister ? 'register' : 'login'
  const isRegistering = activeMode === 'register'
  const submitLabel = isRegistering ? '创建账户' : '登录'
  const submitIcon = useMemo(() => (isRegistering ? UserPlus : LogIn), [isRegistering])
  const SubmitIcon = submitIcon

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      if (isRegistering) {
        await register(username.trim(), password, email.trim() || undefined)
      } else {
        await login(username.trim(), password)
      }
      window.history.replaceState(null, '', '/dashboard')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen bg-muted/30">
      <section className="flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-[420px] rounded-lg bg-background shadow-sm">
          <CardHeader className="gap-2">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                AT
              </div>
              <div className="min-w-0">
                <CardTitle className="text-xl">AlphaTrace</CardTitle>
                <CardDescription>登录后继续访问投研工作台。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex rounded-md border bg-muted p-1">
                <Button
                  type="button"
                  variant={activeMode === 'login' ? 'default' : 'ghost'}
                  className="flex-1"
                  onClick={() => setMode('login')}
                >
                  登录
                </Button>
                <Button
                  type="button"
                  variant={activeMode === 'register' ? 'default' : 'ghost'}
                  className="flex-1"
                  disabled={!canRegister}
                  title={canRegister ? '创建首个本地账户' : '注册已关闭'}
                  onClick={() => setMode('register')}
                >
                  注册
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>

              {isRegistering ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="可选"
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">密码</Label>
                <div className="flex items-center rounded-md border border-input bg-background pr-1 focus-within:ring-1 focus-within:ring-ring">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                    className="border-0 focus-visible:ring-0"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={isRegistering ? 8 : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
                  </Button>
                </div>
              </div>

              {errorMessage ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : null}

              {!canRegister ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <LockKeyhole data-icon="inline-start" />
                  <span>已有本地账户，注册入口已关闭。</span>
                </div>
              ) : null}

              <Button type="submit" size="lg" disabled={isSubmitting || !username.trim() || !password}>
                {isSubmitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <SubmitIcon data-icon="inline-start" />}
                {submitLabel}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

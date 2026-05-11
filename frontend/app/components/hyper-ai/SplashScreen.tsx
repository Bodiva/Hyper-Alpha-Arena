/**
 * SplashScreen - Initial loading screen
 * Waits for both minimum animation duration AND data ready before completing
 */
import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface SplashScreenProps {
  onComplete: () => void
  minDuration?: number
  isReady?: boolean
}

export default function SplashScreen({ onComplete, minDuration = 1500, isReady = false }: SplashScreenProps) {
  const [progress, setProgress] = useState(0)
  const [animationDone, setAnimationDone] = useState(false)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const { i18n } = useTranslation()

  const isZh = i18n.language?.startsWith('zh')

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Animation progress
  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const newProgress = Math.min((elapsed / minDuration) * 100, 100)
      setProgress(newProgress)

      if (elapsed >= minDuration) {
        setAnimationDone(true)
        clearInterval(interval)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [minDuration])

  // Complete when both animation done AND data ready
  useEffect(() => {
    if (animationDone && isReady && !completedRef.current) {
      completedRef.current = true
      onCompleteRef.current()
    }
  }, [animationDone, isReady])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fbfcff] text-[#0f172a]">
      <div className="flex w-full max-w-sm flex-col items-center px-8 text-center">
        <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dbe3f0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
          <span className="text-lg font-semibold text-[#4169e1]">AT</span>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight">
          AlphaTrace
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#64748b]">
          {isZh ? '智能投研决策平台' : 'Intelligent Investment Research Platform'}
        </p>
        <div className="mt-8 h-1 w-52 overflow-hidden rounded-full bg-[#e8edf5]">
          <div
            className="h-full rounded-full bg-[#4169e1] transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-7 text-[11px] font-medium uppercase text-[#94a3b8]">
          Powered by Sunyard.AI
        </p>
      </div>
    </div>
  )
}

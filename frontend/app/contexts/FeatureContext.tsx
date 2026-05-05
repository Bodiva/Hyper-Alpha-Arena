'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getFeatureEntitlements, type FeatureEntitlements } from '@/lib/api'

const DEFAULT_ENTITLEMENTS: FeatureEntitlements = {
  source: 'local-default',
  maxSamplingDepth: 60,
  canUsePromptGenerator: true,
  serviceFeeRate: 0,
}

interface FeatureContextType {
  entitlements: FeatureEntitlements
  loading: boolean
  refreshEntitlements: () => Promise<void>
}

const FeatureContext = createContext<FeatureContextType | undefined>(undefined)

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [entitlements, setEntitlements] = useState<FeatureEntitlements>(DEFAULT_ENTITLEMENTS)
  const [loading, setLoading] = useState(true)

  const refreshEntitlements = async () => {
    try {
      const next = await getFeatureEntitlements()
      setEntitlements(next)
    } catch (error) {
      console.warn('[FeatureContext] Failed to load feature entitlements, using local defaults:', error)
      setEntitlements(DEFAULT_ENTITLEMENTS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshEntitlements()
  }, [])

  const value = useMemo(
    () => ({ entitlements, loading, refreshEntitlements }),
    [entitlements, loading],
  )

  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>
}

export function useFeatures() {
  const context = useContext(FeatureContext)
  if (context === undefined) {
    throw new Error('useFeatures must be used within a FeatureProvider')
  }
  return context
}

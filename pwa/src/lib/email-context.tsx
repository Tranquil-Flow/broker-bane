import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { requestGmailToken, sendViaGmail } from './gmail'
import { requestOutlookToken, sendViaOutlook } from './outlook'
import type { EmailMessage } from './email-templates'
import type { EmailProvider } from '../types'
import { useVault } from './vault-context'

interface EmailContextValue {
  provider: EmailProvider | null
  loaded: boolean
  connectGmail: () => Promise<void>
  connectOutlook: () => Promise<void>
  setProvider: (p: EmailProvider | null) => void
  sendEmail: (message: EmailMessage) => Promise<void>
  openMailto: (message: EmailMessage) => void
}

const EmailContext = createContext<EmailContextValue | null>(null)

export function EmailProvider({ children }: { children: ReactNode }) {
  const { save, load } = useVault()
  const [provider, setProvider] = useState<EmailProvider | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Restore provider from vault on mount (after vault is unlocked)
  useEffect(() => {
    load<EmailProvider>('email-provider')
      .then(p => { if (p) setProvider(p) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [load])

  const connectGmail = useCallback(async () => {
    const accessToken = await requestGmailToken()
    const p: EmailProvider = { type: 'gmail', accessToken }
    setProvider(p)
    // Only persist the provider type, never the access token
    await save('email-provider', { type: p.type })
  }, [save])

  const connectOutlook = useCallback(async () => {
    const accessToken = await requestOutlookToken()
    const p: EmailProvider = { type: 'outlook', accessToken }
    setProvider(p)
    // Only persist the provider type, never the access token
    await save('email-provider', { type: p.type })
  }, [save])

  const sendEmail = useCallback(async (message: EmailMessage) => {
    if (!provider?.accessToken) throw new Error('No email provider connected')
    if (provider.type === 'gmail') {
      await sendViaGmail(provider.accessToken, message)
    } else if (provider.type === 'outlook') {
      await sendViaOutlook(provider.accessToken, message)
    }
  }, [provider])

  const openMailto = useCallback((message: EmailMessage) => {
    const params = new URLSearchParams({
      subject: message.subject,
      body: message.body,
    })
    window.open(`mailto:${message.to}?${params}`, '_blank')
  }, [])

  return (
    <EmailContext.Provider value={{ provider, loaded, connectGmail, connectOutlook, setProvider, sendEmail, openMailto }}>
      {children}
    </EmailContext.Provider>
  )
}

export function useEmail() {
  const ctx = useContext(EmailContext)
  if (!ctx) throw new Error('useEmail must be used inside EmailProvider')
  return ctx
}

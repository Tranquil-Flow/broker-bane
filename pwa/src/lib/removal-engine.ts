import brokers from '../data/brokers.json'
import type { Broker, BrokerStatus, UserProfile } from '../types'
import { buildRemovalEmail, type EmailMessage } from './email-templates'

export function getAllBrokers(): Broker[] {
  return brokers as Broker[]
}

export function getEmailBrokers(): Broker[] {
  return (brokers as Broker[]).filter(
    b => (b.method === 'email' || b.method === 'both') && b.removalEmail
  )
}

export function getWebformBrokers(): Broker[] {
  return (brokers as Broker[]).filter(b => b.method === 'webform' || b.method === 'both')
}

export interface RemovalProgress {
  brokerId: string
  status: 'sent' | 'failed'
  error?: string
}

export async function runEmailRemovals(
  profile: UserProfile,
  statuses: Record<string, BrokerStatus>,
  sendFn: (msg: EmailMessage) => Promise<void>,
  onProgress: (progress: RemovalProgress) => void,
  brokersToProcess?: Broker[]  // optional override for testing
): Promise<void> {
  const targets = (brokersToProcess ?? getEmailBrokers()).filter(b => {
    const s = statuses[b.id]
    return !s || s.status === 'pending' || s.status === 'failed'
  })

  for (const broker of targets) {
    if (!broker.removalEmail) continue

    try {
      const message = buildRemovalEmail(profile, broker.removalLaw, broker.removalEmail)
      await sendFn(message)
      onProgress({ brokerId: broker.id, status: 'sent' })
    } catch (err) {
      onProgress({
        brokerId: broker.id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Rate limiting: avoid triggering spam filters
    await new Promise(r => setTimeout(r, 500))
  }
}

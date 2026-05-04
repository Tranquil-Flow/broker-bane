import brokers from '../data/brokers.json'
import type { Broker, BrokerIdentity, BrokerStatus, RemovalPolicy, UserProfile } from '../types'
import { DEFAULT_REMOVAL_POLICY, normalizeRemovalPolicy } from '../types'
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

export interface RemovalRunOptions {
  brokerIdentity?: BrokerIdentity
  dailyLimit?: number
  delayMs?: number
  now?: Date
}

export interface RemovalRunResult {
  attempted: number
  sent: number
  failed: number
  queued: number
  limitReached: boolean
}

export interface DailyBatch {
  sentToday: number
  remainingAllowance: number
  toSend: Broker[]
  queued: Broker[]
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function statusCountsAgainstDailyLimit(status: BrokerStatus, now: Date): boolean {
  if (status.status !== 'sent' && status.status !== 'manual') return false
  const timestamp = status.sentAt ?? status.lastUpdated
  if (!timestamp) return false
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return false
  return isSameLocalDay(date, now)
}

function isPendingForSend(broker: Broker, statuses: Record<string, BrokerStatus>): boolean {
  const s = statuses[broker.id]
  return !s || s.status === 'pending' || s.status === 'failed'
}

export function getTodaysBatch(
  brokersToProcess: Broker[],
  statuses: Record<string, BrokerStatus>,
  dailyLimit = DEFAULT_REMOVAL_POLICY.dailyLimit,
  now = new Date()
): DailyBatch {
  const normalizedLimit = normalizeRemovalPolicy({ dailyLimit }).dailyLimit
  const targetBrokerIds = new Set(brokersToProcess.map(broker => broker.id))
  const sentToday = Object.values(statuses).filter(status => (
    targetBrokerIds.has(status.brokerId) && statusCountsAgainstDailyLimit(status, now)
  )).length
  const remainingAllowance = Math.max(0, normalizedLimit - sentToday)
  const pending = brokersToProcess.filter(b => b.removalEmail && isPendingForSend(b, statuses))

  return {
    sentToday,
    remainingAllowance,
    toSend: pending.slice(0, remainingAllowance),
    queued: pending.slice(remainingAllowance),
  }
}

export async function runEmailRemovals(
  profile: UserProfile,
  statuses: Record<string, BrokerStatus>,
  sendFn: (msg: EmailMessage) => Promise<void>,
  onProgress: (progress: RemovalProgress) => void,
  brokersToProcess?: Broker[],
  options: RemovalRunOptions = {}
): Promise<RemovalRunResult> {
  const allTargets = brokersToProcess ?? getEmailBrokers()
  const dailyLimit = options.dailyLimit ?? DEFAULT_REMOVAL_POLICY.dailyLimit
  const delayMs = options.delayMs ?? 500
  const batch = getTodaysBatch(allTargets, statuses, dailyLimit, options.now)

  const result: RemovalRunResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    queued: batch.queued.length,
    limitReached: batch.queued.length > 0,
  }

  for (const broker of batch.toSend) {
    if (!broker.removalEmail) continue

    try {
      result.attempted++
      const message = buildRemovalEmail(profile, broker.removalLaw, broker.removalEmail, {
        brokerIdentity: options.brokerIdentity,
      })
      await sendFn(message)
      result.sent++
      onProgress({ brokerId: broker.id, status: 'sent' })
    } catch (err) {
      result.failed++
      onProgress({
        brokerId: broker.id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Rate limiting: avoid triggering spam filters and provider throttles.
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return result
}

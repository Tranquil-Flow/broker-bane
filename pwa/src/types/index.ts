export interface UserProfile {
  names: string[]
  /** Emails brokers may already know and should use to find matching records. */
  emails: string[]
  addresses: string[]
  phone?: string
  dob?: string // YYYY-MM-DD
}

export type BrokerIdentityMode = 'dedicated_mailbox' | 'masked_alias' | 'plus_alias' | 'same_mailbox'

export interface BrokerIdentity {
  mode: BrokerIdentityMode
  /** Mailbox brokers should see and reply to. Prefer a dedicated removal mailbox. */
  email: string
  label?: string
}

export interface RemovalPolicy {
  /** Maximum automated/draft sends per local day. Fresh mailboxes should use 10-20. */
  dailyLimit: number
  /** Delay between provider API sends/draft openings. */
  delayMs: number
}

export const MIN_DAILY_REMOVAL_LIMIT = 1
export const MAX_DAILY_REMOVAL_LIMIT = 25

export const DEFAULT_REMOVAL_POLICY: RemovalPolicy = {
  dailyLimit: 10,
  delayMs: 2_000,
}

export function normalizeRemovalPolicy(policy: Partial<RemovalPolicy> = {}): RemovalPolicy {
  const parsedLimit = Number.parseInt(String(policy.dailyLimit ?? DEFAULT_REMOVAL_POLICY.dailyLimit), 10)
  const dailyLimit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_DAILY_REMOVAL_LIMIT, Math.max(MIN_DAILY_REMOVAL_LIMIT, parsedLimit))
    : DEFAULT_REMOVAL_POLICY.dailyLimit
  const parsedDelay = Number.parseInt(String(policy.delayMs ?? DEFAULT_REMOVAL_POLICY.delayMs), 10)

  return {
    dailyLimit,
    delayMs: Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : DEFAULT_REMOVAL_POLICY.delayMs,
  }
}

export type BrokerMethod = 'email' | 'webform' | 'both'
export type RemovalLaw = 'gdpr' | 'ccpa' | 'generic'

export interface Broker {
  id: string
  name: string
  method: BrokerMethod
  removalEmail?: string
  removalLaw: RemovalLaw
  category: string
  notes?: string
}

export type RemovalStatus = 'pending' | 'sent' | 'confirmed' | 'manual' | 'failed'

export interface BrokerStatus {
  brokerId: string
  status: RemovalStatus
  sentAt?: string
  lastUpdated: string
}

export interface EmailProvider {
  type: 'gmail' | 'outlook' | 'mailto'
  accessToken?: string
  email?: string
}

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

export const DEFAULT_REMOVAL_POLICY: RemovalPolicy = {
  dailyLimit: 10,
  delayMs: 2_000,
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

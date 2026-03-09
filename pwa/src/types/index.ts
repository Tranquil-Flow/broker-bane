export interface UserProfile {
  names: string[]
  emails: string[]
  addresses: string[]
  phone?: string
  dob?: string // YYYY-MM-DD
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

import type { IDBPDatabase } from 'idb'
import type { UserProfile, BrokerStatus } from '../types'
import type { PortablePayload, PortableProfile, PortableRemovalRequest } from '@brokerbane/portable/schema.js'
import { loadEncrypted, saveEncrypted } from './storage'

// Map PWA names array → CLI first_name/last_name (take first entry as primary)
export function pwaToCLIProfile(pwa: UserProfile): PortableProfile {
  const primaryName = pwa.names[0] ?? ''
  const nameParts = primaryName.trim().split(/\s+/)
  const first_name = nameParts[0] ?? ''
  const last_name = nameParts.slice(1).join(' ')
  const aliases = pwa.names.slice(1)
  const primaryEmail = pwa.emails[0] ?? ''

  return {
    first_name,
    last_name,
    email: primaryEmail,
    aliases,
    phone: pwa.phone,
    date_of_birth: pwa.dob,
    country: 'US',
  }
}

// Map CLI profile → PWA names array
export function cliToPWAProfile(cli: PortableProfile): UserProfile {
  const primaryName = [cli.first_name, cli.last_name].filter(Boolean).join(' ')
  const names = [primaryName, ...(cli.aliases ?? [])].filter(Boolean)
  return {
    names,
    emails: [cli.email].filter(Boolean),
    addresses: [],
    phone: cli.phone,
    dob: cli.date_of_birth,
  }
}

// Map BrokerStatus → PortableRemovalRequest
function statusToRequest(s: BrokerStatus): PortableRemovalRequest {
  return {
    _export_id: `rr:${s.brokerId}`,
    broker_id: s.brokerId,
    method: 'email',
    status: s.status,
    template_used: '',
    email_sent_to: null,
    confidence_score: null,
    attempt_count: 1,
    last_error: null,
    metadata: null,
    created_at: s.sentAt ?? s.lastUpdated,
    updated_at: s.lastUpdated,
  }
}

export async function exportFromVault(
  db: IDBPDatabase,
  vaultKey: CryptoKey,
): Promise<PortablePayload> {
  const profile = await loadEncrypted<UserProfile>(db, vaultKey, 'profile')
  const statuses = await loadEncrypted<Record<string, BrokerStatus>>(db, vaultKey, 'statuses')

  const portableProfile = profile
    ? pwaToCLIProfile(profile)
    : { first_name: '', last_name: '', email: '', aliases: [], country: 'US' }

  const removal_requests = Object.values(statuses ?? {}).map(statusToRequest)

  return {
    profile: portableProfile,
    settings: {
      template: 'generic',
      regions: ['us'],
      tiers: [1, 2, 3],
      excluded_brokers: [],
      delay_min_ms: 5000,
      delay_max_ms: 15000,
      dry_run: false,
      verify_before_send: false,
      scan_interval_days: 30,
    },
    removal_requests,
    broker_responses: [],
    email_log: [],
    evidence_chain: [],
    pending_tasks: [],
    scan_runs: [],
    scan_results: [],
    pipeline_runs: [],
    warnings: { screenshots_excluded: true, credentials_excluded: true },
  }
}

export async function importToVault(
  db: IDBPDatabase,
  vaultKey: CryptoKey,
  payload: PortablePayload,
  mode: 'replace' | 'merge',
): Promise<{ added: number; skipped: number }> {
  const pwaProfile = cliToPWAProfile(payload.profile)

  if (mode === 'replace') {
    await saveEncrypted(db, vaultKey, 'profile', pwaProfile)
    const newStatuses: Record<string, BrokerStatus> = {}
    for (const rr of payload.removal_requests) {
      newStatuses[rr.broker_id] = {
        brokerId: rr.broker_id,
        status: rr.status as BrokerStatus['status'],
        sentAt: rr.created_at,
        lastUpdated: rr.updated_at,
      }
    }
    await saveEncrypted(db, vaultKey, 'statuses', newStatuses)
    return { added: payload.removal_requests.length, skipped: 0 }
  } else {
    // Merge: only add brokers not already in vault
    const existing = await loadEncrypted<Record<string, BrokerStatus>>(db, vaultKey, 'statuses') ?? {}
    const merged = { ...existing }
    let added = 0
    let skipped = 0
    for (const rr of payload.removal_requests) {
      if (merged[rr.broker_id]) {
        skipped++
      } else {
        merged[rr.broker_id] = {
          brokerId: rr.broker_id,
          status: rr.status as BrokerStatus['status'],
          sentAt: rr.created_at,
          lastUpdated: rr.updated_at,
        }
        added++
      }
    }
    await saveEncrypted(db, vaultKey, 'statuses', merged)
    return { added, skipped }
  }
}

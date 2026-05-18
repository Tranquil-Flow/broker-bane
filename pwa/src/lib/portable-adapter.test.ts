import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportFromVault, importToVault } from './portable-adapter'
import type { PortablePayload } from '@brokerbane/portable/schema.js'
import type { BrokerIdentity, BrokerStatus, RemovalPolicy, UserProfile } from '../types'

const loadEncrypted = vi.fn()
const saveEncrypted = vi.fn()

vi.mock('./storage', () => ({
  loadEncrypted: (...args: unknown[]) => loadEncrypted(...args),
  saveEncrypted: (...args: unknown[]) => saveEncrypted(...args),
}))

const db = {} as never
const key = {} as CryptoKey

const profile: UserProfile = {
  names: ['Evi Example'],
  emails: ['personal@example.com'],
  addresses: ['1 Moon Lane'],
}

const statuses: Record<string, BrokerStatus> = {
  alpha: {
    brokerId: 'alpha',
    status: 'sent',
    sentAt: '2026-05-04T12:00:00.000Z',
    lastUpdated: '2026-05-04T12:05:00.000Z',
  },
}

const brokerIdentity: BrokerIdentity = {
  mode: 'dedicated_mailbox',
  email: 'removals@example.com',
  label: 'Dedicated removal mailbox',
}

function portablePayload(settings: PortablePayload['settings']): PortablePayload {
  return {
    profile: {
      first_name: 'Evi',
      last_name: 'Example',
      email: 'personal@example.com',
      aliases: [],
      country: 'US',
    },
    settings,
    removal_requests: [
      {
        _export_id: 'rr:alpha',
        broker_id: 'alpha',
        method: 'email',
        status: 'sent',
        template_used: 'generic',
        email_sent_to: 'alpha@example.com',
        confidence_score: null,
        attempt_count: 1,
        last_error: null,
        metadata: null,
        created_at: '2026-05-04T12:00:00.000Z',
        updated_at: '2026-05-04T12:05:00.000Z',
      },
    ],
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

describe('portable adapter autopilot settings', () => {
  beforeEach(() => {
    loadEncrypted.mockReset()
    saveEncrypted.mockReset()
  })

  it('exports the primary PWA address into the portable profile', async () => {
    loadEncrypted.mockImplementation(async (_db, _key, name: string) => {
      if (name === 'profile') return profile
      if (name === 'statuses') return statuses
      if (name === 'removal-policy') return { dailyLimit: 7, delayMs: 3_000 }
      if (name === 'broker-identity') return brokerIdentity
      return null
    })

    const exported = await exportFromVault(db, key)

    expect(exported.profile.address).toBe('1 Moon Lane')
  })

  it('imports portable profile addresses into the PWA profile on replace', async () => {
    const payload = portablePayload({
      template: 'generic',
      regions: ['us'],
      tiers: [1, 2, 3],
      excluded_brokers: [],
      daily_limit: 9,
      delay_min_ms: 4_000,
      delay_max_ms: 10_000,
      dry_run: false,
      verify_before_send: false,
      scan_interval_days: 30,
    })
    payload.profile.address = '42 Backup Road'

    await importToVault(db, key, payload, 'replace')

    expect(saveEncrypted).toHaveBeenCalledWith(db, key, 'profile', expect.objectContaining({
      addresses: ['42 Backup Road'],
    }))
  })

  it('exports the PWA removal policy as portable daily limit and delay settings', async () => {
    const policy: RemovalPolicy = { dailyLimit: 7, delayMs: 3_000 }
    loadEncrypted.mockImplementation(async (_db, _key, name: string) => {
      if (name === 'profile') return profile
      if (name === 'statuses') return statuses
      if (name === 'removal-policy') return policy
      if (name === 'broker-identity') return brokerIdentity
      return null
    })

    const exported = await exportFromVault(db, key)

    expect(exported.settings.daily_limit).toBe(7)
    expect(exported.settings.delay_min_ms).toBe(3_000)
    expect(exported.settings.delay_max_ms).toBe(3_000)
    expect(exported.settings.broker_identity_email).toBe('removals@example.com')
    expect(exported.settings.broker_identity_mode).toBe('dedicated_mailbox')
  })

  it('imports portable pacing settings into the PWA removal policy on replace', async () => {
    const payload = portablePayload({
      template: 'generic',
      regions: ['us'],
      tiers: [1, 2, 3],
      excluded_brokers: [],
      daily_limit: 9,
      delay_min_ms: 4_000,
      delay_max_ms: 10_000,
      broker_identity_email: 'restored-removals@example.com',
      broker_identity_mode: 'masked_alias',
      dry_run: false,
      verify_before_send: false,
      scan_interval_days: 30,
    })

    await importToVault(db, key, payload, 'replace')

    expect(saveEncrypted).toHaveBeenCalledWith(db, key, 'removal-policy', {
      dailyLimit: 9,
      delayMs: 4_000,
    })
    expect(saveEncrypted).toHaveBeenCalledWith(db, key, 'broker-identity', {
      mode: 'masked_alias',
      email: 'restored-removals@example.com',
      label: 'Imported removal mailbox',
    })
  })
})

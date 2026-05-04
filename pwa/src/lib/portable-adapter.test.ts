import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportFromVault, importToVault } from './portable-adapter'
import type { PortablePayload } from '@brokerbane/portable/schema.js'
import type { BrokerStatus, RemovalPolicy, UserProfile } from '../types'

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

  it('exports the PWA removal policy as portable daily limit and delay settings', async () => {
    const policy: RemovalPolicy = { dailyLimit: 7, delayMs: 3_000 }
    loadEncrypted.mockImplementation(async (_db, _key, name: string) => {
      if (name === 'profile') return profile
      if (name === 'statuses') return statuses
      if (name === 'removal-policy') return policy
      return null
    })

    const exported = await exportFromVault(db, key)

    expect(exported.settings.daily_limit).toBe(7)
    expect(exported.settings.delay_min_ms).toBe(3_000)
    expect(exported.settings.delay_max_ms).toBe(3_000)
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
      dry_run: false,
      verify_before_send: false,
      scan_interval_days: 30,
    })

    await importToVault(db, key, payload, 'replace')

    expect(saveEncrypted).toHaveBeenCalledWith(db, key, 'removal-policy', {
      dailyLimit: 9,
      delayMs: 4_000,
    })
  })
})

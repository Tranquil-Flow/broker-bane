import { describe, it, expect, vi } from 'vitest'
import { getEmailBrokers, getWebformBrokers, getAllBrokers, runEmailRemovals } from './removal-engine'
import type { UserProfile, BrokerStatus } from '../types'

describe('getEmailBrokers', () => {
  it('returns only email-capable brokers', () => {
    const brokers = getEmailBrokers()
    expect(brokers.every(b => b.method === 'email' || b.method === 'both')).toBe(true)
    expect(brokers.length).toBeGreaterThan(0)
  })

  it('all returned brokers have a removalEmail field', () => {
    const brokers = getEmailBrokers()
    expect(brokers.every(b => typeof b.removalEmail === 'string' && b.removalEmail.length > 0)).toBe(true)
  })
})

describe('getWebformBrokers', () => {
  it('returns only webform brokers', () => {
    const brokers = getWebformBrokers()
    expect(brokers.every(b => b.method === 'webform' || b.method === 'both')).toBe(true)
  })
})

describe('getAllBrokers', () => {
  it('returns all brokers', () => {
    const all = getAllBrokers()
    const email = getEmailBrokers()
    const web = getWebformBrokers()
    expect(all.length).toBeGreaterThanOrEqual(email.length)
    expect(all.length).toBeGreaterThanOrEqual(web.length)
  })
})

describe('runEmailRemovals', () => {
  const profile: UserProfile = {
    names: ['Test User'],
    emails: ['test@example.com'],
    addresses: ['123 Test St'],
  }

  it('calls sendFn for each pending email broker', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const statuses: Record<string, BrokerStatus> = {}

    // Use a subset: first 3 email brokers
    const brokers = getEmailBrokers().slice(0, 3)

    await runEmailRemovals(profile, statuses, sendFn, onProgress, brokers)

    expect(sendFn).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
  })

  it('skips already-sent brokers', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const brokers = getEmailBrokers().slice(0, 3)

    const statuses: Record<string, BrokerStatus> = {
      [brokers[0].id]: { brokerId: brokers[0].id, status: 'sent', lastUpdated: new Date().toISOString() },
    }

    await runEmailRemovals(profile, statuses, sendFn, onProgress, brokers)

    expect(sendFn).toHaveBeenCalledTimes(2) // skipped the already-sent one
  })

  it('reports failed status when sendFn throws', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('network error'))
    const onProgress = vi.fn()
    const statuses: Record<string, BrokerStatus> = {}
    const brokers = getEmailBrokers().slice(0, 1)

    await runEmailRemovals(profile, statuses, sendFn, onProgress, brokers)

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })
})

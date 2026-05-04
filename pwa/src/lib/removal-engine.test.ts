import { describe, it, expect, vi } from 'vitest'
import { getEmailBrokers, getWebformBrokers, getAllBrokers, runEmailRemovals, getTodaysBatch, getNextLocalBatchTime } from './removal-engine'
import type { UserProfile, BrokerStatus, BrokerIdentity } from '../types'
import { DEFAULT_REMOVAL_POLICY } from '../types'

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

  const brokerIdentity: BrokerIdentity = {
    mode: 'dedicated_mailbox',
    email: 'removals@example.net',
  }

  it('calls sendFn for each pending email broker', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const statuses: Record<string, BrokerStatus> = {}

    // Use a subset: first 3 email brokers
    const brokers = getEmailBrokers().slice(0, 3)

    await runEmailRemovals(profile, statuses, sendFn, onProgress, brokers, { delayMs: 0 })

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

    await runEmailRemovals(profile, statuses, sendFn, onProgress, brokers, { delayMs: 0 })

    expect(sendFn).toHaveBeenCalledTimes(2) // skipped the already-sent one
  })

  it('reports failed status when sendFn throws', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('network error'))
    const onProgress = vi.fn()
    const statuses: Record<string, BrokerStatus> = {}
    const brokers = getEmailBrokers().slice(0, 1)

    await runEmailRemovals(profile, statuses, sendFn, onProgress, brokers, { delayMs: 0 })

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('uses the broker-facing identity email in generated removal requests', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const brokers = getEmailBrokers().slice(0, 1)

    await runEmailRemovals(profile, {}, sendFn, onProgress, brokers, {
      brokerIdentity,
      delayMs: 0,
    })

    expect(sendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Contact / reply email: removals@example.net'),
      })
    )
  })

  it('only sends up to the daily limit and reports remaining queued items', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const brokers = getEmailBrokers().slice(0, 3)

    const result = await runEmailRemovals(profile, {}, sendFn, onProgress, brokers, {
      brokerIdentity,
      dailyLimit: 2,
      delayMs: 0,
    })

    expect(sendFn).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(2)
    expect(result.queued).toBe(1)
    expect(result.limitReached).toBe(true)
  })

  it('uses the privacy-safe default delay between provider sends, but not after the final send', async () => {
    vi.useFakeTimers()
    try {
      const sendFn = vi.fn().mockResolvedValue(undefined)
      const onProgress = vi.fn()
      const brokers = getEmailBrokers().slice(0, 2)

      const resultPromise = runEmailRemovals(profile, {}, sendFn, onProgress, brokers, {
        brokerIdentity,
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(sendFn).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(DEFAULT_REMOVAL_POLICY.delayMs - 1)
      expect(sendFn).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      const result = await resultPromise

      expect(sendFn).toHaveBeenCalledTimes(2)
      expect(result.sent).toBe(2)
      expect(result.queued).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts sent, manual, and confirmed requests from today against the daily batch', () => {
    const brokers = getEmailBrokers().slice(0, 3)
    const today = new Date().toISOString()
    const statuses: Record<string, BrokerStatus> = {
      [brokers[0].id]: { brokerId: brokers[0].id, status: 'sent', sentAt: today, lastUpdated: today },
      [brokers[1].id]: { brokerId: brokers[1].id, status: 'confirmed', sentAt: today, lastUpdated: today },
    }

    const batch = getTodaysBatch(brokers, statuses, 2, new Date(today))

    expect(batch.remainingAllowance).toBe(0)
    expect(batch.toSend).toHaveLength(0)
    expect(batch.queued).toHaveLength(1)
  })

  it('does not let manual webform completions consume the email daily cap', () => {
    const emailBrokers = getEmailBrokers().slice(0, 3)
    const [webformBroker] = getWebformBrokers().filter(b => b.method === 'webform')
    const today = '2026-05-04T12:00:00Z'
    const statuses: Record<string, BrokerStatus> = {
      [webformBroker.id]: {
        brokerId: webformBroker.id,
        status: 'manual',
        sentAt: today,
        lastUpdated: today,
      },
    }

    const batch = getTodaysBatch(emailBrokers, statuses, 2, new Date(today))

    expect(batch.sentToday).toBe(0)
    expect(batch.remainingAllowance).toBe(2)
    expect(batch.toSend.map(b => b.id)).toEqual(emailBrokers.slice(0, 2).map(b => b.id))
    expect(batch.queued).toHaveLength(1)
  })

  it('caps extreme daily limits to a privacy-safe maximum batch size', () => {
    const brokers = getEmailBrokers().slice(0, 30)

    const batch = getTodaysBatch(brokers, {}, 1_000, new Date('2026-05-04T12:00:00Z'))

    expect(batch.remainingAllowance).toBe(25)
    expect(batch.toSend).toHaveLength(25)
    expect(batch.queued).toHaveLength(5)
  })

  it('calculates the next local midnight for resume-tomorrow copy', () => {
    const now = new Date(2026, 4, 4, 15, 30, 45)

    const resumeAt = getNextLocalBatchTime(now)

    expect(resumeAt.getFullYear()).toBe(2026)
    expect(resumeAt.getMonth()).toBe(4)
    expect(resumeAt.getDate()).toBe(5)
    expect(resumeAt.getHours()).toBe(0)
    expect(resumeAt.getMinutes()).toBe(0)
    expect(resumeAt.getSeconds()).toBe(0)
    expect(resumeAt.getMilliseconds()).toBe(0)
  })
})

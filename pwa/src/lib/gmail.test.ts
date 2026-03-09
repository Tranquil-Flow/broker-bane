import { describe, it, expect } from 'vitest'
import { buildGmailPayload } from './gmail'

describe('buildGmailPayload', () => {
  it('returns an object with a raw property', () => {
    const payload = buildGmailPayload({
      to: 'opt-out@broker.com',
      subject: 'Removal Request',
      body: 'Please remove my data.',
    })
    expect(payload).toHaveProperty('raw')
    expect(typeof payload.raw).toBe('string')
  })

  it('base64url-encodes correctly (no +, /, or = chars)', () => {
    const payload = buildGmailPayload({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Body',
    })
    expect(payload.raw).not.toContain('+')
    expect(payload.raw).not.toContain('/')
    expect(payload.raw).not.toContain('=')
  })

  it('decoded content contains To header', () => {
    const payload = buildGmailPayload({
      to: 'opt-out@broker.com',
      subject: 'Removal Request',
      body: 'Please remove my data.',
    })
    // base64url → base64 → decode
    const b64 = payload.raw.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '==='.slice(0, (4 - b64.length % 4) % 4)
    const decoded = atob(padded)
    expect(decoded).toContain('To: opt-out@broker.com')
    expect(decoded).toContain('Subject: Removal Request')
    expect(decoded).toContain('Please remove my data.')
  })
})

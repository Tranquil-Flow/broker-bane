import { describe, it, expect } from 'vitest'
import { buildRemovalEmail } from './email-templates'

const profile = {
  names: ['Alice Smith'],
  emails: ['alice@example.com'],
  addresses: ['123 Main St, London, UK'],
}

describe('buildRemovalEmail', () => {
  it('includes the user name in the subject', () => {
    const email = buildRemovalEmail(profile, 'gdpr', 'data@broker.com')
    expect(email.subject).toContain('Alice Smith')
  })

  it('includes GDPR Article 17 language for gdpr law', () => {
    const email = buildRemovalEmail(profile, 'gdpr', 'data@broker.com')
    expect(email.body).toContain('Article 17')
  })

  it('includes CCPA language for ccpa law', () => {
    const email = buildRemovalEmail(profile, 'ccpa', 'data@broker.com')
    expect(email.body).toContain('1798.105')
  })

  it('sets the To address', () => {
    const email = buildRemovalEmail(profile, 'generic', 'opt-out@broker.com')
    expect(email.to).toBe('opt-out@broker.com')
  })

  it('includes all provided names', () => {
    const multi = { ...profile, names: ['Alice Smith', 'Ali Smith'] }
    const email = buildRemovalEmail(multi, 'generic', 'test@broker.com')
    expect(email.body).toContain('Ali Smith')
  })

  it('handles missing phone and dob gracefully', () => {
    const email = buildRemovalEmail(profile, 'generic', 'test@broker.com')
    expect(email.body).not.toContain('undefined')
    expect(email.body).not.toContain('null')
  })

  it('separates broker-facing contact mailbox from profile emails brokers may know', () => {
    const multi = { ...profile, emails: ['old@example.com', 'work@example.com'] }

    const email = buildRemovalEmail(multi, 'generic', 'test@broker.com', {
      brokerFacingEmail: 'removals@example.net',
    })

    expect(email.body).toContain('Contact / reply email: removals@example.net')
    expect(email.body).toContain('Emails that may identify my records: old@example.com, work@example.com')
    expect(email.body).not.toContain('- Email: old@example.com')
  })

  it('sets Reply-To to the broker-facing mailbox when it differs from known emails', () => {
    const email = buildRemovalEmail(profile, 'generic', 'test@broker.com', {
      brokerIdentity: {
        mode: 'dedicated_mailbox',
        email: 'removals@example.net',
      },
    })

    expect(email.replyTo).toBe('removals@example.net')
  })
})

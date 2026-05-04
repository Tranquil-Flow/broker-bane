import { describe, it, expect } from 'vitest'
import { buildOutlookPayload } from './outlook'

describe('buildOutlookPayload', () => {
  it('includes Reply-To when a broker-facing mailbox is configured', () => {
    const payload = buildOutlookPayload({
      to: 'opt-out@broker.com',
      subject: 'Removal Request',
      body: 'Please remove my data.',
      replyTo: 'removals@example.net',
    })

    expect(payload.message.replyTo).toEqual([
      { emailAddress: { address: 'removals@example.net' } },
    ])
  })
})

import type { BrokerIdentity, RemovalLaw, UserProfile } from '../types'

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

export interface RemovalEmailOptions {
  /** Broker-facing mailbox for replies/confirmations. Kept separate from record-matching emails. */
  brokerFacingEmail?: string
  brokerIdentity?: BrokerIdentity
}

export function buildRemovalEmail(
  profile: UserProfile,
  law: RemovalLaw,
  toAddress: string,
  options: RemovalEmailOptions = {}
): EmailMessage {
  const name = profile.names[0] ?? 'Data Subject'
  const address = profile.addresses[0] ?? ''
  const contactEmail = options.brokerFacingEmail ?? options.brokerIdentity?.email ?? profile.emails[0] ?? ''
  const knownEmails = profile.emails.filter(Boolean)

  const subject = `Data Erasure Request — ${name}`

  const legalSection =
    law === 'gdpr'
      ? `Under the General Data Protection Regulation (GDPR) Article 17, I have the right to erasure ("right to be forgotten"). I request that you delete all personal data you hold about me without undue delay.`
      : law === 'ccpa'
      ? `Under the California Consumer Privacy Act (CCPA) § 1798.105, I have the right to request deletion of personal information collected about me. I hereby invoke this right.`
      : `I am writing to request the deletion of all personal data you hold about me.`

  const contactLines = [
    contactEmail ? `- Contact / reply email: ${contactEmail}` : null,
    knownEmails.length > 0
      ? `- Emails that may identify my records: ${knownEmails.join(', ')}`
      : null,
  ]

  const optionalLines = [
    profile.phone ? `- Phone: ${profile.phone}` : null,
    profile.dob ? `- Date of birth: ${profile.dob}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const body = `To Whom It May Concern,

I am writing to request the immediate removal and deletion of all personal information you hold about me.

${legalSection}

My details:
- Full name(s): ${profile.names.join(', ')}
${contactLines.filter(Boolean).join('\n')}
- Address: ${address}${optionalLines ? '\n' + optionalLines : ''}

Please use the contact / reply email above for confirmations and follow-up. The other email address(es) are identifiers to help locate my records, not permission to add or retain them.

Please confirm in writing that you have complied with this request within 30 days.

Regards,
${name}`

  return { to: toAddress, subject, body }
}

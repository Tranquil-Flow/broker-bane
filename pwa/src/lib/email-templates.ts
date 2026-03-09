import type { UserProfile, RemovalLaw } from '../types'

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

export function buildRemovalEmail(
  profile: UserProfile,
  law: RemovalLaw,
  toAddress: string
): EmailMessage {
  const name = profile.names[0] ?? 'Data Subject'
  const email = profile.emails[0] ?? ''
  const address = profile.addresses[0] ?? ''

  const subject = `Data Erasure Request — ${name}`

  const legalSection =
    law === 'gdpr'
      ? `Under the General Data Protection Regulation (GDPR) Article 17, I have the right to erasure ("right to be forgotten"). I request that you delete all personal data you hold about me without undue delay.`
      : law === 'ccpa'
      ? `Under the California Consumer Privacy Act (CCPA) § 1798.105, I have the right to request deletion of personal information collected about me. I hereby invoke this right.`
      : `I am writing to request the deletion of all personal data you hold about me.`

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
- Email: ${email}
- Address: ${address}${optionalLines ? '\n' + optionalLines : ''}

Please confirm in writing that you have complied with this request within 30 days.

Regards,
${name}`

  return { to: toAddress, subject, body }
}

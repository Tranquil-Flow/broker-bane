import { PublicClientApplication, type SilentRequest } from '@azure/msal-browser'
import type { EmailMessage } from './email-templates'

let msalInstance: PublicClientApplication | null = null

function getMsal(): PublicClientApplication {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID ?? '',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'sessionStorage' },
    })
  }
  return msalInstance
}

export async function requestOutlookToken(): Promise<string> {
  const msal = getMsal()
  await msal.initialize()

  const scopes = ['https://graph.microsoft.com/Mail.Send']

  try {
    const accounts = msal.getAllAccounts()
    if (accounts.length > 0) {
      const silent = await msal.acquireTokenSilent({
        scopes,
        account: accounts[0],
      } as SilentRequest)
      return silent.accessToken
    }
  } catch {
    // Fall through to popup
  }

  const result = await msal.acquireTokenPopup({ scopes })
  return result.accessToken
}

export async function sendViaOutlook(
  accessToken: string,
  message: EmailMessage
): Promise<void> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: 'Text', content: message.body },
        toRecipients: [{ emailAddress: { address: message.to } }],
      },
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Outlook API error ${response.status}: ${JSON.stringify(error)}`)
  }
}

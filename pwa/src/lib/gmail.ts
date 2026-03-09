import type { EmailMessage } from './email-templates'

export interface GmailPayload {
  raw: string
}

export function buildGmailPayload(message: EmailMessage): GmailPayload {
  const rfc2822 = [
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    message.body,
  ].join('\r\n')

  // Encode to UTF-8 bytes, then base64url (Gmail API requirement)
  const bytes = new TextEncoder().encode(rfc2822)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const raw = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return { raw }
}

export async function sendViaGmail(
  accessToken: string,
  message: EmailMessage
): Promise<void> {
  const payload = buildGmailPayload(message)
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Gmail API error ${response.status}: ${JSON.stringify(error)}`)
  }
}

// requestGmailToken uses the Google Identity Services (GIS) library
// loaded via <script src="https://accounts.google.com/gsi/client"> in index.html
// The `google` global is not available in tests — only in the browser
declare const google: any // eslint-disable-line @typescript-eslint/no-explicit-any

export function requestGmailToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID not set'))
      return
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      callback: (response: any) => {
        if (response.error) reject(new Error(response.error))
        else resolve(response.access_token as string)
      },
    })
    client.requestAccessToken()
  })
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OnboardingWizard from './OnboardingWizard'

const save = vi.fn(() => Promise.resolve())
const connectGmail = vi.fn(() => Promise.resolve())
const connectOutlook = vi.fn(() => Promise.resolve())
const setProvider = vi.fn()
let provider: { type: 'gmail' | 'outlook' | 'mailto' } | null = null

vi.mock('../lib/vault-context', () => ({
  useVault: () => ({ save }),
}))

vi.mock('../lib/email-context', () => ({
  useEmail: () => ({ connectGmail, connectOutlook, setProvider, provider }),
}))

describe('OnboardingWizard', () => {
  beforeEach(() => {
    save.mockClear()
    connectGmail.mockClear()
    connectOutlook.mockClear()
    setProvider.mockClear()
    provider = null
  })

  it('saves a dedicated broker-facing mailbox and clamps unsafe daily limits', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Comma-separate aliases/), {
      target: { value: 'Evi Example' },
    })
    fireEvent.change(screen.getByPlaceholderText(/existing emails/), {
      target: { value: 'personal@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Current and past/), {
      target: { value: '1 Moon Lane' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Dedicated mailbox/), {
      target: { value: 'removals@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/10 recommended/), {
      target: { value: '1000' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    await waitFor(() => expect(save).toHaveBeenCalledWith('removal-policy', { dailyLimit: 25, delayMs: 2000 }))
    expect(save).toHaveBeenCalledWith('broker-identity', {
      mode: 'dedicated_mailbox',
      email: 'removals@example.com',
      label: 'Dedicated removal mailbox',
    })
  })

  it('warns when the broker-facing mailbox is left as the profile email', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Comma-separate aliases/), {
      target: { value: 'Evi Example' },
    })
    fireEvent.change(screen.getByPlaceholderText(/existing emails/), {
      target: { value: 'personal@example.com' },
    })

    expect(await screen.findByText(/Use a dedicated removal mailbox to keep broker replies out of your main inbox/)).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(/Dedicated mailbox/), {
      target: { value: 'personal@example.com' },
    })

    expect(await screen.findByText(/This is the same as your first known email/)).toBeTruthy()
  })

  it('rejects invalid known and broker-facing emails before saving', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Comma-separate aliases/), {
      target: { value: 'Evi Example' },
    })
    fireEvent.change(screen.getByPlaceholderText(/existing emails/), {
      target: { value: 'not-an-email' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Current and past/), {
      target: { value: '1 Moon Lane' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Dedicated mailbox/), {
      target: { value: 'also-bad' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    expect(await screen.findByText(/Enter valid known email address/)).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('recovers from vault save failures without leaving onboarding stuck saving', async () => {
    save.mockRejectedValueOnce(new Error('vault locked'))
    render(<OnboardingWizard onComplete={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Comma-separate aliases/), {
      target: { value: 'Evi Example' },
    })
    fireEvent.change(screen.getByPlaceholderText(/existing emails/), {
      target: { value: 'personal@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Current and past/), {
      target: { value: '1 Moon Lane' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    expect(await screen.findByText(/vault locked/)).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('warns and disables OAuth buttons when client IDs are not configured', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText(/Comma-separate aliases/), {
      target: { value: 'Evi Example' },
    })
    fireEvent.change(screen.getByPlaceholderText(/existing emails/), {
      target: { value: 'personal@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Current and past/), {
      target: { value: '1 Moon Lane' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))

    expect(await screen.findByText(/Google OAuth is not configured/)).toBeTruthy()
    expect(screen.getByText(/Microsoft OAuth is not configured/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Sign in with Google/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Sign in with Microsoft/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Use my own email client/ })).toBeTruthy()
  })
})

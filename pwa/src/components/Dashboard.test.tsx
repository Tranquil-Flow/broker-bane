import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import Dashboard from './Dashboard'
import type { Broker, BrokerStatus } from '../types'

const save = vi.fn(() => Promise.resolve())
const load = vi.fn(async (key: string) => {
  if (key === 'statuses') return storedStatuses
  if (key === 'broker-identity') return storedIdentity
  if (key === 'removal-policy') return { dailyLimit: 10, delayMs: 0 }
  if (key === 'autopilot-paused') return storedPaused
  if (key === 'pending-manual-batch') return storedPendingManualBatch
  return null
})
let storedStatuses: Record<string, BrokerStatus> | null = null
let storedIdentity: { mode: 'dedicated_mailbox' | 'same_mailbox'; email: string; label: string } | null = null
let storedPaused: boolean | null = null
let storedPendingManualBatch: string[] | null = null
let provider: { type: 'mailto' | 'gmail' | 'outlook'; accessToken?: string } | null = { type: 'mailto' }
const openMailto = vi.fn()
const sendEmail = vi.fn(() => Promise.resolve())

const baseEmailBrokers: Broker[] = [
  { id: 'a', name: 'Alpha Broker', method: 'email', removalEmail: 'alpha@example.com', removalLaw: 'generic', category: 'people-search' },
  { id: 'b', name: 'Beta Broker', method: 'email', removalEmail: 'beta@example.com', removalLaw: 'generic', category: 'people-search' },
]
let emailBrokers: Broker[] = [...baseEmailBrokers]
const webformBrokers: Broker[] = [
  { id: 'c', name: 'Gamma Manual', method: 'webform', removalLaw: 'ccpa', category: 'people-search', notes: 'Go to gamma.example/optout and confirm by email.' },
]

vi.mock('../lib/vault-context', () => ({
  useVault: () => ({
    save,
    load,
  }),
}))

vi.mock('../lib/email-context', () => ({
  useEmail: () => ({ provider, openMailto, sendEmail }),
}))

vi.mock('../lib/removal-engine', async () => {
  const actual = await vi.importActual<typeof import('../lib/removal-engine')>('../lib/removal-engine')
  return {
    ...actual,
    getAllBrokers: () => [...emailBrokers, ...webformBrokers],
    getEmailBrokers: () => emailBrokers,
    getWebformBrokers: () => webformBrokers,
  }
})

describe('Dashboard safety controls', () => {
  beforeEach(() => {
    save.mockClear()
    openMailto.mockClear()
    sendEmail.mockClear()
    provider = { type: 'mailto' }
    emailBrokers = [...baseEmailBrokers]
    storedStatuses = null
    storedIdentity = { mode: 'dedicated_mailbox', email: 'removals@example.com', label: 'Removal mailbox' }
    storedPaused = null
    storedPendingManualBatch = null
  })

  it('opens mailto drafts only after confirmation and waits for the user to mark them sent', async () => {
    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    const start = await screen.findByRole('button', { name: /Open 2 drafts for today/ })
    fireEvent.click(start)

    expect(openMailto).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Confirm today’s batch/)).toBeTruthy()
    expect(within(dialog).getByText(/Alpha Broker/)).toBeTruthy()
    expect(within(dialog).getByText(/Beta Broker/)).toBeTruthy()
    expect(within(dialog).getByText(/Brokers will see removals@example.com/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm and open drafts/ }))

    await waitFor(() => expect(openMailto).toHaveBeenCalledTimes(2))
    expect(screen.getByText(/0 sent · 0 drafts\/manual/)).toBeTruthy()
    expect(await screen.findByText(/Review your opened drafts/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /I sent these 2 drafts/ }))

    await waitFor(() => expect(screen.getByText(/0 sent · 2 drafts\/manual/)).toBeTruthy())
  })

  it('persists opened mailto drafts across reload until the user resolves them', async () => {
    storedPendingManualBatch = ['a', 'b']

    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    expect(await screen.findByText(/Review your opened drafts/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Review opened drafts first/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Keep them pending/ }))

    await waitFor(() => expect(save).toHaveBeenCalledWith('pending-manual-batch', []))
    expect(await screen.findByRole('button', { name: /Open 2 drafts for today/ })).toBeTruthy()
  })

  it('warns before sending when broker replies would go to the profile inbox', async () => {
    storedIdentity = { mode: 'same_mailbox', email: 'personal@example.com', label: 'Same as profile email' }

    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    expect(await screen.findByText(/Main inbox fallback/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Open 2 drafts for today/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/These replies may land in your main inbox/)).toBeTruthy()
  })

  it('can pause and resume autopilot without sending', async () => {
    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    await screen.findByText(/Ready for today’s batch/)
    fireEvent.click(await screen.findByRole('button', { name: /Pause autopilot/ }))
    expect(save).toHaveBeenCalledWith('autopilot-paused', true)
    expect(screen.getByText(/Autopilot is paused/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /Open 2 drafts for today/ }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Resume autopilot/ }))
    expect(save).toHaveBeenCalledWith('autopilot-paused', false)
  })

  it('requires reconnecting OAuth providers restored without a live access token', async () => {
    provider = { type: 'gmail' }

    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    expect(await screen.findByText(/Reconnect Gmail to continue/)).toBeTruthy()
    const action = screen.getByRole('button', { name: /Reconnect email provider to continue/ }) as HTMLButtonElement
    expect(action.disabled).toBe(true)
    fireEvent.click(action)

    expect(sendEmail).not.toHaveBeenCalled()
    expect(openMailto).not.toHaveBeenCalled()
  })

  it('tracks manual webform opt-outs without reducing the email queue', async () => {
    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    expect(await screen.findByText(/Manual Webform Brokers \(1\)/)).toBeTruthy()
    expect(screen.getByText(/Go to gamma\.example\/optout/)).toBeTruthy()
    expect(screen.getByText('Remaining')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Mark Gamma Manual complete/ }))

    await waitFor(() => expect(screen.getByText(/1 webform\/manual/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /Open 2 drafts for today/ })).toBeTruthy()
    expect(save).toHaveBeenCalledWith('statuses', expect.objectContaining({
      c: expect.objectContaining({ brokerId: 'c', status: 'manual' }),
    }))
  })

  it('initially caps the huge email broker list and lets the user expand it', async () => {
    emailBrokers = Array.from({ length: 55 }, (_, index) => ({
      id: `broker-${index + 1}`,
      name: `Broker ${index + 1}`,
      method: 'email' as const,
      removalEmail: `broker-${index + 1}@example.com`,
      removalLaw: 'generic' as const,
      category: 'people-search',
    }))

    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    expect(await screen.findByText('Broker 50')).toBeTruthy()
    expect(screen.queryByText('Broker 51')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Show 5 more email brokers/ }))

    expect(await screen.findByText('Broker 51')).toBeTruthy()
  })
})

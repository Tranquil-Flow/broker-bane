import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Dashboard from './Dashboard'
import type { Broker, BrokerStatus } from '../types'

const save = vi.fn(() => Promise.resolve())
const load = vi.fn(async (key: string) => {
  if (key === 'statuses') return storedStatuses
  if (key === 'broker-identity') return { mode: 'dedicated_mailbox', email: 'removals@example.com', label: 'Removal mailbox' }
  if (key === 'removal-policy') return { dailyLimit: 10, delayMs: 0 }
  if (key === 'autopilot-paused') return storedPaused
  return null
})
let storedStatuses: Record<string, BrokerStatus> | null = null
let storedPaused: boolean | null = null
let provider: { type: 'mailto' | 'gmail' | 'outlook'; accessToken?: string } | null = { type: 'mailto' }
const openMailto = vi.fn()
const sendEmail = vi.fn(() => Promise.resolve())

const brokers: Broker[] = [
  { id: 'a', name: 'Alpha Broker', method: 'email', removalEmail: 'alpha@example.com', removalLaw: 'generic', category: 'people-search' },
  { id: 'b', name: 'Beta Broker', method: 'email', removalEmail: 'beta@example.com', removalLaw: 'generic', category: 'people-search' },
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
    getAllBrokers: () => brokers,
    getEmailBrokers: () => brokers,
  }
})

describe('Dashboard safety controls', () => {
  beforeEach(() => {
    save.mockClear()
    openMailto.mockClear()
    sendEmail.mockClear()
    provider = { type: 'mailto' }
    storedStatuses = null
    storedPaused = null
  })

  it('opens a confirmation dialog before creating any mailto drafts', async () => {
    await act(async () => {
      render(<Dashboard profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)
    })

    const start = await screen.findByRole('button', { name: /Open 2 drafts for today/ })
    fireEvent.click(start)

    expect(openMailto).not.toHaveBeenCalled()
    expect(screen.getByText(/Confirm today’s batch/)).toBeTruthy()
    expect(screen.getByText(/Brokers will see removals@example.com/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Confirm and open drafts/ }))

    await waitFor(() => expect(openMailto).toHaveBeenCalledTimes(2))
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
})

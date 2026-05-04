import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Settings from './Settings'

const save = vi.fn(() => Promise.resolve())
const load = vi.fn(async (key: string) => {
  if (key === 'broker-identity') return { mode: 'dedicated_mailbox', email: 'old-removals@example.com', label: 'Removal mailbox' }
  if (key === 'removal-policy') return { dailyLimit: 7, delayMs: 2000 }
  return null
})

vi.mock('../lib/vault-context', () => ({
  useVault: () => ({
    db: {},
    key: {},
    load,
    save,
  }),
}))

vi.mock('../lib/backup', () => ({
  exportBackup: vi.fn(() => Promise.resolve()),
}))

describe('Settings removal autopilot controls', () => {
  beforeEach(() => {
    save.mockClear()
    load.mockClear()
  })

  it('loads and saves broker-facing mailbox and daily cap without changing profile identifiers', async () => {
    render(<Settings profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)

    const mailbox = await screen.findByDisplayValue('old-removals@example.com')
    const dailyCap = await screen.findByDisplayValue('7')

    fireEvent.change(mailbox, { target: { value: 'new-removals@example.com' } })
    fireEvent.change(dailyCap, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Removal Settings/ }))

    await waitFor(() => expect(save).toHaveBeenCalledWith('broker-identity', {
      mode: 'dedicated_mailbox',
      email: 'new-removals@example.com',
      label: 'Dedicated removal mailbox',
    }))
    expect(save).toHaveBeenCalledWith('removal-policy', { dailyLimit: 12, delayMs: 2000 })
    expect(screen.getByText(/Known emails/)).toBeTruthy()
    expect(screen.getByText('personal@example.com')).toBeTruthy()
  })

  it('rejects invalid broker-facing mailbox before saving', async () => {
    render(<Settings profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)

    const mailbox = await screen.findByDisplayValue('old-removals@example.com')
    fireEvent.change(mailbox, { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Removal Settings/ }))

    expect(await screen.findByText(/Enter a valid broker-facing mailbox/)).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('clamps saved daily cap to the privacy-safe maximum while preserving existing delay', async () => {
    render(<Settings profile={{ names: ['Evi Example'], emails: ['personal@example.com'], addresses: ['1 Moon Lane'] }} />)

    await screen.findByDisplayValue('old-removals@example.com')
    const dailyCap = await screen.findByDisplayValue('7')
    fireEvent.change(dailyCap, { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Removal Settings/ }))

    await waitFor(() => expect(save).toHaveBeenCalledWith('removal-policy', { dailyLimit: 25, delayMs: 2000 }))
  })
})

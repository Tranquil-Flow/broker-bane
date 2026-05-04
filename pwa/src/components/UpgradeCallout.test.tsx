import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UpgradeCallout from './UpgradeCallout'

describe('UpgradeCallout', () => {
  it('does not advertise a nonexistent desktop app download for browser automation', () => {
    render(<UpgradeCallout />)

    expect(screen.getByText(/brokers require browser automation/i)).toBeTruthy()
    expect(screen.queryByText(/download the desktop app/i)).toBeNull()
    expect(screen.getByText(/local CLI/i)).toBeTruthy()
  })
})

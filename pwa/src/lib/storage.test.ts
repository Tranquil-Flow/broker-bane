import { describe, it, expect } from 'vitest'
import { openStore, saveEncrypted, loadEncrypted } from './storage'
import { deriveKey } from './crypto'

describe('storage', () => {
  it('saves and loads encrypted data by key', async () => {
    const salt = new Uint8Array(16)
    const key = await deriveKey('pass', salt)
    const db = await openStore()
    await saveEncrypted(db, key, 'profile', { name: 'Alice', email: 'alice@example.com' })
    const result = await loadEncrypted(db, key, 'profile')
    expect(result).toEqual({ name: 'Alice', email: 'alice@example.com' })
  })

  it('returns null for missing key', async () => {
    const key = await deriveKey('pass', new Uint8Array(16))
    const db = await openStore()
    const result = await loadEncrypted(db, key, 'nonexistent')
    expect(result).toBeNull()
  })
})

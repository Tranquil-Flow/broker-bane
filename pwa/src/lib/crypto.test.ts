import { describe, it, expect } from 'vitest'
import { deriveKey, encrypt, decrypt } from './crypto'

describe('crypto', () => {
  it('round-trips plaintext through encrypt/decrypt', async () => {
    const key = await deriveKey('test-passphrase', new Uint8Array(16))
    const plaintext = 'hello world'
    const encrypted = await encrypt(key, plaintext)
    const decrypted = await decrypt(key, encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('fails to decrypt with wrong key', async () => {
    const salt = new Uint8Array(16)
    const key1 = await deriveKey('passphrase-1', salt)
    const key2 = await deriveKey('passphrase-2', salt)
    const encrypted = await encrypt(key1, 'secret')
    await expect(decrypt(key2, encrypted)).rejects.toThrow()
  })

  it('deriveKey produces different keys for different salts', async () => {
    const key1 = await deriveKey('same', new Uint8Array(16).fill(1))
    const key2 = await deriveKey('same', new Uint8Array(16).fill(2))
    const raw1 = await crypto.subtle.exportKey('raw', key1)
    const raw2 = await crypto.subtle.exportKey('raw', key2)
    expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2))
  })
})

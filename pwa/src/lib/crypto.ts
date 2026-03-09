export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (salt.length < 16) throw new Error('Salt must be at least 16 bytes')
  if (salt.every(b => b === 0)) throw new Error('Salt must not be all zeros')
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: 200_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface EncryptedBlob {
  iv: string
  data: string
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  }
}

export async function decrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const iv = Uint8Array.from(atob(blob.iv), c => c.charCodeAt(0))
  const data = Uint8Array.from(atob(blob.data), c => c.charCodeAt(0))
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error('Decryption failed — wrong passphrase or corrupted data')
  }
}

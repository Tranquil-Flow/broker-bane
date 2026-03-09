import { openDB, type IDBPDatabase } from 'idb'
import { encrypt, decrypt, type EncryptedBlob } from './crypto'

const DB_NAME = 'brokerbane'
const STORE_NAME = 'vault'

export async function openStore(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME)
    },
  })
}

export async function saveEncrypted(
  db: IDBPDatabase,
  key: CryptoKey,
  storeKey: string,
  value: unknown
): Promise<void> {
  const blob = await encrypt(key, JSON.stringify(value))
  await db.put(STORE_NAME, blob, storeKey)
}

export async function loadEncrypted<T>(
  db: IDBPDatabase,
  key: CryptoKey,
  storeKey: string
): Promise<T | null> {
  const raw = await db.get(STORE_NAME, storeKey)
  if (raw == null) return null
  // Runtime shape guard
  if (typeof raw !== 'object' || typeof raw.iv !== 'string' || typeof raw.data !== 'string') {
    throw new Error(`Corrupted vault entry for key "${storeKey}"`)
  }
  const blob = raw as EncryptedBlob
  try {
    const json = await decrypt(key, blob)
    return JSON.parse(json) as T
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Decryption failed')) {
      throw err // re-throw typed error so UI can show "wrong passphrase"
    }
    throw new Error(`Failed to load vault entry "${storeKey}"`)
  }
}

export async function deleteEntry(db: IDBPDatabase, storeKey: string): Promise<void> {
  await db.delete(STORE_NAME, storeKey)
}

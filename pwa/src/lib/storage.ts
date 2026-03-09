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
  const blob = await db.get(STORE_NAME, storeKey) as EncryptedBlob | undefined
  if (!blob) return null
  const json = await decrypt(key, blob)
  return JSON.parse(json) as T
}

export async function deleteEntry(db: IDBPDatabase, storeKey: string): Promise<void> {
  await db.delete(STORE_NAME, storeKey)
}

import { openDB } from 'idb'

const SALT_STORE = 'meta'
const SALT_KEY = 'pbkdf2_salt'

async function openMetaDb() {
  return openDB('brokerbane-meta', 1, {
    upgrade(db) {
      db.createObjectStore(SALT_STORE)
    },
  })
}

export async function getOrCreateSalt(): Promise<Uint8Array> {
  const db = await openMetaDb()
  const existing = await db.get(SALT_STORE, SALT_KEY)
  if (existing) return existing as Uint8Array
  const salt = crypto.getRandomValues(new Uint8Array(16))
  await db.put(SALT_STORE, salt, SALT_KEY)
  return salt
}

export async function hasSalt(): Promise<boolean> {
  const db = await openMetaDb()
  const existing = await db.get(SALT_STORE, SALT_KEY)
  return existing != null
}

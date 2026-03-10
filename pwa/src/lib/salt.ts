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

export async function getOrCreateSalt(): Promise<{ salt: Uint8Array; created: boolean }> {
  const db = await openMetaDb()
  try {
    const existing = await db.get(SALT_STORE, SALT_KEY) as Uint8Array | undefined
    if (existing) {
      return { salt: existing, created: false }
    }
    const newSalt = crypto.getRandomValues(new Uint8Array(32))
    await db.put(SALT_STORE, newSalt, SALT_KEY)
    return { salt: newSalt, created: true }
  } finally {
    db.close()
  }
}

export async function hasSalt(): Promise<boolean> {
  const db = await openMetaDb()
  try {
    const existing = await db.get(SALT_STORE, SALT_KEY)
    return existing != null
  } finally {
    db.close()
  }
}

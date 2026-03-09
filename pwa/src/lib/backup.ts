import type { IDBPDatabase } from 'idb'

const STORE_NAME = 'vault'

export async function exportBackup(db: IDBPDatabase): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const keys = await store.getAllKeys()
  const entries: Record<string, unknown> = {}

  for (const key of keys) {
    entries[String(key)] = await store.get(key)
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    note: 'This backup is encrypted. Your passphrase is required to restore it.',
    entries,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `brokerbane-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

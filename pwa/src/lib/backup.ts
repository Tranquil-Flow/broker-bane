import type { IDBPDatabase } from 'idb'
import { exportFromVault } from './portable-adapter'
import { serialize } from '@brokerbane/portable/serialize.js'

export async function exportBackup(db: IDBPDatabase, vaultKey: CryptoKey, passphrase: string): Promise<void> {
  const payload = await exportFromVault(db, vaultKey)
  const json = await serialize(payload, passphrase, { source: 'pwa', appVersion: '0.1.0' })
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `brokerbane-${new Date().toISOString().slice(0, 10)}.brokerbane`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

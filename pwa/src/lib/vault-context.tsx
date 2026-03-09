import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { IDBPDatabase } from 'idb'
import { deriveKey } from './crypto'
import { openStore, saveEncrypted, loadEncrypted } from './storage'
import { getOrCreateSalt, hasSalt } from './salt'

interface VaultContextValue {
  key: CryptoKey | null
  db: IDBPDatabase | null
  isFirstRun: boolean
  unlock: (passphrase: string) => Promise<void>
  save: <T>(k: string, v: T) => Promise<void>
  load: <T>(k: string) => Promise<T | null>
  lock: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [db, setDb] = useState<IDBPDatabase | null>(null)
  const [isFirstRun, setIsFirstRun] = useState(false)

  const CANARY_KEY = '__canary__'
  const CANARY_VALUE = 'brokerbane-vault-v1'

  const unlock = useCallback(async (passphrase: string) => {
    const firstRun = !(await hasSalt())
    const salt = await getOrCreateSalt()
    const derivedKey = await deriveKey(passphrase, salt)
    const database = await openStore()

    if (firstRun) {
      // Store a canary so future sessions can verify the passphrase
      await saveEncrypted(database, derivedKey, CANARY_KEY, CANARY_VALUE)
      setIsFirstRun(true)
    } else {
      // Verify passphrase by decrypting the canary
      let canary: string | null
      try {
        canary = await loadEncrypted<string>(database, derivedKey, CANARY_KEY)
      } catch {
        throw new Error('Incorrect passphrase')
      }
      if (canary !== CANARY_VALUE) {
        throw new Error('Incorrect passphrase')
      }
      setIsFirstRun(false)
    }

    setKey(derivedKey)
    setDb(database)
  }, [])

  const save = useCallback(async <T,>(k: string, v: T) => {
    if (!key || !db) throw new Error('Vault locked')
    await saveEncrypted(db, key, k, v)
  }, [key, db])

  const load = useCallback(async <T,>(k: string): Promise<T | null> => {
    if (!key || !db) throw new Error('Vault locked')
    return loadEncrypted<T>(db, key, k)
  }, [key, db])

  const lock = useCallback(() => {
    setKey(null)
    setDb(null)
  }, [])

  return (
    <VaultContext.Provider value={{ key, db, isFirstRun, unlock, save, load, lock }}>
      {children}
    </VaultContext.Provider>
  )
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used inside VaultProvider')
  return ctx
}

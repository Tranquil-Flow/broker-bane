import { useState, useEffect } from 'react'
import { useVault } from '../lib/vault-context'
import { hasSalt } from '../lib/salt'

export default function UnlockScreen() {
  const { unlock } = useVault()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isNew, setIsNew] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    hasSalt().then(has => setIsNew(!has))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (isNew && passphrase !== confirm) {
      setError('Passphrases do not match')
      return
    }
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await unlock(passphrase)
    } catch {
      setError('Incorrect passphrase')
      setLoading(false)
    }
  }

  if (isNew === null) return null

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">BrokerBane</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {isNew
              ? 'Set a passphrase to encrypt your data. It never leaves your device.'
              : 'Enter your passphrase to continue.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              {isNew ? 'Choose a passphrase' : 'Passphrase'}
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
          </div>

          {isNew && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm passphrase</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Unlocking...' : isNew ? 'Set Passphrase & Continue' : 'Unlock'}
          </button>
        </form>

        {!isNew && (
          <p className="text-xs text-slate-500 text-center">
            Your passphrase is never stored or transmitted anywhere.
          </p>
        )}
      </div>
    </div>
  )
}

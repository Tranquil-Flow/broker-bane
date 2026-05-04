import { useEffect, useState, useRef } from 'react'
import { useVault } from '../lib/vault-context'
import { exportBackup } from '../lib/backup'
import { useEmail } from '../lib/email-context'
import ImportPreview from './ImportPreview'
import type { BrokerIdentity, RemovalPolicy, UserProfile } from '../types'
import { DEFAULT_REMOVAL_POLICY, MAX_DAILY_REMOVAL_LIMIT, normalizeRemovalPolicy } from '../types'

export default function Settings({ profile }: { profile: UserProfile }) {
  const { db, key, load, save } = useVault()
  const { provider, connectGmail, connectOutlook, setProvider } = useEmail()
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
  const [exportError, setExportError] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [brokerEmail, setBrokerEmail] = useState('')
  const [savedRemovalPolicy, setSavedRemovalPolicy] = useState<RemovalPolicy>(DEFAULT_REMOVAL_POLICY)
  const [dailyLimit, setDailyLimit] = useState(String(DEFAULT_REMOVAL_POLICY.dailyLimit))
  const [delaySeconds, setDelaySeconds] = useState(String(DEFAULT_REMOVAL_POLICY.delayMs / 1000))
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [settingsError, setSettingsError] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'connecting' | 'saved' | 'error'>('idle')
  const [emailError, setEmailError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const googleOAuthConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
  const microsoftOAuthConfigured = Boolean(import.meta.env.VITE_MICROSOFT_CLIENT_ID)
  const providerLabel = provider?.type === 'gmail'
    ? 'Gmail'
    : provider?.type === 'outlook'
    ? 'Outlook'
    : provider?.type === 'mailto'
    ? 'mailto drafts'
    : 'Not connected'
  const oauthReconnectRequired = Boolean(provider && provider.type !== 'mailto' && !provider.accessToken)
  const usesProfileMailbox = brokerEmail.trim().toLowerCase() === (profile.emails[0] ?? '').trim().toLowerCase()

  useEffect(() => {
    load<BrokerIdentity>('broker-identity')
      .then(identity => setBrokerEmail(identity?.email ?? profile.emails[0] ?? ''))
      .catch(() => setBrokerEmail(profile.emails[0] ?? ''))
    load<RemovalPolicy>('removal-policy')
      .then(policy => {
        const normalized = normalizeRemovalPolicy(policy ?? DEFAULT_REMOVAL_POLICY)
        setSavedRemovalPolicy(normalized)
        setDailyLimit(String(normalized.dailyLimit))
        setDelaySeconds(String(normalized.delayMs / 1000))
      })
      .catch(() => {
        setSavedRemovalPolicy(DEFAULT_REMOVAL_POLICY)
        setDailyLimit(String(DEFAULT_REMOVAL_POLICY.dailyLimit))
        setDelaySeconds(String(DEFAULT_REMOVAL_POLICY.delayMs / 1000))
      })
  }, [load, profile.emails])

  async function handleSaveRemovalSettings() {
    const trimmedEmail = brokerEmail.trim()
    const knownEmail = profile.emails[0] ?? ''
    const parsedLimit = Number.parseInt(dailyLimit, 10)
    const parsedDelaySeconds = Number.parseFloat(delaySeconds)

    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setSettingsError('Enter a valid broker-facing mailbox.')
      setSettingsStatus('error')
      return
    }
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      setSettingsError('Daily cap must be at least 1.')
      setSettingsStatus('error')
      return
    }
    if (!Number.isFinite(parsedDelaySeconds) || parsedDelaySeconds < 0) {
      setSettingsError('Delay between emails must be 0 seconds or more.')
      setSettingsStatus('error')
      return
    }

    const identity: BrokerIdentity = {
      mode: trimmedEmail !== knownEmail ? 'dedicated_mailbox' : 'same_mailbox',
      email: trimmedEmail,
      label: trimmedEmail !== knownEmail ? 'Dedicated removal mailbox' : 'Same as profile email',
    }
    const policy = normalizeRemovalPolicy({
      ...savedRemovalPolicy,
      dailyLimit: parsedLimit,
      delayMs: Math.round(parsedDelaySeconds * 1000),
    })

    try {
      await save('broker-identity', identity)
      await save('removal-policy', policy)
      setSavedRemovalPolicy(policy)
      setDailyLimit(String(policy.dailyLimit))
      setDelaySeconds(String(policy.delayMs / 1000))
      setSettingsStatus('saved')
      setSettingsError('')
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : 'Failed to save removal settings')
      setSettingsStatus('error')
    }
  }

  async function handleUseMailto() {
    setEmailStatus('connecting')
    setEmailError('')
    try {
      const mailtoProvider = { type: 'mailto' as const }
      await save('email-provider', mailtoProvider)
      setProvider(mailtoProvider)
      setEmailStatus('saved')
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : 'Failed to save email connection')
      setEmailStatus('error')
    }
  }

  async function handleReconnect(kind: 'gmail' | 'outlook') {
    setEmailStatus('connecting')
    setEmailError('')
    try {
      if (kind === 'gmail') await connectGmail()
      else await connectOutlook()
      setEmailStatus('saved')
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : `Failed to connect ${kind === 'gmail' ? 'Gmail' : 'Outlook'}`)
      setEmailStatus('error')
    }
  }

  async function handleExport() {
    if (!db || !key || exportPassphrase.length < 8) return
    setExportStatus('exporting')
    setExportError('')
    try {
      await exportBackup(db, key, exportPassphrase)
      setExportStatus('done')
      setExportPassphrase('')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
      setExportStatus('error')
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
    }
  }

  if (importFile) {
    return (
      <ImportPreview
        file={importFile}
        onCancel={() => {
          setImportFile(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>

        {/* Profile */}
        <div className="bg-slate-900 rounded-xl p-5 space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Profile identifiers</h2>
          <ProfileField label="Name" value={profile.names.join(', ') || '—'} />
          <ProfileField label="Known emails" value={profile.emails.join(', ') || '—'} />
          <ProfileField label="Phone" value={profile.phone ?? '—'} />
          <ProfileField label="Date of birth" value={profile.dob ?? '—'} />
          <p className="text-xs text-slate-500 pt-2">
            These identifiers help brokers find records. They are separate from the mailbox brokers should use for replies.
          </p>
        </div>

        {/* Removal identity */}
        <div className="bg-slate-900 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Removal Autopilot</h2>
          <p className="text-xs text-slate-500">
            Use a dedicated removal mailbox or alias when possible. BrokerBane will pace sends over multiple days instead of disturbing your main inbox.
          </p>
          <label className="block text-xs font-medium text-slate-400">Broker-facing mailbox</label>
          <input
            type="email"
            value={brokerEmail}
            onChange={e => {
              setBrokerEmail(e.target.value)
              setSettingsStatus('idle')
            }}
            placeholder="removals@example.com"
            className="w-full bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-violet-500"
          />
          {usesProfileMailbox && (
            <p className="text-xs text-amber-300">
              This uses your main profile email for broker replies. A dedicated mailbox or alias keeps broker confirmations and follow-ups out of your everyday inbox.
            </p>
          )}
          <label className="block text-xs font-medium text-slate-400">Daily email cap (max {MAX_DAILY_REMOVAL_LIMIT})</label>
          <input
            type="number"
            min="1"
            max={MAX_DAILY_REMOVAL_LIMIT}
            value={dailyLimit}
            onChange={e => {
              setDailyLimit(e.target.value)
              setSettingsStatus('idle')
            }}
            className="w-full bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-violet-500"
          />
          <label className="block text-xs font-medium text-slate-400">Delay between emails (seconds)</label>
          <input
            aria-label="Delay between emails"
            type="number"
            min="0"
            step="0.5"
            value={delaySeconds}
            onChange={e => {
              setDelaySeconds(e.target.value)
              setSettingsStatus('idle')
            }}
            className="w-full bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-violet-500"
          />
          <p className="text-xs text-slate-500">
            Use a gentle pause between each message so the removal mailbox behaves like a human-paced workflow instead of a burst sender.
          </p>
          <button
            onClick={handleSaveRemovalSettings}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-sm font-medium transition"
          >
            Save Removal Settings
          </button>
          {settingsStatus === 'saved' && (
            <p className="text-green-400 text-xs">Removal settings saved. Return to the dashboard to use the updated queue.</p>
          )}
          {settingsStatus === 'error' && (
            <p className="text-red-400 text-xs">{settingsError}</p>
          )}
        </div>

        {/* Email connection */}
        <div className="bg-slate-900 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Email Connection</h2>
          <p className="text-xs text-slate-500">
            Connect the same dedicated mailbox or alias you put above. OAuth tokens stay in memory only, so you may need to reconnect after reopening the app.
          </p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">Current provider</span>
            <span className={oauthReconnectRequired ? 'text-amber-300 font-medium' : 'text-slate-200 font-medium'}>
              {oauthReconnectRequired ? `${providerLabel} reconnect required` : providerLabel}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              onClick={() => handleReconnect('gmail')}
              disabled={!googleOAuthConfigured || emailStatus === 'connecting'}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:hover:bg-slate-800"
            >
              {provider?.type === 'gmail' ? 'Reconnect Gmail' : 'Use Gmail'}
            </button>
            <button
              onClick={() => handleReconnect('outlook')}
              disabled={!microsoftOAuthConfigured || emailStatus === 'connecting'}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:hover:bg-slate-800"
            >
              {provider?.type === 'outlook' ? 'Reconnect Outlook' : 'Use Outlook'}
            </button>
            <button
              onClick={handleUseMailto}
              disabled={emailStatus === 'connecting'}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:hover:bg-slate-800"
            >
              Use mailto drafts
            </button>
          </div>
          {!googleOAuthConfigured && !microsoftOAuthConfigured && (
            <p className="text-xs text-amber-400">OAuth client IDs are not configured in this build, so mailto drafts are the safe local-testing path.</p>
          )}
          {emailStatus === 'saved' && <p className="text-green-400 text-xs">Email connection updated. Return to the dashboard to continue autopilot.</p>}
          {emailStatus === 'error' && <p className="text-red-400 text-xs">{emailError}</p>}
        </div>

        {/* Export */}
        <div className="bg-slate-900 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Export Backup</h2>
          <p className="text-xs text-slate-500">
            Creates an encrypted <code>.brokerbane</code> file. Use the same passphrase to import on another device.
          </p>
          <input
            type="password"
            placeholder="Passphrase (min 8 characters)"
            value={exportPassphrase}
            onChange={e => setExportPassphrase(e.target.value)}
            className="w-full bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={handleExport}
            disabled={!db || !key || exportPassphrase.length < 8 || exportStatus === 'exporting'}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {exportStatus === 'exporting' ? 'Exporting…' : 'Download Backup'}
          </button>
          {exportStatus === 'done' && (
            <p className="text-green-400 text-xs">Backup downloaded successfully.</p>
          )}
          {exportStatus === 'error' && (
            <p className="text-red-400 text-xs">{exportError}</p>
          )}
        </div>

        {/* Import */}
        <div className="bg-slate-900 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Import Backup</h2>
          <p className="text-xs text-slate-500">
            Restore data from a <code>.brokerbane</code> file. You will be shown a preview before anything is applied.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".brokerbane,.json"
            onChange={handleFileSelect}
            className="block w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-violet-600 file:text-white hover:file:bg-violet-700 file:cursor-pointer"
          />
        </div>

        {/* Debug info */}
        <div className="bg-slate-900 rounded-xl p-5 space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Debug Info</h2>
          <ProfileField label="Storage" value="IndexedDB (encrypted)" />
          <ProfileField label="Browser" value={navigator.userAgent.split(' ').slice(-1)[0] ?? 'unknown'} />
          <ProfileField label="App version" value="0.1.0" />
        </div>
      </div>
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-slate-500 min-w-[120px]">{label}</span>
      <span className="text-slate-200 break-all">{value}</span>
    </div>
  )
}

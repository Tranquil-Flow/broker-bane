import { useState, useRef } from 'react'
import { useVault } from '../lib/vault-context'
import { exportBackup } from '../lib/backup'
import ImportPreview from './ImportPreview'
import type { UserProfile } from '../types'

export default function Settings({ profile }: { profile: UserProfile }) {
  const { db, key } = useVault()
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
  const [exportError, setExportError] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Profile</h2>
          <ProfileField label="Name" value={profile.names[0] ?? '—'} />
          <ProfileField label="Email" value={profile.emails[0] ?? '—'} />
          <ProfileField label="Phone" value={profile.phone ?? '—'} />
          <ProfileField label="Date of birth" value={profile.dob ?? '—'} />
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
      <span className="text-slate-200">{value}</span>
    </div>
  )
}

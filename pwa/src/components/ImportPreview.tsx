import { useState, useEffect } from 'react'
import { useVault } from '../lib/vault-context'
import { readEnvelope, deserialize } from '@brokerbane/portable/deserialize.js'
import { importToVault } from '../lib/portable-adapter'
import type { ExportEnvelope, PortablePayload } from '@brokerbane/portable/schema.js'

interface ImportPreviewProps {
  file: File
  onCancel: () => void
}

export default function ImportPreview({ file, onCancel }: ImportPreviewProps) {
  const { db, key } = useVault()
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [envelope, setEnvelope] = useState<ExportEnvelope | null>(null)
  const [envelopeError, setEnvelopeError] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [payload, setPayload] = useState<PortablePayload | null>(null)
  const [decryptError, setDecryptError] = useState('')
  const [decrypting, setDecrypting] = useState(false)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState('')

  // Read file and parse envelope on mount
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setFileContent(content)
      try {
        const env = readEnvelope(content)
        setEnvelope(env)
      } catch (err) {
        setEnvelopeError(err instanceof Error ? err.message : 'Invalid backup file')
      }
    }
    reader.onerror = () => setEnvelopeError('Failed to read file')
    reader.readAsText(file)
  }, [file])

  async function handleDecrypt() {
    if (!fileContent || passphrase.length < 8) return
    setDecrypting(true)
    setDecryptError('')
    try {
      const p = await deserialize(fileContent, passphrase)
      setPayload(p)
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : 'Decryption failed')
    } finally {
      setDecrypting(false)
    }
  }

  async function handleImport() {
    if (!db || !key || !payload) return
    setImporting(true)
    setImportError('')
    try {
      const result = await importToVault(db, key, payload, mode)
      setImportResult(result)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (importResult) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="max-w-md w-full mx-4 bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-green-400">Import Complete</h2>
          <p className="text-sm text-slate-300">{importResult.added} brokers added, {importResult.skipped} skipped.</p>
          <button
            onClick={onCancel}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-sm font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 text-sm transition">← Cancel</button>
          <h1 className="text-xl font-bold">Import Backup</h1>
        </div>

        <div className="bg-slate-900 rounded-xl p-5 space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">File Summary</h2>
          <SummaryRow label="File" value={file.name} />
          {envelopeError && <p className="text-red-400 text-sm">{envelopeError}</p>}
          {envelope && (
            <>
              <SummaryRow label="Created" value={new Date(envelope.created_at).toLocaleString()} />
              <SummaryRow label="Source" value={envelope.source} />
              <SummaryRow label="App version" value={envelope.app_version} />
              <SummaryRow label="Removal requests" value={String(envelope.summary.removal_requests)} />
              <SummaryRow label="Email log" value={String(envelope.summary.email_log)} />
              <SummaryRow label="Evidence entries" value={String(envelope.summary.evidence_chain)} />
            </>
          )}
        </div>

        {!payload && envelope && (
          <div className="bg-slate-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Decrypt</h2>
            <input
              type="password"
              placeholder="Enter passphrase"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDecrypt() }}
              className="w-full bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={handleDecrypt}
              disabled={passphrase.length < 8 || decrypting}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {decrypting ? 'Decrypting…' : 'Unlock Backup'}
            </button>
            {decryptError && <p className="text-red-400 text-xs">{decryptError}</p>}
          </div>
        )}

        {payload && (
          <>
            <div className="bg-slate-900 rounded-xl p-5 space-y-2">
              <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-2">Decrypted — Ready to Import</h2>
              <SummaryRow label="Profile" value={`${payload.profile.first_name} ${payload.profile.last_name}`} />
              <SummaryRow label="Removal requests" value={String(payload.removal_requests.length)} />
            </div>

            <div className="bg-slate-900 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Import Mode</h2>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-0.5" />
                <span className="text-sm">
                  <span className="text-white font-medium">Merge</span>
                  <span className="text-slate-400 block text-xs">Add new brokers only; skip brokers already tracked.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-0.5" />
                <span className="text-sm">
                  <span className="text-white font-medium">Replace</span>
                  <span className="text-slate-400 block text-xs">Overwrite all vault data with the backup contents.</span>
                </span>
              </label>

              <button
                onClick={handleImport}
                disabled={importing || !db || !key}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Confirm Import'}
              </button>
              {importError && <p className="text-red-400 text-xs">{importError}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-slate-500 min-w-[140px]">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  )
}

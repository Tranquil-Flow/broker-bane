import { useState, useEffect, useCallback, useRef } from 'react'
import { useVault } from '../lib/vault-context'
import { useEmail } from '../lib/email-context'
import {
  getEmailBrokers,
  getAllBrokers,
  runEmailRemovals,
} from '../lib/removal-engine'
import { buildRemovalEmail } from '../lib/email-templates'
import BrokerCard from './BrokerCard'
import UpgradeCallout from './UpgradeCallout'
import { exportBackup } from '../lib/backup'
import type { UserProfile, BrokerStatus } from '../types'

export default function Dashboard({ profile }: { profile: UserProfile }) {
  const { save, load, db } = useVault()
  const { sendEmail, provider, openMailto } = useEmail()
  const runningRef = useRef(false)
  const [statuses, setStatuses] = useState<Record<string, BrokerStatus>>({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const allBrokers = getAllBrokers()
  const emailBrokers = getEmailBrokers()

  useEffect(() => {
    load<Record<string, BrokerStatus>>('statuses')
      .then(s => { if (s) setStatuses(s) })
      .catch(() => {})
  }, [load])

  const updateStatus = useCallback(
    (brokerId: string, status: BrokerStatus['status']) => {
      setStatuses(prev => {
        const updated = {
          ...prev,
          [brokerId]: {
            brokerId,
            status,
            lastUpdated: new Date().toISOString(),
          },
        }
        // Schedule save outside the state updater
        setTimeout(() => {
          save('statuses', updated).catch(() => {})
        }, 0)
        return updated
      })
    },
    [save]
  )

  async function startRemovals() {
    if (!provider || runningRef.current) return

    if (provider.type === 'mailto') {
      // For mailto, open each broker's email in the user's client
      const emailBrokersToSend = emailBrokers.filter(b => {
        const s = statuses[b.id]
        return !s || s.status === 'pending' || s.status === 'failed'
      })
      for (const broker of emailBrokersToSend) {
        if (!broker.removalEmail) continue
        const message = buildRemovalEmail(profile, broker.removalLaw, broker.removalEmail)
        openMailto(message)
        updateStatus(broker.id, 'sent')
        // Small delay between opening mailto links
        await new Promise(r => setTimeout(r, 200))
      }
      return
    }

    // Gmail/Outlook path
    runningRef.current = true
    setRunning(true)
    setRunError('')
    try {
      await runEmailRemovals(
        profile,
        statuses,
        sendEmail,
        ({ brokerId, status }) => updateStatus(brokerId, status)
      )
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRunning(false)
      runningRef.current = false
    }
  }

  const sentCount = Object.values(statuses).filter(
    s => s.status === 'sent' || s.status === 'confirmed'
  ).length
  const failedCount = Object.values(statuses).filter(s => s.status === 'failed').length
  const remaining = emailBrokers.length - sentCount

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">BrokerBane</h1>
          <span className="text-sm text-slate-400 truncate ml-4">{profile.names[0]}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total brokers" value={allBrokers.length} />
          <StatCard label="Requests sent" value={sentCount} highlight />
          <StatCard label="Remaining" value={remaining} />
        </div>

        {/* CTA */}
        {!provider ? (
          <div className="bg-slate-900 rounded-xl p-4 text-sm text-amber-400">
            No email provider connected. Re-run setup to connect Gmail or Outlook.
          </div>
        ) : (
          <button
            onClick={startRemovals}
            disabled={running || remaining === 0}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-medium transition disabled:opacity-50"
          >
            {running
              ? 'Sending removal requests…'
              : remaining === 0
              ? '✓ All email requests sent'
              : `Send ${remaining} removal requests`}
          </button>
        )}

        {runError && (
          <p className="text-red-400 text-sm">{runError}</p>
        )}

        {failedCount > 0 && (
          <p className="text-amber-400 text-sm">
            {failedCount} requests failed — retry by clicking the button above.
          </p>
        )}

        <UpgradeCallout />

        {/* Broker list */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Email Brokers ({emailBrokers.length})
          </h2>
          <div className="bg-slate-900 rounded-xl px-4 divide-y divide-slate-800">
            {emailBrokers.map(b => (
              <BrokerCard key={b.id} broker={b} status={statuses[b.id]} />
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="pt-2 border-t border-slate-800">
          <button
            onClick={() => db && exportBackup(db).catch(() => {})}
            className="text-sm text-slate-500 hover:text-slate-300 transition"
          >
            Export encrypted backup
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="bg-slate-900 rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold ${highlight ? 'text-violet-400' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </div>
  )
}

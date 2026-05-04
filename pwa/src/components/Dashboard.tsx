import { useState, useEffect, useCallback, useRef } from 'react'
import { useVault } from '../lib/vault-context'
import { useEmail } from '../lib/email-context'
import {
  getEmailBrokers,
  getAllBrokers,
  runEmailRemovals,
  getTodaysBatch,
} from '../lib/removal-engine'
import { buildRemovalEmail } from '../lib/email-templates'
import BrokerCard from './BrokerCard'
import UpgradeCallout from './UpgradeCallout'
import type { BrokerIdentity, BrokerStatus, RemovalPolicy, UserProfile } from '../types'
import { DEFAULT_REMOVAL_POLICY, normalizeRemovalPolicy } from '../types'

export default function Dashboard({ profile }: { profile: UserProfile }) {
  const { save, load } = useVault()
  const { sendEmail, provider, openMailto } = useEmail()
  const runningRef = useRef(false)
  const [statuses, setStatuses] = useState<Record<string, BrokerStatus>>({})
  const [brokerIdentity, setBrokerIdentity] = useState<BrokerIdentity | null>(null)
  const [policy, setPolicy] = useState<RemovalPolicy>(DEFAULT_REMOVAL_POLICY)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [runError, setRunError] = useState('')
  const allBrokers = getAllBrokers()
  const emailBrokers = getEmailBrokers()
  const effectiveIdentity: BrokerIdentity = brokerIdentity ?? {
    mode: 'same_mailbox',
    email: profile.emails[0] ?? '',
    label: 'Profile email',
  }
  const todaysBatch = getTodaysBatch(emailBrokers, statuses, policy.dailyLimit)

  useEffect(() => {
    load<Record<string, BrokerStatus>>('statuses')
      .then(s => { if (s) setStatuses(s) })
      .catch(() => {})
    load<BrokerIdentity>('broker-identity')
      .then(i => { if (i) setBrokerIdentity(i) })
      .catch(() => {})
    load<RemovalPolicy>('removal-policy')
      .then(p => { if (p) setPolicy(normalizeRemovalPolicy(p)) })
      .catch(() => {})
    load<boolean>('autopilot-paused')
      .then(p => { if (typeof p === 'boolean') setPaused(p) })
      .catch(() => {})
  }, [load])

  useEffect(() => {
    if (Object.keys(statuses).length > 0) {
      save('statuses', statuses).catch(() => {})
    }
  }, [statuses, save])

  const updateStatus = useCallback(
    (brokerId: string, status: BrokerStatus['status']) => {
      const now = new Date().toISOString()
      setStatuses(prev => ({
        ...prev,
        [brokerId]: {
          brokerId,
          status,
          sentAt: status === 'sent' || status === 'manual' ? now : prev[brokerId]?.sentAt,
          lastUpdated: now,
        },
      }))
    },
    []
  )

  async function startRemovals() {
    if (!provider || paused || runningRef.current || todaysBatch.remainingAllowance <= 0) return

    if (provider.type === 'mailto') {
      runningRef.current = true
      setRunning(true)
      setRunError('')
      try {
        for (const broker of todaysBatch.toSend) {
          if (!broker.removalEmail) continue
          const message = buildRemovalEmail(profile, broker.removalLaw, broker.removalEmail, {
            brokerIdentity: effectiveIdentity,
          })
          openMailto(message)
          // Mark as manual — user must confirm they actually sent the email.
          updateStatus(broker.id, 'manual')
          await new Promise(r => setTimeout(r, Math.max(250, Math.min(policy.delayMs, 2_000))))
        }
      } catch (e) {
        setRunError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setRunning(false)
        runningRef.current = false
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
        ({ brokerId, status }) => updateStatus(brokerId, status),
        emailBrokers,
        {
          brokerIdentity: effectiveIdentity,
          dailyLimit: policy.dailyLimit,
          delayMs: policy.delayMs,
        }
      )
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRunning(false)
      runningRef.current = false
    }
  }

  const sentCount = Object.values(statuses).filter(
    s => s.status === 'sent' || s.status === 'confirmed' || s.status === 'manual'
  ).length
  const failedCount = Object.values(statuses).filter(s => s.status === 'failed').length
  const remaining = emailBrokers.length - sentCount
  const canSendToday = todaysBatch.toSend.length > 0
  const dailyDone = remaining > 0 && !canSendToday
  const actionDisabled = running || paused || remaining === 0 || dailyDone

  function requestStartRemovals() {
    if (!provider || actionDisabled) return
    setRunError('')
    setConfirmOpen(true)
  }

  async function confirmStartRemovals() {
    setConfirmOpen(false)
    await startRemovals()
  }

  function togglePaused() {
    const next = !paused
    setPaused(next)
    save('autopilot-paused', next).catch(() => {})
  }

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
          <StatCard label="Requests handled" value={sentCount} highlight />
          <StatCard label="Remaining" value={remaining} />
        </div>

        <div className="bg-slate-900 rounded-xl p-4 space-y-2 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Broker-facing mailbox</span>
            <span className="font-medium text-white truncate">{effectiveIdentity.email || 'Not set'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Autopilot status</span>
            <span className={`font-medium ${paused ? 'text-amber-300' : 'text-emerald-300'}`}>
              {paused ? 'Autopilot is paused' : dailyDone ? 'Daily cap reached' : running ? 'Running daily batch' : 'Ready for today’s batch'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Autopilot pace</span>
            <span className="font-medium text-white">
              {todaysBatch.sentToday}/{policy.dailyLimit} today · {todaysBatch.queued.length} queued
            </span>
          </div>
          <button
            onClick={togglePaused}
            className="text-xs text-violet-300 hover:text-violet-200 underline"
          >
            {paused ? 'Resume autopilot' : 'Pause autopilot'}
          </button>
          <p className="text-xs text-slate-500">
            BrokerBane sends in small daily batches so a fresh removal mailbox is less likely to trip provider spam controls. No warm-up swarm; just quiet, steady removal work.
          </p>
        </div>

        {/* CTA */}
        {!provider ? (
          <div className="bg-slate-900 rounded-xl p-4 text-sm text-amber-400">
            No email provider connected. Re-run setup to connect a dedicated removal mailbox or use mailto drafts.
          </div>
        ) : (
          <button
            onClick={requestStartRemovals}
            disabled={actionDisabled}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-medium transition disabled:opacity-50"
          >
            {running
              ? provider.type === 'mailto' ? 'Opening today’s draft batch…' : 'Sending today’s removal batch…'
              : remaining === 0
              ? '✓ All email requests handled'
              : dailyDone
              ? '✓ Daily privacy-safe batch complete — continue tomorrow'
              : provider.type === 'mailto'
              ? `Open ${todaysBatch.toSend.length} drafts for today`
              : `Send ${todaysBatch.toSend.length} removal requests today`}
          </button>
        )}

        {runError && (
          <p className="text-red-400 text-sm">{runError}</p>
        )}

        {confirmOpen && (
          <div className="bg-slate-900 border border-violet-500/50 rounded-xl p-4 space-y-3" role="dialog" aria-modal="true">
            <div>
              <h2 className="font-semibold text-white">Confirm today’s batch</h2>
              <p className="text-sm text-slate-300 mt-1">
                {provider?.type === 'mailto' ? 'BrokerBane will open' : 'BrokerBane will send'} {todaysBatch.toSend.length} removal request{todaysBatch.toSend.length === 1 ? '' : 's'} for today.
              </p>
              <p className="text-sm text-amber-300 mt-2">
                Brokers will see {effectiveIdentity.email || 'your configured removal mailbox'} as the contact / reply address.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmStartRemovals}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg font-medium transition"
              >
                {provider?.type === 'mailto' ? 'Confirm and open drafts' : 'Confirm and send'}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
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

        {/* Export — available in Settings tab */}
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

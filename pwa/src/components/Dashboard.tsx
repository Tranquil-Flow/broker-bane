import { useState, useEffect, useCallback, useRef } from 'react'
import { useVault } from '../lib/vault-context'
import { useEmail } from '../lib/email-context'
import {
  getEmailBrokers,
  getAllBrokers,
  getWebformBrokers,
  runEmailRemovals,
  getTodaysBatch,
} from '../lib/removal-engine'
import { buildRemovalEmail } from '../lib/email-templates'
import BrokerCard from './BrokerCard'
import UpgradeCallout from './UpgradeCallout'
import type { BrokerIdentity, BrokerStatus, RemovalPolicy, UserProfile } from '../types'
import { DEFAULT_REMOVAL_POLICY, normalizeRemovalPolicy } from '../types'

const INITIAL_EMAIL_BROKER_VISIBLE_COUNT = 50

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
  const [pendingManualBatch, setPendingManualBatch] = useState<string[]>([])
  const [visibleEmailBrokerCount, setVisibleEmailBrokerCount] = useState(INITIAL_EMAIL_BROKER_VISIBLE_COUNT)
  const [runError, setRunError] = useState('')
  const allBrokers = getAllBrokers()
  const emailBrokers = getEmailBrokers()
  const webformBrokers = getWebformBrokers()
  const manualWebformBrokers = webformBrokers.filter(b => b.method === 'webform')
  const emailBrokerIds = new Set(emailBrokers.map(b => b.id))
  const webformBrokerIds = new Set(manualWebformBrokers.map(b => b.id))
  const visibleEmailBrokers = emailBrokers.slice(0, visibleEmailBrokerCount)
  const hiddenEmailBrokerCount = Math.max(0, emailBrokers.length - visibleEmailBrokers.length)
  const effectiveIdentity: BrokerIdentity = brokerIdentity ?? {
    mode: 'same_mailbox',
    email: profile.emails[0] ?? '',
    label: 'Profile email',
  }
  const usingProfileInbox = effectiveIdentity.mode === 'same_mailbox' || (
    effectiveIdentity.email.trim().toLowerCase() === (profile.emails[0] ?? '').trim().toLowerCase()
  )
  const todaysBatch = getTodaysBatch(emailBrokers, statuses, policy.dailyLimit)
  const oauthProviderNeedsReconnect = Boolean(
    provider && provider.type !== 'mailto' && !provider.accessToken
  )

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
    load<string[]>('pending-manual-batch')
      .then(batch => {
        if (Array.isArray(batch)) {
          setPendingManualBatch(batch.filter(id => typeof id === 'string'))
        }
      })
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
        const openedDraftIds: string[] = []
        for (const broker of todaysBatch.toSend) {
          if (!broker.removalEmail) continue
          const message = buildRemovalEmail(profile, broker.removalLaw, broker.removalEmail, {
            brokerIdentity: effectiveIdentity,
          })
          openMailto(message)
          openedDraftIds.push(broker.id)
          await new Promise(r => setTimeout(r, Math.max(250, Math.min(policy.delayMs, 2_000))))
        }
        setPendingManualBatch(openedDraftIds)
        await save('pending-manual-batch', openedDraftIds)
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

  const statusValues = Object.values(statuses)
  const emailStatusValues = statusValues.filter(s => emailBrokerIds.has(s.brokerId))
  const webformStatusValues = statusValues.filter(s => webformBrokerIds.has(s.brokerId))
  const sentAutoCount = emailStatusValues.filter(s => s.status === 'sent' || s.status === 'confirmed').length
  const manualCount = emailStatusValues.filter(s => s.status === 'manual').length
  const webformManualCount = webformStatusValues.filter(s => s.status === 'manual' || s.status === 'confirmed').length
  const handledCount = sentAutoCount + manualCount
  const failedCount = emailStatusValues.filter(s => s.status === 'failed').length
  const remaining = emailBrokers.length - handledCount
  const canSendToday = todaysBatch.toSend.length > 0
  const previewBrokers = todaysBatch.toSend.slice(0, 5)
  const hiddenPreviewCount = Math.max(0, todaysBatch.toSend.length - previewBrokers.length)
  const dailyDone = remaining > 0 && !canSendToday
  const hasPendingManualBatch = pendingManualBatch.length > 0
  const pendingManualBrokers = pendingManualBatch
    .map(id => emailBrokers.find(broker => broker.id === id))
    .filter((broker): broker is (typeof emailBrokers)[number] => Boolean(broker))
  const awaitingConfirmationBrokers = emailBrokers.filter(broker => {
    const status = statuses[broker.id]?.status
    return status === 'sent' || status === 'manual'
  })
  const actionDisabled = running || paused || remaining === 0 || dailyDone || hasPendingManualBatch || oauthProviderNeedsReconnect

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

  function markPendingManualBatchSent() {
    for (const brokerId of pendingManualBatch) {
      updateStatus(brokerId, 'manual')
    }
    setPendingManualBatch([])
    save('pending-manual-batch', []).catch(() => {})
  }

  function discardPendingManualBatch() {
    setPendingManualBatch([])
    save('pending-manual-batch', []).catch(() => {})
  }

  function markWebformComplete(brokerId: string) {
    updateStatus(brokerId, 'manual')
  }

  function markEmailConfirmed(brokerId: string) {
    updateStatus(brokerId, 'confirmed')
  }

  function resetEmailToPending(brokerId: string) {
    updateStatus(brokerId, 'pending')
  }

  function resetWebformToPending(brokerId: string) {
    updateStatus(brokerId, 'pending')
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
          <StatCard label="Requests handled" value={handledCount} highlight />
          <StatCard label="Remaining" value={remaining} />
        </div>

        <div className="bg-slate-900 rounded-xl p-4 space-y-2 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Broker-facing mailbox</span>
            <span className="font-medium text-white truncate">{effectiveIdentity.email || 'Not set'}</span>
          </div>
          {usingProfileInbox && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2">
              <p className="text-xs font-medium text-amber-300">Main inbox fallback</p>
              <p className="text-xs text-slate-400 mt-1">
                Broker replies may land in your profile inbox. Use Settings to switch to a dedicated removal mailbox or alias.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Autopilot status</span>
            <span className={`font-medium ${paused || hasPendingManualBatch || oauthProviderNeedsReconnect ? 'text-amber-300' : 'text-emerald-300'}`}>
              {paused
                ? 'Autopilot is paused'
                : hasPendingManualBatch
                ? 'Review opened drafts'
                : oauthProviderNeedsReconnect
                ? `Reconnect ${provider?.type === 'gmail' ? 'Gmail' : 'Outlook'} to continue`
                : dailyDone
                ? 'Daily cap reached'
                : running
                ? 'Running daily batch'
                : 'Ready for today’s batch'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Autopilot pace</span>
            <span className="font-medium text-white">
              {todaysBatch.sentToday}/{policy.dailyLimit} today · {todaysBatch.queued.length} queued
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Progress detail</span>
            <span className="font-medium text-white">
              {sentAutoCount} sent · {manualCount} drafts/manual · {webformManualCount} webform/manual
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
              : oauthProviderNeedsReconnect
              ? 'Reconnect email provider to continue'
              : remaining === 0
              ? '✓ All email requests handled'
              : hasPendingManualBatch
              ? 'Review opened drafts first'
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

        {hasPendingManualBatch && (
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-amber-200">Review your opened drafts</h2>
              <p className="text-sm text-slate-300 mt-1">
                BrokerBane opened {pendingManualBatch.length} draft{pendingManualBatch.length === 1 ? '' : 's'} in your email client. It will not count them as handled until you confirm you sent them.
              </p>
              {pendingManualBrokers.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-950/50 border border-amber-500/20 p-3">
                  <p className="text-xs font-medium text-amber-200 mb-2">Opened draft batch:</p>
                  <ul className="space-y-1 text-sm text-slate-200">
                    {pendingManualBrokers.map(broker => (
                      <li key={broker.id} className="flex justify-between gap-3">
                        <span className="truncate">{broker.name}</span>
                        <span className="text-xs text-slate-500 shrink-0">{broker.category}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={markPendingManualBatchSent}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg font-medium transition"
              >
                I sent these {pendingManualBatch.length} draft{pendingManualBatch.length === 1 ? '' : 's'}
              </button>
              <button
                onClick={discardPendingManualBatch}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg font-medium transition"
              >
                Keep them pending
              </button>
            </div>
          </div>
        )}

        {confirmOpen && (
          <div className="bg-slate-900 border border-violet-500/50 rounded-xl p-4 space-y-3" role="dialog" aria-modal="true">
            <div>
              <h2 className="font-semibold text-white">Confirm today’s batch</h2>
              <p className="text-sm text-slate-300 mt-1">
                {provider?.type === 'mailto' ? 'BrokerBane will open' : 'BrokerBane will send'} {todaysBatch.toSend.length} removal request{todaysBatch.toSend.length === 1 ? '' : 's'} for today.
              </p>
              <p className="text-sm text-amber-300 mt-2">
                Replies should go to {effectiveIdentity.email || 'your configured removal mailbox'} as the contact / reply address.
              </p>
              {provider?.type !== 'mailto' && (
                <p className="text-sm text-slate-400 mt-2">
                  OAuth sends may still show the connected {provider?.type === 'gmail' ? 'Gmail' : 'Outlook'} account as the From sender. For strongest inbox isolation, connect the dedicated removal mailbox itself.
                </p>
              )}
              {usingProfileInbox && (
                <p className="text-sm text-amber-300 mt-2">
                  These replies may land in your main inbox. Cancel and choose a dedicated removal mailbox in Settings if you want a cleaner test.
                </p>
              )}
              {previewBrokers.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Today’s brokers</p>
                  <ul className="space-y-1 text-sm text-slate-200">
                    {previewBrokers.map(broker => (
                      <li key={broker.id} className="flex justify-between gap-3">
                        <span className="truncate">{broker.name}</span>
                        <span className="text-xs text-slate-500 shrink-0">{broker.category}</span>
                      </li>
                    ))}
                  </ul>
                  {hiddenPreviewCount > 0 && (
                    <p className="text-xs text-slate-500 mt-2">+{hiddenPreviewCount} more in today’s capped batch</p>
                  )}
                </div>
              )}
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

        {/* Manual confirmation checklist */}
        {awaitingConfirmationBrokers.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-white">Confirm broker replies manually</h2>
              <p className="text-sm text-slate-400 mt-1">
                Browser-only BrokerBane cannot monitor your dedicated mailbox automatically yet. When a broker replies with a completion or confirmation email, mark it here.
              </p>
            </div>
            <div className="divide-y divide-slate-800">
              {awaitingConfirmationBrokers.map(broker => {
                const status = statuses[broker.id]?.status
                return (
                  <div key={broker.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{broker.name}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        Waiting after {status === 'manual' ? 'manual draft send' : 'provider send'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => markEmailConfirmed(broker.id)}
                        className="text-xs text-emerald-300 hover:text-emerald-200 underline"
                      >
                        Mark {broker.name} confirmed
                      </button>
                      <button
                        onClick={() => resetEmailToPending(broker.id)}
                        className="text-xs text-slate-400 hover:text-slate-200 underline"
                      >
                        Retry later
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Manual webform queue */}
        {manualWebformBrokers.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Manual Webform Brokers ({manualWebformBrokers.length})
            </h2>
            <div className="bg-slate-900 rounded-xl px-4 divide-y divide-slate-800">
              {manualWebformBrokers.map(broker => {
                const status = statuses[broker.id]
                const complete = status?.status === 'manual' || status?.status === 'confirmed'
                return (
                  <div key={broker.id} className="py-3 border-b border-slate-800 last:border-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{broker.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{broker.category}</p>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${complete ? 'text-amber-400' : 'text-slate-400'}`}>
                        {complete ? 'Manual complete' : 'Manual pending'}
                      </span>
                    </div>
                    {broker.notes && <p className="text-xs text-slate-400 leading-relaxed">{broker.notes}</p>}
                    <button
                      onClick={() => complete ? resetWebformToPending(broker.id) : markWebformComplete(broker.id)}
                      className="text-xs text-violet-300 hover:text-violet-200 underline"
                    >
                      {complete ? `Mark ${broker.name} pending` : `Mark ${broker.name} complete`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Broker list */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Email Brokers ({emailBrokers.length})
          </h2>
          <div className="bg-slate-900 rounded-xl px-4 divide-y divide-slate-800">
            {visibleEmailBrokers.map(b => (
              <BrokerCard key={b.id} broker={b} status={statuses[b.id]} />
            ))}
          </div>
          {hiddenEmailBrokerCount > 0 && (
            <button
              onClick={() => setVisibleEmailBrokerCount(emailBrokers.length)}
              className="w-full mt-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 py-2 rounded-lg text-sm font-medium transition"
            >
              Show {hiddenEmailBrokerCount} more email brokers
            </button>
          )}
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

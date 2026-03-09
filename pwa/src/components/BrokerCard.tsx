import type { Broker, BrokerStatus } from '../types'

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-slate-400' },
  sent: { label: 'Sent', color: 'text-blue-400' },
  confirmed: { label: 'Confirmed', color: 'text-green-400' },
  manual: { label: 'Manual', color: 'text-amber-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
}

export default function BrokerCard({
  broker,
  status,
}: {
  broker: Broker
  status?: BrokerStatus
}) {
  const s = status?.status ?? 'pending'
  const { label, color } = statusConfig[s] ?? statusConfig.pending

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{broker.name}</p>
        <p className="text-xs text-slate-500 capitalize">{broker.category}</p>
      </div>
      <span className={`text-xs font-medium ml-4 shrink-0 ${color}`}>{label}</span>
    </div>
  )
}

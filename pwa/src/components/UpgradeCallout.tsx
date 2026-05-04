import { getWebformBrokers } from '../lib/removal-engine'

export default function UpgradeCallout() {
  const count = getWebformBrokers().length
  return (
    <div className="border border-amber-600/40 bg-amber-950/30 rounded-xl p-4">
      <p className="font-medium text-amber-400 text-sm">
        {count} brokers require browser automation
      </p>
      <p className="text-slate-400 text-sm mt-1">
        Web form opt-outs need local browser automation from the BrokerBane CLI/dashboard. The PWA keeps these as manual tasks until you run the local CLI with browser automation configured.
      </p>
    </div>
  )
}

import { getWebformBrokers } from '../lib/removal-engine'

export default function UpgradeCallout() {
  const count = getWebformBrokers().length
  return (
    <div className="border border-amber-600/40 bg-amber-950/30 rounded-xl p-4">
      <p className="font-medium text-amber-400 text-sm">
        {count} brokers require browser automation
      </p>
      <p className="text-slate-400 text-sm mt-1">
        Web form opt-outs need the desktop app to run automatically.{' '}
        <a
          href="https://github.com/yourusername/broker-bane/releases"
          className="text-amber-400 underline hover:text-amber-300"
          target="_blank"
          rel="noreferrer"
        >
          Download the desktop app
        </a>{' '}
        to handle these automatically.
      </p>
    </div>
  )
}

import { useState } from 'react'
import { useVault } from '../lib/vault-context'
import { useEmail } from '../lib/email-context'
import type { UserProfile } from '../types'

interface Props {
  onComplete: (profile: UserProfile) => void
}

export default function OnboardingWizard({ onComplete }: Props) {
  const { save } = useVault()
  const { connectGmail, connectOutlook, provider } = useEmail()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [connectError, setConnectError] = useState('')

  // Step 1 fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')

  async function saveProfile() {
    setSaving(true)
    const profile: UserProfile = {
      names: name.split(',').map(s => s.trim()).filter(Boolean),
      emails: email.split(',').map(s => s.trim()).filter(Boolean),
      addresses: address.split(',').map(s => s.trim()).filter(Boolean),
      phone: phone.trim() || undefined,
      dob: dob.trim() || undefined,
    }
    await save('profile', profile)
    setSaving(false)
    setStep(2)
    return profile
  }

  // Keep profile ref for onComplete
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null)

  async function handleSaveProfile() {
    const profile = await saveProfile()
    setSavedProfile(profile)
  }

  async function handleConnectGmail() {
    setConnectError('')
    try {
      await connectGmail()
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Failed to connect Gmail')
    }
  }

  async function handleConnectOutlook() {
    setConnectError('')
    try {
      await connectOutlook()
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Failed to connect Outlook')
    }
  }

  async function handleUseMailto() {
    await save('email-provider', { type: 'mailto' })
    setStep(3)
  }

  function handleFinish() {
    if (savedProfile) onComplete(savedProfile)
  }

  if (step === 1) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="w-full max-w-lg p-8 space-y-6">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Step 1 of 2</div>
          <h2 className="text-xl font-bold">Your Profile</h2>
          <p className="text-slate-400 text-sm mt-1">
            Used to identify your records at data brokers. Encrypted on your device — never transmitted.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Full name(s)" hint="Comma-separate aliases e.g. John Smith, Johnny Smith" value={name} onChange={setName} required />
          <Field label="Email address(es)" hint="Comma-separate if multiple" value={email} onChange={setEmail} required />
          <Field label="Address(es)" hint="Current and past, comma-separated" value={address} onChange={setAddress} required />
          <Field label="Phone number" hint="Optional" value={phone} onChange={setPhone} />
          <Field label="Date of birth" hint="YYYY-MM-DD, optional" value={dob} onChange={setDob} />
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={!name.trim() || !email.trim() || !address.trim() || saving}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Continue →'}
        </button>
      </div>
    </div>
  )

  if (step === 2) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="w-full max-w-lg p-8 space-y-6">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Step 2 of 2</div>
          <h2 className="text-xl font-bold">Connect Your Email</h2>
          <p className="text-slate-400 text-sm mt-1">
            BrokerBane sends removal requests from your email. Your credentials never leave your device.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleConnectGmail}
            className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-3 rounded-lg transition"
          >
            <span className="font-medium">Sign in with Google</span>
            {provider?.type === 'gmail' && <span className="text-green-400 text-sm">✓ Connected</span>}
          </button>

          <button
            onClick={handleConnectOutlook}
            className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-3 rounded-lg transition"
          >
            <span className="font-medium">Sign in with Microsoft</span>
            {provider?.type === 'outlook' && <span className="text-green-400 text-sm">✓ Connected</span>}
          </button>

          {connectError && <p className="text-red-400 text-sm">{connectError}</p>}

          <button
            onClick={handleUseMailto}
            className="w-full text-slate-400 hover:text-white text-sm py-2 transition"
          >
            Use my own email client (mailto: links)
          </button>
        </div>

        {provider && (
          <button
            onClick={() => setStep(3)}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5 rounded-lg transition"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  )

  // Step 3: complete
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6 text-center">
        <div className="text-6xl">✓</div>
        <h2 className="text-xl font-bold">You're all set</h2>
        <p className="text-slate-400">
          Ready to remove your data from 1,000+ brokers.
        </p>
        <button
          onClick={handleFinish}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5 rounded-lg transition"
        >
          Start Removing
        </button>
      </div>
    </div>
  )
}

function Field({
  label, hint, value, onChange, required = false
}: {
  label: string; hint: string; value: string; onChange: (v: string) => void; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}{required && <span className="text-violet-400 ml-1">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={hint}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  )
}

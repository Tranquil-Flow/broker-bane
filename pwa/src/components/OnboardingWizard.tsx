import { useState } from 'react'
import { useVault } from '../lib/vault-context'
import { useEmail } from '../lib/email-context'
import type { BrokerIdentity, RemovalPolicy, UserProfile } from '../types'
import { DEFAULT_REMOVAL_POLICY, normalizeRemovalPolicy } from '../types'

interface Props {
  onComplete: (profile: UserProfile) => void
}

export default function OnboardingWizard({ onComplete }: Props) {
  const { save } = useVault()
  const { connectGmail, connectOutlook, setProvider, provider } = useEmail()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [profileError, setProfileError] = useState('')
  const googleOAuthConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
  const microsoftOAuthConfigured = Boolean(import.meta.env.VITE_MICROSOFT_CLIENT_ID)

  // Step 1 fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [brokerEmail, setBrokerEmail] = useState('')
  const [dailyLimit, setDailyLimit] = useState(String(DEFAULT_REMOVAL_POLICY.dailyLimit))
  const firstKnownEmail = email.split(',').map(s => s.trim()).filter(Boolean)[0] ?? ''
  const trimmedBrokerEmail = brokerEmail.trim()
  const brokerMailboxFallsBackToProfile = Boolean(firstKnownEmail && !trimmedBrokerEmail)
  const brokerMailboxMatchesProfile = Boolean(
    firstKnownEmail && trimmedBrokerEmail.toLowerCase() === firstKnownEmail.toLowerCase()
  )

  async function saveProfile() {
    setProfileError('')
    const profile: UserProfile = {
      names: name.split(',').map(s => s.trim()).filter(Boolean),
      emails: email.split(',').map(s => s.trim()).filter(Boolean),
      addresses: address.split(',').map(s => s.trim()).filter(Boolean),
      phone: phone.trim() || undefined,
      dob: dob.trim() || undefined,
    }
    const invalidKnownEmail = profile.emails.find(e => !isValidEmail(e))
    if (profile.names.length === 0) {
      setProfileError('Enter at least one name brokers may know.')
      return null
    }
    if (profile.emails.length === 0 || invalidKnownEmail) {
      setProfileError('Enter valid known email address(es) brokers may use to find your records.')
      return null
    }
    if (profile.addresses.length === 0) {
      setProfileError('Enter at least one current or past address brokers may know.')
      return null
    }
    const trimmedBrokerEmail = brokerEmail.trim()
    if (trimmedBrokerEmail && !isValidEmail(trimmedBrokerEmail)) {
      setProfileError('Enter a valid broker-facing removal mailbox, or leave it blank to use your first known email.')
      return null
    }

    setSaving(true)
    try {
      const knownEmail = profile.emails[0] ?? ''
      const identity: BrokerIdentity = {
        mode: trimmedBrokerEmail && trimmedBrokerEmail !== knownEmail ? 'dedicated_mailbox' : 'same_mailbox',
        email: trimmedBrokerEmail || knownEmail,
        label: trimmedBrokerEmail && trimmedBrokerEmail !== knownEmail ? 'Dedicated removal mailbox' : 'Same as profile email',
      }
      const parsedLimit = Number.parseInt(dailyLimit, 10)
      const policy: RemovalPolicy = normalizeRemovalPolicy({
        ...DEFAULT_REMOVAL_POLICY,
        dailyLimit: Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_REMOVAL_POLICY.dailyLimit,
      })
      await save('profile', profile)
      await save('broker-identity', identity)
      await save('removal-policy', policy)
      setStep(2)
      return profile
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to save profile')
      return null
    } finally {
      setSaving(false)
    }
  }

  // Keep profile ref for onComplete
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null)

  async function handleSaveProfile() {
    const profile = await saveProfile()
    if (profile) setSavedProfile(profile)
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
    setConnectError('')
    try {
      const mailtoProvider = { type: 'mailto' as const }
      await save('email-provider', mailtoProvider)
      setProvider(mailtoProvider)
      setStep(3)
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Failed to save settings')
    }
  }

  function handleFinish() {
    if (savedProfile) onComplete(savedProfile)
  }

  if (step === 1) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="w-full max-w-lg p-8 space-y-6">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Step 1 of 3</div>
          <h2 className="text-xl font-bold">Your Profile</h2>
          <p className="text-slate-400 text-sm mt-1">
            Used to identify your records at data brokers. Encrypted on your device — never uploaded to BrokerBane servers.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Full name(s)" hint="Comma-separate aliases e.g. John Smith, Johnny Smith" value={name} onChange={setName} required />
          <Field label="Email address(es) brokers may know" hint="Comma-separate existing emails used to find records" value={email} onChange={setEmail} required />
          <Field label="Address(es)" hint="Current and past, comma-separated" value={address} onChange={setAddress} required />
          <Field label="Phone number" hint="Optional" value={phone} onChange={setPhone} />
          <Field label="Date of birth" hint="YYYY-MM-DD, optional" value={dob} onChange={setDob} />
          <Field label="Broker-facing removal mailbox" hint="Dedicated mailbox/alias for broker replies; defaults to first email above" value={brokerEmail} onChange={setBrokerEmail} />
          {brokerMailboxFallsBackToProfile && (
            <p className="text-xs text-amber-300 -mt-2">
              Use a dedicated removal mailbox to keep broker replies out of your main inbox. Leaving this blank will use {firstKnownEmail}.
            </p>
          )}
          {brokerMailboxMatchesProfile && (
            <p className="text-xs text-amber-300 -mt-2">
              This is the same as your first known email. It works, but a dedicated removal mailbox or alias keeps broker replies isolated.
            </p>
          )}
          <Field label="Daily send limit" hint="10 recommended for a fresh mailbox" value={dailyLimit} onChange={setDailyLimit} />
        </div>

        {profileError && <p className="text-red-400 text-sm">{profileError}</p>}

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
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Step 2 of 3</div>
          <h2 className="text-xl font-bold">Connect Your Email</h2>
          <p className="text-slate-400 text-sm mt-1">
            Connect the dedicated removal mailbox if you have one. Brokers see the sending address; your credentials never leave your device.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleConnectGmail}
            disabled={!googleOAuthConfigured}
            className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-3 rounded-lg transition disabled:opacity-50 disabled:hover:bg-slate-800"
          >
            <span className="font-medium">Sign in with Google</span>
            {provider?.type === 'gmail' && <span className="text-green-400 text-sm">✓ Connected</span>}
          </button>
          {!googleOAuthConfigured && (
            <p className="text-xs text-amber-400">
              Google OAuth is not configured. Set VITE_GOOGLE_CLIENT_ID or use mailto drafts for local testing.
            </p>
          )}

          <button
            onClick={handleConnectOutlook}
            disabled={!microsoftOAuthConfigured}
            className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-3 rounded-lg transition disabled:opacity-50 disabled:hover:bg-slate-800"
          >
            <span className="font-medium">Sign in with Microsoft</span>
            {provider?.type === 'outlook' && <span className="text-green-400 text-sm">✓ Connected</span>}
          </button>
          {!microsoftOAuthConfigured && (
            <p className="text-xs text-amber-400">
              Microsoft OAuth is not configured. Set VITE_MICROSOFT_CLIENT_ID or use mailto drafts for local testing.
            </p>
          )}

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
          Ready to start quiet daily batches against 1,000+ brokers without blasting your inbox all at once.
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

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value)
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

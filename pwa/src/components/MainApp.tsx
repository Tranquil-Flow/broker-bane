import { useEffect, useState } from 'react'
import { useVault } from '../lib/vault-context'
import OnboardingWizard from './OnboardingWizard'
import Dashboard from './Dashboard'
import type { UserProfile } from '../types'

export default function MainApp() {
  const { load } = useVault()
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined)

  useEffect(() => {
    load<UserProfile>('profile').then(setProfile).catch(() => setProfile(null))
  }, [load])

  if (profile === undefined) {
    // Loading
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    )
  }

  if (!profile) {
    return <OnboardingWizard onComplete={setProfile} />
  }

  return <Dashboard profile={profile} />
}

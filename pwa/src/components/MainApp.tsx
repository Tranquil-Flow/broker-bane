import { useEffect, useState } from 'react'
import { useVault } from '../lib/vault-context'
import OnboardingWizard from './OnboardingWizard'
import Dashboard from './Dashboard'
import Settings from './Settings'
import type { UserProfile } from '../types'

type Tab = 'dashboard' | 'settings'

export default function MainApp() {
  const { load } = useVault()
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

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

  return (
    <div>
      {/* Tab bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4">
        <div className="max-w-2xl mx-auto flex gap-1">
          <TabButton label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <TabButton label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <Dashboard profile={profile} />
      ) : (
        <Settings profile={profile} />
      )}
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
        active
          ? 'border-violet-500 text-white'
          : 'border-transparent text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

import type { UserProfile } from '../types'

export default function Dashboard({ profile }: { profile: UserProfile }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-400 mt-2">Welcome, {profile.names[0]}</p>
    </div>
  )
}

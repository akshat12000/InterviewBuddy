import { useAuth } from '../auth/AuthContext'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="card p-6">
          <div className="text-center text-neutral-400">You are not logged in.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h2 className="mb-4 text-2xl font-semibold">Profile</h2>
      <div className="card grid gap-3 p-6">
        <div className="grid grid-cols-3 items-center">
          <div className="text-sm text-neutral-400">Name</div>
          <div className="col-span-2">{user.name}</div>
        </div>
        <div className="grid grid-cols-3 items-center">
          <div className="text-sm text-neutral-400">Email</div>
          <div className="col-span-2">{user.email}</div>
        </div>
        <div className="grid grid-cols-3 items-center">
          <div className="text-sm text-neutral-400">Role</div>
          <div className="col-span-2 capitalize">{user.role}</div>
        </div>
        <div className="pt-2">
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </div>
    </div>
  )
}

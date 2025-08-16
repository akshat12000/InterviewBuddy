import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { user, login } = useAuth()
  const [email, setEmail] = useState('interviewer@example.com')
  const [password, setPassword] = useState('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  if (user) return <Navigate to="/profile" replace />

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-sm gap-4 px-4 py-10">
      <h2 className="text-center text-2xl font-semibold">Sign in</h2>
      <div className="card p-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1">
            <label className="text-sm text-neutral-400">Email</label>
            <input className="input" value={email} onChange={e=>setEmail(e.target.value)} type="email" required />
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-neutral-400">Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                onClick={() => setShowPassword(v => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading?'Logging in...':'Login'}</button>
        </form>
      </div>
    </div>
  )
}

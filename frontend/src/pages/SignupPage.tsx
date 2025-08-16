import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Eye, EyeOff } from 'lucide-react'

export default function SignupPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'candidate'|'interviewer'>('candidate')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await axios.post('/api/auth/register', { name, email, password, role })
      // Auto login for smoother UX
      await login(email, password)
      navigate('/dashboard')
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-10">
      <h2 className="text-center text-2xl font-semibold">Create your account</h2>
      <div className="card p-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1">
            <label className="text-sm text-neutral-400">Full name</label>
            <input className="input" value={name} onChange={e=>setName(e.target.value)} required />
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-neutral-400">Email</label>
            <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-neutral-400">Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
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
          <div className="grid gap-1">
            <label className="text-sm text-neutral-400">I am a</label>
            <select className="select" value={role} onChange={(e)=>setRole(e.target.value as any)}>
              <option value="candidate">Candidate</option>
              <option value="interviewer">Interviewer</option>
            </select>
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading? 'Creating...' : 'Create Account'}</button>
        </form>
      </div>
    </div>
  )
}

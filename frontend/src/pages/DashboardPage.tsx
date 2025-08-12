import useSWR from 'swr'
import { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const fetcher = (url: string) => axios.get(url).then(r => r.data)

export default function DashboardPage() {
  const { user } = useAuth()
  const { data: sessions } = useSWR('/api/sessions', fetcher)
  const { data: problems } = useSWR('/api/problems', fetcher)
  const [selectedProblem, setSelectedProblem] = useState<string>('')
  const [candEmail, setCandEmail] = useState<string>('candidate@example.com')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const createSession = async () => {
    try {
      setCreating(true)
      setError('')
      if (!problems?.items?.length) return
      const problem = problems.items.find((p: any) => p._id === selectedProblem) || problems.items[0]
      const { data: me } = await axios.get('/api/users/me')
      if (user?.role !== 'interviewer') throw new Error('Only interviewer can create')
      // Lookup candidate by email
      const cand = await axios.get('/api/users/by-email', { params: { email: candEmail } })
      const { data: created } = await axios.post('/api/sessions', {
        interviewer: me.user._id || me.user.id,
        candidate: cand.data.user._id || cand.data.user.id,
        problem: problem._id
      })
      const roomId = created.item.roomId || created.item._id
      navigate(`/room/${roomId}`)
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 md:grid-cols-3">
      <div className="md:col-span-1">
        <h2 className="mb-3 text-2xl font-semibold">Dashboard</h2>
        <div className="card p-4">
          <div className="text-lg font-medium">{user?.name} <span className="text-sm font-normal text-neutral-400">({user?.role})</span></div>
          <div className="text-sm text-neutral-400">{user?.email}</div>
        </div>
        {user?.role === 'interviewer' && (
          <div className="card mt-4 p-4">
            <h3 className="mb-3 text-lg font-semibold">Create Session</h3>
            <div className="grid gap-3">
              <label className="text-sm text-neutral-400">Candidate email</label>
              <input className="input" value={candEmail} onChange={(e)=>setCandEmail(e.target.value)} placeholder="candidate@example.com" />
              <label className="text-sm text-neutral-400">Problem</label>
              <select className="select" value={selectedProblem} onChange={(e)=>setSelectedProblem(e.target.value)}>
                <option value="">Select problem</option>
                {problems?.items?.map((p: any) => (
                  <option key={p._id} value={p._id}>{p.title} - {p.difficulty}</option>
                ))}
              </select>
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button className="btn btn-primary" onClick={createSession} disabled={creating}>{creating?'Creating...':'Create & Join'}</button>
            </div>
          </div>
        )}
      </div>
      <div className="md:col-span-2">
        <h3 className="mb-3 text-lg font-semibold">My Sessions</h3>
        <div className="grid gap-3">
          {sessions?.items?.map((s: any) => (
            <div key={s._id} className="card flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{s.problem?.title}</div>
                <div className="text-sm text-neutral-400">{s.status}</div>
              </div>
              <Link to={`/room/${s.roomId || s._id}`} className="btn">Join</Link>
            </div>
          ))}
          {!sessions?.items?.length && (
            <div className="text-sm text-neutral-400">No sessions yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

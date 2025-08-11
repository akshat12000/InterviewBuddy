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
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
      <div>
        <h2>Dashboard</h2>
        <div style={{ margin: '12px 0', padding: 12, background: '#fafafa', border: '1px solid #eee' }}>
          <div><b>{user?.name}</b> ({user?.role})</div>
          <div style={{ color: '#666' }}>{user?.email}</div>
        </div>
        {user?.role === 'interviewer' && (
          <div style={{ border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
            <h3>Create Session</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Candidate email</label>
              <input value={candEmail} onChange={(e)=>setCandEmail(e.target.value)} placeholder="candidate@example.com" />
              <label>Problem</label>
              <select value={selectedProblem} onChange={(e)=>setSelectedProblem(e.target.value)}>
                <option value="">Select problem</option>
                {problems?.items?.map((p: any) => (
                  <option key={p._id} value={p._id}>{p.title} - {p.difficulty}</option>
                ))}
              </select>
              {error && <div style={{ color: 'red' }}>{error}</div>}
              <button onClick={createSession} disabled={creating}>{creating?'Creating...':'Create & Join'}</button>
            </div>
          </div>
        )}
      </div>
      <div>
        <h3>My Sessions</h3>
        <ul>
          {sessions?.items?.map((s: any) => (
            <li key={s._id} style={{ marginBottom: 6 }}>
              <b>{s.problem?.title}</b> — {s.status} — <Link to={`/room/${s.roomId || s._id}`}>Join</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

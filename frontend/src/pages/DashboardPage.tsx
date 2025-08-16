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

  // Results modal state
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [resultsDecision, setResultsDecision] = useState<'selected'|'rejected'|'on-hold'|''>('')
  const [resultsScores, setResultsScores] = useState<Array<{criterion:string; score:number; notes?:string}>>([])
  const [resultsError, setResultsError] = useState('')
  const [resultsTitle, setResultsTitle] = useState<string>('Interview Results')

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

  const openResults = async (s: any) => {
    setShowResultsModal(true)
    setResultsLoading(true)
    setResultsError('')
    setResultsScores([])
    setResultsDecision('')
    setResultsTitle(s?.problem?.title ? `Results · ${s.problem.title}` : 'Interview Results')
    try {
      const idOrRoom = s?.roomId || s?._id
      const { data } = await axios.get(`/api/sessions/${idOrRoom}`)
      const item = data.item || {}
      const scores = item.interviewerScores || []
      const decision = item.finalDecision || ''
      setResultsScores(Array.isArray(scores) ? scores : [])
      setResultsDecision(decision)
    } catch (e: any) {
      setResultsError(e?.response?.data?.message || 'Failed to load results')
    } finally {
      setResultsLoading(false)
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
              {s.status === 'completed' ? (
                <button className="btn" onClick={() => openResults(s)}>Results</button>
              ) : s.status === 'cancelled' ? (
                <span className="text-sm text-neutral-500">Cancelled</span>
              ) : (
                <Link to={`/room/${s.roomId || s._id}`} className="btn">Join</Link>
              )}
            </div>
          ))}
          {!sessions?.items?.length && (
            <div className="text-sm text-neutral-400">No sessions yet.</div>
          )}
        </div>
      </div>
      {showResultsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{resultsTitle}</h2>
              <button className="btn" onClick={() => setShowResultsModal(false)}>Close</button>
            </div>
            {resultsLoading ? (
              <div className="text-sm text-neutral-400">Loading…</div>
            ) : resultsError ? (
              <div className="text-sm text-red-400">{resultsError}</div>
            ) : (
              <>
                <div className="mb-3">
                  <div className="text-sm text-neutral-400">Decision</div>
                  <div className={
                    `mt-1 inline-flex items-center rounded px-2 py-1 text-sm font-medium ` +
                    (resultsDecision === 'selected' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-800' :
                     resultsDecision === 'rejected' ? 'bg-red-600/20 text-red-300 border border-red-800' :
                     'bg-amber-600/20 text-amber-200 border border-amber-800')
                  }>
                    {resultsDecision ? (resultsDecision as string).replace(/\b\w/g, c => c.toUpperCase()) : 'N/A'}
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="text-sm text-neutral-400">Scores</div>
                  <div className="grid gap-2">
                    {resultsScores && resultsScores.length ? resultsScores.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm">
                        <span className="text-neutral-300">{r.criterion}</span>
                        <span className="font-semibold">{r.score}/10</span>
                      </div>
                    )) : (
                      <div className="text-sm text-neutral-500">No scores available.</div>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="mt-4 text-right">
              <button className="btn" onClick={() => setShowResultsModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

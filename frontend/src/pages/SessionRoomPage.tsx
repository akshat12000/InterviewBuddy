import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import io from 'socket.io-client'
import Editor from '@monaco-editor/react'
import axios from 'axios'

export default function SessionRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const [code, setCode] = useState('')
  const [participants, setParticipants] = useState<{socketId:string; uid:string; role:string}[]>([])
  const [socketId, setSocketId] = useState('')
  const [scores, setScores] = useState<Array<{criterion:string; score:number; notes?:string}>>([
    { criterion: 'Problem Solving', score: 0 },
    { criterion: 'Code Quality', score: 0 },
    { criterion: 'Communication', score: 0 }
  ])
  const [decision, setDecision] = useState<'selected'|'rejected'|'on-hold'>('on-hold')
  const [submitting, setSubmitting] = useState(false)

  // WebRTC state
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const [callStarted, setCallStarted] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [mediaError, setMediaError] = useState<string>('')

  const rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  }

  // Problem + editor enhancements
  const [sessionId, setSessionId] = useState<string>('')
  const [problem, setProblem] = useState<any>(null)
  const [status, setStatus] = useState<'scheduled'|'live'|'completed'|'cancelled'>('scheduled')
  const [language, setLanguage] = useState<'javascript'|'typescript'|'python'|'cpp'|'java'>('javascript')
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const editingDisabled = status !== 'live'
  const [chat, setChat] = useState<Array<{from:string;fromName?:string;text:string;at:number}>>([])
  const [chatInput, setChatInput] = useState('')
  const [allProblems, setAllProblems] = useState<any[]>([])
  const chatBoxRef = useRef<HTMLDivElement | null>(null)
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [isSessionInterviewer, setIsSessionInterviewer] = useState<boolean>(false)

  useEffect(() => {
    if (!roomId || !user) return
    const s = io('/', { // proxied to backend
      auth: { token: (window as any).token || '' },
      withCredentials: true
    })
    socketRef.current = s
    s.emit('session:join', { roomId })
  s.on('room:participants', (list) => setParticipants(list))
  s.on('socket:me', ({ socketId }) => setSocketId(socketId))
    s.on('code:update', ({ code }) => setCode(code))
    s.on('webrtc:signal', async ({ from, data }) => {
      if (!pcRef.current && (data?.type === 'offer' || data?.type === 'answer' || data?.candidate)) {
        await ensureLocalMedia()
        createPeer(from)
      }
      if (data?.type === 'offer') {
        await pcRef.current!.setRemoteDescription(new RTCSessionDescription(data))
        const answer = await pcRef.current!.createAnswer()
        await pcRef.current!.setLocalDescription(answer)
        socketRef.current?.emit('webrtc:signal', { roomId, to: from, data: pcRef.current!.localDescription })
      } else if (data?.type === 'answer') {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data))
      } else if (data?.candidate) {
        try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate)) } catch {}
      }
    })
    s.on('chat:message', (msg) => {
      setChat(prev => [...prev, msg])
    })
    s.on('problem:select', async ({ problemId }) => {
      try {
        const { data } = await axios.get(`/api/problems/${problemId}`)
        setProblem(data.item)
      } catch {}
    })
    s.on('call:end', () => {
      cleanupCall()
      navigate('/')
    })
    return () => {
      s.emit('session:leave', { roomId })
      s.disconnect()
      cleanupCall()
    }
  }, [roomId, user])

  // When participants list updates, detect the other peer and auto-initiate if interviewer
  useEffect(() => {
    const other = participants.find(p => p.socketId !== socketId)
    const shouldInitiate = user?.role === 'interviewer' && other && !callStarted
    if (shouldInitiate) { startCall(other.socketId!) }
  }, [participants, socketId])

  // Fetch session & problem
  useEffect(() => {
    if (!roomId) return
    (async () => {
      try {
        const { data } = await axios.get(`/api/sessions/${roomId}`)
        const s = data.item
        setSessionId(s._id)
        setProblem(s.problem)
        setStatus(s.status)
  // Determine if current user is the assigned interviewer for this session
  const interviewerId = (s.interviewer && (s.interviewer._id || s.interviewer.id)) || s.interviewer
  setIsSessionInterviewer(Boolean(user?.id && interviewerId && user.id === interviewerId))
  // Build a map of user id -> name for chat display
  const map: Record<string, string> = {}
  const interviewer = s.interviewer || {}
  const candidate = s.candidate || {}
  const iid = interviewer._id || interviewer.id || interviewer
  const cid = candidate._id || candidate.id || candidate
  if (iid && interviewer.name) map[iid] = interviewer.name
  if (cid && candidate.name) map[cid] = candidate.name
  if (user?.id && user.name) map[user.id] = user.name
  setUserNames(map)
        const lastSnap = (s.codeSnapshots || []).slice(-1)[0]
        if (lastSnap?.code) setCode(lastSnap.code)
        if (lastSnap?.language) setLanguage(lastSnap.language)
  // load problems for potential change (interviewer only view)
  const probs = await axios.get('/api/problems')
  setAllProblems(probs.data.items || [])
      } catch {}
    })()
  }, [roomId])

  async function ensureLocalMedia() {
    if (localStreamRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.muted = true
        localVideoRef.current.srcObject = stream
  await localVideoRef.current.play().catch(()=>{ /* autoplay might require gesture */ })
      }
      setMediaError('')
    } catch (err: any) {
      const name = err?.name || ''
      let msg = err?.message || String(err)
      if (name === 'NotReadableError') msg = 'Device in use by another app. Close apps like Teams/Zoom/OBS/Camera and retry.'
      if (name === 'NotAllowedError') msg = 'Permission denied. Allow access in the browser address bar and retry.'
      if (name === 'NotFoundError') msg = 'No camera/mic found. Plug in a device or choose a different one.'
      setMediaError('Camera/Mic error: ' + msg)
      throw err
    }
  }

  function createPeer(targetId: string) {
    if (pcRef.current) return pcRef.current
    const pc = new RTCPeerConnection(rtcConfig)
    pcRef.current = pc
    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!))
    // Remote track handler
    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream
  remoteVideoRef.current.play().catch(()=>{ /* user gesture may be required */ })
      }
    }
    // ICE candidate handler
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socketRef.current?.emit('webrtc:signal', { roomId, to: targetId, data: { candidate: ev.candidate } })
      }
    }
    return pc
  }

  async function startCall(targetId: string) {
    try {
      await ensureLocalMedia()
      const pc = createPeer(targetId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socketRef.current?.emit('webrtc:signal', { roomId, to: targetId, data: pc.localDescription })
      setCallStarted(true)
    } catch (e) {
      // ignore
    }
  }

  function cleanupCall() {
    pcRef.current?.getSenders().forEach(s => { try { s.track?.stop() } catch {} })
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t=>t.stop())
    localStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    setCallStarted(false)
    setMicOn(true)
    setCamOn(true)
  }

  function toggleMic() {
    const enabled = !micOn
    setMicOn(enabled)
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = enabled)
  }

  function toggleCam() {
    const enabled = !camOn
    setCamOn(enabled)
    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = enabled)
  }

  const onEdit = (value?: string) => {
    const v = value ?? ''
    setCode(v)
  socketRef.current?.emit('code:update', { roomId, code: v, language })
  }

  const submitScores = async () => {
    if (!roomId) return
    try {
      setSubmitting(true)
      // fetch session by roomId
      const { data } = await axios.get(`/api/sessions/${roomId}`)
      const sid = data.item._id
      await axios.post(`/api/sessions/${sid}/score`, { scores })
      await axios.post(`/api/sessions/${sid}/decision`, { decision })
      alert('Scores submitted')
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  // Debounced code snapshot to backend every 2s of idle
  useEffect(() => {
    if (!sessionId || !code) return
    const t = setTimeout(async () => {
      try {
        await axios.post(`/api/sessions/${sessionId}/code`, { code, language })
      } catch {}
    }, 2000)
    return () => clearTimeout(t)
  }, [code, language, sessionId])

  async function startInterview() {
    if (!sessionId) return
    try {
      await axios.patch(`/api/sessions/${sessionId}/status`, { status: 'live' })
      setStatus('live')
    } catch {}
  }

  async function endInterview() {
    if (!sessionId) return
    try {
  const ok = window.confirm('End interview and leave the room?')
  if (!ok) return
  await axios.patch(`/api/sessions/${sessionId}/status`, { status: 'completed' })
  setStatus('completed')
  socketRef.current?.emit('call:end', { roomId })
  cleanupCall()
  navigate('/')
    } catch {}
  }

  function runCode() {
    setRunOutput('')
    if (language !== 'javascript') {
      setRunOutput('Run is available for JavaScript in this MVP. Other languages coming soon.')
      return
    }
    setRunning(true)
    const blob = new Blob([
      `self.onmessage = async (e) => {
        const code = e.data;
        let logs = [];
        const originalLog = console.log;
        console.log = (...args) => { logs.push(args.map(a => typeof a==='object'? JSON.stringify(a) : String(a)).join(' ')); };
        try {
          const fn = new Function(code);
          const result = await Promise.resolve(fn());
          postMessage({ ok: true, logs, result: typeof result==='undefined'? '' : String(result) });
        } catch (err) {
          postMessage({ ok: false, logs, error: String(err) });
        } finally { console.log = originalLog; }
      };`
    ], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    worker.onmessage = (ev) => {
      const { ok, logs, result, error } = ev.data || {}
      let out = ''
      if (logs && logs.length) out += logs.join('\n') + '\n'
      if (ok && result) out += result + '\n'
      if (!ok && error) out += 'Error: ' + error + '\n'
      setRunOutput(out.trim())
      setRunning(false)
      worker.terminate()
    }
    worker.onerror = (e) => {
      setRunOutput('Worker error: ' + e.message)
      setRunning(false)
      worker.terminate()
    }
    worker.postMessage(code)
  }

  async function sendChat() {
    if (!chatInput.trim() || !roomId) return
    socketRef.current?.emit('chat:message', { roomId, text: chatInput.trim() })
    setChatInput('')
  }

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
    }
  }, [chat])

  // Simplified: no device selection UI; default devices used

  async function changeProblem(pid: string) {
    if (!sessionId || !pid) return
    try {
      await axios.patch(`/api/sessions/${sessionId}/problem`, { problem: pid })
      // sync to room
      socketRef.current?.emit('problem:select', { roomId, problemId: pid })
      const { data } = await axios.get(`/api/problems/${pid}`)
      setProblem(data.item)
    } catch {}
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr', height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #222', background: '#141414' }}>
        <div style={{ fontWeight: 600 }}>Interview Room</div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => {
            const ok = window.confirm('Exit interview? This will end the call and leave the room.')
            if (!ok) return
            socketRef.current?.emit('call:end', { roomId })
            cleanupCall()
            navigate('/')
          }}>Exit</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 360px', height: '100%' }}>
        <div style={{ borderRight: '1px solid #ddd', overflowY: 'auto' }}>
        <h3 style={{ margin: 8 }}>Participants</h3>
        <ul>
          {participants.map((p,i) => (<li key={i}>{p.uid} ({p.role}) {p.socketId===socketId?'(me)':''}</li>))}
        </ul>
        <h3 style={{ margin: 8 }}>Problem</h3>
        <div style={{ padding: 8 }}>
          {problem ? (
            <div>
              <div style={{ fontWeight: 600 }}>{problem.title} <span style={{ color: '#888', fontWeight: 400 }}>· {problem.difficulty}</span></div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{problem.statement}</p>
            </div>
          ) : (
            <div>Select problem in dashboard to sync...</div>
          )}
        </div>
        {/* Chat moved here so both roles can see it easily */}
        <div style={{ padding: 8, borderTop: '1px solid #ddd' }}>
          <h3>Chat</h3>
          <div ref={chatBoxRef} style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4, padding: 6, border: '1px solid #444', background: '#111', color: '#eee' }}>
            {chat.map((m, i) => {
              const isMe = m.from === (user?.id || '')
              const name = isMe ? 'Me' : (m.fromName || userNames[m.from] || m.from)
              return <div key={i} style={{ color: '#eee' }}><b>{name}</b>: {m.text}</div>
            })}
            {!chat.length && <div style={{ color: '#aaa' }}>No messages yet</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={chatInput} onChange={(e)=>setChatInput(e.target.value)} placeholder="Type a message" style={{ flex: 1, background: '#1a1a1a', color: '#fff', border: '1px solid #444', padding: '6px 8px' }} onKeyDown={(e)=>{ if (e.key==='Enter') sendChat() }} />
            <button onClick={sendChat} style={{ background: '#333', color: '#fff', border: '1px solid #444', padding: '6px 10px' }}>Send</button>
          </div>
        </div>
        {isSessionInterviewer && (
          <div style={{ padding: 8, display: 'grid', gap: 8 }}>
            <button title="Sets the session status to Live and enables editor" onClick={startInterview} disabled={status==='live'}>Start Interview</button>
            <button title="Completes session, ends call for both, and returns to dashboard" onClick={endInterview} disabled={status!=='live'}>End Interview</button>
            <div>Status: <b>{status}</b> {status!=='live' && <span style={{ color: '#888' }}>(editor disabled)</span>}</div>
            {!!allProblems.length && (
              <div>
                <label>Change Problem</label>
                <select onChange={(e)=>changeProblem(e.target.value)} defaultValue="">
                  <option value="" disabled>Select a problem</option>
                  {allProblems.map(p => (
                    <option key={p._id} value={p._id}>{p.title} · {p.difficulty}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        {!isSessionInterviewer && (
          <div style={{ padding: 8, display: 'grid', gap: 8 }}>
            <div>Status: <b>{status}</b> {status!=='live' && <span style={{ color: '#888' }}>(editor disabled)</span>}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateRows: '240px auto 1fr 180px', height: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8, alignItems: 'start' }}>
          <video ref={localVideoRef} style={{ width: '100%', height: '100%', background: '#000', borderRadius: 6, objectFit: 'cover' }} playsInline muted />
          <video ref={remoteVideoRef} style={{ width: '100%', height: '100%', background: '#000', borderRadius: 6, objectFit: 'cover' }} playsInline />
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 8px 8px', alignItems: 'center' }}>
          <button onClick={() => { ensureLocalMedia().catch(()=>{}); }}>Test Camera</button>
          <button onClick={() => {
            const other = participants.find(p => p.socketId !== socketId)
            if (other) startCall(other.socketId)
          }} disabled={callStarted}>Start Call</button>
          <button onClick={() => {
            const ok = window.confirm('End call and leave the room?')
            if (!ok) return
            socketRef.current?.emit('call:end', { roomId })
            cleanupCall()
            navigate('/')
          }} disabled={!callStarted}>End Call</button>
          <button onClick={toggleMic} disabled={!callStarted}>{micOn? 'Mute' : 'Unmute'}</button>
          <button onClick={toggleCam} disabled={!callStarted}>{camOn? 'Camera Off' : 'Camera On'}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <label>Language</label>
            <select value={language} onChange={(e)=>setLanguage(e.target.value as any)} disabled={editingDisabled}>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
            <button onClick={runCode} disabled={running || editingDisabled}>{running?'Running...':'Run'}</button>
          </div>
        </div>
        {mediaError && (
          <div style={{ color: '#f66', padding: '0 8px 8px' }}>{mediaError}</div>
        )}
        <div style={{ minHeight: 0 /* allow editor to fill remaining space */ }}>
          <Editor height="100%" language={language} value={code} onChange={onEdit} options={{ readOnly: editingDisabled }} />
        </div>
        <div style={{ borderTop: '1px solid #222', padding: 8, background: '#0b0b0b', overflow: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Output</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{runOutput || 'Run code to see output here.'}</pre>
        </div>
  </div>
  <div style={{ borderLeft: '1px solid #ddd', padding: 8, overflowY: 'auto', display: 'grid', gridTemplateRows: '1fr auto', gap: 8 }}>
        <h3>Interviewer Score Sheet</h3>
        {user?.role === 'interviewer' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {scores.map((s, idx) => (
              <div key={idx} style={{ display: 'grid', gap: 4 }}>
                <label>{s.criterion}</label>
                <input type="range" min={0} max={10} value={s.score} onChange={(e)=>{
                  const next=[...scores]; next[idx] = { ...s, score: Number(e.target.value) }; setScores(next)
                }} />
                <textarea placeholder="Notes" value={s.notes||''} onChange={(e)=>{
                  const next=[...scores]; next[idx] = { ...s, notes: e.target.value }; setScores(next)
                }} />
              </div>
            ))}
            <label>Decision</label>
            <select value={decision} onChange={(e)=>setDecision(e.target.value as any)}>
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
              <option value="on-hold">On Hold</option>
            </select>
            <button onClick={submitScores} disabled={submitting}>{submitting?'Submitting...':'Submit Scores'}</button>
          </div>
        ) : (
          <div>Only interviewer can see the score sheet.</div>
        )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import io from 'socket.io-client'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import { Camera, CameraOff, Mic, MicOff, Play, LogOut } from 'lucide-react'

export default function SessionRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const [code, setCode] = useState('')
  const [participants, setParticipants] = useState<{socketId:string; uid:string; role:string; name?:string}[]>([])
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
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const [callStarted, setCallStarted] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [remoteMicOn, setRemoteMicOn] = useState<boolean | null>(null)
  const [remoteCamOn, setRemoteCamOn] = useState<boolean | null>(null)
  const [mediaError, setMediaError] = useState<string>('')

  // WebRTC config with optional TURN (set via Vite env: VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL)
  const rtcConfig: RTCConfiguration = (() => {
    const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined
    const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined
    const turnCred = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined
    const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    if (turnUrl && turnUser && turnCred) {
      servers.push({ urls: turnUrl.split(',').map(s=>s.trim()).filter(Boolean), username: turnUser, credential: turnCred })
    }
    return { iceServers: servers, iceCandidatePoolSize: 4 }
  })()

  // Problem + editor enhancements
  const [sessionId, setSessionId] = useState<string>('')
  const [problem, setProblem] = useState<any>(null)
  const [status, setStatus] = useState<'scheduled'|'live'|'completed'|'cancelled'>('scheduled')
  const [language, setLanguage] = useState<string>('javascript')
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const editingDisabled = status !== 'live'
  const [chat, setChat] = useState<Array<{from:string;fromName?:string;text:string;at:number}>>([])
  const [chatInput, setChatInput] = useState('')
  const [allProblems, setAllProblems] = useState<any[]>([])
  const chatBoxRef = useRef<HTMLDivElement | null>(null)
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  // removed: isSessionInterviewer (show controls to any interviewer)
  const [focusEditor, setFocusEditor] = useState<boolean>(false)
  const languageOptions: Array<{id:string; label:string}> = [
    { id: 'javascript', label: 'JavaScript' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'python', label: 'Python' },
    { id: 'cpp', label: 'C/C++' },
    { id: 'java', label: 'Java' },
    { id: 'csharp', label: 'C#' },
    { id: 'go', label: 'Go' },
    { id: 'rust', label: 'Rust' },
    { id: 'php', label: 'PHP' },
    { id: 'ruby', label: 'Ruby' },
    { id: 'kotlin', label: 'Kotlin' },
    { id: 'swift', label: 'Swift' },
    { id: 'scala', label: 'Scala' },
    { id: 'sql', label: 'SQL' },
    { id: 'json', label: 'JSON' },
    { id: 'markdown', label: 'Markdown' },
    { id: 'html', label: 'HTML' },
    { id: 'css', label: 'CSS' },
    { id: 'shell', label: 'Shell' },
    { id: 'xml', label: 'XML' },
    { id: 'yaml', label: 'YAML' },
  ]
  const userInitials = (() => {
    const src = (user?.name || user?.email || '').trim()
    if (!src) return 'U'
    const parts = src.split(/\s+/)
    const first = parts[0]?.[0] || ''
    const last = parts.length > 1 ? parts[parts.length-1]?.[0] : ''
    return (first + last).toUpperCase() || first.toUpperCase() || 'U'
  })()
  const remoteInitials = (() => {
    const other = participants.find(p => p.socketId !== socketId)
    const name = (other?.name || (other?.uid ? userNames[other.uid] : '') || '').trim()
    if (!name) return '?'
    const parts = name.split(/\s+/)
    const first = parts[0]?.[0] || ''
    const last = parts.length > 1 ? parts[parts.length-1]?.[0] : ''
    return (first + last).toUpperCase() || first.toUpperCase() || '?'
  })()

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
    // Buffer ICE candidates until remote description is set to avoid addIceCandidate errors in some browsers
    const pendingCandidates: any[] = []
    s.on('webrtc:signal', async ({ from, data }) => {
      // Create peer only when receiving an offer or ICE candidate (not for answers)
      if (!pcRef.current && (data?.type === 'offer' || data?.candidate)) {
        await ensureLocalMedia()
        createPeer(from)
      }
      const pc = pcRef.current
      if (!pc) return
      try {
        if (data?.type === 'offer') {
          // Only accept offers when stable (no ongoing negotiation)
          if (pc.signalingState !== 'stable') return
          await pc.setRemoteDescription(new RTCSessionDescription(data))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socketRef.current?.emit('webrtc:signal', { roomId, to: from, data: pc.localDescription })
          // flush pending candidates
          while (pendingCandidates.length) {
            const c = pendingCandidates.shift()
            try { await pc.addIceCandidate(new RTCIceCandidate(c.candidate)) } catch {}
          }
        } else if (data?.type === 'answer') {
          // Only apply answer if we have a local offer and no remote description yet
          if (pc.signalingState !== 'have-local-offer') return
          if (pc.currentRemoteDescription) return
          await pc.setRemoteDescription(new RTCSessionDescription(data))
        } else if (data?.candidate) {
          if (!pc.currentRemoteDescription) {
            pendingCandidates.push(data)
          } else {
            try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)) } catch {}
          }
        }
      } catch (err) {
        // swallow to avoid noisy logs in UI; can add debug console if needed
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
        navigate('/dashboard')
    })
  s.on('media:state', ({ micOn, camOn }) => {
      // update remote media state
      setRemoteMicOn(typeof micOn === 'boolean' ? micOn : null)
      setRemoteCamOn(typeof camOn === 'boolean' ? camOn : null)
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
    const shouldInitiate = user?.role === 'interviewer' && other && !callStarted && !pcRef.current
    if (shouldInitiate) { startCall(other.socketId!) }
    // Broadcast our current media state so new peer reflects correct UI
    if (socketRef.current && roomId) {
      socketRef.current.emit('media:state', { roomId, micOn, camOn })
    }
  }, [participants, socketId, callStarted])

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
  // Note: controls are visible to any user with interviewer role
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
      if (remoteStream) {
        remoteStreamRef.current = remoteStream
      }
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream
        remoteVideoRef.current.play().catch(()=>{ /* user gesture may be required */ })
      }
      setCallStarted(true)
    }
    // ICE candidate handler
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socketRef.current?.emit('webrtc:signal', { roomId, to: targetId, data: { candidate: ev.candidate } })
      }
    }
    // ICE connection monitoring and restart for cross-browser stability
    pc.oniceconnectionstatechange = async () => {
      const state = pc.iceConnectionState
      if (state === 'disconnected' || state === 'failed') {
        try { await pc.restartIce?.() } catch {}
      }
    }
    return pc
  }

  // Rebind media streams to video tags when layout switches (focus toggled)
  useEffect(() => {
    // local
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.muted = true
      const cur = localVideoRef.current as HTMLVideoElement
      if (cur.srcObject !== localStreamRef.current) {
        cur.srcObject = localStreamRef.current
      }
      cur.play?.().catch(()=>{})
    }
    // remote
    if (remoteStreamRef.current && remoteVideoRef.current) {
      const cur = remoteVideoRef.current as HTMLVideoElement
      if (cur.srcObject !== remoteStreamRef.current) {
        cur.srcObject = remoteStreamRef.current
      }
      cur.play?.().catch(()=>{})
    }
  }, [focusEditor])

  async function startCall(targetId: string) {
    try {
  if (pcRef.current && callStarted) return
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

  async function toggleMic() {
    if (!localStreamRef.current) {
      try { await ensureLocalMedia() } catch { return }
    }
    const enabled = !micOn
    setMicOn(enabled)
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = enabled)
    // broadcast state
    socketRef.current?.emit('media:state', { roomId, micOn: enabled, camOn })
  }

  async function toggleCam() {
    if (!localStreamRef.current) {
      try { await ensureLocalMedia() } catch { return }
    }
    const enabled = !camOn
    setCamOn(enabled)
    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = enabled)
    // broadcast state
    socketRef.current?.emit('media:state', { roomId, micOn, camOn: enabled })
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
        navigate('/dashboard')
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
  <div className="grid h-dvh grid-rows-[48px_1fr] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3">
        <div className="text-sm font-semibold">Interview Room</div>
        <div className="ml-auto">
          <button className="btn" onClick={() => {
            const ok = window.confirm('Exit interview? This will end the call and leave the room.')
            if (!ok) return
            socketRef.current?.emit('call:end', { roomId })
            cleanupCall()
            navigate('/dashboard')
          }}>
            <LogOut size={16}/> Exit
          </button>
        </div>
      </div>
  <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* Left Sidebar */}
  <div className="order-2 md:order-1 border-b md:border-b-0 md:border-r border-neutral-800 h-full overflow-y-auto">
          <div className="p-3">
      <h3 className="mb-2 text-sm font-semibold text-neutral-300">Participants</h3>
            <ul className="space-y-1 text-sm text-neutral-300">
              {participants.map((p,i) => {
                const displayName = (p.name && p.name.trim()) || userNames[p.uid] || 'User'
                return (
                  <li key={i} className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1">
                    <span className="truncate">{displayName}</span>
                    {p.socketId===socketId && <span className="text-xs text-brand-400">me</span>}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="p-3">
            <h3 className="mb-2 text-sm font-semibold text-neutral-300">Problem</h3>
            <div className="card p-3">
              {problem ? (
                <div>
                  <div className="font-semibold">{problem.title} <span className="font-normal text-neutral-400">· {problem.difficulty}</span></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{problem.statement}</p>
                </div>
              ) : (
                <div className="text-sm text-neutral-400">Select a problem in the dashboard to sync...</div>
              )}
            </div>
          </div>
          {/* Chat */}
          <div className="border-t border-neutral-800 p-3">
            <h3 className="mb-2 text-sm font-semibold text-neutral-300">Chat</h3>
            <div ref={chatBoxRef} className="card grid max-h-60 gap-1 overflow-y-auto p-2 text-sm text-neutral-200">
              {chat.map((m, i) => {
                const isMe = m.from === (user?.id || '')
                const name = isMe ? 'Me' : (m.fromName || userNames[m.from] || m.from)
                return <div key={i}><b>{name}</b>: {m.text}</div>
              })}
              {!chat.length && <div className="text-neutral-500">No messages yet</div>}
            </div>
            <div className="mt-2 flex gap-2">
              <input className="input" value={chatInput} onChange={(e)=>setChatInput(e.target.value)} placeholder="Type a message" onKeyDown={(e)=>{ if (e.key==='Enter') sendChat() }} />
              <button className="btn" onClick={sendChat}>Send</button>
            </div>
          </div>
          {user?.role === 'interviewer' ? (
            <div className="p-3">
              <div className="grid gap-2">
                <button className="btn btn-primary" title="Sets the session status to Live and enables editor" onClick={startInterview} disabled={status==='live'}>Start Interview</button>
                <button className="btn" title="Completes session, ends call for both, and returns to dashboard" onClick={endInterview} disabled={status!=='live'}>End Interview</button>
                <div className="text-sm">Status: <b>{status}</b> {status!=='live' && <span className="text-neutral-500">(editor disabled)</span>}</div>
                {!!allProblems.length && (
                  <div className="grid gap-1">
                    <label className="text-sm text-neutral-400">Change Problem</label>
                    <select className="select" onChange={(e)=>changeProblem(e.target.value)} defaultValue="">
                      <option value="" disabled>Select a problem</option>
                      {allProblems.map(p => (
                        <option key={p._id} value={p._id}>{p.title} · {p.difficulty}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 text-sm">Status: <b>{status}</b> {status!=='live' && <span className="text-neutral-500">(editor disabled)</span>}</div>
          )}
  </div>

  {/* Center */}
  <div className="order-1 md:order-2 min-w-0 h-full overflow-y-auto">
  {focusEditor ? (
          <div className="grid min-w-0 h-full min-h-0 grid-cols-1 md:grid-cols-2 gap-2 p-2">
            <div className="grid min-h-0 grid-rows-[1fr_auto_auto] gap-2">
              <div className="grid min-h-0 grid-rows-2 gap-2">
                <div className="relative h-full w-full">
                  <video ref={localVideoRef} className={`h-full w-full rounded-md bg-black object-cover transition-opacity ${camOn ? 'opacity-100' : 'opacity-0'}`} playsInline muted />
                  {!camOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-neutral-800 text-neutral-200">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700 text-2xl font-semibold">{userInitials}</div>
                      <div className="mt-2 flex items-center gap-1 text-sm"><CameraOff size={16}/> Camera is off</div>
                    </div>
                  )}
                  {!micOn && (
                    <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-neutral-100">
                      <MicOff size={14}/> Muted
                    </div>
                  )}
                </div>
                <div className="relative h-full w-full">
                  <video ref={remoteVideoRef} className={`h-full w-full rounded-md bg-black object-cover transition-opacity ${remoteCamOn === false ? 'opacity-0' : 'opacity-100'}`} playsInline />
                  {remoteCamOn === false && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-neutral-800 text-neutral-200">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700 text-2xl font-semibold">{remoteInitials}</div>
                      <div className="mt-2 flex items-center gap-1 text-sm"><CameraOff size={16}/> Camera is off</div>
                    </div>
                  )}
                  {remoteMicOn === false && (
                    <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-neutral-100">
                      <MicOff size={14}/> Muted
                    </div>
                  )}
                </div>
              </div>
              <div className="sticky top-0 flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
                <button className="btn" onClick={()=>setFocusEditor(false)}>Exit Focus</button>
                <button className="btn" onClick={toggleMic} disabled={!callStarted}>{micOn? (<><Mic size={16}/> Mute</>) : (<><MicOff size={16}/> Unmute</> )}</button>
                <button className="btn" onClick={toggleCam} disabled={!callStarted}>{camOn? (<><Camera size={16}/> Camera Off</>) : (<><CameraOff size={16}/> Camera On</>)}</button>
              </div>
              <div className="card p-3">
                <h3 className="mb-2 text-sm font-semibold text-neutral-300">Problem</h3>
                {problem ? (
                  <div>
                    <div className="font-semibold">{problem.title} <span className="font-normal text-neutral-400">· {problem.difficulty}</span></div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{problem.statement}</p>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-400">No problem selected.</div>
                )}
              </div>
            </div>
            <div className="grid grid-rows-[auto_1fr_auto] gap-2 min-h-0">
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-400">Language</label>
                <select className="select" value={language} onChange={(e)=>setLanguage(e.target.value as any)} disabled={editingDisabled}>
                  {languageOptions.map(opt => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                </select>
                <button className="btn" onClick={runCode} disabled={running || editingDisabled}><Play size={16}/> {running?'Running...':'Run'}</button>
              </div>
              <div className="min-h-0">
                <Editor height="100%" language={language} value={code} onChange={onEdit} options={{ readOnly: editingDisabled }} />
              </div>
              <div className="overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="mb-1 font-semibold">Output</div>
                <pre className="m-0 whitespace-pre-wrap text-sm text-neutral-200">{runOutput || 'Run code to see output here.'}</pre>
              </div>
            </div>
    </div>
  ) : (
  <div className="grid min-w-0 h-full min-h-0 grid-rows-[240px_auto_1fr_180px] md:grid-rows-[240px_auto_1fr_180px]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
              <div className="relative h-full w-full">
                <video ref={localVideoRef} className={`h-full w-full rounded-md bg-black object-cover transition-opacity ${camOn ? 'opacity-100' : 'opacity-0'}`} playsInline muted />
                {!camOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-neutral-800 text-neutral-200">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700 text-2xl font-semibold">{userInitials}</div>
                    <div className="mt-2 flex items-center gap-1 text-sm"><CameraOff size={16}/> Camera is off</div>
                  </div>
                )}
                {!micOn && (
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-neutral-100">
                    <MicOff size={14}/> Muted
                  </div>
                )}
              </div>
              <div className="relative h-full w-full">
                <video ref={remoteVideoRef} className={`h-full w-full rounded-md bg-black object-cover transition-opacity ${remoteCamOn === false ? 'opacity-0' : 'opacity-100'}`} playsInline />
                {remoteCamOn === false && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-neutral-800 text-neutral-200">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700 text-2xl font-semibold">{remoteInitials}</div>
                    <div className="mt-2 flex items-center gap-1 text-sm"><CameraOff size={16}/> Camera is off</div>
                  </div>
                )}
                {remoteMicOn === false && (
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-neutral-100">
                    <MicOff size={14}/> Muted
                  </div>
                )}
              </div>
            </div>
            <div className="sticky top-0 z-30 flex items-center gap-2 border-t border-neutral-800 bg-neutral-950/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
              <button className="btn" onClick={()=>setFocusEditor(true)}>Focus Editor</button>
              <button className="btn" onClick={toggleMic} disabled={!callStarted}>{micOn? (<><Mic size={16}/> Mute</>) : (<><MicOff size={16}/> Unmute</> )}</button>
              <button className="btn" onClick={toggleCam} disabled={!callStarted}>{camOn? (<><Camera size={16}/> Camera Off</>) : (<><CameraOff size={16}/> Camera On</>)}</button>
              <div className="ml-auto flex items-center gap-2">
                <label className="text-sm text-neutral-400">Language</label>
                <select className="select" value={language} onChange={(e)=>setLanguage(e.target.value as any)} disabled={editingDisabled}>
                  {languageOptions.map(opt => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                </select>
                <button className="btn" onClick={runCode} disabled={running || editingDisabled}><Play size={16}/> {running?'Running...':'Run'}</button>
              </div>
            </div>
            {mediaError && (
              <div className="px-2 pb-2 text-sm text-red-400">{mediaError}</div>
            )}
            <div className="min-h-0">
              <Editor height="100%" language={language} value={code} onChange={onEdit} options={{ readOnly: editingDisabled }} />
            </div>
            <div className="overflow-auto border-t border-neutral-800 bg-neutral-950 p-2">
              <div className="mb-1 font-semibold">Output</div>
              <pre className="m-0 whitespace-pre-wrap text-sm text-neutral-200">{runOutput || 'Run code to see output here.'}</pre>
            </div>
    </div>
  )}
        </div>

        {/* Right Sidebar */}
  <div className="order-3 grid h-full grid-rows-[1fr_auto] gap-2 overflow-y-auto border-t md:border-t-0 md:border-l border-neutral-800 p-3">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Interviewer Score Sheet</h3>
            {user?.role === 'interviewer' ? (
              <div className="grid gap-3">
                {scores.map((s, idx) => (
                  <div key={idx} className="grid gap-1">
                    <label className="text-sm text-neutral-300">{s.criterion}</label>
                    <input className="w-full" type="range" min={0} max={10} value={s.score} onChange={(e)=>{
                      const next=[...scores]; next[idx] = { ...s, score: Number(e.target.value) }; setScores(next)
                    }} />
                    <textarea className="textarea" placeholder="Notes" value={s.notes||''} onChange={(e)=>{
                      const next=[...scores]; next[idx] = { ...s, notes: e.target.value }; setScores(next)
                    }} />
                  </div>
                ))}
                <div className="grid gap-1">
                  <label className="text-sm text-neutral-300">Decision</label>
                  <select className="select" value={decision} onChange={(e)=>setDecision(e.target.value as any)}>
                    <option value="selected">Selected</option>
                    <option value="rejected">Rejected</option>
                    <option value="on-hold">On Hold</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="text-sm text-neutral-400">Only interviewer can see the score sheet.</div>
            )}
          </div>
          {user?.role === 'interviewer' && (
            <div>
              <button className="btn btn-primary w-full" onClick={submitScores} disabled={submitting}>{submitting?'Submitting...':'Submit Scores'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

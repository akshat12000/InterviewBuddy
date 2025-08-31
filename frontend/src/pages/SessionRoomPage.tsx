import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import io from 'socket.io-client'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import { Camera, CameraOff, Mic, MicOff, Play } from 'lucide-react'

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
  const [downloading, setDownloading] = useState(false)

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
  // Device selection and testing
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioInId, setSelectedAudioInId] = useState<string>('')
  const [selectedVideoInId, setSelectedVideoInId] = useState<string>('')
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micRAFRef = useRef<number | null>(null)
  const [micLevel, setMicLevel] = useState<number>(0)
  const [isAssignedInterviewer, setIsAssignedInterviewer] = useState<boolean>(false)
  const [sessionLoaded, setSessionLoaded] = useState<boolean>(false)
  const [showResultsModal, setShowResultsModal] = useState<boolean>(false)
  const [finalScores, setFinalScores] = useState<Array<{criterion:string; score:number; notes?:string}>>([])
  const [finalDecision, setFinalDecision] = useState<'selected'|'rejected'|'on-hold'|''>('')
  // Helper to resolve IDs/emails robustly across shapes
  const getIdString = (x: any): string => {
    if (!x) return ''
    if (typeof x === 'string') return x
    return String(x._id || x.id || x.uid || x.userId || '')
  }
  const getEmailString = (x: any): string => {
    if (!x) return ''
    if (typeof x === 'string') return ''
    return String((x.email || '').toLowerCase())
  }

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
    // Only connect sockets for active sessions
    if (!roomId || !user || !sessionLoaded) return
    if (status === 'completed' || status === 'cancelled') return
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
  }, [roomId, user, status, sessionLoaded])

  // When participants list updates, detect the other peer and auto-initiate if interviewer
  useEffect(() => {
    const other = participants.find(p => p.socketId !== socketId)
    const shouldInitiate = (user?.role === 'interviewer' && isAssignedInterviewer) && other && !callStarted && !pcRef.current
    if (shouldInitiate) { startCall(other.socketId!) }
    // Broadcast our current media state so new peer reflects correct UI
    if (socketRef.current && roomId) {
      socketRef.current.emit('media:state', { roomId, micOn, camOn })
    }
  }, [participants, socketId, callStarted, isAssignedInterviewer])

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
  // results info if completed (align with backend model)
  const fromServerScores = s.interviewerScores || []
  const fromServerDecision = s.finalDecision || ''
        if (s.status === 'completed') {
          setFinalScores(Array.isArray(fromServerScores) ? fromServerScores : [])
          setFinalDecision(fromServerDecision)
          setShowResultsModal(true)
        }
  // Note: controls are visible to any user with interviewer role
  // Build a map of user id -> name for chat display
  const map: Record<string, string> = {}
  const interviewer = s.interviewer || {}
  const candidate = s.candidate || {}
  const iid = getIdString(interviewer) || interviewer
  const cid = getIdString(candidate) || candidate
  if (iid && interviewer.name) map[iid] = interviewer.name
  if (cid && candidate.name) map[cid] = candidate.name
  if (user?.id && user.name) map[user.id] = user.name
  setUserNames(map)
        // Assigned interviewer gating (robust id/email comparison)
        const interviewerId = getIdString(interviewer)
        const interviewerEmail = getEmailString(interviewer)
        const userId = getIdString(user)
        const userEmail = getEmailString(user)
        const isAssigned = (interviewerId && userId && String(interviewerId) === String(userId))
          || (interviewerEmail && userEmail && interviewerEmail === userEmail)
        setIsAssignedInterviewer(Boolean(isAssigned))
        const lastSnap = (s.codeSnapshots || []).slice(-1)[0]
        if (lastSnap?.code) setCode(lastSnap.code)
        if (lastSnap?.language) setLanguage(lastSnap.language)
  // load problems for potential change (interviewer only view)
  const probs = await axios.get('/api/problems')
  setAllProblems(probs.data.items || [])
      } catch {}
      finally {
        setSessionLoaded(true)
      }
    })()
  }, [roomId])

  // Enumerate devices and react to changes
  useEffect(() => {
    async function enumerate() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices()
        const aud = devs.filter(d => d.kind === 'audioinput')
        const vid = devs.filter(d => d.kind === 'videoinput')
        setAudioInputs(aud)
        setVideoInputs(vid)
        if (!selectedAudioInId && aud[0]?.deviceId) setSelectedAudioInId(aud[0].deviceId)
        if (!selectedVideoInId && vid[0]?.deviceId) setSelectedVideoInId(vid[0].deviceId)
      } catch {}
    }
    enumerate()
    const onChange = () => enumerate()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
  }, [])

  async function ensureLocalMedia() {
    if (localStreamRef.current) return
    try {
      const constraints: MediaStreamConstraints = {
        audio: { deviceId: selectedAudioInId ? { exact: selectedAudioInId } : undefined },
        video: { deviceId: selectedVideoInId ? { exact: selectedVideoInId } : undefined }
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      // honor current toggle state
      stream.getAudioTracks().forEach(t => t.enabled = micOn)
      stream.getVideoTracks().forEach(t => t.enabled = camOn)
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.muted = true
        localVideoRef.current.srcObject = stream
  await localVideoRef.current.play().catch(()=>{ /* autoplay might require gesture */ })
      }
      startMicMeter()
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

  // Keyboard shortcuts: Ctrl/Cmd+Enter to Run, Shift+Alt+F to Format
  function onEditorMount(editor: any, monaco: any) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { if (!running && !editingDisabled) runCode() })
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument')?.run()
    })
  }

  async function refreshLocalMedia() {
    try {
      const constraints: MediaStreamConstraints = {
        audio: { deviceId: selectedAudioInId ? { exact: selectedAudioInId } : undefined },
        video: { deviceId: selectedVideoInId ? { exact: selectedVideoInId } : undefined }
      }
      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      newStream.getAudioTracks().forEach(t => t.enabled = micOn)
      newStream.getVideoTracks().forEach(t => t.enabled = camOn)
      const oldStream = localStreamRef.current
      localStreamRef.current = newStream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream
        localVideoRef.current.play?.().catch(()=>{})
      }
      // Replace tracks in existing connection
      const pc = pcRef.current
      if (pc) {
        const audioTrack = newStream.getAudioTracks()[0]
        const videoTrack = newStream.getVideoTracks()[0]
        const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio')
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (audioSender && audioTrack) { try { await audioSender.replaceTrack(audioTrack) } catch {} }
        if (videoSender && videoTrack) { try { await videoSender.replaceTrack(videoTrack) } catch {} }
      }
      // stop old tracks
      oldStream?.getTracks().forEach(t => { try { t.stop() } catch {} })
      startMicMeter()
    } catch (e: any) {
      setMediaError('Failed to apply device change: ' + (e?.message || String(e)))
    }
  }

  function startMicMeter() {
    try {
      if (!localStreamRef.current) return
      const track = localStreamRef.current.getAudioTracks()[0]
      if (!track) return
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      const ctx = audioCtxRef.current
      if (!ctx) return
      stopMicMeter()
      const source = ctx.createMediaStreamSource(new MediaStream([track]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      micSourceRef.current = source
      analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteTimeDomainData(data)
        // Compute RMS
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        setMicLevel(Math.min(100, Math.max(0, Math.round(rms * 200))))
        micRAFRef.current = requestAnimationFrame(loop)
      }
      micRAFRef.current = requestAnimationFrame(loop)
    } catch {}
  }

  function stopMicMeter() {
    if (micRAFRef.current) {
      cancelAnimationFrame(micRAFRef.current)
      micRAFRef.current = null
    }
    try { micSourceRef.current?.disconnect() } catch {}
    try { analyserRef.current?.disconnect() } catch {}
    micSourceRef.current = null
    analyserRef.current = null
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
  stopMicMeter()
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

  async function onSelectAudioDevice(id: string) {
    setSelectedAudioInId(id)
    if (localStreamRef.current) await refreshLocalMedia()
  }

  async function onSelectVideoDevice(id: string) {
    setSelectedVideoInId(id)
    if (localStreamRef.current) await refreshLocalMedia()
  }

  function testSpeakers() {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      const ctx = audioCtxRef.current!
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 440
      gain.gain.value = 0.05
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      setTimeout(() => { try { osc.stop() } catch {} try { osc.disconnect() } catch {} try { gain.disconnect() } catch {} }, 500)
    } catch {}
  }

  const onEdit = (value?: string) => {
    const v = value ?? ''
    setCode(v)
  socketRef.current?.emit('code:update', { roomId, code: v, language })
  }
  async function sendChat() {
    if (!chatInput.trim() || !roomId) return
    socketRef.current?.emit('chat:message', { roomId, text: chatInput.trim() })
    setChatInput('')
  }

  const submitScores = async (opts?: { silent?: boolean }) => {
    if (!sessionId) return
    try {
      setSubmitting(true)
      // post scores and decision to current session
      await axios.post(`/api/sessions/${sessionId}/score`, { scores })
      await axios.post(`/api/sessions/${sessionId}/decision`, { decision })
      if (!opts?.silent) alert('Scores submitted')
    } catch (e: any) {
      if (!opts?.silent) alert(e?.response?.data?.message || 'Failed to submit')
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
  if (status !== 'scheduled') return
    try {
      await axios.patch(`/api/sessions/${sessionId}/status`, { status: 'live' })
      setStatus('live')
    } catch {}
  }
  async function exitInterview() {
    // Leave the room without completing the session
    try {
      if (user?.role === 'interviewer') {
        const isComplete = scores.every(s => Number(s.score) > 0)
        if (!isComplete) {
          alert('Please complete the score sheet (set all scores) before exiting the interview.')
          document.getElementById('score-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        // best-effort auto-save
        try { await submitScores({ silent: true }) } catch {}
      }
      const ok = window.confirm('Exit the interview and leave the room? The session will remain live for others.')
      if (!ok) return
      cleanupCall()
      navigate('/dashboard')
    } catch {}
  }

    async function endInterview() {
    if (!sessionId) return
    try {
  // Interviewer must complete all scores (>0) before ending
  if (user?.role === 'interviewer') {
    const isComplete = scores.every(s => Number(s.score) > 0)
    if (!isComplete) {
      alert('Please complete the score sheet (set all scores) before ending the interview.')
      document.getElementById('score-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  const ok = window.confirm('End interview and leave the room?')
  if (!ok) return
  // Save scores silently before marking completed (best effort)
  if (user?.role === 'interviewer') { try { await submitScores({ silent: true }) } catch {} }
  await axios.patch(`/api/sessions/${sessionId}/status`, { status: 'completed' })
  setStatus('completed')
  socketRef.current?.emit('call:end', { roomId })
  cleanupCall()
        navigate('/dashboard')
    } catch {}
  }

  

  async function runCode() {
    setRunOutput('')
    setRunning(true)
    try {
      // For JS, keep fast in-browser worker path
      if (language === 'javascript') {
        await new Promise<void>((resolve) => {
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
            worker.terminate()
            resolve()
          }
          worker.onerror = () => { worker.terminate(); resolve() }
          worker.postMessage(code)
        })
        return
      }
      // For other languages, call backend executor
      const { data } = await axios.post('/api/execute', { language, code })
      setRunOutput(String(data?.output || '').trim() || '(no output)')
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Run failed'
      setRunOutput(`Error: ${msg}`)
    } finally {
      setRunning(false)
    }
  }

  // Helpers for UI controls
  const isInterviewerRole = user?.role === 'interviewer'
  const scoresComplete = scores.every(s => Number(s.score) > 0)
  async function changeProblem(pid: string) {
    if (!sessionId || !pid) return
    try {
      await axios.patch(`/api/sessions/${sessionId}/problem`, { problem: pid })
    } catch {}
  }

  async function downloadPdf() {
    if (!sessionId) return
    try {
      setDownloading(true)
      const { data } = await axios.get(`/api/sessions/${sessionId}/export/pdf`, { responseType: 'blob' })
      const blob = new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${sessionId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Failed to download PDF')
    } finally {
      setDownloading(false)
    }
  }
  return (
    <>
      {showResultsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Interview Results</h2>
              <button className="btn" onClick={() => { setShowResultsModal(false); navigate('/dashboard') }}>Close</button>
            </div>
            <div className="mb-3">
              <div className="text-sm text-neutral-400">Decision</div>
              <div className={
                `mt-1 inline-flex items-center rounded px-2 py-1 text-sm font-medium ` +
                (finalDecision === 'selected' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-800' :
                 finalDecision === 'rejected' ? 'bg-red-600/20 text-red-300 border border-red-800' :
                 'bg-amber-600/20 text-amber-200 border border-amber-800')
              }>
                {finalDecision ? finalDecision.replace(/\b\w/g, c => c.toUpperCase()) : 'N/A'}
              </div>
            </div>
            <div className="grid gap-2">
              <div className="text-sm text-neutral-400">Scores</div>
              <div className="grid gap-2">
                {finalScores && finalScores.length ? finalScores.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm">
                    <span className="text-neutral-300">{s.criterion}</span>
                    <span className="font-semibold">{s.score}/10</span>
                  </div>
                )) : (
                  <div className="text-sm text-neutral-500">No scores available.</div>
                )}
              </div>
            </div>
            <div className="mt-4 text-right">
              <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
            </div>
          </div>
        </div>
      )}
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
            <h3 className="mb-2 text-sm font-semibold text-neutral-300">Devices</h3>
            <div className="card grid gap-2 p-3 mb-3">
              <div className="grid gap-1">
                <label className="text-sm text-neutral-400">Microphone</label>
                <select className="select" value={selectedAudioInId} onChange={(e)=>onSelectAudioDevice(e.target.value)}>
                  {audioInputs.length ? audioInputs.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                  )) : <option value="">No microphones found</option>}
                </select>
                <div className="h-2 rounded bg-neutral-800">
                  <div className="h-2 rounded bg-brand-500 transition-all" style={{ width: `${micLevel}%` }} />
                </div>
              </div>
              <div className="grid gap-1">
                <label className="text-sm text-neutral-400">Camera</label>
                <select className="select" value={selectedVideoInId} onChange={(e)=>onSelectVideoDevice(e.target.value)}>
                  {videoInputs.length ? videoInputs.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
                  )) : <option value="">No cameras found</option>}
                </select>
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={ensureLocalMedia}>Preview Devices</button>
                <button className="btn" onClick={testSpeakers}>Test Speakers</button>
              </div>
            </div>
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
  <button className="btn btn-primary" title={isAssignedInterviewer? (status==='scheduled' ? 'Sets the session status to Live and enables editor' : 'Interview cannot be started in current state') : 'Only the assigned interviewer can start the interview'} onClick={startInterview} disabled={status!=='scheduled' || !isAssignedInterviewer}>Start Interview</button>
  <button className="btn" title={isAssignedInterviewer? (isInterviewerRole && !scoresComplete ? 'Complete all scores to enable Exit Interview' : 'Leaves the room for you only; session stays live') : 'Only the assigned interviewer can exit the interview'} onClick={exitInterview} disabled={status!=='live' || !isAssignedInterviewer || (isInterviewerRole && !scoresComplete)}>Exit Interview</button>
  <button className="btn" title={isAssignedInterviewer? (isInterviewerRole && !scoresComplete ? 'Complete all scores to enable End Interview' : 'Completes session, ends call for both, and returns to dashboard') : 'Only the assigned interviewer can end the interview'} onClick={endInterview} disabled={status!=='live' || !isAssignedInterviewer || (isInterviewerRole && !scoresComplete)}>End Interview</button>
                <div className="text-sm">Status: <b>{status}</b> {status!=='live' && <span className="text-neutral-500">(editor disabled)</span>}</div>
        {!isAssignedInterviewer && <div className="text-xs text-neutral-500">You are not the assigned interviewer for this session. Controls are read-only.</div>}
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
              <div className="sticky top-0 flex flex-wrap items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
                <button className="btn" onClick={()=>setFocusEditor(false)}>Exit Focus</button>
                <button className="btn" aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} onClick={toggleMic}>
                  {micOn? (<><Mic size={16}/> <span className="hidden sm:inline">Mute</span></>) : (<><MicOff size={16}/> <span className="hidden sm:inline">Unmute</span></> )}
                </button>
                <button className="btn" aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} onClick={toggleCam}>
                  {camOn? (<><Camera size={16}/> <span className="hidden sm:inline">Camera Off</span></>) : (<><CameraOff size={16}/> <span className="hidden sm:inline">Camera On</span></>)}
                </button>
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
              <div className="flex flex-wrap items-center gap-2">
                <label className="hidden sm:inline text-sm text-neutral-400">Language</label>
                <select className="select w-full sm:w-auto" value={language} onChange={(e)=>setLanguage(e.target.value as any)} disabled={editingDisabled} aria-label="Language">
                  {languageOptions.map(opt => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                </select>
                <button className="btn" onClick={runCode} disabled={running || editingDisabled} aria-label="Run code"><Play size={16}/> <span className="hidden sm:inline">{running?'Running...':'Run'}</span></button>
              </div>
              <div className="min-h-0">
                <Editor height="100%" language={language} value={code} onChange={onEdit} options={{ readOnly: editingDisabled }} onMount={onEditorMount} />
              </div>
              <div className="overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="mb-1 font-semibold">Output</div>
                <pre className="m-0 whitespace-pre-wrap text-sm text-neutral-200">{runOutput || 'Run code to see output here.'}</pre>
              </div>
            </div>
    </div>
  ) : (
  <div className="grid min-w-0 h-full min-h-0 grid-rows-[minmax(180px,32vh)_auto_1fr_minmax(140px,24vh)] md:grid-rows-[240px_auto_1fr_180px]">
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
            <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-t border-neutral-800 bg-neutral-950/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
              <button className="btn" onClick={()=>setFocusEditor(true)}>Focus Editor</button>
              <button className="btn" aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} onClick={toggleMic}>{micOn? (<><Mic size={16}/> <span className="hidden sm:inline">Mute</span></>) : (<><MicOff size={16}/> <span className="hidden sm:inline">Unmute</span></> )}</button>
              <button className="btn" aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} onClick={toggleCam}>{camOn? (<><Camera size={16}/> <span className="hidden sm:inline">Camera Off</span></>) : (<><CameraOff size={16}/> <span className="hidden sm:inline">Camera On</span></>)}</button>
              <div className="ml-0 sm:ml-auto w-full sm:w-auto flex flex-wrap items-center gap-2 justify-between sm:justify-end">
                <label className="hidden sm:inline text-sm text-neutral-400">Language</label>
                <select className="select w-full sm:w-auto" value={language} onChange={(e)=>setLanguage(e.target.value as any)} disabled={editingDisabled} aria-label="Language">
                  {languageOptions.map(opt => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                </select>
                <button className="btn" onClick={runCode} disabled={running || editingDisabled} aria-label="Run code"><Play size={16}/> <span className="hidden sm:inline">{running?'Running...':'Run'}</span></button>
              </div>
            </div>
            {mediaError && (
              <div className="px-2 pb-2 text-sm text-red-400">{mediaError}</div>
            )}
            <div className="min-h-0">
              <Editor height="100%" language={language} value={code} onChange={onEdit} options={{ readOnly: editingDisabled }} onMount={onEditorMount} />
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
          <div id="score-sheet">
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
                {!scoresComplete && (
                  <div className="text-xs text-amber-400">Set all scores above 0 to enable Exit/End Interview.</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-neutral-400">Only interviewer can see the score sheet.</div>
            )}
          </div>
      {user?.role === 'interviewer' && (
            <div>
  <button className="btn btn-primary w-full" onClick={() => submitScores()} disabled={submitting}>{submitting?'Submitting...':'Submit Scores'}</button>
  <button className="btn w-full mt-2" onClick={downloadPdf} disabled={!sessionId || downloading}>{downloading ? 'Downloading…' : 'Download PDF Summary'}</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

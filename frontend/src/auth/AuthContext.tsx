import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import axios from 'axios'
import Cookies from 'js-cookie'

export type User = { id: string; name: string; email: string; role: 'interviewer' | 'candidate' }

type AuthCtx = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | undefined>(undefined)

axios.defaults.withCredentials = true

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // boot: load token for sockets
    const t = localStorage.getItem('token')
    if (t) (window as any).token = t
    axios.get('/api/auth/me').then(r => setUser(r.data.user)).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const r = await axios.post('/api/auth/login', { email, password })
    setUser(r.data.user)
    if (r.data?.token) {
      localStorage.setItem('token', r.data.token)
      ;(window as any).token = r.data.token
    }
  }

  const logout = async () => {
    await axios.post('/api/auth/logout')
    Cookies.remove('token')
    localStorage.removeItem('token')
    ;(window as any).token = ''
    setUser(null)
  }

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

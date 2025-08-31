import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

export type Toast = { id: string; type?: 'success'|'error'|'info'; title?: string; message: string; duration?: number }

type ToastCtx = {
  push: (t: Omit<Toast, 'id'>) => void
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
}

const Ctx = createContext<ToastCtx | undefined>(undefined)

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const remove = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), [])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const duration = t.duration ?? 3000
    const toast: Toast = { id, ...t, duration }
    setToasts(prev => [...prev, toast])
    window.setTimeout(() => remove(id), duration)
  }, [remove])
  const success = useCallback((message: string, title?: string) => push({ type: 'success', message, title }), [push])
  const error = useCallback((message: string, title?: string) => push({ type: 'error', message, title }), [push])
  const info = useCallback((message: string, title?: string) => push({ type: 'info', message, title }), [push])
  const value = useMemo(() => ({ push, success, error, info }), [push, success, error, info])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-80 flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} role="status" className={
            'pointer-events-auto rounded border px-3 py-2 shadow-lg ' +
            (t.type === 'success' ? 'border-emerald-900 bg-emerald-950/90 text-emerald-100' :
             t.type === 'error' ? 'border-red-900 bg-red-950/90 text-red-100' :
             'border-neutral-800 bg-neutral-900/90 text-neutral-100')
          }>
            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
            <div className="text-sm">{t.message}</div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

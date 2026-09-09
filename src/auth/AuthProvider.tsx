import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  authError: string | null
  recoveringPassword: boolean
  finishPasswordRecovery: () => void
  retryVerification: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : ''
  if (code === 'invalid_credentials') return 'El correo o la contraseña no son correctos.'
  if (code === 'email_not_confirmed') return 'Confirma tu correo con el enlace que recibiste antes de entrar.'
  if (code === 'weak_password') return 'Elige una contraseña más segura, con al menos 8 caracteres.'
  if (code === 'same_password') return 'La nueva contraseña debe ser distinta de la anterior.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit/i.test(message)) {
    return 'Se han realizado varios intentos seguidos. Espera unos minutos y vuelve a probar.'
  }
  if (code === 'signup_disabled') return 'La creación de cuentas está deshabilitada. Solicita que habiliten tu acceso.'
  if (code === 'email_address_invalid') return 'Revisa que el correo esté escrito correctamente.'
  if (code === 'otp_expired' || code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'bad_jwt') {
    return 'El enlace o la sesión ha caducado. Vuelve a iniciar sesión o solicita otro enlace.'
  }
  if (/fetch|network|load failed|timeout/i.test(message)) return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.'
  return 'No se pudo completar la solicitud. Vuelve a intentarlo en unos momentos.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [recoveringPassword, setRecoveringPassword] = useState(() =>
    new URLSearchParams(window.location.search).get('auth') === 'recovery' ||
    new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery',
  )
  const generation = useRef(0)
  const mounted = useRef(false)
  const verifiedUserId = useRef<string | null>(null)

  const verifySession = useCallback(async (candidate: Session | null) => {
    const current = ++generation.current
    if (!mounted.current) return
    setSession(candidate)
    setAuthError(null)
    if (!candidate) {
      verifiedUserId.current = null
      setUser(null)
      setLoading(false)
      return
    }
    if (verifiedUserId.current !== candidate.user.id) {
      setLoading(true)
      setUser(null)
    }
    try {
      // getSession's local user is not used as the authority for mounting private data.
      const { data, error } = await supabase.auth.getUser(candidate.access_token)
      if (error) throw error
      if (!data.user || data.user.id !== candidate.user.id) throw new Error('Invalid session')
      if (!mounted.current || current !== generation.current) return
      verifiedUserId.current = data.user.id
      setUser(data.user)
    } catch (error) {
      if (!mounted.current || current !== generation.current) return
      verifiedUserId.current = null
      setUser(null)
      setAuthError(authErrorMessage(error))
    } finally {
      if (mounted.current && current === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted.current) return
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true)
      if (event === 'SIGNED_OUT') setRecoveringPassword(false)
      // Leave the synchronous SDK callback before invoking another Auth method.
      const timer = setTimeout(() => {
        timers.delete(timer)
        void verifySession(nextSession)
      }, 0)
      timers.add(timer)
    })
    return () => {
      mounted.current = false
      ++generation.current
      subscription.unsubscribe()
      timers.forEach(clearTimeout)
    }
  }, [verifySession])

  const retryVerification = useCallback(async () => {
    setLoading(true)
    setAuthError(null)
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      await verifySession(data.session)
    } catch (error) {
      if (mounted.current) {
        setAuthError(authErrorMessage(error))
        setLoading(false)
      }
    }
  }, [verifySession])

  const signOut = useCallback(async () => {
    // Keep other devices signed in and retain this user's separately keyed study cache.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
  }, [])

  const finishPasswordRecovery = useCallback(() => {
    setRecoveringPassword(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('auth')
    // The SDK has already consumed the recovery token; never preserve it in the URL.
    url.hash = ''
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }, [])

  return <AuthContext.Provider value={{ user, session, loading, authError, recoveringPassword, finishPasswordRecovery, retryVerification, signOut }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return value
}

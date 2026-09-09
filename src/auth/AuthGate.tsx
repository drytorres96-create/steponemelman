import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { authErrorMessage, useAuth } from './AuthProvider'
import './auth.css'

function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="auth-page">
    <section className="auth-intro" aria-label="Step 1 Melman">
      <div className="marca"><span className="punto" aria-hidden="true" />Step 1 · Melman</div>
      <div>
        <span className="etq violeta">Tu espacio de estudio</span>
        <h1>Un concepto a la vez.<br /><span>Tu progreso, contigo.</span></h1>
        <p>Practica, repasa y retoma tus sesiones con la misma cuenta en cada dispositivo.</p>
      </div>
      <p className="auth-footnote">Razonamiento activo · Repaso espaciado · Progreso personal</p>
    </section>
    <section className="auth-card tarjeta" aria-label="Acceso a tu cuenta">{children}</section>
  </main>
}

function AuthNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={`auth-notice${error ? ' auth-notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>
}

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  function changeMode(next: typeof mode) {
    setMode(next)
    setPassword('')
    setError(null)
    setNotice(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const redirect = new URL(window.location.pathname, window.location.origin)
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
      } else if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: redirect.href },
        })
        if (signUpError) throw signUpError
        if (!data.session) setNotice('Revisa tu correo para confirmar la cuenta. Si ya tienes una, entra con tu contraseña.')
      } else {
        redirect.searchParams.set('auth', 'recovery')
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect.href })
        if (resetError) throw resetError
        setNotice('Si hay una cuenta con este correo, recibirás un enlace para cambiar la contraseña. Revisa también la carpeta de spam.')
      }
      setPassword('')
    } catch (requestError) {
      setError(authErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="auth-heading">
      <h2>{mode === 'login' ? 'Vuelve a tu estudio' : mode === 'signup' ? 'Crea tu cuenta' : 'Recupera tu acceso'}</h2>
      <p className="sutil">{mode === 'signup' ? 'Confirma tu correo y solicita que habiliten tu acceso al material.' : mode === 'reset' ? 'Te enviaremos un enlace a tu correo.' : 'Entra con el correo que usas en esta plataforma.'}</p>
    </div>
    {mode !== 'reset' && <div className="auth-tabs" aria-label="Tipo de acceso">
      <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => changeMode('login')}>Entrar</button>
      <button type="button" aria-pressed={mode === 'signup'} disabled={busy} onClick={() => changeMode('signup')}>Crear cuenta</button>
    </div>}
    <form className="auth-form" onSubmit={event => void submit(event)}>
      <label htmlFor="auth-email">Correo electrónico
        <input id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="tu@correo.com" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
      </label>
      {mode !== 'reset' && <label htmlFor="auth-password">Contraseña
        <div className="auth-password">
          <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : 1} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-describedby={mode === 'signup' ? 'auth-password-help' : undefined} />
          <button type="button" className="auth-reveal" disabled={busy} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        {mode === 'signup' && <small id="auth-password-help">Al menos 8 caracteres. Usa una contraseña propia para tu cuenta de estudio.</small>}
      </label>}
      {error && <AuthNotice error>{error}</AuthNotice>}
      {notice && <AuthNotice>{notice}</AuthNotice>}
      <button type="submit" className="btn principal auth-submit" disabled={busy}>
        {busy ? 'Un momento…' : mode === 'login' ? 'Entrar a estudiar' : mode === 'signup' ? 'Crear mi cuenta' : 'Enviar enlace de recuperación'}
      </button>
    </form>
    <button className="auth-link" type="button" disabled={busy} onClick={() => changeMode(mode === 'reset' ? 'login' : 'reset')}>
      {mode === 'reset' ? 'Volver a iniciar sesión' : 'Olvidé mi contraseña'}
    </button>
    <p className="mini auth-device-note">Usa la misma cuenta para recuperar tu progreso guardado desde otro dispositivo.</p>
  </>
}

function RecoveryForm() {
  const { finishPasswordRecovery, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setPassword('')
      setConfirmation('')
      setSaved(true)
    } catch (requestError) {
      setError(authErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function leaveRecovery() {
    setBusy(true)
    try {
      await signOut()
      finishPasswordRecovery()
    } catch (requestError) {
      setError(authErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="auth-heading"><h2>{saved ? 'Contraseña actualizada' : 'Elige tu nueva contraseña'}</h2>
      <p className="sutil">{saved ? 'Ya puedes usarla la próxima vez que entres.' : 'Guárdala para acceder desde tus otros dispositivos.'}</p>
    </div>
    {saved ? <button type="button" className="btn principal auth-submit" onClick={finishPasswordRecovery}>Continuar</button> : <form className="auth-form" onSubmit={event => void submit(event)}>
      <label htmlFor="recovery-password">Nueva contraseña
        <input id="recovery-password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <label htmlFor="recovery-confirmation">Repite la contraseña
        <input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {error && <AuthNotice error>{error}</AuthNotice>}
      <button className="btn principal auth-submit" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      <button type="button" className="auth-link" disabled={busy} onClick={() => void leaveRecovery()}>Cancelar y salir</button>
    </form>}
  </>
}

function AccountExitButton() {
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function exit() {
    setBusy(true)
    setError(null)
    try { await signOut() } catch (requestError) { setError(authErrorMessage(requestError)) } finally { setBusy(false) }
  }
  return <>{error && <AuthNotice error>{error}</AuthNotice>}<button type="button" className="btn fantasma" disabled={busy} onClick={() => void exit()}>{busy ? 'Saliendo…' : 'Cerrar sesión'}</button></>
}

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const { user, session, loading, authError, retryVerification, recoveringPassword } = useAuth()
  const [membership, setMembership] = useState<{ userId: string; allowed: boolean } | null>(null)
  const [checking, setChecking] = useState(false)
  const [membershipError, setMembershipError] = useState<string | null>(null)
  const checkGeneration = useRef(0)
  const userId = user?.id

  const checkMembership = useCallback(async () => {
    const generation = ++checkGeneration.current
    if (!userId) {
      setMembership(null)
      return
    }
    setChecking(true)
    setMembershipError(null)
    try {
      const { data, error } = await supabase.from('app_members').select('user_id').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (generation === checkGeneration.current) setMembership({ userId, allowed: data !== null })
    } catch {
      if (generation === checkGeneration.current) {
        setMembership(null)
        setMembershipError('No pudimos comprobar tu acceso. Revisa la conexión y vuelve a intentarlo.')
      }
    } finally {
      if (generation === checkGeneration.current) setChecking(false)
    }
  }, [userId])

  useEffect(() => {
    void checkMembership()
    const onFocus = () => { void checkMembership() }
    window.addEventListener('focus', onFocus)
    return () => {
      ++checkGeneration.current
      window.removeEventListener('focus', onFocus)
    }
  }, [checkMembership, session?.access_token])

  if (loading) return <AuthFrame><div className="auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" />Comprobando tu sesión…</div></AuthFrame>
  if (authError) return <AuthFrame><h2>No pudimos abrir tu sesión</h2><AuthNotice error>{authError}</AuthNotice><div className="auth-actions"><button className="btn principal" type="button" onClick={() => void retryVerification()}>Volver a intentar</button><AccountExitButton /></div></AuthFrame>
  if (!user) return <AuthFrame><AuthForm /></AuthFrame>
  if (recoveringPassword) return <AuthFrame><RecoveryForm /></AuthFrame>
  if (membershipError) return <AuthFrame><h2>No pudimos comprobar tu acceso</h2><AuthNotice error>{membershipError}</AuthNotice><div className="auth-actions"><button className="btn principal" disabled={checking} type="button" onClick={() => void checkMembership()}>{checking ? 'Comprobando…' : 'Volver a intentar'}</button><AccountExitButton /></div></AuthFrame>
  if (!membership || membership.userId !== user.id) return <AuthFrame><div className="auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" />Comprobando tu acceso…</div></AuthFrame>
  if (!membership.allowed) return <AuthFrame>
    <span className="etq ambar">Acceso pendiente</span>
    <div className="auth-heading"><h2>Tu cuenta está creada; falta habilitar acceso</h2><p className="sutil">La cuenta <strong className="auth-email">{user.email}</strong> ya está verificada. El material se abrirá cuando se habilite tu acceso.</p></div>
    <p className="sutil">Si ya solicitaste la activación, pulsa el botón para comprobarla.</p>
    <div className="auth-actions"><button type="button" className="btn principal" disabled={checking} onClick={() => void checkMembership()}>{checking ? 'Comprobando…' : 'Comprobar acceso'}</button><AccountExitButton /></div>
  </AuthFrame>
  return <>{children(user)}</>
}

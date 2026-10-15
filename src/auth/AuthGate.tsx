import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { authErrorMessage, useAuth } from './AuthProvider'
import { Brand, AccessScene } from '../components/Editorial'
import { APP_VERSION } from '../release'
import './auth.css'
import { myqbankEnabled } from '../myqbank/activation'
import { withDeadline } from '../lib/deadline'
import { MyQBankAuthFrame } from '../myqbank/AuthFrame'
const tx = (es: string, en: string) => myqbankEnabled() ? en : es

function AuthFrame({ children }: { children: ReactNode }) {
  if (myqbankEnabled()) return <MyQBankAuthFrame>{children}</MyQBankAuthFrame>
  return <main className="auth-page" data-app-version={APP_VERSION} data-depth-scene>
    <div className="auth-brand"><Brand /></div>
    <section className="auth-card tarjeta" aria-label="Acceso a tu cuenta"><p className="editorial-eyebrow">Tu cuenta · Tu continuidad</p>{children}</section>
    <section className="auth-intro" aria-label="Step 1 Melman" data-depth-scene>
      <AccessScene />
      <div className="auth-editorial-copy">
        <span className="editorial-eyebrow">USMLE Step 1 · Aprendizaje activo</span>
        <h1>Un concepto<br /><span>a la vez.</span></h1>
        <p>Practica, repasa y retoma tus sesiones con la misma cuenta en cada dispositivo.</p>
      </div>
    </section>
    <p className="auth-footnote">MELMAN <span>Tu espacio de estudio para Step 1.</span></p>
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
    if (myqbankEnabled()) redirect.searchParams.set('workspace', 'myqbank')
    try {
      if (mode === 'login') {
        const { error: signInError } = await withDeadline(supabase.auth.signInWithPassword({ email: email.trim(), password }))
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
      <h2>{mode === 'login' ? tx('Vuelve a tu estudio','Welcome back') : mode === 'signup' ? tx('Crea tu cuenta','Create your account') : tx('Recupera tu acceso','Reset your password')}</h2>
      <p className="sutil">{mode === 'signup' ? 'Confirma tu correo y solicita que habiliten tu acceso al material.' : mode === 'reset' ? 'Te enviaremos un enlace a tu correo.' : 'Entra con el correo que usas en esta plataforma.'}</p>
    </div>
    {mode !== 'reset' && <div className="auth-tabs" aria-label={tx('Tipo de acceso','Account access')}>
      <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => changeMode('login')}>{tx('Entrar','Sign in')}</button>
      <button type="button" aria-pressed={mode === 'signup'} disabled={busy} onClick={() => changeMode('signup')}>{tx('Crear cuenta','Create account')}</button>
    </div>}
    <form className="auth-form" onSubmit={event => void submit(event)}>
      <label htmlFor="auth-email">{tx('Correo electrónico','Email')}
        <input id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={tx('tu@correo.com','you@example.com')} required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
      </label>
      {mode !== 'reset' && <label htmlFor="auth-password">{tx('Contraseña','Password')}
        <div className="auth-password">
          <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : 1} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-describedby={mode === 'signup' ? 'auth-password-help' : undefined} />
          <button type="button" className="auth-reveal" disabled={busy} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? tx('Ocultar contraseña','Hide password') : tx('Mostrar contraseña','Show password')} aria-pressed={showPassword}>{showPassword ? tx('Ocultar','Hide') : tx('Mostrar','Show')}</button>
        </div>
        {mode === 'signup' && <small id="auth-password-help">Al menos 8 caracteres. Usa una contraseña propia para tu cuenta de estudio.</small>}
      </label>}
      {error && <AuthNotice error>{error}</AuthNotice>}
      {notice && <AuthNotice>{notice}</AuthNotice>}
      <button type="submit" className="btn principal auth-submit" disabled={busy}>
        {busy ? tx('Un momento…','Please wait…') : mode === 'login' ? tx('Entrar a estudiar','Sign in') : mode === 'signup' ? tx('Crear mi cuenta','Create account') : tx('Enviar enlace de recuperación','Send recovery link')}
      </button>
    </form>
    <button className="auth-link" type="button" disabled={busy} onClick={() => changeMode(mode === 'reset' ? 'login' : 'reset')}>
      {mode === 'reset' ? tx('Volver a iniciar sesión','Back to sign in') : tx('Olvidé mi contraseña','Forgot password?')}
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
    <div className="auth-heading"><h2>{saved ? tx('Contraseña actualizada','Password updated') : tx('Elige tu nueva contraseña','Choose a new password')}</h2>
      <p className="sutil">{saved ? 'Ya puedes usarla la próxima vez que entres.' : 'Guárdala para acceder desde tus otros dispositivos.'}</p>
    </div>
    {saved ? <button type="button" className="btn principal auth-submit" onClick={finishPasswordRecovery}>{tx('Continuar','Continue')}</button> : <form className="auth-form" onSubmit={event => void submit(event)}>
      <label htmlFor="recovery-password">{tx('Nueva contraseña','New password')}
        <input id="recovery-password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <label htmlFor="recovery-confirmation">{tx('Repite la contraseña','Confirm password')}
        <input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {error && <AuthNotice error>{error}</AuthNotice>}
      <button className="btn principal auth-submit" type="submit" disabled={busy}>{busy ? tx('Guardando…','Saving…') : tx('Guardar contraseña','Save password')}</button>
      <button type="button" className="auth-link" disabled={busy} onClick={() => void leaveRecovery()}>{tx('Cancelar y salir','Cancel and sign out')}</button>
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
  return <>{error && <AuthNotice error>{error}</AuthNotice>}<button type="button" className="btn fantasma" disabled={busy} onClick={() => void exit()}>{busy ? tx('Saliendo…','Signing out…') : tx('Cerrar sesión','Sign out')}</button></>
}

export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const { user, session, loading, authError, retryVerification, recoveringPassword } = useAuth()
  const [membership, setMembership] = useState<{ userId: string; allowed: boolean } | null>(null)
  const [checking, setChecking] = useState(false)
  const [membershipError, setMembershipError] = useState<string | null>(null)
  const checkGeneration = useRef(0)
  /** El último acceso confirmado por el servidor, por cuenta. */
  const verified = useRef<{ userId: string; allowed: boolean } | null>(null)
  const userId = user?.id

  const checkMembership = useCallback(async () => {
    const generation = ++checkGeneration.current
    if (!userId) {
      verified.current = null
      setMembership(null)
      return
    }
    setChecking(true)
    setMembershipError(null)
    try {
      const { data, error } = await withDeadline(supabase.from('app_members').select('user_id').eq('user_id', userId).maybeSingle())
      if (error) throw error
      if (generation === checkGeneration.current) {
        verified.current = { userId, allowed: data !== null }
        setMembership(verified.current)
      }
    } catch {
      if (generation === checkGeneration.current) {
        // Se comprueba otra vez al volver a la pestaña y al renovar la sesión. Si la red falla
        // entonces, quien ya tenía acceso sigue estudiando: desmontar la aplicación cortaría
        // la sesión a mitad, y el acceso real lo deciden las políticas RLS en cada petición.
        if (verified.current?.userId === userId && verified.current.allowed) return
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
  if (authError) return <AuthFrame><h2>No pudimos abrir tu sesión</h2><AuthNotice error>{authError}</AuthNotice><div className="auth-actions"><button className="btn principal" type="button" onClick={() => void retryVerification()}>{tx('Volver a intentar','Retry')}</button><AccountExitButton /></div></AuthFrame>
  if (!user) return <AuthFrame><AuthForm /></AuthFrame>
  if (recoveringPassword) return <AuthFrame><RecoveryForm /></AuthFrame>
  if (membershipError) return <AuthFrame><h2>No pudimos comprobar tu acceso</h2><AuthNotice error>{membershipError}</AuthNotice><div className="auth-actions"><button className="btn principal" disabled={checking} type="button" onClick={() => void checkMembership()}>{checking ? tx('Comprobando…','Checking…') : tx('Volver a intentar','Retry')}</button><AccountExitButton /></div></AuthFrame>
  if (!membership || membership.userId !== user.id) return <AuthFrame><div className="auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" />Comprobando tu acceso…</div></AuthFrame>
  if (!membership.allowed) return <AuthFrame>
    <span className="etq ambar">Acceso pendiente</span>
    <div className="auth-heading"><h2>Tu cuenta está creada; falta habilitar acceso</h2><p className="sutil">La cuenta <strong className="auth-email">{user.email}</strong> ya está verificada. El material se abrirá cuando se habilite tu acceso.</p></div>
    <p className="sutil">Si ya solicitaste la activación, pulsa el botón para comprobarla.</p>
    <div className="auth-actions"><button type="button" className="btn principal" disabled={checking} onClick={() => void checkMembership()}>{checking ? tx('Comprobando…','Checking…') : tx('Comprobar acceso','Check access')}</button><AccountExitButton /></div>
  </AuthFrame>
  return <>{children(user)}</>
}

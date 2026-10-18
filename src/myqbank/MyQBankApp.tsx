import { lazy, Suspense, useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { useAuth } from '../auth/AuthProvider'
import { useNbme } from '../nbme/NbmeProvider'
import { usePielEstudio } from '../components/PielEstudio'
import { crearUUID } from '../store/model'
import { cargarConceptos, cargarTodo, cargarModulo } from '../data/corpus'
import { construirCola, RUTAS } from '../lib/rutas'
import { alternarFormatos } from '../lib/formatos'
import { hayConceptosPendientes } from '../lib/conceptos-pendientes'
import { prepararPracticaConcepto } from '../lib/practica-aplicacion'
import { prepararConcepto } from '../lib/formatos'
import { aplicarVariante } from '../lib/variantes'
import { versionPregunta } from '../screens/sesion'
import { Hoy, type MaterialNuevo } from '../screens/Hoy'
import { ClaudeEnDashboard } from './ClaudeEnDashboard'
import { AsistenteDashboard } from './AsistenteDashboard'
import type { ItemCaja } from '../lib/cajas'
import { construirGuion } from '../semana/guion'
import type { Cola } from '../screens/Reproductor'
import { Resguardo } from '../components/Resguardo'
import { Brand, Button, Icon, StateMessage } from './components'
import { Dashboard } from './Dashboard'
import { AnnotationProvider, useAnnotations } from './AnnotationProvider'
import { blockOpportunity, createBlock, modeChangeEvidence, patchBlock, removeBlock, type BlockEntry, type StudyBlock } from './blocks'
import type { BankItem } from './selection'
import type { BlockMode } from './contracts'
import './layout.css'
import './workspace.css'
const Study = lazy(() => import('./Study').then(m => ({ default: m.Study })))
const Settings = lazy(() => import('../screens/Ajustes').then(m => ({ default: m.Ajustes })))
const ProgressDetails = lazy(() => import('../screens/Progreso').then(m => ({ default: m.ResumenProgreso })))
const Reproductor = lazy(() => import('../screens/Reproductor').then(m => ({ default: m.Reproductor })))
const NbmePlayer = lazy(() => import('../nbme/NbmePlayer').then(m => ({ default: m.NbmePlayer })))

export default function MyQBankApp() {
  const { user } = useAuth()
  return user ? <AnnotationProvider key={user.id} userId={user.id}><Workspace/></AnnotationProvider> : null
}
function Workspace() {
  const app = useApp(), nbme = useNbme(), auth = useAuth(), theme = usePielEstudio()
  const annotations = useAnnotations()
  const [view, setView] = useState<'dashboard' | 'settings' | 'block' | 'legacy-concepts' | 'legacy-nbme'>(() => location.hash === '#settings' || location.hash === '#ajustes' ? 'settings' : 'dashboard')
  const [activeId, setActiveId] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [legacy, setLegacy] = useState<{ cola: Cola; index: number } | null>(null), [details, setDetails] = useState(false)
  const block = activeId ? app.estado.myqbankBlocks?.[activeId] : null
  const studying = !['dashboard', 'settings'].includes(view)
  useEffect(() => { document.title = 'MyQBank'; document.documentElement.lang = 'en' }, [])
  const dashboard = () => { nbme.pauseSession(); setView('dashboard'); location.hash = 'dashboard'; setError(null) }
  useEffect(() => {
    const handler = () => { if (['#dashboard','#hoy','#progreso','#modulos'].includes(location.hash)) { nbme.pauseSession(); setView('dashboard') } else if (['#settings','#ajustes'].includes(location.hash)) { nbme.pauseSession(); setView('settings') } }
    window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler)
  }, [nbme.pauseSession])
  // The two histories sync independently. A saved removal also applies when an older NBME copy arrives later.
  useEffect(() => {
    for (const saved of Object.values(app.estado.myqbankBlocks ?? {})) {
      const session = nbme.state.sessions[saved.id]
      if (saved.archivedAt !== undefined && session && (!nbme.state.archivedSessions?.[saved.id] || session.completedAt === undefined)) {
        nbme.archiveSession(saved.id, { complete: true })
      }
    }
  }, [app.estado.myqbankBlocks, nbme.state.sessions, nbme.state.archivedSessions, nbme.archiveSession, nbme.syncStatus.state])
  const removeSaved = (id: string): boolean => {
    const saved = app.estado.myqbankBlocks?.[id]
    if (!saved || saved.archivedAt !== undefined) return true
    if (busy) return false
    // Archive both copies locally; their existing sync engines preserve the histories.
    if (nbme.state.sessions[id] && !nbme.state.archivedSessions?.[id] && !nbme.archiveSession(id, { complete: true })) {
      setError('Could not remove this block yet. Wait for saved progress to load and retry.')
      return false
    }
    app.guardarBloque(removeBlock(saved))
    setError(null)
    return true
  }
  async function open(block: StudyBlock) {
    setBusy(true); setError(null)
    try {
      if (block.entries.some(e => e.kind === 'nbme') && !await nbme.resumeSession(block.id)) throw new Error('Could not resume the exact NBME session. Your answers are preserved.')
      app.guardarBloque(patchBlock(block, { paused: block.completedAt !== undefined }))
      setActiveId(block.id); setView('block'); location.hash = 'block'
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the block.') }
    finally { setBusy(false) }
  }
  async function create(items: Pick<BankItem, 'kind' | 'id' | 'revision'>[], mode: BlockMode, retryOf?: string, fixedEntries?: BlockEntry[], pausedBlock?: StudyBlock, title?: string) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const id = crearUUID()
      const retryConcepts = fixedEntries ? await cargarConceptos(fixedEntries.filter(e => e.kind === 'concept').map(e => e.id), app.indice!.modulos) : null
      const selectedConcepts = fixedEntries ? null : await cargarConceptos(items.filter(item => item.kind === 'concept').map(item => item.id), app.indice!.modulos)
      const entries: BlockEntry[] = fixedEntries ? fixedEntries.map((entry, index) => {
        if (entry.kind === 'nbme') return entry
        const original = retryConcepts?.get(entry.id)
        if (!original) throw new Error('A concept is unavailable. Your completed block is preserved.')
        const concept = prepararConcepto(aplicarVariante(original, entry.concept.variante_id), { semilla: blockOpportunity(id, index), indice: index, ruta: mode === 'test' ? 'examen' : 'repaso', version: 3 })
        return { kind: 'concept', id: entry.id, revision: versionPregunta(concept), concept }
      }) : items.map((item, index) => {
        if (item.kind === 'nbme') return { kind: 'nbme', id: item.id, revision: item.revision }
        const loaded = selectedConcepts?.get(item.id)
        if (!loaded) throw new Error('A selected concept is unavailable. Reload the material and retry.')
        const original = prepararPracticaConcepto(loaded, app.estado.progreso[item.id], app.estado.criterios, { ruta: mode === 'test' ? 'examen' : 'repaso', ahora: Date.now() })
        const concept = prepararConcepto(original, { semilla: blockOpportunity(id, index), indice: index, ruta: mode === 'test' ? 'examen' : 'repaso', version: 3 })
        return { kind: 'concept', id: item.id, revision: versionPregunta(concept), concept }
      })
      const block = { ...createBlock(id, entries, mode, Date.now(), retryOf, title), ...(pausedBlock ? modeChangeEvidence(pausedBlock,
        pausedBlock.entries.filter((entry, position) => entry.kind === 'concept' && app.estado.progreso[entry.id]?.intentos.some(attempt => attempt.session_id === pausedBlock.id && attempt.pregunta_id === blockOpportunity(pausedBlock.id, position))).map(entry => entry.id)) : {}) }
      if (new Blob([JSON.stringify({ ...app.estado, myqbankBlocks: { ...app.estado.myqbankBlocks, [id]: block } })]).size > 12 * 1024 * 1024) throw new Error('Your saved study history is approaching the storage limit. Export a backup in Settings before starting more blocks. Existing blocks remain available.')
      const refs = entries.filter(e => e.kind === 'nbme')
      if (refs.length && !await nbme.startSession(refs, { id, mode, title: block.title, budgetMinutes: null, pausePrevious: !!pausedBlock })) throw new Error('Could not prepare the NBME block. Check the connection and retry.')
      if (pausedBlock) app.guardarBloque(patchBlock(pausedBlock, { paused: true }))
      app.guardarBloque(block); setActiveId(id); setView('block'); location.hash = 'block'
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare the block.') }
    finally { setBusy(false) }
  }
  // Keep Hoy's scheduler and exact due-item order; only replace the player.
  const blockItems = ({ conceptIds, preguntas, cada }: MaterialNuevo) => construirGuion(conceptIds, preguntas, cada ?? 3).map(step => step.kind === 'concepto'
    ? { kind: 'concept' as const, id: step.id, revision: 'prepared-on-start' }
    : { kind: 'nbme' as const, id: step.id, revision: step.revision })
  const newDaily = (material: MaterialNuevo) => {
    const items = blockItems({ ...material, cada: 3 })
    if (items.length) void create(items.slice(0, 80), 'tutor')
  }
  // «Para reforzar hoy» y el chat de sesiones: el bloque lleva su título y respeta la proporción de cada petición.
  const newClaude = (material: MaterialNuevo) => {
    const items = blockItems(material)
    if (items.length) void create(items.slice(0, 80), 'tutor', undefined, undefined, undefined, material.titulo)
  }
  const openCajas = (items: ItemCaja[]) => {
    try {
      const selected = items.filter(item => !item.hecho).map(item => {
        if (item.tipo === 'concepto') return { kind: 'concept' as const, id: item.id, revision: 'prepared-on-start' }
        const question = nbme.catalog?.questions.find(q => q.id === item.id && q.status === 'ready')
        if (!question) throw new Error('A due question is unavailable. Reload the material and retry; your progress is preserved.')
        return { kind: 'nbme' as const, id: question.id, revision: question.revision }
      })
      if (selected.length) void create(selected.slice(0, 80), 'tutor')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare due items.') }
  }
  const resumeLegacy = async () => {
    setBusy(true); setError(null)
    try {
      const r = app.estado.reanudable
      if (r?.conceptIds?.length && app.indice && r.indice < r.conceptIds.length) {
        const map = await cargarConceptos(r.conceptIds, app.indice.modulos)
        if (r.conceptIds.some(id => !map.has(id))) throw new Error('Some saved concepts are unavailable. Your history is preserved.')
        setLegacy({ index: r.indice, cola: { titulo: r.titulo ?? 'Saved session', subtitulo: r.subtitulo ?? '', ruta: r.sesion, modulo: r.modulo,
          sessionId: r.sessionId, presupuestoMinutos: r.presupuestoMinutos, conceptos: r.conceptIds.map((id, i) => aplicarVariante(map.get(id)!, r.variantes?.[i])) } })
        setView('legacy-concepts'); return true
      }
      if (r && !r.conceptIds && app.indice) {
        const module = app.indice.modulos.find(m => m.module_id === r.modulo)
        const concepts = module ? await cargarModulo(module.module_id) : await cargarTodo(app.indice.modulos)
        const selected = construirCola(RUTAS.find(route => route.id === r.sesion)?.id ?? 'guiada', concepts, app.estado.progreso, 30)
        const prepared = alternarFormatos(selected.map(c => prepararPracticaConcepto(c, app.estado.progreso[c.concept_id], app.estado.criterios,
          { ruta: r.sesion, restaurando: true, ahora: Date.now() })), r.sesion)
        if (!prepared.length) throw new Error('No concepts are available for the saved route yet.')
        setLegacy({ index: Math.min(r.indice, prepared.length - 1), cola: { titulo: module?.nombre ?? RUTAS.find(route => route.id === r.sesion)?.nombre ?? 'Saved session',
          subtitulo: r.subtitulo ?? '', ruta: r.sesion, modulo: r.modulo, conceptos: prepared } })
        setView('legacy-concepts'); return true
      }
      const session = Object.values(nbme.state.sessions).filter(s => !s.mode && !nbme.state.archivedSessions?.[s.id]).sort((a, b) => b.controlChangedAt - a.controlChangedAt)[0]
      if (session && await nbme.resumeSession(session.id)) { setView('legacy-nbme'); return true }
      return false
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not resume this session.'); return false }
    finally { setBusy(false) }
  }
  if (!app.listo) return <StateMessage state="loading" title="Loading your study space">Your saved progress is being restored.</StateMessage>
  if (!app.indice) return <StateMessage state="error" title="Material unavailable" action={<Button onClick={() => location.reload()}>Retry</Button>}>{app.errorCarga}</StateMessage>
  const legacyPending = hayConceptosPendientes(app.estado.reanudable) || Object.values(nbme.state.sessions).some(s => !s.mode && s.paused && !nbme.state.archivedSessions?.[s.id])
  const pendingTest = Object.values(app.estado.myqbankBlocks ?? {}).some(b => b.mode === 'test' && b.completedAt === undefined && b.archivedAt === undefined)
  return <div lang="en" className={`mq-root mq-preview mq-workspace ${view === 'block' ? 'mq-workspace--study' : ''}`} data-theme={theme.piel === 'claro' ? 'light' : 'dark'}>
    <a className="mq-skip-link" href="#mq-main">Skip to content</a><header className="mq-header"><Brand/>{!studying && <Button className="mq-dashboard-link" aria-label="Dashboard" aria-current={view === 'dashboard' ? 'page' : undefined} onClick={dashboard}><Icon name="dashboard"/><span>Dashboard</span></Button>}
      <div className="mq-header-actions"><Button aria-label={theme.piel === 'claro' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={theme.alternar}><Icon name={theme.piel === 'claro' ? 'moon' : 'sun'}/></Button>
        {!studying && <Button aria-label="Settings" onClick={() => { setView('settings'); location.hash = 'settings' }}><Icon name="settings"/><span>Settings</span></Button>}</div>
    </header>
    {app.avisoLocal && <p role="status">{app.avisoLocal}<Button onClick={app.descartarAvisoLocal}>Dismiss</Button></p>}
    <Resguardo key={view} alFallar={e => <StateMessage state="error" title="Could not open this screen" action={<Button onClick={dashboard}><Icon name="dashboard"/>Dashboard</Button>}>{e.message}</StateMessage>}>
    <Suspense fallback={<StateMessage state="loading" title="Opening your workspace">Your progress remains saved.</StateMessage>}>
      {view === 'dashboard' && <><Dashboard busy={busy} error={error} onStart={create} onResume={open} onRemove={removeSaved}
        legacyResume={legacyPending ? <Button disabled={busy} onClick={() => void resumeLegacy()}>Resume earlier session</Button> : null}
        dailyGoal={pendingTest ? <p>Finish your Test block to update the daily goal.</p> : <Hoy compact busy={busy} onNuevo={newDaily} onCajas={openCajas} onRetomar={resumeLegacy} onBiblioteca={() => {}}/>}
        assistant={<AsistenteDashboard busy={busy} onNuevo={newClaude}>{datos => <ClaudeEnDashboard {...datos}/>}</AsistenteDashboard>}/>
        <details className="mq-progress-details" onToggle={e => setDetails(e.currentTarget.open)}><summary>Detailed progress and study plan</summary>{details && (pendingTest ? <p>End your Test block to see updated results.</p> : <ProgressDetails onNuevo={newDaily} onCajas={openCajas} onRetomar={resumeLegacy}/>)}</details></>}
      {view === 'block' && error && <p role="alert">{error}</p>}
      {view === 'block' && block && <Study block={block} busy={busy} onModeChange={(b, mode) => create([], mode, undefined, b.entries, b)} onExit={dashboard} onRetry={b => create([], 'tutor', b.id, b.entries)}/>}
      {view === 'settings' && <main id="mq-main" tabIndex={-1} className="mq-settings"><div className="mq-settings-heading"><h1>Settings</h1><div className="mq-inline"><Button onClick={() => void Promise.all([app.sincronizarAhora(), nbme.syncNow(), annotations.sync()])}>Sync now</Button><Button onClick={async () => { const saved = await Promise.all([app.sincronizarAhora(), nbme.syncNow()]); await annotations.sync(); if (saved.every(Boolean) && !annotations.rows.some(r => r.dirty) || confirm('Some changes are pending. Keep a local backup and sign out?')) await auth.signOut() }}>Sign out</Button></div></div><Settings english extraBackup={{ myqbankAnnotations: { userId: auth.user!.id, rows: annotations.rows } }} restoreExtra={backup => annotations.restore(backup.myqbankAnnotations)}/></main>}
      {view === 'legacy-concepts' && legacy && <main id="mq-main" tabIndex={-1} className="mq-legacy-study"><Reproductor cola={legacy.cola} indiceInicial={legacy.index} onSalir={dashboard} etiquetaSalida="Dashboard"/></main>}
      {view === 'legacy-nbme' && <main id="mq-main" tabIndex={-1} className="mq-legacy-study"><NbmePlayer recuperarErrores onSalir={dashboard} etiquetaSalida="Dashboard"/></main>}
    </Suspense></Resguardo>
  </div>
}

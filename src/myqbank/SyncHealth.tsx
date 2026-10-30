import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { useAnnotations } from './AnnotationProvider'
import './sync-health.css'

const labels: Record<string, string> = {
  inicializando: 'Loading saved progress…', initializing: 'Loading saved progress…',
  pendiente: 'Changes pending', pending: 'Changes pending',
  sincronizando: 'Syncing…', syncing: 'Syncing…',
  sincronizado: 'Synced', synced: 'Synced',
  error: 'Sync needs attention', offline: 'Offline · sync pending',
}

/** The three independent stores can finish or fail separately. Never imply one global success. */
export function SyncHealth() {
  const { sincronizacion } = useApp()
  const nbme = useNbme()
  const annotations = useAnnotations()
  const rows = [
    { label: 'Concept progress', state: labels[sincronizacion.estado] ?? 'Sync pending', detail: sincronizacion.estado === 'error' ? sincronizacion.mensaje : null },
    { label: 'NBME progress', state: nbme.storageWarning ? 'Device storage needs attention' : labels[nbme.syncStatus.state] ?? 'Sync pending', detail: nbme.storageWarning ?? (nbme.syncStatus.state === 'error' ? nbme.syncStatus.message : null) },
    { label: 'Notes and highlights', state: annotations.status, detail: null },
  ]
  return <section className="mq-sync-health" aria-labelledby="mq-sync-title">
    <h2 id="mq-sync-title">Sync status</h2>
    <p className="mq-muted mq-small">Check all three before switching devices.</p>
    <dl aria-live="polite" aria-atomic="true">{rows.map(row => <div key={row.label}>
      <dt>{row.label}</dt><dd>{row.state}{row.detail && <span lang="es">{row.detail}</span>}</dd>
    </div>)}</dl>
  </section>
}

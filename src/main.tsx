import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ProveedorEstado } from './store/estado'
import { AuthProvider } from './auth/AuthProvider'
import { AuthGate } from './auth/AuthGate'
import { NbmeProvider } from './nbme/NbmeProvider'
import { Resguardo, FalloGeneral } from './components/Resguardo'
import './styles.css'
import './editorial.css'
import './organic.css'
import './cinema.css'
import './studio.css'
import './hoy.css'
import './piel-estudio.css'

// El acceso no necesita descargar las pantallas de estudio antes de verificar la cuenta.
const App = lazy(() => import('./App'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Resguardo alFallar={error => <FalloGeneral error={error} />}>
      <AuthProvider>
        <AuthGate>{user => <ProveedorEstado key={user.id} userId={user.id}><NbmeProvider key={user.id} userId={user.id}>
          <Suspense fallback={<div className="contenedor" role="status">Abriendo tu estudio…</div>}><App /></Suspense>
        </NbmeProvider></ProveedorEstado>}</AuthGate>
      </AuthProvider>
    </Resguardo>
  </StrictMode>
)

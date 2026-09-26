import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Resguardo alFallar={error => <FalloGeneral error={error} />}>
      <AuthProvider>
        <AuthGate>{user => <ProveedorEstado key={user.id} userId={user.id}><NbmeProvider key={user.id} userId={user.id}><App /></NbmeProvider></ProveedorEstado>}</AuthGate>
      </AuthProvider>
    </Resguardo>
  </StrictMode>
)

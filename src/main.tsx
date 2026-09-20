import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ProveedorEstado } from './store/estado'
import { AuthProvider } from './auth/AuthProvider'
import { AuthGate } from './auth/AuthGate'
import { NbmeProvider } from './nbme/NbmeProvider'
import './styles.css'
import './editorial.css'
import './organic.css'
import './cinema.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>{user => <ProveedorEstado key={user.id} userId={user.id}><NbmeProvider key={user.id} userId={user.id}><App /></NbmeProvider></ProveedorEstado>}</AuthGate>
    </AuthProvider>
  </StrictMode>
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ProveedorEstado } from './store/estado'
import { AuthProvider } from './auth/AuthProvider'
import { AuthGate } from './auth/AuthGate'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>{user => <ProveedorEstado key={user.id} userId={user.id}><App /></ProveedorEstado>}</AuthGate>
    </AuthProvider>
  </StrictMode>
)

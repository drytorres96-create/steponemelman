import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Preview from './Preview'

// No AuthProvider, private content, worker, AI, analytics or storage in the design preview.
createRoot(document.getElementById('root')!).render(<StrictMode><Preview/></StrictMode>)

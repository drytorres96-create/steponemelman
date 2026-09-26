import { createRoot } from 'react-dom/client'
import App from '@app/App'
import { Resguardo, FalloGeneral } from '@app/components/Resguardo'
import '@app/styles.css'
import '@app/editorial.css'
import '@app/organic.css'
import '@app/cinema.css'
import '@app/studio.css'
import '@app/hoy.css'
import '@app/piel-estudio.css'

createRoot(document.getElementById('root')!).render(<Resguardo alFallar={error => <FalloGeneral error={error} />}><App /></Resguardo>)

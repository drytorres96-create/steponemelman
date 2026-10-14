import { createRoot } from 'react-dom/client'
import App from '@app/App'
import MyQBankApp from '@app/myqbank/MyQBankApp'
import { AuthGate } from '@app/auth/AuthGate'
import { Resguardo, FalloGeneral } from '@app/components/Resguardo'
import { NbmeProvider } from './falso-nbme'
import '@app/styles.css'
import '@app/editorial.css'
import '@app/organic.css'
import '@app/cinema.css'
import '@app/studio.css'
import '@app/hoy.css'
import '@app/piel-estudio.css'
import '@app/premium.css'
import '@app/synapse.css'

const query = new URLSearchParams(location.search)
createRoot(document.getElementById('root')!).render(<Resguardo alFallar={error => <FalloGeneral error={error} />}>
  {query.has('auth-scene') ? <AuthGate>{() => <p>Authentication fixture</p>}</AuthGate> : <NbmeProvider>{query.get('workspace') === 'myqbank' ? <MyQBankApp/> : <App />}</NbmeProvider>}
</Resguardo>)

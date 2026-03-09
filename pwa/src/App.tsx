import { VaultProvider } from './lib/vault-context'
import { EmailProvider } from './lib/email-context'
import Shell from './components/Shell'

export default function App() {
  return (
    <VaultProvider>
      <EmailProvider>
        <Shell />
      </EmailProvider>
    </VaultProvider>
  )
}

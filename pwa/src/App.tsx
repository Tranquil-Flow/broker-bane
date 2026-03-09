import { VaultProvider } from './lib/vault-context'
import Shell from './components/Shell'

export default function App() {
  return (
    <VaultProvider>
      <Shell />
    </VaultProvider>
  )
}

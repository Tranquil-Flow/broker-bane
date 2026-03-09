import { useVault } from '../lib/vault-context'
import UnlockScreen from './UnlockScreen'
import MainApp from './MainApp'

export default function Shell() {
  const { key } = useVault()
  return key ? <MainApp /> : <UnlockScreen />
}

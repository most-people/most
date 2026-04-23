import AppProvider from '../app/AppProvider'
import '../../styles/web3.css'

export default function Web3Layout({ children }) {
  return <AppProvider>{children}</AppProvider>
}

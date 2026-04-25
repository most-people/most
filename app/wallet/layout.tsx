import '~/styles/wallet.css'
import AppShell from '~/components/AppShell'
import AppProvider from '~/app/app/AppProvider'

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShell showBackendWarning={false} sidebar={() => null}>
        {children}
      </AppShell>
    </AppProvider>
  )
}

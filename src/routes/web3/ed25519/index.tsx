import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/web3/ed25519/')({
  ssr: false,
  component: () => <Navigate to="/web3/" replace />,
})

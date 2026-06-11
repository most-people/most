import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/web3/tools/')({
  ssr: false,
  component: () => <Navigate to="/web3/" replace />,
})

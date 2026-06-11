import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/game/')({
  ssr: false,
  component: () => <Navigate to="/game/gandengyan/" replace />,
})

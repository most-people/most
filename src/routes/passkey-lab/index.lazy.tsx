import { createLazyFileRoute } from '@tanstack/react-router'

import PasskeyLabPage from '~/features/passkey/PasskeyLabPage'

export const Route = createLazyFileRoute('/passkey-lab/')({
  component: PasskeyLabPage,
})

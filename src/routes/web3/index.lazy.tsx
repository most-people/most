import { createLazyFileRoute } from '@tanstack/react-router'

import Web3Page from '~/features/web3/Web3Page'

export const Route = createLazyFileRoute('/web3/')({
  component: Web3Page,
})

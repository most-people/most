import { createFileRoute } from '@tanstack/react-router'

import Web3Page from '~/features/web3/Web3Page'

export const Route = createFileRoute('/web3/')({
  ssr: false,
  component: Web3Page,
})

import { createFileRoute } from '@tanstack/react-router'

import Web3Page from '~/app/web3/page'

export const Route = createFileRoute('/web3/')({
  ssr: false,
  component: Web3Page,
})

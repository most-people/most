import { createLazyFileRoute } from '@tanstack/react-router'

import FeaturePage from '~/features/feature/FeaturePage'

export const Route = createLazyFileRoute('/feature/')({
  component: FeaturePage,
})

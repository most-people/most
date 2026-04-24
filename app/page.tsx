'use client'

import '../styles/portal.css'

import FeaturePortal from '../components/FeaturePortal'
import { MarketingLayout } from '../components/MarketingLayout'

export default function HomePage() {
  return (
    <MarketingLayout>
      <FeaturePortal />
    </MarketingLayout>
  )
}

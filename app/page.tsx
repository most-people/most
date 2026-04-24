'use client'

import '../styles/marketing.css'
import '../styles/portal.css'

import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import FeaturePortal from '../components/FeaturePortal'

export default function HomePage() {
  return (
    <>
      <Nav />
      <FeaturePortal />
      <Footer />
    </>
  )
}

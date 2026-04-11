import { Hero } from '../components/Hero'
import { FeatureList } from '../components/FeatureList'
import { CompareTable } from '../components/CompareTable'
import { QuickStart } from '../components/QuickStart'
import { RemoteAccess } from '../components/RemoteAccess'
import { FAQ } from '../components/FAQ'

export default function Home() {
  return (
    <>
      <Hero />
      <div className="container" style={{ paddingBlock: 'var(--space-12)' }}>
        <div className="screenshot-placeholder">
          MostBox 截图
        </div>
      </div>
      <FeatureList />
      <CompareTable />
      <QuickStart />
      <RemoteAccess />
      <FAQ />
    </>
  )
}
'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Compass, ArrowLeft, Home } from 'lucide-react'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon">
          <Compass size={48} strokeWidth={1.5} />
        </div>
        <h1 className="not-found-title">页面未找到</h1>
        <p className="not-found-desc">
          你访问的页面似乎已经迷失在 P2P 网络中了
        </p>
        <div className="not-found-actions">
          <button
            onClick={() => router.back()}
            className="not-found-btn-secondary"
          >
            <ArrowLeft size={16} />
            上一页
          </button>
          <Link href="/" className="not-found-btn-primary">
            <Home size={16} />
            回首页
          </Link>
        </div>
      </div>
    </div>
  )
}

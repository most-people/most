import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Compass, Home } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  function goBack() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    navigate({ to: '/' })
  }

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
          <button onClick={goBack} className="btn btn-secondary">
            <ArrowLeft size={16} />
            上一页
          </button>
          <Link to="/" className="btn btn-primary">
            <Home size={16} />
            回首页
          </Link>
        </div>
      </div>
    </div>
  )
}

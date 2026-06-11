import { useEffect, useState } from 'react'
import { Database, Download } from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { api, getApiErrorMessage } from '~/server/src/utils/api'

type UserExport = {
  schemaVersion: number
  exportedAt: string
  ownerAddress: string
  files: unknown[]
  trashFiles: unknown[]
  channels: unknown[]
}

function downloadJson(data: UserExport) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  link.href = url
  link.download = `mostbox-user-data-${data.ownerAddress}-${stamp}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function UserDataExportSection() {
  const addToast = useAppStore(s => s.addToast)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const [preview, setPreview] = useState<UserExport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!identity) return
    setLoading(true)
    setError('')
    api
      .get<UserExport>('/api/user/export')
      .json()
      .then(setPreview)
      .catch(async err =>
        setError(await getApiErrorMessage(err, '导出预览失败'))
      )
      .finally(() => setLoading(false))
  }, [identity?.address])

  const handleExport = async () => {
    if (!identity) {
      openLoginModal()
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await api.get<UserExport>('/api/user/export').json()
      setPreview(data)
      downloadJson(data)
      addToast('用户数据已导出', 'success')
    } catch (err) {
      const message = await getApiErrorMessage(err, '导出失败')
      setError(message)
      addToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="user-export" className="web3-key-card">
      <div className="web3-key-card-header">
        <span className="web3-key-card-icon">
          <Database size={18} />
        </span>
        <span className="web3-key-card-title">MostBox 元数据导出</span>
      </div>
      <div className="web3-key-card-body web3-data-stack">
        {!identity ? (
          <button className="btn btn-primary" onClick={openLoginModal}>
            登录后导出
          </button>
        ) : (
          <>
            <div className="web3-data-summary">
              <span>当前用户</span>
              <strong>{identity.address}</strong>
            </div>
            <div className="web3-data-grid">
              <div>
                <span>文件</span>
                <strong>{preview?.files.length ?? '-'}</strong>
              </div>
              <div>
                <span>回收站</span>
                <strong>{preview?.trashFiles.length ?? '-'}</strong>
              </div>
              <div>
                <span>频道</span>
                <strong>{preview?.channels.length ?? '-'}</strong>
              </div>
            </div>
            {error && <p className="web3-tools-danger">{error}</p>}
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={loading}
            >
              <Download size={16} />
              {loading ? '处理中...' : '导出 JSON'}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

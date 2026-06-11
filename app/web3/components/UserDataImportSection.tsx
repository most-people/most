import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { AlertTriangle, FileJson, Upload } from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { ConfirmModal } from '~/components/ui'
import { api, getApiErrorMessage } from '~/server/src/utils/api'

type ImportCheck = {
  success: boolean
  ready: boolean
  checkId: string
  failures: Array<{ cid?: string; fileName?: string; error: string }>
  currentFileCount: number
  currentTrashCount: number
  currentCidCount: number
  importFileCount: number
  importTrashCount: number
  requiredBytes: number
  availableBytes: number
}

type ImportResult = {
  success: boolean
  importedFiles: number
  importedTrashFiles: number
  failedFiles: Array<{ cid: string; fileName: string; error: string }>
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function UserDataImportSection() {
  const addToast = useAppStore(s => s.addToast)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const [importPackage, setImportPackage] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [check, setCheck] = useState<ImportCheck | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setCheck(null)
    setResult(null)
    setError('')
    setImportPackage(null)
    if (!file) return
    setFileName(file.name)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      setImportPackage(parsed)
      if (!identity) {
        openLoginModal()
        return
      }
      setLoading(true)
      const nextCheck = await api
        .post<ImportCheck>('/api/user/import/check', {
          json: { package: parsed },
          timeout: 60000,
        })
        .json()
      setCheck(nextCheck)
    } catch (err) {
      const message =
        err instanceof SyntaxError
          ? 'JSON 文件格式无效'
          : await getApiErrorMessage(err, '导入预检失败')
      setError(message)
      addToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const runImport = async () => {
    if (!identity) {
      openLoginModal()
      return
    }
    if (!importPackage || !check?.ready || !check.checkId) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api
        .post<ImportResult>('/api/user/import', {
          json: { package: importPackage, checkId: check.checkId },
          timeout: 120000,
        })
        .json()
      setResult(data)
      addToast(
        data.success ? '导入完成' : '导入完成，部分文件失败',
        data.success ? 'success' : 'error'
      )
      setConfirmOpen(false)
    } catch (err) {
      const message = await getApiErrorMessage(err, '导入失败')
      setError(message)
      addToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <section id="user-import" className="web3-key-card">
        <div className="web3-key-card-header">
          <span className="web3-key-card-icon">
            <FileJson size={18} />
          </span>
          <span className="web3-key-card-title">MostBox 元数据导入</span>
        </div>
        <div className="web3-key-card-body web3-data-stack">
          {!identity ? (
            <button className="btn btn-primary" onClick={openLoginModal}>
              登录后导入
            </button>
          ) : (
            <>
              <label className="web3-import-drop">
                <Upload size={20} />
                <span>{fileName || '选择导出的 JSON 文件'}</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFile}
                />
              </label>
              {loading && <p className="web3-data-muted">处理中...</p>}
              {error && <p className="web3-tools-danger">{error}</p>}
              {check && (
                <div className="web3-data-stack">
                  <div className="web3-data-grid">
                    <div>
                      <span>当前文件</span>
                      <strong>{check.currentFileCount}</strong>
                    </div>
                    <div>
                      <span>导入文件</span>
                      <strong>{check.importFileCount}</strong>
                    </div>
                    <div>
                      <span>所需容量</span>
                      <strong>{formatSize(check.requiredBytes)}</strong>
                    </div>
                    <div>
                      <span>可用容量</span>
                      <strong>{formatSize(check.availableBytes)}</strong>
                    </div>
                  </div>
                  {!check.ready && (
                    <div className="web3-import-failures">
                      <div className="web3-data-warning">
                        <AlertTriangle size={16} />
                        <span>当前导入包不能完整导入</span>
                      </div>
                      {check.failures.slice(0, 20).map((failure, index) => (
                        <p key={`${failure.cid || failure.fileName || index}`}>
                          {failure.fileName || failure.cid || '导入包'}:{' '}
                          {failure.error}
                        </p>
                      ))}
                    </div>
                  )}
                  {check.ready && (
                    <button
                      className="btn btn-danger"
                      onClick={() => setConfirmOpen(true)}
                      disabled={loading}
                    >
                      覆盖并导入
                    </button>
                  )}
                </div>
              )}
              {result && (
                <div className="web3-import-result">
                  <strong>
                    已导入 {result.importedFiles} 个文件，
                    {result.importedTrashFiles} 个回收站项
                  </strong>
                  {result.failedFiles.map(file => (
                    <p key={file.cid}>
                      {file.fileName}: {file.error}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {confirmOpen && (
        <ConfirmModal
          title="覆盖当前用户数据"
          message="导入会先清空当前账号在本节点的文件视图、回收站和频道偏好，然后用导入包重建。"
          confirmText={loading ? '导入中...' : '确认导入'}
          danger
          onConfirm={runImport}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  )
}

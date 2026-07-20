const DOWNLOAD_TASK_STATUSES = new Set([
  'connecting',
  'finding-peers',
  'downloading',
  'verifying',
])

function normalizeOwnerAddress(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function toSnapshot(task) {
  return {
    taskId: task.taskId,
    cid: task.cid,
    fileName: task.fileName,
    kind: task.kind,
    status: task.status,
    progress: task.progress,
    loadedBytes: task.loadedBytes,
    totalBytes: task.totalBytes,
    completedFiles: task.completedFiles,
    totalFiles: task.totalFiles,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  }
}

export function createDownloadTaskRegistry(engine) {
  const tasks = new Map()
  let listening = false

  const updateTask = (taskId, updater) => {
    const task = tasks.get(String(taskId || ''))
    if (!task) return null
    updater(task)
    task.updatedAt = Date.now()
    return task
  }

  const handleStatus = data => {
    updateTask(data?.taskId, task => {
      if (DOWNLOAD_TASK_STATUSES.has(data?.status)) {
        task.status = data.status
      }
    })
  }

  const handleProgress = data => {
    updateTask(data?.taskId, task => {
      task.status = 'downloading'
      task.progress = Math.min(100, normalizeNumber(data?.percent))
      if (data?.collection === true) {
        task.kind = 'collection'
        task.loadedBytes = 0
        task.totalBytes = 0
        task.completedFiles = normalizeNumber(
          data?.completedFiles,
          normalizeNumber(data?.loaded)
        )
        task.totalFiles = normalizeNumber(
          data?.totalFiles,
          normalizeNumber(data?.total)
        )
      } else {
        task.loadedBytes = normalizeNumber(data?.loaded)
        task.totalBytes = normalizeNumber(data?.total)
      }
    })
  }

  const removeTask = data => {
    remove(data?.taskId)
  }

  const startListening = () => {
    if (listening || typeof engine?.on !== 'function') return
    listening = true
    engine.on('download:status', handleStatus)
    engine.on('download:progress', handleProgress)
    engine.on('download:success', removeTask)
  }

  const stopListening = () => {
    if (!listening || tasks.size > 0 || typeof engine?.off !== 'function') {
      return
    }
    listening = false
    engine.off('download:status', handleStatus)
    engine.off('download:progress', handleProgress)
    engine.off('download:success', removeTask)
  }

  const remove = taskId => {
    const removed = tasks.delete(String(taskId || ''))
    stopListening()
    return removed
  }

  return {
    register(input) {
      const taskId = String(input.taskId || '')
      const ownerAddress = normalizeOwnerAddress(input.ownerAddress)
      if (!taskId || !ownerAddress) {
        throw new Error('Download task requires taskId and ownerAddress')
      }

      const now = Date.now()
      tasks.set(taskId, {
        taskId,
        ownerAddress,
        visible: input.visible !== false,
        cid: String(input.cid || ''),
        fileName: String(input.fileName || input.cid || ''),
        kind: input.kind === 'collection' ? 'collection' : 'file',
        status: 'starting',
        progress: 0,
        loadedBytes: 0,
        totalBytes: 0,
        completedFiles: 0,
        totalFiles: normalizeNumber(input.totalFiles),
        startedAt: now,
        updatedAt: now,
      })
      startListening()
      return toSnapshot(tasks.get(taskId))
    },

    list(ownerAddress) {
      const owner = normalizeOwnerAddress(ownerAddress)
      return [...tasks.values()]
        .filter(task => task.ownerAddress === owner && task.visible)
        .sort((left, right) => right.startedAt - left.startedAt)
        .map(toSnapshot)
    },

    markCancelling(taskId, ownerAddress) {
      const owner = normalizeOwnerAddress(ownerAddress)
      const task = tasks.get(String(taskId || ''))
      if (!task || task.ownerAddress !== owner) return null
      task.status = 'cancelling'
      task.updatedAt = Date.now()
      return toSnapshot(task)
    },

    remove,
  }
}

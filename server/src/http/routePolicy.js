export function validationErrorPayload(errorCode, details = undefined) {
  return {
    errorCode,
    code: 'VALIDATION_ERROR',
    ...(details ? { details } : {}),
  }
}

export function isPublicFileDownloadPath(path) {
  return /^\/api\/files\/[^/]+\/download$/.test(path)
}

export function requiresUserAuth(path) {
  if (isPublicFileDownloadPath(path)) {
    return false
  }

  return (
    path === '/api/files' ||
    path === '/api/publish' ||
    path === '/api/download/check' ||
    path === '/api/download' ||
    path === '/api/download/cancel' ||
    path === '/api/user/sync/start' ||
    path === '/api/user/sync/status' ||
    path === '/api/trash' ||
    path === '/api/move' ||
    path === '/api/folder/rename' ||
    path.startsWith('/api/files/') ||
    path.startsWith('/api/trash/') ||
    path.startsWith('/api/channels')
  )
}

export function isAdminApi(path) {
  return (
    path.startsWith('/api/admin/') ||
    path === '/api/node/config' ||
    path === '/api/node/policy' ||
    path === '/api/node/logs' ||
    path === '/api/shutdown'
  )
}

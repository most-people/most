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
    path === '/api/p2p/pull' ||
    path === '/api/user/profile' ||
    path === '/api/user/export' ||
    path === '/api/user/import' ||
    path === '/api/trash' ||
    path === '/api/move' ||
    path === '/api/folder/rename' ||
    path.startsWith('/api/note-vault') ||
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

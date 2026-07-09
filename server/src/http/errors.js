export function getApiErrorStatus(err) {
  switch (err.code) {
    case 'VALIDATION_ERROR':
    case 'PATH_SECURITY_ERROR':
    case 'FILE_SIZE_ERROR':
      return 400
    case 'PEER_NOT_FOUND':
      return 503
    case 'INTEGRITY_ERROR':
      return 422
    case 'CONFLICT':
      return 409
    case 'PERMISSION_ERROR':
      return 403
    case 'ENGINE_NOT_INITIALIZED':
      return 503
    default:
      return 500
  }
}

export function errorJson(c, err) {
  const payload = {
    error: err.message,
    code: err.code || 'UNKNOWN',
  }
  if (err.errorCode) payload.errorCode = err.errorCode
  if (err.details) payload.details = err.details

  return c.json(payload, getApiErrorStatus(err))
}

export function badRequestOrAppError(c, err) {
  if (err.code) return errorJson(c, err)
  return c.json({ error: err.message }, 400)
}

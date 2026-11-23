const DOWNLOAD_CHECK_MESSAGES = {
  timeout:
    '检测等待超时，暂时没有等到在线种子响应。请确认分享者或其他下载者仍在线做种，稍后再检测。',
  offline: '无法连接本地节点，请确认 MostBox 后端正在运行后再检测。',
  missingApi: '当前后端还没有检测接口，请重启 MostBox 后端后再试。',
  validation: '链接格式不正确，请粘贴 most://、网页入口或 CID。',
  nameConflict: '文件库已有同名文件，请先重命名或移走后再检测。',
  noPeer:
    '暂时没有发现在线种子。请确认分享者或其他下载者仍在线做种，稍后再检测。',
  permission: '本机做种库不可写，请检查数据目录权限后再检测。',
  starting: '本地节点还没有启动完成，请稍等几秒后重新检测。',
  server: '本地节点检测时出错，请稍后重试或查看节点日志。',
  fallback: '检测未通过，请确认链接完整、发布者在线且本机网络正常。',
}

export function getDownloadCheckErrorMessageFromPayload(
  data = {},
  errorName = ''
) {
  if (errorName === 'TimeoutError') return DOWNLOAD_CHECK_MESSAGES.timeout
  if (!data.status) return DOWNLOAD_CHECK_MESSAGES.offline
  if (data.status === 404) return DOWNLOAD_CHECK_MESSAGES.missingApi

  switch (data.code) {
    case 'VALIDATION_ERROR':
      return DOWNLOAD_CHECK_MESSAGES.validation
    case 'CONFLICT':
      return data.error
        ? `${data.error}，请先处理同名文件后再下载。`
        : DOWNLOAD_CHECK_MESSAGES.nameConflict
    case 'PEER_NOT_FOUND':
      return DOWNLOAD_CHECK_MESSAGES.noPeer
    case 'PERMISSION_ERROR':
      return data.error
        ? `本机做种库不可写：${data.error}`
        : DOWNLOAD_CHECK_MESSAGES.permission
    case 'ENGINE_NOT_INITIALIZED':
      return DOWNLOAD_CHECK_MESSAGES.starting
    default:
      break
  }

  if (data.status === 503) return DOWNLOAD_CHECK_MESSAGES.noPeer
  if (data.status >= 500) return DOWNLOAD_CHECK_MESSAGES.server
  return data.error
    ? `检测未通过：${data.error}`
    : DOWNLOAD_CHECK_MESSAGES.fallback
}

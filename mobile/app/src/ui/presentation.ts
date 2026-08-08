import type { MobileTransfer } from '../mobileCore/types'

const TRANSFER_MESSAGE_LABELS: Record<string, string> = {
  'Calculating UnixFS CID': '正在计算 CID',
  'Writing file into Hyperdrive': '正在写入本地内容库',
  'Published and seeding': '发布完成，正在做种',
  'Connecting to CID topic': '正在连接内容网络',
  'Already available in local holdings': '本机已有该文件',
  'Finding peers': '正在查找在线种子',
  'Downloading file': '正在下载文件',
  'Verifying CID': '正在校验 CID',
}

export function usesAccessibilityLayout(fontScale: number) {
  return Number.isFinite(fontScale) && fontScale >= 1.6
}

export function getFriendlyCoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()

  if (
    normalized.includes('no online seed') ||
    (normalized.includes('timed out') && normalized.includes('file.download'))
  ) {
    return '暂未发现在线种子，请稍后重试。'
  }
  if (normalized.includes('download cancelled')) {
    return '下载已取消。'
  }
  if (normalized.includes('cid mismatch')) {
    return '文件校验失败，内容与分享链接不一致。'
  }
  if (
    normalized.includes('core is not running') ||
    normalized.includes('core is not ready') ||
    normalized.includes('core stopped')
  ) {
    return 'P2P 核心未就绪，请稍后重试。'
  }
  if (
    normalized.includes('network') ||
    normalized.includes('connection') ||
    normalized.includes('socket')
  ) {
    return '连接种子失败，请检查网络后重试。'
  }
  return '操作未完成，请稍后重试。'
}

export function getTransferDisplayMessage(
  message: string,
  status?: MobileTransfer['status']
) {
  if (TRANSFER_MESSAGE_LABELS[message]) return TRANSFER_MESSAGE_LABELS[message]
  if (message.startsWith('Downloaded to ')) return '下载完成，正在做种'
  if (message.startsWith('P2P core request timed out:')) {
    return getFriendlyCoreError(new Error(message))
  }
  if (message === 'No online seed was found for this CID') {
    return getFriendlyCoreError(new Error(message))
  }
  if (message.includes('CID mismatch')) {
    return getFriendlyCoreError(new Error(message))
  }
  if (status === 'failed') return getFriendlyCoreError(new Error(message))
  return message
}

export function partitionTransfers(transfers: MobileTransfer[]) {
  const active: MobileTransfer[] = []
  const failed: MobileTransfer[] = []
  const completed: MobileTransfer[] = []

  for (const transfer of transfers) {
    if (
      transfer.status === 'queued' ||
      transfer.status === 'running' ||
      transfer.status === 'waitingCore'
    ) {
      active.push(transfer)
    } else if (transfer.status === 'failed') failed.push(transfer)
    else completed.push(transfer)
  }

  return { active, failed, completed }
}

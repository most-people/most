export function formatBytes(bytes?: number | null) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatMegabytes(bytes?: number | null) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  const mb = value / 1024 / 1024
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

export function formatAddressShort(address?: string | null) {
  if (!address) return ''
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

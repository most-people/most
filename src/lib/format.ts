function formatFixed(value: number, digits: number) {
  return Number(value.toFixed(digits)).toString()
}

export function formatBytes(bytes?: number | null) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${formatFixed(value / 1024, 1)} KB`
  if (value < 1024 * 1024 * 1024) {
    return `${formatFixed(value / (1024 * 1024), 1)} MB`
  }
  return `${formatFixed(value / (1024 * 1024 * 1024), 2)} GB`
}

export function formatMegabytes(bytes?: number | null) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  const mb = value / 1024 / 1024
  return `${formatFixed(mb, mb >= 100 ? 0 : 1)} MB`
}

export function shortAddress(address?: string | null) {
  const value = String(address || '')
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

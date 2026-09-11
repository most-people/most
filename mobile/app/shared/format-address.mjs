export function shortAddress(address) {
  const value = String(address || '')
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

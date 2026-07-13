const BYTES_PER_MB = 1024 * 1024
const BYTES_PER_GIB = 1024 * 1024 * 1024

export type StorageLimitUnit = 'MB' | 'GiB'

function formatUnitValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'

  const roundedToTwo = Number(value.toFixed(2))
  if (Math.abs(value - roundedToTwo) < 0.000001) {
    return String(roundedToTwo)
  }

  return String(Number(value.toPrecision(15)))
}

export function storageLimitToBytes(
  value: string | number,
  unit: StorageLimitUnit
) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  const multiplier = unit === 'MB' ? BYTES_PER_MB : BYTES_PER_GIB
  return Math.round(amount * multiplier)
}

export function splitStorageLimitInput(bytes?: number | null): {
  value: string
  unit: StorageLimitUnit
} {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) {
    return { value: '0', unit: 'MB' }
  }

  if (value < BYTES_PER_GIB) {
    return {
      value: formatUnitValue(value / BYTES_PER_MB),
      unit: 'MB',
    }
  }

  return {
    value: formatUnitValue(value / BYTES_PER_GIB),
    unit: 'GiB',
  }
}

export function convertStorageLimitUnit(
  value: string,
  fromUnit: StorageLimitUnit,
  toUnit: StorageLimitUnit
) {
  if (fromUnit === toUnit) return value
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '0'
  const nextValue = toUnit === 'MB' ? amount * 1024 : amount / 1024
  return formatUnitValue(nextValue)
}

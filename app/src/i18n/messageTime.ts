const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// 今天：14:09；昨天：昨天 14:09；今年：11月3日 14:09；往年：2025年11月3日 14:09
export function formatMessageTime(
  value: Date | string | number,
  locale: string,
  yesterdayLabel: string,
  now: Date = new Date()
) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const dayDiff = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / DAY_MS
  )
  if (dayDiff === 0) return time
  if (dayDiff === 1) return `${yesterdayLabel} ${time}`

  const day = new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    month: 'short',
    day: 'numeric',
  }).format(date)
  return `${day} ${time}`
}

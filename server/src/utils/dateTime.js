import dayjs from 'dayjs'

export function formatDate(time) {
  if (!time) return ''
  const date = dayjs(Number(time))
  const hour = date.hour()
  let timeOfDay

  if (hour >= 0 && hour < 3) {
    timeOfDay = '凌晨'
  } else if (hour >= 3 && hour < 6) {
    timeOfDay = '拂晓'
  } else if (hour >= 6 && hour < 9) {
    timeOfDay = '早晨'
  } else if (hour >= 9 && hour < 12) {
    timeOfDay = '上午'
  } else if (hour >= 12 && hour < 15) {
    timeOfDay = '下午'
  } else if (hour >= 15 && hour < 18) {
    timeOfDay = '傍晚'
  } else if (hour >= 18 && hour < 21) {
    timeOfDay = '晚上'
  } else {
    timeOfDay = '深夜'
  }

  return date.format(`YYYY年M月D日 ${timeOfDay}h:m`)
}

export const formatTime = formatDate

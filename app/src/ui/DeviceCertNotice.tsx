import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { CircleAlert } from 'lucide-react-native'
import { useI18n } from '../i18n'
import { useMostBoxTheme } from './theme'

type DeviceCertNoticeProps = {
  expiresAt?: number
  renewAt?: number
  onPress?: () => void
}

const CHECK_INTERVAL_MS = 60 * 1000

/**
 * Shown once a tenth of the device authorization period is left, so the user
 * signs in again before the node starts rejecting this device mid-chat.
 */
export function DeviceCertNotice({
  expiresAt = 0,
  renewAt = 0,
  onPress,
}: DeviceCertNoticeProps) {
  const { t, formatMessageTime } = useI18n()
  const theme = useMostBoxTheme()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!renewAt) return
    const timer = setInterval(() => setNow(Date.now()), CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [renewAt])
  if (!renewAt || !expiresAt || now < renewAt) return null
  const expired = now >= expiresAt
  const text = expired
    ? t('node.account.certExpired')
    : t('node.account.certExpiring', { time: formatMessageTime(expiresAt) })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.bar, { backgroundColor: theme.colors.warningSoft }]}
    >
      <CircleAlert size={16} color={theme.colors.warning} />
      <Text style={[styles.text, { color: theme.colors.text }]}>{text}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
})

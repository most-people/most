import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { CircleAlert, CircleCheck, CircleSlash } from 'lucide-react-native'
import { useI18n } from '../i18n'
import { useMostBoxTheme } from './theme'
import {
  getConnectionStatus,
  type ConnectionStatusInput,
} from './connectionStatus'

export type ConnectionStatusBarProps = ConnectionStatusInput & {
  onPress?: () => void
}

/** 常驻的连接状态条：一眼看到是否连上、几个节点在线、通过谁连接。 */
export function ConnectionStatusBar({
  onPress,
  ...input
}: ConnectionStatusBarProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const status = getConnectionStatus(input)
  const palette = {
    ok: { fg: theme.colors.success, bg: theme.colors.successSoft },
    pending: { fg: theme.colors.info, bg: theme.colors.infoSoft },
    warn: { fg: theme.colors.warning, bg: theme.colors.warningSoft },
    error: { fg: theme.colors.danger, bg: theme.colors.dangerSoft },
  }[status.level]
  const title = t(status.titleKey, status.params)
  const detail = t(status.detailKey, status.params)
  const Icon =
    status.level === 'ok'
      ? CircleCheck
      : status.level === 'error'
        ? CircleSlash
        : CircleAlert

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}。${detail}`}
      accessibilityLiveRegion="polite"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.bar, { backgroundColor: palette.bg }]}
    >
      {status.level === 'pending' ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <Icon size={16} color={palette.fg} />
      )}
      <View style={styles.text}>
        <Text
          style={[styles.title, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.detail, { color: theme.colors.textSecondary }]}
          numberOfLines={2}
        >
          {detail}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 12 },
})

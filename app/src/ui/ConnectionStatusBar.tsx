import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ChevronRight,
  CircleSlash,
} from 'lucide-react-native'
import { useI18n } from '../i18n'
import { useMostBoxTheme } from './theme'
import {
  getConnectionStatus,
  type ConnectionStatusInput,
} from './connectionStatus'

export type ConnectionStatusBarProps = ConnectionStatusInput & {
  onPress?: () => void
  /** 正常状态只显示标题一行，异常状态仍显示完整说明 */
  compact?: boolean
  /** 贴边无外边距，用于卡片/弹窗内部 */
  flush?: boolean
}

/** 常驻的连接状态条：一眼看到是否连上、几个节点在线、通过谁连接。 */
export function ConnectionStatusBar({
  onPress,
  compact = false,
  flush = false,
  ...input
}: ConnectionStatusBarProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const status = getConnectionStatus(input)
  const palette = {
    ok: { fg: theme.colors.success, bg: theme.colors.successSoft },
    pending: { fg: theme.colors.info, bg: theme.colors.infoSoft },
    idle: { fg: theme.colors.textMuted, bg: theme.colors.surfaceMuted },
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
        : status.level === 'idle'
          ? CircleDashed
          : CircleAlert

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}。${detail}`}
      accessibilityLiveRegion="polite"
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.bar,
        flush ? styles.flush : null,
        { backgroundColor: palette.bg },
      ]}
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
        {compact && status.level === 'ok' ? null : (
          <Text
            style={[styles.detail, { color: theme.colors.textSecondary }]}
            numberOfLines={2}
          >
            {detail}
          </Text>
        )}
      </View>
      {onPress ? (
        <ChevronRight size={16} color={theme.colors.textMuted} />
      ) : null}
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
  flush: { marginHorizontal: 0 },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 12 },
})

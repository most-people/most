import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { MostButton } from '../../ui/components'
import { useI18n } from '../../i18n'
import { useMostBoxTheme, type MostBoxTheme } from '../../ui/theme'
import type {
  AccountSyncInfo,
  MostBoxMobileClient,
} from '../../mobileCore/types'

type AccountSyncRowProps = {
  client: MostBoxMobileClient
  /** 节点或账号变化时重新读取状态。 */
  refreshKey: string
}

export function AccountSyncRow({ client, refreshKey }: AccountSyncRowProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = createStyles(theme)
  const [info, setInfo] = useState<AccountSyncInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    client
      .getAccountSync()
      .then(next => active && setInfo(next))
      .catch(() => active && setInfo(null))
    return () => {
      active = false
    }
  }, [client, refreshKey])

  const toggle = useCallback(async () => {
    if (!info || busy) return
    setBusy(true)
    setFailed(false)
    try {
      setInfo(await client.setAccountSync(!info.enabled))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [busy, client, info])

  if (!info?.available) return null

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('node.sync.title')}</Text>
      <Text style={styles.note}>{t('node.sync.desc')}</Text>
      <Text style={styles.note}>
        {info.automatic
          ? t('node.sync.automatic')
          : info.enabled
            ? t('node.sync.remoteOn')
            : t('node.sync.remoteWarning')}
      </Text>
      {info.enabled ? (
        <Text style={styles.note}>
          {t('node.sync.devices', { count: info.devices })}
        </Text>
      ) : null}
      {failed ? <Text style={styles.error}>{t('node.sync.error')}</Text> : null}
      {info.automatic ? null : (
        <MostButton
          disabled={busy}
          icon={
            busy ? <ActivityIndicator color={theme.colors.accent} /> : undefined
          }
          onPress={() => void toggle()}
          variant={info.enabled ? 'ghost' : 'primary'}
        >
          {info.enabled ? t('node.sync.disable') : t('node.sync.enable')}
        </MostButton>
      )}
    </View>
  )
}

function createStyles(theme: MostBoxTheme) {
  const { colors } = theme
  return StyleSheet.create({
    section: { gap: 8 },
    title: { color: colors.text, fontSize: 13, fontWeight: '700' },
    note: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    error: { color: colors.danger, fontSize: 12 },
  })
}

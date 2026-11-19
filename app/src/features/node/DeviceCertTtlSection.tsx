import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useI18n } from '../../i18n'
import { MostButton, MostTextInput } from '../../ui/components'
import { useMostBoxTheme } from '../../ui/theme'
import {
  DEVICE_CERT_TTL_CHOICES,
  DEVICE_CERT_TTL_OPTIONS,
  readDeviceCertWindow,
  type DeviceCertTtl,
} from '../../remoteNode/identity'
import type { MostBoxMobileClient } from '../../mobileCore/types'
import { DeviceCertTtlPicker } from './DeviceCertTtlPicker'

type DeviceCertTtlSectionProps = {
  client: MostBoxMobileClient
  /** Current device certificate; changes after a successful reissue. */
  cert: string
}

/** Device authorization period in the profile; changing it needs the password. */
export function DeviceCertTtlSection({
  client,
  cert,
}: DeviceCertTtlSectionProps) {
  const { t, formatDateTime } = useI18n()
  const theme = useMostBoxTheme()
  const certWindow = readDeviceCertWindow(cert)
  const current = DEVICE_CERT_TTL_CHOICES.find(
    ttl => DEVICE_CERT_TTL_OPTIONS[ttl] === certWindow?.ttlMs
  )
  const [selected, setSelected] = useState<DeviceCertTtl | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = selected && selected !== current ? selected : null

  const confirm = async () => {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      await client.changeDeviceCertTtl({
        password,
        ttlMs: DEVICE_CERT_TTL_OPTIONS[pending],
      })
      setSelected(null)
      setPassword('')
    } catch (nextError) {
      setError(
        (nextError as { code?: string })?.code === 'WRONG_PASSWORD'
          ? t('node.account.certTtlWrongPassword')
          : t('node.account.certTtlFailed')
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <DeviceCertTtlPicker
        disabled={busy}
        onChange={value => {
          setSelected(value)
          setError('')
        }}
        value={pending ?? current ?? null}
      />
      {certWindow && (
        <Text style={[styles.note, { color: theme.colors.textSecondary }]}>
          {t('node.account.certTtlExpires', {
            time: formatDateTime(certWindow.expiresAt),
          })}
        </Text>
      )}
      {pending && (
        <>
          <Text style={[styles.note, { color: theme.colors.textSecondary }]}>
            {t('node.account.certTtlPasswordHint')}
          </Text>
          <MostTextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onChangeText={setPassword}
            placeholder={t('node.account.password')}
            secureTextEntry
            value={password}
          />
          <MostButton
            disabled={busy || !password}
            icon={
              busy ? (
                <ActivityIndicator color={theme.colors.onAccent} />
              ) : undefined
            }
            onPress={() => void confirm()}
          >
            {t('node.account.certTtlConfirm')}
          </MostButton>
        </>
      )}
      {error ? (
        <Text style={[styles.note, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  note: { fontSize: 13, lineHeight: 18 },
})

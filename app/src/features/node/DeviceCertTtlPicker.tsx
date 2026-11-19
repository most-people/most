import { StyleSheet, Text, View } from 'react-native'
import { useI18n } from '../../i18n'
import { MostButton } from '../../ui/components'
import { useMostBoxTheme } from '../../ui/theme'
import {
  DEVICE_CERT_TTL_CHOICES,
  type DeviceCertTtl,
} from '../../remoteNode/identity'

type DeviceCertTtlPickerProps = {
  value: DeviceCertTtl | null
  onChange: (value: DeviceCertTtl) => void
  disabled?: boolean
}

/** Device certificate validity (4 hours, 1 day, 30 days). */
export function DeviceCertTtlPicker({
  value,
  onChange,
  disabled = false,
}: DeviceCertTtlPickerProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
        {t('node.account.certTtl')}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {DEVICE_CERT_TTL_CHOICES.map(choice => (
          <MostButton
            key={choice}
            accessibilityRole="radio"
            accessibilityState={{ selected: choice === value, disabled }}
            disabled={disabled}
            onPress={() => onChange(choice)}
            style={styles.option}
            variant={choice === value ? 'primary' : 'secondary'}
          >
            {t(`node.account.certTtl.${choice}`)}
          </MostButton>
        ))}
      </View>
      <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
        {t('node.account.certTtlHint')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 13 },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1 },
  hint: { fontSize: 12, lineHeight: 18 },
})

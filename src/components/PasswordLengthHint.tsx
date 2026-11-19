import { useI18n } from '~/lib/i18n'
import { isPasswordShort } from '~/lib/password'

export function PasswordLengthHint({ password }: { password: string }) {
  const { t } = useI18n()
  if (!isPasswordShort(password)) return null
  return (
    <p className="password-length-hint">{t('login.warning.passwordShort')}</p>
  )
}

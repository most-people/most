import { useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Languages, ShieldCheck } from 'lucide-react-native'
import { LOCALES, localeNames, useI18n } from '../i18n'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from '../ui/theme'
import { getGlassSurfaceStyle } from '../ui/components'
import { useFeedback } from '../ui/feedback'
import { PRIVACY_URL, TERMS_URL } from './legalUrls'
import {
  persistPrivacyConsent,
  readPrivacyConsent,
} from './privacyConsentStorage'

type PrivacyConsentGateProps = {
  children: ReactNode
}

type ConsentState = 'checking' | 'required' | 'accepted'

export function PrivacyConsentGate({ children }: PrivacyConsentGateProps) {
  const { locale, setLocale, t } = useI18n()
  const { alert } = useFeedback()
  const theme = useMostBoxTheme()
  const styles = consentStyles[theme.mode]
  const [consentState, setConsentState] = useState<ConsentState>('checking')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    let active = true
    void readPrivacyConsent().then(accepted => {
      if (active) setConsentState(accepted ? 'accepted' : 'required')
    })
    return () => {
      active = false
    }
  }, [])

  const openLegalUrl = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      alert(t('app.link.openFailed'), url)
    }
  }

  const openLanguageMenu = () => {
    alert(
      t('common.language.choose'),
      undefined,
      LOCALES.map(item => ({
        text:
          item === locale
            ? t('common.language.current', { language: localeNames[item] })
            : localeNames[item],
        onPress: () => setLocale(item),
      })),
      { cancelable: true }
    )
  }

  const acceptPrivacyPolicy = async () => {
    setAccepting(true)
    try {
      await persistPrivacyConsent()
      setConsentState('accepted')
    } catch {
      alert(t('app.privacy.saveFailedTitle'), t('app.privacy.saveFailedBody'))
    } finally {
      setAccepting(false)
    }
  }

  const declinePrivacyPolicy = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp()
      return
    }
    alert(t('app.privacy.declineTitle'), t('app.privacy.declineBody'))
  }

  if (consentState === 'accepted') return children

  const consentScreen = (
    <SafeAreaView
      edges={['top', 'right', 'bottom', 'left']}
      style={styles.screen}
    >
      <StatusBar
        barStyle={theme.statusBarStyle}
        backgroundColor={theme.colors.background}
      />
      {consentState === 'checking' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
          <Text style={styles.loadingText}>{t('app.privacy.checking')}</Text>
        </View>
      ) : (
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <ShieldCheck size={22} color={theme.colors.accent} />
              <Text style={styles.brandName}>MostBox</Text>
            </View>
            <Pressable
              accessibilityLabel={t('common.language.choose')}
              accessibilityRole="button"
              onPress={openLanguageMenu}
              style={({ pressed }) => [
                styles.languageButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Languages size={19} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.notice}>
            <Text maxFontSizeMultiplier={1.5} style={styles.title}>
              {t('app.privacy.title')}
            </Text>
            <Text maxFontSizeMultiplier={1.8} style={styles.body}>
              {t(
                Platform.OS === 'web'
                  ? 'app.privacy.bodyWeb'
                  : 'app.privacy.body'
              )}
            </Text>
            <View style={styles.links}>
              <Pressable
                accessibilityRole="link"
                onPress={() => void openLegalUrl(PRIVACY_URL)}
                style={({ pressed }) => [
                  styles.linkButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.linkText}>
                  {t('app.privacy.openPrivacy')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => void openLegalUrl(TERMS_URL)}
                style={({ pressed }) => [
                  styles.linkButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.linkText}>
                  {t('app.privacy.openTerms')}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={accepting}
              onPress={() => void acceptPrivacyPolicy()}
              style={({ pressed }) => [
                styles.acceptButton,
                pressed ? styles.acceptButtonPressed : null,
                accepting ? styles.disabled : null,
              ]}
            >
              {accepting ? (
                <ActivityIndicator color={theme.colors.onAccent} />
              ) : (
                <Text style={styles.acceptButtonText}>
                  {t('app.privacy.accept')}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={accepting}
              onPress={declinePrivacyPolicy}
              style={({ pressed }) => [
                styles.declineButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.declineButtonText}>
                {Platform.OS === 'android'
                  ? t('app.privacy.declineAndExit')
                  : t('app.privacy.decline')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )

  return <SafeAreaProvider>{consentScreen}</SafeAreaProvider>
}

function createStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    content: {
      flexGrow: 1,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
      justifyContent: 'space-between',
      gap: 32,
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    topBar: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    brandName: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    languageButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    notice: {
      ...getGlassSurfaceStyle(theme, 'elevated'),
      gap: 20,
      padding: 22,
      backgroundColor: colors.glassHeavy,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      lineHeight: 36,
      fontWeight: '700',
    },
    body: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 24,
    },
    links: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    linkButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    linkText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    actions: {
      gap: 10,
    },
    acceptButton: {
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: radii.medium,
      backgroundColor: colors.accent,
    },
    acceptButtonPressed: {
      backgroundColor: colors.accentPressed,
    },
    acceptButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
    declineButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    declineButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    disabled: {
      opacity: 0.55,
    },
    pressed: {
      opacity: 0.68,
    },
  })
}

const consentStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
} as const

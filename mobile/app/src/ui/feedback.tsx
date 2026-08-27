import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react-native'
import { useI18n } from '../i18n'
import {
  darkTheme,
  lightTheme,
  type MostBoxTheme,
  useMostBoxTheme,
} from './theme'
import { BottomSheetCard, IconButton } from './components'
import { runFeedbackAction } from './feedbackModel'

export type FeedbackButton = {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

export type ToastTone = 'info' | 'success' | 'error'
export type ToastAction = {
  label: string
  onPress: () => void
}

type AlertOptions = {
  cancelable?: boolean
}

type DialogState = {
  title: string
  message?: string
  buttons: FeedbackButton[]
  cancelable: boolean
}

type ToastState = {
  actions: ToastAction[]
  id: number
  message: string
  tone: ToastTone
}

type FeedbackContextValue = {
  alert: (
    title: string,
    message?: string,
    buttons?: FeedbackButton[],
    options?: AlertOptions
  ) => void
  toast: (message: string, tone?: ToastTone, actions?: ToastAction[]) => void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const styles = feedbackStyles[theme.mode]
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [toastState, setToastState] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    },
    []
  )

  const alert = useCallback(
    (
      title: string,
      message?: string,
      buttons?: FeedbackButton[],
      options?: AlertOptions
    ) => {
      setDialog({
        title,
        message,
        buttons:
          buttons?.length === 0 ? [] : buttons || [{ text: t('common.ok') }],
        cancelable: options?.cancelable !== false,
      })
    },
    [t]
  )

  const toast = useCallback(
    (
      message: string,
      tone: ToastTone = 'info',
      actions: ToastAction[] = []
    ) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      const next = {
        actions: actions.slice(0, 2),
        id: Date.now(),
        message,
        tone,
      }
      setToastState(next)
      toastTimerRef.current = setTimeout(
        () => {
          setToastState(current => (current?.id === next.id ? null : current))
          toastTimerRef.current = null
        },
        actions.length ? 5200 : 2600
      )
    },
    []
  )

  const dismissDialog = () => {
    if (dialog?.cancelable) setDialog(null)
  }

  const runButton = (button: FeedbackButton) => {
    runFeedbackAction(() => setDialog(null), button.onPress)
  }

  const ToastIcon =
    toastState?.tone === 'success'
      ? CircleCheck
      : toastState?.tone === 'error'
        ? CircleAlert
        : Info
  const toastColor =
    toastState?.tone === 'success'
      ? theme.colors.success
      : toastState?.tone === 'error'
        ? theme.colors.danger
        : theme.colors.info

  return (
    <FeedbackContext.Provider value={{ alert, toast }}>
      {children}

      <Modal
        animationType="fade"
        onRequestClose={dismissDialog}
        transparent
        visible={Boolean(dialog)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            onPress={dismissDialog}
            style={StyleSheet.absoluteFill}
          />
          <BottomSheetCard style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleGroup}>
                <CircleAlert size={20} color={theme.colors.accent} />
                <Text maxFontSizeMultiplier={1.8} style={styles.dialogTitle}>
                  {dialog?.title}
                </Text>
              </View>
              {dialog?.cancelable ? (
                <IconButton
                  accessibilityLabel={t('common.close')}
                  onPress={dismissDialog}
                  variant="ghost"
                >
                  <X size={20} color={theme.colors.textSecondary} />
                </IconButton>
              ) : null}
            </View>
            {dialog?.message ? (
              <Text selectable maxFontSizeMultiplier={2} style={styles.message}>
                {dialog.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {dialog?.buttons.map((button, index) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${button.text}-${index}`}
                  onPress={() => runButton(button)}
                  style={({ pressed }) => [
                    styles.action,
                    button.style === 'destructive'
                      ? styles.actionDestructive
                      : null,
                    button.style === 'cancel' ? styles.actionCancel : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={1.8}
                    style={[
                      styles.actionText,
                      button.style === 'destructive'
                        ? styles.actionTextDestructive
                        : null,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </BottomSheetCard>
        </View>
      </Modal>

      {toastState ? (
        <View accessibilityLiveRegion="polite" style={styles.toastWrap}>
          <View style={styles.toast}>
            <ToastIcon size={18} color={toastColor} />
            <Text maxFontSizeMultiplier={1.8} style={styles.toastText}>
              {toastState.message}
            </Text>
            {toastState.actions.map(action => (
              <Pressable
                accessibilityRole="button"
                key={action.label}
                onPress={() => {
                  setToastState(null)
                  action.onPress()
                }}
                style={({ pressed }) => [
                  styles.toastAction,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.toastActionText}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const value = useContext(FeedbackContext)
  if (!value)
    throw new Error('useFeedback must be used inside FeedbackProvider')
  return value
}

function createStyles(theme: MostBoxTheme) {
  return StyleSheet.create({
    overlay: {
      alignItems: 'center',
      backgroundColor: theme.colors.overlay,
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      padding: 20,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    dialogCard: {
      borderRadius: theme.radii.small,
      gap: 16,
      maxWidth: 480,
      padding: 20,
      width: '100%',
    },
    dialogHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    dialogTitleGroup: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 10,
    },
    dialogTitle: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 19,
      fontWeight: '700',
    },
    message: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 23,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'flex-end',
    },
    action: {
      alignItems: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.small,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 96,
      paddingHorizontal: 16,
    },
    actionCancel: {
      backgroundColor: theme.colors.surfaceSubtle,
    },
    actionDestructive: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
    },
    actionText: {
      color: theme.colors.accent,
      fontSize: 15,
      fontWeight: '700',
    },
    actionTextDestructive: {
      color: theme.colors.danger,
    },
    pressed: {
      opacity: 0.7,
    },
    toastWrap: {
      alignItems: 'center',
      bottom: 92,
      left: 16,
      pointerEvents: 'box-none',
      position: 'absolute',
      right: 16,
      zIndex: 30,
    },
    toast: {
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.small,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      maxWidth: 520,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 10,
      shadowColor: theme.shadow.color,
      shadowOffset: { height: theme.shadow.offsetY, width: 0 },
      shadowOpacity: theme.shadow.opacity,
      shadowRadius: theme.shadow.radius,
      width: '100%',
    },
    toastText: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    toastAction: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
      paddingHorizontal: 8,
    },
    toastActionText: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '700',
    },
  })
}

const feedbackStyles = {
  light: createStyles(lightTheme),
  dark: createStyles(darkTheme),
}

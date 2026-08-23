import type { ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import {
  darkTheme,
  lightTheme,
  useMostBoxTheme,
  type MostBoxTheme,
} from './theme'

type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted'
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function getGlassSurfaceStyle(
  theme: MostBoxTheme,
  variant: 'default' | 'subtle' | 'elevated' = 'default'
): ViewStyle {
  const backgroundColor =
    variant === 'elevated'
      ? theme.colors.glassSolid
      : variant === 'subtle'
        ? theme.colors.glassSubtle
        : theme.colors.glass

  return {
    backgroundColor,
    borderColor:
      variant === 'subtle' ? theme.colors.border : theme.colors.borderStrong,
    borderRadius: theme.radii.large,
    borderWidth: 1,
    shadowColor: theme.shadow.color,
    shadowOffset: { height: theme.shadow.offsetY, width: 0 },
    shadowOpacity:
      variant === 'subtle' ? theme.shadow.opacity * 0.45 : theme.shadow.opacity,
    shadowRadius:
      variant === 'subtle' ? theme.shadow.radius * 0.55 : theme.shadow.radius,
    elevation: variant === 'subtle' ? 1 : theme.shadow.elevation,
  }
}

export function getToneColor(theme: MostBoxTheme, tone: Tone) {
  return {
    accent: theme.colors.accent,
    info: theme.colors.info,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    muted: theme.colors.textSecondary,
  }[tone]
}

export function getToneSoftColor(theme: MostBoxTheme, tone: Tone) {
  return {
    accent: theme.colors.accentSoft,
    info: theme.colors.infoSoft,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
    danger: theme.colors.dangerSoft,
    muted: theme.colors.surfaceSubtle,
  }[tone]
}

type GlassSurfaceProps = {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  variant?: 'default' | 'subtle' | 'elevated'
}

export function GlassSurface({
  children,
  style,
  variant = 'default',
}: GlassSurfaceProps) {
  const theme = useMostBoxTheme()
  return (
    <View style={[getGlassSurfaceStyle(theme, variant), style]}>
      {children}
    </View>
  )
}

type MostButtonProps = Omit<PressableProps, 'style'> & {
  children: ReactNode
  icon?: ReactNode
  labelStyle?: StyleProp<TextStyle>
  style?: StyleProp<ViewStyle>
  variant?: ButtonVariant
}

export function MostButton({
  children,
  disabled,
  icon,
  labelStyle,
  style,
  variant = 'secondary',
  ...props
}: MostButtonProps) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : null,
        variant === 'secondary' ? styles.buttonSecondary : null,
        variant === 'ghost' ? styles.buttonGhost : null,
        variant === 'danger' ? styles.buttonDanger : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
      {...props}
    >
      {icon}
      {typeof children === 'string' ? (
        <Text
          maxFontSizeMultiplier={1.6}
          numberOfLines={2}
          style={[
            styles.buttonLabel,
            variant === 'primary' || variant === 'danger'
              ? styles.buttonLabelOnFill
              : null,
            labelStyle,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  )
}

type IconButtonProps = Omit<PressableProps, 'style'> & {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  variant?: 'glass' | 'ghost'
}

export function IconButton({
  children,
  disabled,
  style,
  variant = 'glass',
  ...props
}: IconButtonProps) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'ghost' ? styles.iconButtonGhost : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  )
}

export function MostTextInput({
  style,
  ...props
}: TextInputProps & { style?: StyleProp<TextStyle> }) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]
  return (
    <TextInput
      placeholderTextColor={theme.colors.textMuted}
      selectionColor={theme.colors.accent}
      style={[styles.textInput, style]}
      {...props}
    />
  )
}

export function SectionHeader({
  icon,
  meta,
  title,
  style,
}: {
  icon?: ReactNode
  meta?: string
  title: string
  style?: StyleProp<ViewStyle>
}) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleGroup}>
        {icon}
        <Text maxFontSizeMultiplier={2} style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {meta ? (
        <Text maxFontSizeMultiplier={2} style={styles.sectionMeta}>
          {meta}
        </Text>
      ) : null}
    </View>
  )
}

export function StatusBadge({
  label,
  tone = 'muted',
  style,
}: {
  label: string
  tone?: Tone
  style?: StyleProp<ViewStyle>
}) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: getToneSoftColor(theme, tone),
          borderColor: getToneColor(theme, tone),
        },
        style,
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.6}
        numberOfLines={1}
        style={[styles.badgeText, { color: getToneColor(theme, tone) }]}
      >
        {label}
      </Text>
    </View>
  )
}

export function SegmentedControl({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]
  return <View style={[styles.segmented, style]}>{children}</View>
}

export function ListRow({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]
  return <View style={[styles.listRow, style]}>{children}</View>
}

export function BottomSheetCard({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const theme = useMostBoxTheme()
  const styles = sharedStyles[theme.mode]
  return <View style={[styles.bottomSheet, style]}>{children}</View>
}

function createSharedStyles(theme: MostBoxTheme) {
  const { colors, radii } = theme
  const glass = getGlassSurfaceStyle(theme)
  const subtleGlass = getGlassSurfaceStyle(theme, 'subtle')

  return StyleSheet.create({
    button: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      borderRadius: radii.medium,
      borderWidth: 1,
    },
    buttonPrimary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    buttonSecondary: {
      backgroundColor: colors.glassSubtle,
      borderColor: colors.border,
    },
    buttonGhost: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
    },
    buttonDanger: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },
    buttonLabel: {
      color: colors.accent,
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    buttonLabelOnFill: {
      color: colors.onAccent,
    },
    iconButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.glassSubtle,
    },
    iconButtonGhost: {
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    textInput: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.medium,
      color: colors.text,
      backgroundColor: colors.glassSubtle,
      fontSize: 15,
    },
    sectionHeader: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionTitleGroup: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    sectionMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    badge: {
      minHeight: 26,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: radii.full,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    segmented: {
      minHeight: 44,
      flexDirection: 'row',
      gap: 3,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.glassSubtle,
    },
    listRow: {
      minHeight: 56,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radii.medium,
      backgroundColor: colors.glassSubtle,
    },
    bottomSheet: {
      ...glass,
      width: '100%',
      maxWidth: 520,
      gap: 18,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 24,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    pressed: {
      opacity: 0.68,
      transform: [{ translateY: 1 }],
    },
    disabled: {
      opacity: 0.48,
    },
    surface: glass,
    subtleSurface: subtleGlass,
  })
}

export const sharedStyles = {
  light: createSharedStyles(lightTheme),
  dark: createSharedStyles(darkTheme),
}

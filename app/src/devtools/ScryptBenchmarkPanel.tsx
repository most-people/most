import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useI18n } from '../i18n'
import { MostButton } from '../ui/components'
import { useMostBoxTheme } from '../ui/theme'
import type { NativeScryptRun } from '../mobileCore/types'
import {
  formatScryptBenchmark,
  recommendLogN,
  runScryptBenchmark,
} from './scryptBenchmark'

declare const HermesInternal: unknown

function describeEnvironment() {
  const constants = Platform.constants as Record<string, unknown>
  const model = [constants?.Manufacturer, constants?.Model]
    .filter(Boolean)
    .join(' ')
  const engine = typeof HermesInternal === 'undefined' ? 'non-Hermes' : 'Hermes'
  return `${Platform.OS} ${Platform.Version}, ${model || 'unknown device'}, ${engine}`
}

type ScryptBenchmarkPanelProps = {
  /** Runs libsodium scrypt in the Bare backend (the path the app will use). */
  runNative?: () => Promise<NativeScryptRun[]>
}

/**
 * Dev builds only: measures the scrypt cost for the v2 chat identity on this
 * device (docs/protocol/v2/signatures.md §7.2). Copy the report back to the
 * design discussion; the spec fixes N from a low-end Android phone.
 */
export function ScryptBenchmarkPanel({ runNative }: ScryptBenchmarkPanelProps) {
  const { t } = useI18n()
  const theme = useMostBoxTheme()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [report, setReport] = useState('')

  const run = async () => {
    setRunning(true)
    setReport('')
    try {
      const result = await runScryptBenchmark({
        environment: describeEnvironment(),
        onProgress: (logN, attempt, fraction) => {
          setProgress(
            t('node.devtools.scryptProgress', {
              logN,
              attempt,
              percent: Math.round(fraction * 100),
            })
          )
        },
      })
      setReport(formatScryptBenchmark(result))
    } catch (error) {
      setReport(error instanceof Error ? error.message : String(error))
    } finally {
      setProgress('')
      setRunning(false)
    }
  }

  const runNativeBenchmark = async () => {
    if (!runNative) return
    setRunning(true)
    setReport('')
    setProgress(t('node.devtools.scryptRunning'))
    try {
      const runs = await runNative()
      setReport(
        formatScryptBenchmark({
          environment: `${describeEnvironment()}, native libsodium in Bare`,
          runs,
          recommendedLogN: recommendLogN(runs),
        })
      )
    } catch (error) {
      setReport(error instanceof Error ? error.message : String(error))
    } finally {
      setProgress('')
      setRunning(false)
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
        {t('node.devtools.scryptHint')}
      </Text>
      <MostButton disabled={running} onPress={() => void run()}>
        {running ? t('node.devtools.scryptRunning') : t('node.devtools.scrypt')}
      </MostButton>
      {runNative ? (
        <MostButton
          disabled={running}
          onPress={() => void runNativeBenchmark()}
        >
          {t('node.devtools.scryptNative')}
        </MostButton>
      ) : null}
      {progress ? (
        <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
          {progress}
        </Text>
      ) : null}
      {report ? (
        <Text selectable style={[styles.report, { color: theme.colors.text }]}>
          {report}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  hint: { fontSize: 12, lineHeight: 17 },
  report: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 17,
  },
})

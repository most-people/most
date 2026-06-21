import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import b4a from 'b4a'
import {
  Activity,
  Copy,
  Download,
  FileUp,
  HardDrive,
  Link,
  Radio,
} from 'lucide-react-native'
import { MockMostBoxCore } from './src/mobileCore/mockCore'
import { BareWorkletMostBoxCore } from './src/mobileCore/workletClient'
import { parseMostLink } from './src/mobileCore/protocol'
import type { MobileCoreSnapshot, MostBoxMobileCore } from './src/mobileCore/types'

const DEV_CID_MAX_BYTES = 20 * 1024 * 1024

declare const require: (path: string) => unknown

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

async function readDevCidBytes(uri: string, size: number) {
  if (size > DEV_CID_MAX_BYTES) return undefined

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  return b4a.from(base64, 'base64')
}

function getNodeStatusLabel(status: MobileCoreSnapshot['node']['status']) {
  if (status === 'ready') return 'Ready'
  if (status === 'starting') return 'Starting'
  if (status === 'stopping') return 'Stopping'
  if (status === 'error') return 'Error'
  return 'Idle'
}

function loadBackendBundle() {
  try {
    const moduleValue = require('./app.bundle.mjs')
    if (typeof moduleValue === 'string' || moduleValue instanceof Uint8Array) {
      return moduleValue
    }

    if (moduleValue && typeof moduleValue === 'object') {
      const defaultValue = (moduleValue as { default?: unknown }).default
      if (typeof defaultValue === 'string' || defaultValue instanceof Uint8Array) {
        return defaultValue
      }
    }
  } catch {}

  return null
}

function getCoreStoragePath() {
  const baseUri = FileSystem.documentDirectory || FileSystem.cacheDirectory || ''
  const storageUri = `${baseUri.replace(/\/$/, '')}/mostbox-core`
  if (storageUri.startsWith('file://')) {
    return decodeURIComponent(storageUri.slice('file://'.length))
  }
  return storageUri
}

export default function App() {
  const coreRef = useRef<MostBoxMobileCore | null>(null)
  const [snapshot, setSnapshot] = useState<MobileCoreSnapshot | null>(null)
  const [downloadLink, setDownloadLink] = useState('')

  if (!coreRef.current) {
    const backendBundle = loadBackendBundle()
    coreRef.current = backendBundle
      ? new BareWorkletMostBoxCore({
          bundle: backendBundle,
          storagePath: getCoreStoragePath(),
        })
      : new MockMostBoxCore()
  }

  const core = coreRef.current

  useEffect(() => {
    const unsubscribe = core.subscribe(setSnapshot)
    void core.start().catch(error => {
      Alert.alert(
        'P2P core 启动失败',
        error instanceof Error ? error.message : '请先运行 npm run bundle:core'
      )
    })
    return () => {
      unsubscribe()
      void core.stop()
    }
  }, [core])

  const nodeStatus = snapshot?.node.status || 'idle'
  const nodeStatusLabel = getNodeStatusLabel(nodeStatus)

  const parsedDownload = useMemo(() => {
    if (!downloadLink.trim()) return null
    try {
      return parseMostLink(downloadLink.trim())
    } catch {
      return null
    }
  }, [downloadLink])

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    })

    if (result.canceled) return
    const file = result.assets[0]
    if (!file) return
    const fileSize = file.size || 0
    const contentBytes = await readDevCidBytes(file.uri, fileSize)

    await core.publishFile({
      uri: file.uri,
      name: file.name,
      size: fileSize,
      mimeType: file.mimeType,
      contentBytes,
    })
  }

  const handleDownload = async () => {
    try {
      await core.downloadLink({ link: downloadLink.trim() })
      setDownloadLink('')
    } catch (error) {
      Alert.alert('链接不可用', error instanceof Error ? error.message : '请检查链接')
    }
  }

  const handleCopyFirstLink = async () => {
    const firstLink = snapshot?.holdings[0]?.shareLink
    if (!firstLink) return
    await Clipboard.setStringAsync(firstLink)
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MostBox Android</Text>
            <Text style={styles.title}>文件分享</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              nodeStatus === 'ready' ? styles.statusReady : styles.statusIdle,
            ]}
          >
            <Radio size={14} color={nodeStatus === 'ready' ? '#064e3b' : '#475569'} />
            <Text
              style={[
                styles.statusText,
                nodeStatus === 'ready' ? styles.statusTextReady : null,
              ]}
            >
              {nodeStatusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metric}>
            <Activity size={18} color="#22c55e" />
            <Text style={styles.metricValue}>{snapshot?.node.peerCount || 0}</Text>
            <Text style={styles.metricLabel}>Peers</Text>
          </View>
          <View style={styles.metric}>
            <HardDrive size={18} color="#38bdf8" />
            <Text style={styles.metricValue}>{snapshot?.holdings.length || 0}</Text>
            <Text style={styles.metricLabel}>Holdings</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={handlePickFile}>
            <FileUp size={18} color="#f8fafc" />
            <Text style={styles.primaryButtonText}>发布文件</Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryButton,
              !snapshot?.holdings.length ? styles.disabledButton : null,
            ]}
            disabled={!snapshot?.holdings.length}
            onPress={handleCopyFirstLink}
          >
            <Copy size={18} color={snapshot?.holdings.length ? '#0f172a' : '#94a3b8'} />
            <Text
              style={[
                styles.secondaryButtonText,
                !snapshot?.holdings.length ? styles.disabledButtonText : null,
              ]}
            >
              复制链接
            </Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelTitleRow}>
            <Link size={18} color="#38bdf8" />
            <Text style={styles.panelTitle}>下载</Text>
          </View>
          <TextInput
            value={downloadLink}
            onChangeText={setDownloadLink}
            placeholder="most://<cid>?filename=..."
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {parsedDownload ? (
            <Text style={styles.validationText}>
              {parsedDownload.fileName} · {parsedDownload.cid.slice(0, 16)}
            </Text>
          ) : null}
          <Pressable
            style={[
              styles.primaryButton,
              !downloadLink.trim() ? styles.disabledPrimaryButton : null,
            ]}
            disabled={!downloadLink.trim()}
            onPress={handleDownload}
          >
            <Download size={18} color="#f8fafc" />
            <Text style={styles.primaryButtonText}>加入下载</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>正在做种</Text>
          {snapshot?.holdings.length ? (
            snapshot.holdings.map(holding => (
              <View key={holding.cid} style={styles.listItem}>
                <View style={styles.listItemMain}>
                  <Text style={styles.listItemTitle}>{holding.fileName}</Text>
                  <Text style={styles.listItemMeta}>
                    {holding.cid.slice(0, 18)} · {formatBytes(holding.size)}
                  </Text>
                </View>
                <Text style={styles.badge}>{holding.status}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>暂无 holding</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>传输</Text>
          {snapshot?.transfers.length ? (
            snapshot.transfers.map(transfer => (
              <View key={transfer.id} style={styles.listItem}>
                <View style={styles.listItemMain}>
                  <Text style={styles.listItemTitle}>{transfer.fileName}</Text>
                  <Text style={styles.listItemMeta}>{transfer.message}</Text>
                </View>
                <Text style={styles.badge}>{transfer.status}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>暂无传输</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>日志</Text>
          {snapshot?.logs.length ? (
            snapshot.logs.map(log => (
              <View key={log.id} style={styles.logItem}>
                <Text style={styles.logLevel}>{log.level}</Text>
                <Text style={styles.logMessage}>{log.message}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>暂无日志</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  kicker: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  statusReady: {
    backgroundColor: '#bbf7d0',
  },
  statusIdle: {
    backgroundColor: '#e2e8f0',
  },
  statusText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  statusTextReady: {
    color: '#064e3b',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    flex: 1,
    minHeight: 92,
    justifyContent: 'center',
    gap: 6,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  metricValue: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledPrimaryButton: {
    backgroundColor: '#334155',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    backgroundColor: '#1e293b',
  },
  disabledButtonText: {
    color: '#94a3b8',
  },
  panel: {
    gap: 12,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    color: '#f8fafc',
    backgroundColor: '#020617',
  },
  validationText: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  listItemMain: {
    flex: 1,
    gap: 4,
  },
  listItemTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  listItemMeta: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    color: '#bae6fd',
    backgroundColor: '#0c4a6e',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  logItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  logLevel: {
    width: 42,
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  logMessage: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
})

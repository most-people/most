import { useEffect, useMemo, useState } from 'react'
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type Table,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clipboard,
  Database,
  Download,
  FileText,
  HardDrive,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react'
import {
  api,
  getApiErrorMessage,
  getAuthenticatedWebSocketUrl,
  getBackendUrlExport,
} from '~server/src/utils/api'
import { useAppStore } from '~/stores/useAppStore'
import { MarketingHeader } from '~/components/MarketingHeader'
import { SegmentedControl, SelectControl } from '~/components/ui'
import {
  useI18n,
  type Locale,
  type MessageKey,
} from '~/lib/i18n'
import { formatBytes } from '~/lib/format'
import {
  convertStorageLimitUnit,
  splitStorageLimitInput,
  storageLimitToBytes,
  type StorageLimitUnit,
} from '~/lib/storageLimitInput'

dayjs.extend(relativeTime)

interface NodeAddress {
  type: string
  ip: string
  label: string
  iface: string
}

interface NodeConfig {
  dataPath: string
  configuredDataPath?: string
  host: string
  port: number
  capacityBytes: number
  maxFileSizeBytes: number
  remoteInvites?: string[]
  remoteInviteCount?: number
  remoteInviteConfigured?: boolean
}

interface NodeLog {
  id: string
  ts: string
  level: string
  event: string
  message: string
  data?: Record<string, unknown>
}

interface NodeHolding {
  cid: string
  fileName: string
  size: number
  joined: boolean
  seedStatus?: 'queued' | 'joining' | 'active' | 'paused' | 'error'
  seedError?: string
  updatedAt?: string
  peerCount?: number
  lastServedAt?: string | null
  totalServedBytes?: number
}

interface NodeStatus {
  status: string
  version: string
  uptimeSeconds: number
  nodeId: string
  host: string
  port: number
  listen: {
    port: number
    addresses: NodeAddress[]
  }
  dataPath: string
  config: NodeConfig
  policy: {
    maxFileSizeBytes: number
  }
  capacity: {
    configuredBytes: number
    usedBytes: number
    freeBytes: number
  }
  storage: {
    total: number
    used: number
    free: number
    fileCount: number
    trashCount: number
  }
  network: {
    peers: number
    appPeers: number
    chatPeers: number
    status: string
  }
  holdings: NodeHolding[]
}

interface AdminUserData {
  address: string
  fileCount: number
  trashCount: number
  cidCount: number
}

const EMPTY_STATUS: NodeStatus | null = null
const EMPTY_HOLDINGS: NodeHolding[] = []
const LOG_LIMIT = 300
const DEFAULT_ADMIN_TABLE_PAGE_SIZE = 10
const ADMIN_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const MAX_FILE_SIZE_UNIT_OPTIONS = [
  { value: 'MB', label: 'MB' },
  { value: 'GiB', label: 'GiB' },
] satisfies Array<{ value: StorageLimitUnit; label: string }>

type AdminTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string

function formatUptime(seconds: number, t: AdminTranslate) {
  const total = Math.max(0, Number(seconds) || 0)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return t('admin.uptime.daysHours', { days, hours })
  if (hours > 0) return t('admin.uptime.hoursMinutes', { hours, minutes })
  return t('admin.uptime.minutes', { minutes })
}

function bytesToGiB(bytes: number) {
  if (!Number.isFinite(bytes)) return '0'
  return String(Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100)
}

function gibToBytes(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 1024 * 1024 * 1024)
}

function parseInviteText(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  )
}

function shortText(text: string, head = 12, tail = 8) {
  if (!text) return '-'
  if (text.length <= head + tail + 3) return text
  return `${text.slice(0, head)}...${text.slice(-tail)}`
}

function formatSeedStatus(holding: NodeHolding, t: AdminTranslate) {
  switch (holding.seedStatus) {
    case 'queued':
      return t('admin.seedStatus.queued')
    case 'joining':
      return t('admin.seedStatus.joining')
    case 'active':
      return t('admin.seedStatus.active')
    case 'paused':
      return t('admin.seedStatus.paused')
    case 'error':
      return holding.seedError
        ? t('admin.seedStatus.errorWithMessage', {
            message: holding.seedError,
          })
        : t('admin.seedStatus.error')
    default:
      return holding.joined
        ? t('admin.seedStatus.active')
        : t('admin.seedStatus.notJoined')
  }
}

function getDayjsLocale(locale: Locale) {
  const dayjsLocales: Record<Locale, string> = {
    'zh-CN': 'zh-cn',
    'zh-TW': 'zh-tw',
    en: 'en',
  }
  return dayjsLocales[locale]
}

function formatRecentTime(
  value: string | null | undefined,
  t: (key: MessageKey) => string,
  locale: Locale
) {
  if (!value) return t('admin.time.never')
  const time = dayjs(value)
  if (!time.isValid()) return t('admin.time.never')
  if (time.isAfter(dayjs())) return t('admin.time.justNow')
  const dayjsLocale = getDayjsLocale(locale)
  return time.locale(dayjsLocale).from(dayjs().locale(dayjsLocale))
}

const SEED_STATUS_HELP = [
  {
    labelKey: 'admin.seedHelp.active.label',
    tone: 'active',
    descKey: 'admin.seedHelp.active.desc',
  },
  {
    labelKey: 'admin.seedHelp.pending.label',
    tone: 'pending',
    descKey: 'admin.seedHelp.pending.desc',
  },
  {
    labelKey: 'admin.seedHelp.paused.label',
    tone: 'muted',
    descKey: 'admin.seedHelp.paused.desc',
  },
  {
    labelKey: 'admin.seedHelp.error.label',
    tone: 'error',
    descKey: 'admin.seedHelp.error.desc',
  },
] satisfies Array<{ labelKey: MessageKey; tone: string; descKey: MessageKey }>

const LOG_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'admin.logFilter.all' },
  { value: 'join', labelKey: 'admin.logFilter.join' },
  { value: 'pull', labelKey: 'admin.logFilter.pull' },
  { value: 'verify', labelKey: 'admin.logFilter.verify' },
  { value: 'serve', labelKey: 'admin.logFilter.serve' },
  { value: 'error', labelKey: 'admin.logFilter.error' },
] satisfies Array<{ value: string; labelKey: MessageKey }>

const LOG_FILTER_TERMS: Record<string, string[]> = {
  join: ['join', 'joined', 'topic'],
  pull: ['pull', 'p2p'],
  verify: ['verify', 'verified', 'integrity', 'download:success'],
  serve: ['seed', 'seeding', 'holding', 'publish:success', 'topic:joined'],
  error: ['error', 'failed', 'fail'],
}

function getNodeLogText(log: NodeLog) {
  let dataText = ''
  try {
    dataText = JSON.stringify(log.data || {})
  } catch {}

  return [log.level, log.event, log.message, dataText]
    .map(value => String(value || '').toLowerCase())
    .join(' ')
}

function nodeLogMatchesFilter(log: NodeLog, filter: string) {
  const normalized = String(filter || 'all')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'all') return true

  const text = getNodeLogText(log)
  if (normalized === 'error') {
    return (
      log.level === 'error' ||
      LOG_FILTER_TERMS.error.some(term => text.includes(term))
    )
  }

  const terms = LOG_FILTER_TERMS[normalized] || [normalized]
  return terms.some(term => text.includes(term))
}

type SortState = false | 'asc' | 'desc'

interface AdminDataTableProps<TData> {
  table: Table<TData>
  className: string
  emptyText: string
  t: AdminTranslate
}

function getSortTitle(sort: SortState, t: AdminTranslate) {
  if (sort === 'asc') return t('admin.table.sortDesc')
  if (sort === 'desc') return t('admin.table.sortClear')
  return t('admin.table.sortAsc')
}

function SortIcon({ sort }: { sort: SortState }) {
  if (sort === 'asc') return <ArrowUp size={13} />
  if (sort === 'desc') return <ArrowDown size={13} />
  return <ArrowUpDown size={13} />
}

function AdminTablePagination<TData>({
  table,
  t,
}: {
  table: Table<TData>
  t: AdminTranslate
}) {
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = Math.max(1, table.getPageCount())
  const rowCount = table.getPrePaginationRowModel().rows.length

  return (
    <div
      className="admin-table-pagination"
      aria-label={t('admin.table.pagination')}
    >
      <span className="admin-table-pagination-status">
        {t('admin.table.totalRows', { count: rowCount })}
      </span>
      <div className="admin-table-page-size">
        <span>{t('admin.table.pageSize')}</span>
        <SelectControl
          ariaLabel={t('admin.table.pageSize')}
          size="compact"
          value={pageSize}
          options={ADMIN_TABLE_PAGE_SIZE_OPTIONS.map(option => ({
            value: option,
            label: String(option),
          }))}
          onChange={nextPageSize => table.setPageSize(nextPageSize)}
        />
      </div>
      <span className="admin-table-pagination-status">
        {t('admin.table.pageIndicator', {
          page: pageIndex + 1,
          total: pageCount,
        })}
      </span>
      <div className="admin-table-page-actions">
        <button
          className="btn btn-icon"
          type="button"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label={t('admin.table.firstPage')}
          title={t('admin.table.firstPage')}
        >
          <ChevronsLeft size={15} />
        </button>
        <button
          className="btn btn-icon"
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label={t('admin.table.previousPage')}
          title={t('admin.table.previousPage')}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          className="btn btn-icon"
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label={t('admin.table.nextPage')}
          title={t('admin.table.nextPage')}
        >
          <ChevronRight size={15} />
        </button>
        <button
          className="btn btn-icon"
          type="button"
          onClick={() => table.setPageIndex(Math.max(0, pageCount - 1))}
          disabled={!table.getCanNextPage()}
          aria-label={t('admin.table.lastPage')}
          title={t('admin.table.lastPage')}
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  )
}

function AdminDataTable<TData>({
  table,
  className,
  emptyText,
  t,
}: AdminDataTableProps<TData>) {
  const rows = table.getRowModel().rows
  const rowCount = table.getPrePaginationRowModel().rows.length
  const shouldShowPagination =
    rowCount > table.getState().pagination.pageSize

  return (
    <div className={`admin-table ${className}`}>
      <table className="admin-data-table">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const sort = header.column.getIsSorted()
                const sortTitle = getSortTitle(sort, t)
                return (
                  <th
                    className={`admin-col-${header.column.id}`}
                    key={header.id}
                    aria-sort={
                      sort === 'asc'
                        ? 'ascending'
                        : sort === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="admin-table-sort"
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={sortTitle}
                        title={sortTitle}
                      >
                        <span>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        <SortIcon sort={sort} />
                      </button>
                    ) : (
                      <span>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td
                  className={`admin-col-${cell.column.id}`}
                  key={cell.id}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                className="admin-empty-row"
                colSpan={table.getAllLeafColumns().length}
              >
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {shouldShowPagination && <AdminTablePagination table={table} t={t} />}
    </div>
  )
}

export default function AdminPage() {
  const { t, locale, formatNumber, formatTime } = useI18n()
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const [status, setStatus] = useState<NodeStatus | null>(EMPTY_STATUS)
  const [logs, setLogs] = useState<NodeLog[]>([])
  const [error, setError] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false)
  const [logFilter, setLogFilter] = useState('all')
  const [userSorting, setUserSorting] = useState<SortingState>([])
  const [userPagination, setUserPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  })
  const [holdingSorting, setHoldingSorting] = useState<SortingState>([])
  const [holdingPagination, setHoldingPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  })
  const [logSorting, setLogSorting] = useState<SortingState>([
    { id: 'log-time', desc: true },
  ])
  const [logPagination, setLogPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_ADMIN_TABLE_PAGE_SIZE,
  })
  const [users, setUsers] = useState<AdminUserData[]>([])
  const [isClearingUser, setIsClearingUser] = useState('')
  const [configForm, setConfigForm] = useState({
    dataPath: '',
    capacityGiB: '100',
    maxFileSizeValue: '10',
    maxFileSizeUnit: 'GiB' as StorageLimitUnit,
    remoteInvites: '',
  })
  const isBackendReady = hasBackend === true

  function requireBackendReady() {
    if (isBackendReady) return true
    addToast(
      hasBackend === null
        ? t('admin.toast.backendChecking')
        : t('admin.toast.backendDisconnected'),
      'warning'
    )
    return false
  }

  const capacityPercent = useMemo(() => {
    if (!status || status.capacity.configuredBytes <= 0) return 0
    return Math.min(
      100,
      Math.round(
        (status.capacity.usedBytes / status.capacity.configuredBytes) * 100
      )
    )
  }, [status])

  const holdings = status?.holdings || EMPTY_HOLDINGS
  const backendUrl = getBackendUrlExport()
  const isRemoteAdmin =
    Boolean(backendUrl) &&
    !backendUrl.includes('localhost') &&
    !backendUrl.includes('127.0.0.1')
  const userColumns = useMemo<ColumnDef<AdminUserData>[]>(
    () => [
      {
        id: 'user',
        accessorKey: 'address',
        header: t('admin.userData.user'),
        cell: info => {
          const address = info.getValue<string>()
          return (
            <span title={address} translate="no">
              {shortText(address)}
            </span>
          )
        },
      },
      {
        id: 'user-files',
        accessorKey: 'fileCount',
        header: t('admin.userData.files'),
        cell: info => formatNumber(info.getValue<number>()),
      },
      {
        id: 'user-trash',
        accessorKey: 'trashCount',
        header: t('admin.userData.trash'),
        cell: info => formatNumber(info.getValue<number>()),
      },
      {
        id: 'user-actions',
        header: t('admin.userData.actions'),
        enableSorting: false,
        cell: info => {
          const address = info.row.original.address
          return (
            <button
              className="btn btn-ghost"
              onClick={() => clearUserData(address)}
              disabled={isClearingUser === address}
            >
              <Trash2 size={16} />
              {t('admin.action.clear')}
            </button>
          )
        },
      },
    ],
    [formatNumber, isClearingUser, t]
  )
  const holdingColumns = useMemo<ColumnDef<NodeHolding>[]>(
    () => [
      {
        id: 'file',
        accessorKey: 'fileName',
        header: t('admin.holdings.file'),
        cell: info => (
          <span translate="no">{info.getValue<string>() || '-'}</span>
        ),
      },
      {
        id: 'cid',
        accessorKey: 'cid',
        header: 'CID',
        cell: info => {
          const holding = info.row.original
          return (
            <span title={holding.cid} translate="no">
              {shortText(holding.cid)}
            </span>
          )
        },
      },
      {
        id: 'size',
        accessorKey: 'size',
        header: t('admin.holdings.size'),
        cell: info => formatBytes(info.getValue<number>()),
      },
      {
        id: 'peers',
        accessorFn: row => row.peerCount ?? 0,
        header: t('admin.holdings.peers'),
        cell: info => formatNumber(info.getValue<number>()),
      },
      {
        id: 'topic',
        accessorFn: row => Number(row.joined),
        header: t('admin.holdings.topicJoined'),
        cell: info => {
          const holding = info.row.original
          return (
            <span
              className={`admin-seed-pill ${holding.joined ? 'active' : ''}`}
            >
              {holding.joined
                ? t('admin.holdings.joinedYes')
                : t('admin.holdings.joinedNo')}
            </span>
          )
        },
      },
      {
        id: 'last-served',
        accessorFn: row =>
          row.lastServedAt ? new Date(row.lastServedAt).getTime() || 0 : 0,
        header: t('admin.holdings.lastServed'),
        cell: info => {
          const lastServedAt = info.row.original.lastServedAt
          return (
            <span title={lastServedAt || ''}>
              {formatRecentTime(lastServedAt, t, locale)}
            </span>
          )
        },
      },
      {
        id: 'total-served',
        accessorFn: row => row.totalServedBytes || 0,
        header: t('admin.holdings.totalServed'),
        cell: info => formatBytes(info.getValue<number>()),
      },
      {
        id: 'status',
        accessorFn: row =>
          row.seedStatus || (row.joined ? 'active' : 'not-joined'),
        header: t('admin.holdings.status'),
        cell: info => {
          const holding = info.row.original
          return (
            <span
              className={`admin-seed-pill ${
                holding.seedStatus === 'error'
                  ? 'error'
                  : holding.seedStatus === 'active' || holding.joined
                    ? 'active'
                    : ''
              }`}
            >
              {formatSeedStatus(holding, t)}
            </span>
          )
        },
      },
    ],
    [formatNumber, locale, t]
  )
  const logColumns = useMemo<ColumnDef<NodeLog>[]>(
    () => [
      {
        id: 'log-time',
        accessorFn: row => new Date(row.ts).getTime() || 0,
        header: t('admin.logs.time'),
        cell: info => <time>{formatTime(info.row.original.ts)}</time>,
      },
      {
        id: 'log-level',
        accessorKey: 'level',
        header: t('admin.logs.level'),
        cell: info => (
          <span
            className={`admin-log-level ${info.getValue<string>()}`}
            translate="no"
          >
            {info.getValue<string>()}
          </span>
        ),
      },
      {
        id: 'log-event',
        accessorKey: 'event',
        header: t('admin.logs.event'),
        cell: info => <strong translate="no">{info.getValue<string>()}</strong>,
      },
      {
        id: 'log-message',
        accessorKey: 'message',
        header: t('admin.logs.message'),
        cell: info => <span translate="no">{info.getValue<string>()}</span>,
      },
    ],
    [formatTime, t]
  )
  const userTable = useReactTable({
    data: users,
    columns: userColumns,
    state: {
      sorting: userSorting,
      pagination: userPagination,
    },
    onSortingChange: setUserSorting,
    onPaginationChange: setUserPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: row => row.address,
  })
  const holdingTable = useReactTable({
    data: holdings,
    columns: holdingColumns,
    state: {
      sorting: holdingSorting,
      pagination: holdingPagination,
    },
    onSortingChange: setHoldingSorting,
    onPaginationChange: setHoldingPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: row => row.cid,
  })
  const logTable = useReactTable({
    data: logs,
    columns: logColumns,
    state: {
      sorting: logSorting,
      pagination: logPagination,
    },
    onSortingChange: setLogSorting,
    onPaginationChange: setLogPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: row => row.id,
  })

  const loadStatus = async () => {
    if (!isBackendReady) return false
    try {
      const nextStatus = await api.get<NodeStatus>('/api/node/status').json()
      const nodeConfig = await api.get<NodeConfig>('/api/node/config').json()
      const maxFileSize = splitStorageLimitInput(nodeConfig.maxFileSizeBytes)
      setStatus(nextStatus)
      setConfigForm({
        dataPath: nodeConfig.dataPath || nextStatus.dataPath || '',
        capacityGiB: bytesToGiB(nodeConfig.capacityBytes),
        maxFileSizeValue: maxFileSize.value,
        maxFileSizeUnit: maxFileSize.unit,
        remoteInvites: (nodeConfig.remoteInvites || []).join('\n'),
      })
      setError('')
      return true
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.readStatus')
      )
      setError(message)
      addToast(message, 'error')
      return false
    }
  }

  const refreshStatus = async () => {
    if (!requireBackendReady()) return
    if (await loadStatus()) {
      addToast(t('admin.toast.statusRefreshed'), 'success')
    }
  }

  const loadLogs = async (nextFilter = logFilter) => {
    if (!isBackendReady) return
    try {
      const query = new URLSearchParams({
        limit: String(LOG_LIMIT),
        filter: nextFilter,
      })
      const result = await api
        .get<{ logs: NodeLog[] }>(`/api/node/logs?${query.toString()}`)
        .json()
      setLogs(result.logs || [])
    } catch {}
  }

  const loadUsers = async () => {
    if (!isBackendReady) return
    try {
      const result = await api
        .get<{ users: AdminUserData[] }>('/api/admin/users')
        .json()
      setUsers(result.users || [])
    } catch {}
  }

  const saveConfig = async () => {
    if (!requireBackendReady()) return
    setIsSavingConfig(true)
    try {
      await api
        .post('/api/node/config', {
          json: {
            dataPath: configForm.dataPath,
            capacityBytes: gibToBytes(configForm.capacityGiB),
            maxFileSizeBytes: storageLimitToBytes(
              configForm.maxFileSizeValue,
              configForm.maxFileSizeUnit
            ),
            remoteInvites: parseInviteText(configForm.remoteInvites),
          },
        })
        .json()
      const needsRestart = configForm.dataPath !== (status?.dataPath || '')
      addToast(
        needsRestart
          ? t('admin.toast.configSavedRestart')
          : t('admin.toast.configSaved'),
        'success'
      )
      await loadStatus()
      await loadLogs()
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.saveConfig')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const copyNodeId = async () => {
    if (!status?.nodeId) return
    await navigator.clipboard.writeText(status.nodeId)
    addToast(t('admin.toast.nodeIdCopied'), 'success')
  }

  const clearLogs = async () => {
    if (!requireBackendReady()) return
    setIsClearingLogs(true)
    try {
      await api.delete('/api/node/logs').json()
      setLogs([])
      addToast(t('admin.toast.logsCleared'), 'success')
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.clearLogs')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsClearingLogs(false)
    }
  }

  const exportDiagnostics = async () => {
    if (!requireBackendReady()) return
    setIsExportingDiagnostics(true)
    try {
      const diagnostics = await api.get('/api/node/diagnostics').json()
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      link.href = url
      link.download = `mostbox-diagnostics-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      addToast(t('admin.toast.diagnosticsExported'), 'success')
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.exportDiagnostics')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsExportingDiagnostics(false)
    }
  }

  async function clearUserData(address: string) {
    if (!requireBackendReady()) return
    const confirmed = window.confirm(
      t('admin.confirm.clearUserData', {
        address: `${address.slice(0, 6)}...${address.slice(-4)}`,
      })
    )
    if (!confirmed) return
    setIsClearingUser(address)
    try {
      await api.delete(`/api/admin/users/${address}/data`).json()
      addToast(t('admin.toast.userDataCleared'), 'success')
      await loadUsers()
      await loadStatus()
    } catch (err) {
      const message = await getApiErrorMessage(
        err,
        t('admin.error.clearUserData')
      )
      addToast(message, 'error')
      setError(message)
    } finally {
      setIsClearingUser('')
    }
  }

  useEffect(() => {
    if (!isBackendReady) return
    if (isRemoteAdmin) return
    loadStatus()
    loadLogs()
    loadUsers()

    let ws: WebSocket | null = null
    let cancelled = false
    ;(async () => {
      ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (cancelled) {
        ws.close()
        return
      }
      ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if (message.event === 'node:status') {
            setStatus(message.data)
          }
          if (message.event === 'node:log') {
            if (nodeLogMatchesFilter(message.data, logFilter)) {
              setLogs(prev => [message.data, ...prev].slice(0, LOG_LIMIT))
            }
          }
          if (message.event === 'node:logs:cleared') {
            setLogs([])
          }
          if (
            message.event === 'publish:success' ||
            message.event === 'download:success' ||
            message.event === 'network:status'
          ) {
            loadStatus()
          }
        } catch {}
      }
    })()
    return () => {
      cancelled = true
      ws?.close()
    }
  }, [isBackendReady, isRemoteAdmin, logFilter])

  return (
    <>
      <MarketingHeader />
      <main className="admin-page">
        <header className="admin-topbar">
          <div className="admin-title-group">
            <h1>{t('admin.title')}</h1>
          </div>
          <div className="admin-topbar-actions">
            <span
              className={`admin-status-pill ${status?.status === 'online' ? 'online' : ''}`}
            >
              <Activity size={14} />
              {status?.status === 'online'
                ? t('admin.status.online')
                : t('admin.status.waiting')}
            </span>
            <button className="btn btn-secondary" onClick={refreshStatus}>
              <RefreshCw size={16} />
              {t('admin.action.refresh')}
            </button>
          </div>
        </header>

      {hasBackend === false && (
        <section className="admin-panel admin-error">
          <Server size={20} />
          <span>{t('admin.error.localDaemonDisconnected')}</span>
        </section>
      )}

      {isRemoteAdmin && (
        <section className="admin-panel admin-error">
          <AlertTriangle size={18} />
          <div>
            <h2>{t('admin.remoteUnavailable.title')}</h2>
            <p>
              {t('admin.remoteUnavailable.desc')}
            </p>
          </div>
        </section>
      )}

      {!isRemoteAdmin && error && (
        <section className="admin-panel admin-error">
          <FileText size={20} />
          <span>{error}</span>
        </section>
      )}

      {!isRemoteAdmin && (
        <>
          <section className="admin-overview">
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <span>{t('admin.metric.nodeId')}</span>
                <strong translate="no">
                  {shortText(status?.nodeId || '')}
                </strong>
              </div>
              <button
                className="btn btn-icon admin-metric-action"
                onClick={copyNodeId}
                aria-label={t('admin.action.copyNodeId')}
              >
                <Clipboard size={15} />
              </button>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <Wifi size={18} />
              </div>
              <div>
                <span>{t('admin.metric.connections')}</span>
                <strong>
                  {status
                    ? t('admin.metric.peers', {
                        count: status.network.peers,
                      })
                    : '-'}
                </strong>
              </div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <HardDrive size={18} />
              </div>
              <div>
                <span>{t('admin.metric.capacity')}</span>
                <strong>{capacityPercent}%</strong>
              </div>
            </div>
            <div className="admin-metric">
              <div className="admin-metric-icon">
                <Server size={18} />
              </div>
              <div>
                <span>{t('admin.metric.uptime')}</span>
                <strong>
                  {status ? formatUptime(status.uptimeSeconds, t) : '-'}
                </strong>
              </div>
            </div>
          </section>

          <section className="admin-grid">
            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.nodeStatus.title')}</h2>
                </div>
                <CheckCircle2 size={18} />
              </div>
              <div className="admin-status-grid">
                <div>
                  <span>{t('admin.nodeStatus.version')}</span>
                  <strong translate="no">{status?.version || '-'}</strong>
                </div>
                <div>
                  <span>{t('admin.nodeStatus.listen')}</span>
                  <strong translate="no">
                    {status ? `${status.host}:${status.port}` : '-'}
                  </strong>
                </div>
                <div>
                  <span>{t('admin.nodeStatus.dataPath')}</span>
                  <strong translate="no">{status?.dataPath || '-'}</strong>
                </div>
              </div>
              <div className="admin-address-list">
                {(status?.listen.addresses || []).map(address => (
                  <span key={`${address.type}-${address.ip}`} translate="no">
                    {address.label}: {address.ip}:{status?.port}
                  </span>
                ))}
              </div>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.userData.title')}</h2>
                </div>
                <Database size={18} />
              </div>
              <AdminDataTable
                table={userTable}
                className="admin-table-users"
                emptyText={t('admin.userData.empty')}
                t={t}
              />
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.settings.title')}</h2>
                </div>
                <Database size={18} />
              </div>
              <div className="admin-settings-fields">
                <label className="admin-field admin-field-wide">
                  <span>{t('admin.settings.dataPath')}</span>
                  <input
                    className="input"
                    value={configForm.dataPath}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        dataPath: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>{t('admin.settings.capacityGiB')}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={configForm.capacityGiB}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        capacityGiB: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>{t('admin.settings.maxFileSize')}</span>
                  <div className="admin-unit-field">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder={t('admin.settings.maxFileSizePlaceholder')}
                      value={configForm.maxFileSizeValue}
                      onChange={event =>
                        setConfigForm(prev => ({
                          ...prev,
                          maxFileSizeValue: event.target.value,
                        }))
                      }
                    />
                    <SegmentedControl
                      ariaLabel={t('admin.settings.maxFileSizeUnit')}
                      options={MAX_FILE_SIZE_UNIT_OPTIONS}
                      value={configForm.maxFileSizeUnit}
                      onChange={nextUnit =>
                        setConfigForm(prev => ({
                          ...prev,
                          maxFileSizeValue: convertStorageLimitUnit(
                            prev.maxFileSizeValue,
                            prev.maxFileSizeUnit,
                            nextUnit
                          ),
                          maxFileSizeUnit: nextUnit,
                        }))
                      }
                    />
                  </div>
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{t('admin.settings.remoteInvites')}</span>
                  <textarea
                    className="input admin-textarea"
                    value={configForm.remoteInvites}
                    placeholder={t('admin.settings.remoteInvitesPlaceholder')}
                    onChange={event =>
                      setConfigForm(prev => ({
                        ...prev,
                        remoteInvites: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <p className="admin-field-hint">
                {t('admin.settings.hint')}
              </p>
              <button
                className="btn btn-primary btn-full"
                onClick={saveConfig}
                disabled={isSavingConfig}
              >
                <Save size={16} />
                {t('admin.action.saveConfig')}
              </button>
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.holdings.title')}</h2>
                </div>
                <HardDrive size={18} />
              </div>
              <div className="admin-capacity-row">
                <progress value={capacityPercent} max="100" />
                <span>
                  {formatBytes(status?.capacity.usedBytes || 0)} /{' '}
                  {formatBytes(status?.capacity.configuredBytes || 0)}
                </span>
              </div>
              <div
                className="admin-seed-help"
                aria-label={t('admin.seedHelp.label')}
              >
                {SEED_STATUS_HELP.map(item => (
                  <div className="admin-seed-help-item" key={item.labelKey}>
                    <span className={`admin-seed-dot ${item.tone}`} />
                    <div>
                      <strong>{t(item.labelKey)}</strong>
                      <span>{t(item.descKey)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <AdminDataTable
                table={holdingTable}
                className="admin-table-holdings"
                emptyText={t('admin.holdings.empty')}
                t={t}
              />
            </div>

            <div className="admin-panel admin-span-2">
              <div className="admin-panel-header">
                <div>
                  <h2>{t('admin.logs.title')}</h2>
                </div>
                <div className="admin-panel-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={exportDiagnostics}
                    disabled={isExportingDiagnostics}
                  >
                    <Download size={16} />
                    {t('admin.action.exportDiagnostics')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={clearLogs}
                    disabled={isClearingLogs || logs.length === 0}
                  >
                    <Trash2 size={16} />
                    {t('admin.action.clearLogs')}
                  </button>
                  <FileText size={18} />
                </div>
              </div>
              <div
                className="admin-log-filter"
                aria-label={t('admin.logs.filterLabel')}
              >
                {LOG_FILTER_OPTIONS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={logFilter === item.value ? 'active' : ''}
                    onClick={() => {
                      setLogFilter(item.value)
                      setLogPagination(prev => ({ ...prev, pageIndex: 0 }))
                      loadLogs(item.value)
                    }}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
              <AdminDataTable
                table={logTable}
                className="admin-table-logs"
                emptyText={t('admin.logs.empty')}
                t={t}
              />
            </div>
          </section>
        </>
      )}
      </main>
    </>
  )
}

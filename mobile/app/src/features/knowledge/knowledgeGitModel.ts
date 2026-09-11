export type KnowledgeGitChangeStatus = 'added' | 'modified' | 'deleted'

export type KnowledgeGitChange = {
  path: string
  status: KnowledgeGitChangeStatus
  staged: boolean
}

export type KnowledgeGitAuthor = { name: string; email: string }

export type KnowledgeGitStatus = {
  initialized: boolean
  branch: string
  headOid: string
  changes: KnowledgeGitChange[]
  stagedCount: number
  author: KnowledgeGitAuthor | null
}

export type KnowledgeGitCommit = {
  oid: string
  message: string
  author: KnowledgeGitAuthor
  timestamp: number
  changes: Array<{ path: string; status: KnowledgeGitChangeStatus }>
}

export type KnowledgeGitDiffPart = {
  value: string
  count: number
  added: boolean
  removed: boolean
}

export type KnowledgeGitDiff = {
  path: string
  oid: string
  beforeExists: boolean
  afterExists: boolean
  parts: KnowledgeGitDiffPart[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function status(value: unknown): KnowledgeGitChangeStatus | null {
  return value === 'added' || value === 'modified' || value === 'deleted'
    ? value
    : null
}

function author(value: unknown): KnowledgeGitAuthor | null {
  const item = record(value)
  const name = text(item?.name).trim()
  const email = text(item?.email).trim()
  return name && email ? { name, email } : null
}

function changes(value: unknown, stagedDefault: boolean) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const row = record(item)
    const path = text(row?.path).trim()
    const changeStatus = status(row?.status)
    if (!path || !changeStatus) return []
    return [
      {
        path,
        status: changeStatus,
        staged: row?.staged === true || stagedDefault,
      },
    ]
  })
}

export function normalizeKnowledgeGitStatus(
  input: unknown
): KnowledgeGitStatus {
  const value = record(input)
  const initialized = value?.initialized === true
  const stagedCount = Number(value?.stagedCount)
  return {
    initialized,
    branch: text(value?.branch, 'main') || 'main',
    headOid: text(value?.headOid),
    changes: changes(value?.changes, false),
    stagedCount:
      Number.isFinite(stagedCount) && stagedCount >= 0
        ? Math.floor(stagedCount)
        : 0,
    author: author(value?.author),
  }
}

export function normalizeKnowledgeGitHistory(
  input: unknown
): KnowledgeGitCommit[] {
  if (!Array.isArray(input)) return []
  return input.flatMap(item => {
    const value = record(item)
    const commitAuthor = author(value?.author)
    const oid = text(value?.oid)
    const message = text(value?.message).trim()
    const timestamp = Number(value?.timestamp)
    if (!oid || !message || !commitAuthor || !Number.isFinite(timestamp))
      return []
    return [
      {
        oid,
        message,
        author: commitAuthor,
        timestamp,
        changes: changes(value?.changes, false).map(
          ({ path, status: changeStatus }) => ({ path, status: changeStatus })
        ),
      },
    ]
  })
}

export function normalizeKnowledgeGitDiff(
  input: unknown
): KnowledgeGitDiff | null {
  const value = record(input)
  const path = text(value?.path).trim()
  if (!path || !Array.isArray(value?.parts)) return null
  const parts = value.parts.flatMap(item => {
    const part = record(item)
    const content = text(part?.value)
    if (!content) return []
    const count = Number(part?.count)
    return [
      {
        value: content,
        count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
        added: part?.added === true,
        removed: part?.removed === true,
      },
    ]
  })
  return {
    path,
    oid: text(value?.oid),
    beforeExists: value?.beforeExists === true,
    afterExists: value?.afterExists === true,
    parts,
  }
}

export function summarizeKnowledgeGitDiff(diff: KnowledgeGitDiff) {
  return diff.parts.reduce(
    (summary, part) => {
      if (part.added) summary.added += part.count
      else if (part.removed) summary.removed += part.count
      else summary.unchanged += part.count
      return summary
    },
    { added: 0, removed: 0, unchanged: 0 }
  )
}

import { displayStoredText, isTodo, type Todo } from '../model.ts'
import { copy } from '../copy.ts'

export const STORAGE_KEY = 'todo-list:items'
export const STORAGE_BACKUP_KEY = 'todo-list:items.bak'
export const STORAGE_PROBE_KEY = 'todo-list:probe'

export type StorageIssue = 'unavailable' | 'write-failed'

/** 读写结果。warning 非空时界面显示提示条；issues 说明原因。 */
export type StorageStatus = {
  issues: StorageIssue[]
  warning: string | null
}

export type KeyValueStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadResult = {
  items: Todo[]
  status: StorageStatus
}

export type SaveResult = {
  status: StorageStatus
}

export function createStatus(issues: readonly StorageIssue[]): StorageStatus {
  const unique: StorageIssue[] = []
  for (const issue of issues) {
    if (!unique.includes(issue)) unique.push(issue)
  }
  return {
    issues: unique,
    warning: unique.length > 0 ? copy.storageWarning : null,
  }
}

/** 提示条在本次会话内保留，不因后续写入成功而消失。 */
export function mergeStatus(previous: StorageStatus, next: StorageStatus): StorageStatus {
  const issues = [...previous.issues]
  for (const issue of next.issues) {
    if (!issues.includes(issue)) issues.push(issue)
  }
  return {
    issues,
    warning: previous.warning ?? (issues.length > 0 ? copy.storageWarning : null),
  }
}

/**
 * 每次调用时读取 window.localStorage，不在模块加载时缓存 setItem。
 * 这样页面脚本执行前对 Storage.prototype.setItem 的注入仍然生效。
 */
export function safeLocalStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function loadTodos(storage: KeyValueStorage | null): LoadResult {
  if (!storage) return { items: [], status: createStatus(['unavailable']) }

  const probeOk = probeStorage(storage)
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { items: [], status: createStatus(['unavailable']) }
  }

  const issues: StorageIssue[] = probeOk ? [] : ['unavailable']
  if (raw === null || raw === '') return { items: [], status: createStatus(issues) }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    if (!probeOk) return { items: [], status: createStatus(issues) }
    return repair(storage, raw, [], issues)
  }

  if (!Array.isArray(parsed)) {
    if (!probeOk) return { items: [], status: createStatus(issues) }
    return repair(storage, raw, [], issues)
  }

  const sanitized = sanitize(parsed)
  if (!sanitized.dropped || !probeOk) {
    return { items: sanitized.items, status: createStatus(issues) }
  }

  return repair(storage, raw, sanitized.items, issues)
}

/** 写入当前完整列表。失败后由 useTodos 在本次会话内停止再调用。 */
export function saveTodos(items: readonly Todo[], storage: KeyValueStorage | null): SaveResult {
  if (!storage) return { status: createStatus(['unavailable']) }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items))
    return { status: createStatus([]) }
  } catch {
    return { status: createStatus(['write-failed']) }
  }
}

function probeStorage(storage: KeyValueStorage): boolean {
  try {
    storage.setItem(STORAGE_PROBE_KEY, '1')
  } catch {
    return false
  }
  try {
    storage.removeItem(STORAGE_PROBE_KEY)
    return true
  } catch {
    return false
  }
}

function sanitize(values: unknown[]): { items: Todo[]; dropped: boolean } {
  const valid: Todo[] = []
  let dropped = false
  for (const value of values) {
    if (!isTodo(value)) {
      dropped = true
      continue
    }
    const text = displayStoredText(value.text)
    valid.push({
      id: value.id,
      text,
      completed: value.completed,
      createdAt: value.createdAt,
    })
  }
  const seen = new Set<string>()
  const items: Todo[] = []
  for (const item of valid) {
    if (seen.has(item.id)) {
      dropped = true
      continue
    }
    seen.add(item.id)
    items.push(item)
  }
  return { items, dropped }
}

function repair(
  storage: KeyValueStorage,
  raw: string,
  items: Todo[],
  issues: StorageIssue[],
): LoadResult {
  try {
    storage.setItem(STORAGE_BACKUP_KEY, raw)
  } catch {
    return { items, status: createStatus([...issues, 'write-failed']) }
  }
  return writeItems(storage, items, issues)
}

function writeItems(storage: KeyValueStorage, items: Todo[], issues: StorageIssue[]): LoadResult {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items))
    return { items, status: createStatus(issues) }
  } catch {
    return { items, status: createStatus([...issues, 'write-failed']) }
  }
}

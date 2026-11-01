export type Todo = {
  id: string
  text: string
  completed: boolean
  createdAt: number
}

/** 按 JavaScript 字符串 length 计算，一个汉字为 1，一个 BMP 之外的 emoji 通常为 2。 */
export const MAX_TODO_LENGTH = 200

const ZERO_WIDTH = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g
const LINE_BREAK = /\r\n|\r|\n/g

/** 加载时使用的文本：去掉零宽字符再 trim。不合法时返回 null，不截断。 */
export function canonicalStoredText(text: string): string | null {
  if (text.trim().length > MAX_TODO_LENGTH) return null
  const cleaned = text.replace(ZERO_WIDTH, '').trim()
  if (!cleaned) return null
  return cleaned
}

export function isTodo(value: unknown): value is Todo {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.text === 'string' &&
    canonicalStoredText(item.text) !== null &&
    typeof item.completed === 'boolean' &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt)
  )
}

/** 去掉零宽字符后再 trim，没有可见内容就视为空。 */
export function isBlankTodoInput(raw: string): boolean {
  return raw.replace(ZERO_WIDTH, '').trim().length === 0
}

export function canSubmit(raw: string): boolean {
  return !isBlankTodoInput(raw)
}

/**
 * 换行换成一个空格，再按码元截到 200。
 * 截断点若落在代理对中间，整个字符丢掉，避免孤立代理项。
 */
export function clampTodoInput(raw: string): string {
  return clampCodeUnits(raw.replace(LINE_BREAK, ' '), MAX_TODO_LENGTH)
}

export function clampCodeUnits(value: string, max: number): string {
  if (value.length <= max) return value
  let end = max
  const code = value.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return value.slice(0, end)
}

export function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

/** 保存前：换行转空格、去掉零宽字符、再 trim。结果为空则不能添加。 */
export function normalizeTodoText(raw: string): string | null {
  const singleLine = clampTodoInput(raw).replace(ZERO_WIDTH, '').trim()
  if (!singleLine) return null
  return singleLine
}

let lastCreatedAt = 0

export function nextCreatedAt(now = Date.now()): number {
  const value = now > lastCreatedAt ? now : lastCreatedAt + 1
  lastCreatedAt = value
  return value
}

export function createTodoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

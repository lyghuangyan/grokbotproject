import { describe, expect, it } from 'vitest'
import { copy } from '../copy.ts'
import type { Todo } from '../model.ts'
import {
  createStatus,
  loadTodos,
  mergeStatus,
  saveTodos,
  STORAGE_BACKUP_KEY,
  STORAGE_KEY,
  STORAGE_PROBE_KEY,
  type KeyValueStorage,
} from './todoStorage.ts'

function memory(initial: Record<string, string> = {}): KeyValueStorage & { snapshot(): Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    snapshot: () => data,
  }
}

function todo(id: string, text = id, completed = false, createdAt = 1): Todo {
  return { id, text, completed, createdAt }
}

describe('todoStorage', () => {
  it('正常读写完整列表，探测键不残留', () => {
    const storage = memory()
    const items = [todo('1', '买牛奶', false, 2), todo('2', '写周报', true, 1)]
    expect(saveTodos(items, storage).status).toEqual({ issues: [], warning: null })
    expect(loadTodos(storage)).toEqual({ items, status: { issues: [], warning: null } })
    expect(storage.getItem(STORAGE_PROBE_KEY)).toBeNull()
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBeNull()
  })

  it('键不存在、空数组、空字符串都是空列表，不备份不提示', () => {
    expect(loadTodos(memory()).items).toEqual([])
    expect(loadTodos(memory({ [STORAGE_KEY]: '[]' })).status.warning).toBeNull()
    const empty = memory({ [STORAGE_KEY]: '' })
    expect(loadTodos(empty)).toEqual({ items: [], status: { issues: [], warning: null } })
    expect(empty.getItem(STORAGE_KEY)).toBe('')
    expect(empty.getItem(STORAGE_BACKUP_KEY)).toBeNull()
  })

  it('损坏 JSON 先备份再重置为空数组，本身不提示', () => {
    const storage = memory({ [STORAGE_KEY]: '{abc' })
    const loaded = loadTodos(storage)
    expect(loaded.items).toEqual([])
    expect(loaded.status).toEqual({ issues: [], warning: null })
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBe('{abc')
    expect(storage.getItem(STORAGE_KEY)).toBe('[]')
  })

  it('不是数组时同样备份并重置', () => {
    for (const raw of ['{}', '"str"', '123', 'null', 'true']) {
      const storage = memory({ [STORAGE_KEY]: raw })
      const loaded = loadTodos(storage)
      expect(loaded.items).toEqual([])
      expect(loaded.status.warning).toBeNull()
      expect(storage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
      expect(storage.getItem(STORAGE_KEY)).toBe('[]')
    }
  })

  it('只丢弃不合法元素和重复 id，原文备份，顺序保留第一条', () => {
    const first = todo('same', '先到', false, 1)
    const kept = todo('b', 'B', true, 2)
    const raw = JSON.stringify([
      first,
      null,
      kept,
      { id: 'x', text: '', completed: false, createdAt: 1 },
      { id: 'same', text: '后到', completed: true, createdAt: 3 },
    ])
    const storage = memory({ [STORAGE_KEY]: raw })
    const loaded = loadTodos(storage)
    expect(loaded.items).toEqual([first, kept])
    expect(loaded.status.warning).toBeNull()
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual([first, kept])
  })

  it('多余字段和首尾空白不备份也不写回，内存里使用 trim 后的文本', () => {
    const raw = JSON.stringify([{ id: 'a', text: ' a ', completed: false, createdAt: 1, extra: 1 }])
    const storage = memory({ [STORAGE_KEY]: raw })
    const loaded = loadTodos(storage)
    expect(loaded.items).toEqual([todo('a', 'a', false, 1)])
    expect(loaded.status).toEqual({ issues: [], warning: null })
    expect(storage.getItem(STORAGE_KEY)).toBe(raw)
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBeNull()
    expect(storage.getItem(STORAGE_PROBE_KEY)).toBeNull()
  })

  it('先校验再去重：不合法的同 id 被丢掉后，后面的合法项保留', () => {
    const raw = JSON.stringify([
      { id: 'same', text: '\u200B', completed: false, createdAt: 1 },
      todo('same', '留下', false, 2),
      todo('same', '重复', false, 3),
    ])
    const storage = memory({ [STORAGE_KEY]: raw })
    const loaded = loadTodos(storage)
    expect(loaded.items).toEqual([todo('same', '留下', false, 2)])
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual([todo('same', '留下', false, 2)])
  })

  it('加载时保留零宽字符，只 trim，不因此写回', () => {
    const raw = JSON.stringify([{ id: 'z', text: '  a\u200Bb  ', completed: false, createdAt: 1 }])
    const storage = memory({ [STORAGE_KEY]: raw })
    const loaded = loadTodos(storage)
    expect(loaded.items).toEqual([todo('z', 'a\u200Bb', false, 1)])
    expect(loaded.items[0]?.text).toBe('a\u200Bb')
    expect(loaded.status.warning).toBeNull()
    expect(storage.getItem(STORAGE_KEY)).toBe(raw)
    expect(storage.getItem(STORAGE_BACKUP_KEY)).toBeNull()
  })

  it('显示顺序以数组为准，不按 createdAt 重排', () => {
    const older = todo('old', '较早', false, 1)
    const newer = todo('new', '较新', false, 99)
    const storage = memory({ [STORAGE_KEY]: JSON.stringify([older, newer]) })
    expect(loadTodos(storage).items.map((item) => item.id)).toEqual(['old', 'new'])
  })

  it('备份写不进去时不覆盖原数据，并提示', () => {
    const raw = '{abc'
    const storage: KeyValueStorage = {
      getItem: (key) => (key === STORAGE_KEY ? raw : null),
      setItem: (key) => {
        if (key === STORAGE_BACKUP_KEY) throw new Error('quota')
      },
      removeItem: () => {},
    }
    const loaded = loadTodos(storage)
    expect(loaded.items).toEqual([])
    expect(loaded.status.warning).toBe(copy.storageWarning)
    expect(loaded.status.issues).toContain('write-failed')
  })

  it('读取抛异常或探测失败时提示，探测键会被删掉', () => {
    const denied: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadTodos(denied).status).toEqual({
      issues: ['unavailable'],
      warning: copy.storageWarning,
    })
    expect(loadTodos(null).status.warning).toBe(copy.storageWarning)

    const data = new Map<string, string>()
    const probed: KeyValueStorage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value)
      },
      removeItem: (key) => {
        data.delete(key)
      },
    }
    loadTodos(probed)
    expect(data.has(STORAGE_PROBE_KEY)).toBe(false)
  })

  it('写入失败可提示，成功写入会保存当时的完整列表', () => {
    const data = new Map<string, string>()
    let fail = true
    const storage: KeyValueStorage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        if (fail && key === STORAGE_KEY) throw new Error('QuotaExceededError')
        data.set(key, value)
      },
      removeItem: (key) => {
        data.delete(key)
      },
    }
    const items = [todo('1', '写周报')]
    expect(saveTodos(items, storage).status.warning).toBe(copy.storageWarning)
    expect(data.has(STORAGE_KEY)).toBe(false)
    fail = false
    expect(saveTodos(items, storage).status.warning).toBeNull()
    expect(JSON.parse(data.get(STORAGE_KEY)!)).toEqual(items)
  })

  it('提示在状态合并后一直保留', () => {
    const merged = mergeStatus(createStatus(['write-failed']), createStatus([]))
    expect(merged.warning).toBe(copy.storageWarning)
    expect(merged.issues).toEqual(['write-failed'])
  })
})

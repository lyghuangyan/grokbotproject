import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { copy } from '../copy.ts'
import { formatStats } from '../statsCopy.ts'
import {
  STORAGE_KEY,
  type KeyValueStorage,
} from '../storage/todoStorage.ts'
import { useTodos } from './useTodos.ts'

function memory(initial: Record<string, string> = {}): KeyValueStorage & { read(key: string): string | null } {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    read: (key) => data.get(key) ?? null,
  }
}

describe('useTodos', () => {
  it('拒绝空、纯空白和零宽字符，trim 后置顶，200 保留，201 截断，允许重复文本', () => {
    const storage = memory()
    const { result } = renderHook(() => useTodos(storage))

    act(() => {
      expect(result.current.add('')).toBe(false)
      expect(result.current.add(' \u3000\t')).toBe(false)
      expect(result.current.add('\u200B\u200B')).toBe(false)
    })
    expect(result.current.items).toEqual([])

    act(() => {
      expect(result.current.add('  买牛奶  ')).toBe(true)
      expect(result.current.add('买牛奶')).toBe(true)
    })
    expect(result.current.items.map((item) => item.text)).toEqual(['买牛奶', '买牛奶'])
    expect(new Set(result.current.items.map((item) => item.id)).size).toBe(2)

    act(() => {
      result.current.add(`${'a'.repeat(199)}😀`)
      result.current.add('b'.repeat(200))
    })
    expect(result.current.items[0]?.text).toBe('b'.repeat(200))
    expect(result.current.items[1]?.text).toBe('a'.repeat(199))
    expect(storage.read(STORAGE_KEY)).toBe(JSON.stringify(result.current.items))
  })

  it('换行在保存前变成空格，toggle 不改顺序，remove 只删目标', () => {
    const storage = memory()
    const { result } = renderHook(() => useTodos(storage))
    act(() => {
      result.current.add('A')
      result.current.add('第一行\n第二行')
      result.current.add('C')
    })
    expect(result.current.items.map((item) => item.text)).toEqual(['C', '第一行 第二行', 'A'])
    const ids = result.current.items.map((item) => item.id)
    act(() => {
      result.current.toggle(ids[1]!)
    })
    expect(result.current.items.map((item) => item.id)).toEqual(ids)
    expect(result.current.items[1]?.completed).toBe(true)
    act(() => {
      result.current.remove(ids[1]!)
    })
    expect(result.current.items.map((item) => item.text)).toEqual(['C', 'A'])
  })

  it('写入失败后只改内存，本次会话不再写入，提示一直在', () => {
    const data = new Map<string, string>()
    let writes = 0
    const storage: KeyValueStorage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        writes += 1
        if (key === STORAGE_KEY) throw new Error('QuotaExceededError')
        data.set(key, value)
      },
      removeItem: (key) => {
        data.delete(key)
      },
    }
    const { result } = renderHook(() => useTodos(storage))
    const writesAfterLoad = writes
    act(() => {
      result.current.add('未保存')
    })
    expect(result.current.items.map((item) => item.text)).toEqual(['未保存'])
    expect(result.current.status.warning).toBe(copy.storageWarning)
    expect(data.has(STORAGE_KEY)).toBe(false)
    expect(writes).toBe(writesAfterLoad + 1)

    act(() => {
      result.current.add('第二条')
      result.current.toggle(result.current.items[0]!.id)
    })
    expect(writes).toBe(writesAfterLoad + 1)
    expect(result.current.items.map((item) => item.text)).toEqual(['第二条', '未保存'])
    expect(result.current.status.warning).toBe(copy.storageWarning)
    expect(data.has(STORAGE_KEY)).toBe(false)
  })

  it('保存时去掉零宽字符', () => {
    const storage = memory()
    const { result } = renderHook(() => useTodos(storage))
    act(() => {
      result.current.add('买\u200B牛奶')
    })
    expect(result.current.items[0]?.text).toBe('买牛奶')
  })

  it('增删改后统计文案实时变化，全部完成不拼接计数', () => {
    const { result } = renderHook(() => useTodos(memory()))
    act(() => {
      result.current.add('A')
      result.current.add('B')
    })
    expect(formatStats(result.current.items)).toMatchObject({
      wide: '剩余 2 项 · 共 2 项',
      narrow: '剩余 2 项',
    })
    act(() => {
      result.current.toggle(result.current.items[0]!.id)
      result.current.toggle(result.current.items[1]!.id)
    })
    expect(formatStats(result.current.items)).toEqual({
      visible: true,
      wide: '全部完成',
      narrow: '全部完成',
    })
    const ids = result.current.items.map((item) => item.id)
    act(() => {
      result.current.remove(ids[0]!)
      result.current.remove(ids[1]!)
    })
    expect(formatStats(result.current.items)).toEqual({ visible: false })
  })

  it('两个读取者各自保存时不抛错，id 不重复，以最后一次完整写入为准', () => {
    const shared = memory({
      [STORAGE_KEY]: JSON.stringify([{ id: 'x', text: 'X', completed: false, createdAt: 1 }]),
    })
    const first = renderHook(() => useTodos(shared))
    const second = renderHook(() => useTodos(shared))
    act(() => {
      first.result.current.remove('x')
    })
    act(() => {
      second.result.current.toggle('x')
    })
    const saved = JSON.parse(shared.read(STORAGE_KEY)!) as { id: string }[]
    expect(new Set(saved.map((item) => item.id)).size).toBe(saved.length)
    expect(saved.map((item) => item.id)).toEqual(['x'])
  })
})

import { describe, expect, it } from 'vitest'
import type { Todo } from './model.ts'
import { allDoneLabel, formatStats } from './statsCopy.ts'

function todo(id: string, completed: boolean): Todo {
  return { id, text: id, completed, createdAt: 1 }
}

describe('统计文案', () => {
  it('列表为空时不显示', () => {
    expect(formatStats([])).toEqual({ visible: false })
  })

  it('还有未完成时，桌面端带总数，窄屏只有剩余', () => {
    const stats = formatStats([todo('a', false), todo('b', false), todo('c', true)])
    expect(stats).toEqual({
      visible: true,
      wide: '剩余 2 项 · 共 3 项',
      narrow: '剩余 2 项',
    })
  })

  it('全部完成时两端都只显示「全部完成」，不拼接计数', () => {
    const stats = formatStats([todo('a', true), todo('b', true)])
    expect(stats).toEqual({
      visible: true,
      wide: allDoneLabel,
      narrow: allDoneLabel,
    })
    expect(stats).toEqual({ visible: true, wide: '全部完成', narrow: '全部完成' })
    if (stats.visible) {
      expect(stats.wide).not.toContain('·')
      expect(stats.wide).not.toContain('剩余')
      expect(stats.narrow).not.toContain('共')
    }
  })

  it('添加、勾选、删除后文案跟着变', () => {
    let items = [todo('a', false), todo('b', true)]
    expect(formatStats(items)).toMatchObject({ wide: '剩余 1 项 · 共 2 项' })

    items = [todo('c', false), ...items]
    expect(formatStats(items)).toMatchObject({ wide: '剩余 2 项 · 共 3 项', narrow: '剩余 2 项' })

    items = items.map((item) => (item.id === 'c' ? { ...item, completed: true } : item))
    expect(formatStats(items)).toMatchObject({ wide: '剩余 1 项 · 共 3 项' })

    items = items.map((item) => ({ ...item, completed: true }))
    expect(formatStats(items)).toEqual({ visible: true, wide: '全部完成', narrow: '全部完成' })

    items = items.filter((item) => item.id !== 'b')
    expect(formatStats(items)).toEqual({ visible: true, wide: '全部完成', narrow: '全部完成' })

    items = []
    expect(formatStats(items)).toEqual({ visible: false })
  })
})

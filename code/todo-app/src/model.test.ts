import { describe, expect, it } from 'vitest'
import {
  canSubmit,
  clampCodeUnits,
  clampTodoInput,
  hasLoneSurrogate,
  isBlankTodoInput,
  isTodo,
  MAX_TODO_LENGTH,
  normalizeTodoText,
} from './model.ts'

describe('输入校验', () => {
  it('空字符串、半角/全角空格、Tab、不换行空格不能提交', () => {
    for (const value of ['', '   ', '\t', '\u3000', '\u00A0', '\n\t']) {
      expect(canSubmit(value)).toBe(false)
      expect(normalizeTodoText(value)).toBeNull()
    }
  })

  it('只含零宽字符视为空', () => {
    const value = '\u200B\u200C\u200D\u2060\uFEFF'
    expect(isBlankTodoInput(value)).toBe(true)
    expect(canSubmit(value)).toBe(false)
    expect(normalizeTodoText(value)).toBeNull()
  })

  it('保存时去掉首尾空格，保留中间空格，换行变成一个空格', () => {
    expect(normalizeTodoText('  买牛奶  ')).toBe('买牛奶')
    expect(normalizeTodoText('买  牛奶')).toBe('买  牛奶')
    expect(clampTodoInput('第一行\n第二行')).toBe('第一行 第二行')
    expect(clampTodoInput('第一行\r\n第二行')).toBe('第一行 第二行')
    expect(normalizeTodoText('第一行\r第二行')).toBe('第一行 第二行')
    expect(canSubmit('  买牛奶  ')).toBe(true)
  })

  it('恰好 200 字可以提交，201 字按码元截断', () => {
    const exact = '中'.repeat(MAX_TODO_LENGTH)
    expect(normalizeTodoText(exact)).toBe(exact)
    expect(clampTodoInput('中'.repeat(201))).toBe('中'.repeat(200))
    expect(normalizeTodoText(`  ${'中'.repeat(201)}  `)?.length).toBeLessThanOrEqual(200)
  })

  it('截断落在 emoji 代理对中间时丢掉整个字符', () => {
    const value = `${'a'.repeat(199)}😀`
    expect(value).toHaveLength(201)
    const clamped = clampTodoInput(value)
    expect(clamped).toBe('a'.repeat(199))
    expect(hasLoneSurrogate(clamped)).toBe(false)
    expect(clampCodeUnits('😀', 1)).toBe('')
    expect(hasLoneSurrogate(`${'a'.repeat(198)}😀`)).toBe(false)
    expect(clampTodoInput(`${'a'.repeat(198)}😀`)).toBe(`${'a'.repeat(198)}😀`)
  })

  it('合法元素按 PRD 6.3 判定，不修正类型', () => {
    expect(isTodo({ id: '1', text: '  a', completed: false, createdAt: 1 })).toBe(true)
    expect(isTodo({ id: '1', text: '', completed: false, createdAt: 1 })).toBe(false)
    expect(isTodo({ id: '1', text: 'a'.repeat(201), completed: false, createdAt: 1 })).toBe(false)
    expect(isTodo({ id: '', text: 'a', completed: false, createdAt: 1 })).toBe(false)
    expect(isTodo({ id: '1', text: 'a', completed: 'no', createdAt: 1 })).toBe(false)
    expect(isTodo({ id: '1', text: 'a', completed: false, createdAt: Number.NaN })).toBe(false)
    expect(isTodo({ id: '1', text: '\u200B\u200B', completed: false, createdAt: 1 })).toBe(false)
    expect(isTodo({ id: '1', text: 'a\u200Bb', completed: false, createdAt: 1, extra: 1 })).toBe(true)
    expect(isTodo(null)).toBe(false)
    expect(normalizeTodoText('买\u200B牛奶')).toBe('买牛奶')
  })
})

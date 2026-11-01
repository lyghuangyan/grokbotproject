import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { copy } from './copy.ts'
import type { Todo } from './model.ts'
import { STORAGE_BACKUP_KEY, STORAGE_KEY, STORAGE_PROBE_KEY } from './storage/todoStorage.ts'
import { installMatchMedia } from './test/matchMedia.ts'

function todo(id: string, text: string, completed = false, createdAt = 1): Todo {
  return { id, text, completed, createdAt }
}

function seed(value: Todo[] | string) {
  localStorage.setItem(STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value))
}

function input() {
  return screen.getByRole('textbox', { name: copy.inputLabel })
}

function addButton() {
  return screen.getByRole('button', { name: copy.add })
}

function texts() {
  return screen.queryAllByRole('listitem').map((item) => item.querySelector('.todo-text')?.textContent ?? '')
}

function statsNode() {
  const node = document.querySelector('[aria-live="polite"]')
  if (!(node instanceof HTMLElement)) throw new Error('缺少统计容器')
  return node
}

function row(text: string, index = 0) {
  const item = screen.getAllByText(text)[index]?.closest('li')
  if (!item) throw new Error(`找不到待办 ${text}`)
  return item
}

function deleteButton(text: string, index = 0) {
  return within(row(text, index)).getByRole('button', { name: copy.deleteLabel })
}

function checkbox(text: string, index = 0) {
  return within(row(text, index)).getByRole('checkbox')
}

describe('待办页面', () => {
  it('AC-01-1 按存储数组顺序显示已有待办', () => {
    seed([todo('a', 'A', false, 1), todo('b', 'B', true, 50), todo('c', 'C', false, 3)])
    render(<App />)
    expect(texts()).toEqual(['A', 'B', 'C'])
    expect(checkbox('B')).toBeChecked()
    expect(checkbox('A')).not.toBeChecked()
  })

  it('AC-01-2 没有数据、空数组、空字符串都显示空状态且不显示统计', () => {
    const { unmount } = render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(statsNode()).not.toBeVisible()
    unmount()

    seed([])
    const second = render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    second.unmount()

    localStorage.setItem(STORAGE_KEY, '')
    render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(statsNode().textContent).toBe('')
  })

  it('AC-01-3 非法 JSON 备份后重置，不提示、不报错', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed('{abc')
    render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBe('{abc')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]')
    expect(localStorage.getItem(STORAGE_PROBE_KEY)).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('AC-01-4 已完成项有删除线且位置不变', () => {
    seed([todo('a', '未完成'), todo('b', '已完成', true)])
    render(<App />)
    expect(checkbox('已完成')).toBeChecked()
    expect(row('已完成').querySelector('.todo-text')).toHaveClass('line-through', 'text-muted-foreground')
    expect(texts()).toEqual(['未完成', '已完成'])
  })

  it('AC-01-5 非数组值都会备份并重置', () => {
    for (const raw of ['{}', '"str"', '123', 'null', 'true']) {
      localStorage.clear()
      seed(raw)
      const view = render(<App />)
      expect(screen.getByText(copy.empty)).toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
      expect(localStorage.getItem(STORAGE_KEY)).toBe('[]')
      view.unmount()
    }
  })

  it('AC-01-6 部分不合法元素被丢弃，合法项保持顺序', () => {
    const raw = JSON.stringify([
      todo('a', 'A'),
      null,
      todo('b', 'B'),
      { id: 'x', text: '', completed: false, createdAt: 1 },
    ])
    seed(raw)
    render(<App />)
    expect(texts()).toEqual(['A', 'B'])
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).map((item: Todo) => item.id)).toEqual(['a', 'b'])
  })

  it('AC-01-7 id 重复只保留第一条，后续操作只影响它', async () => {
    const user = userEvent.setup()
    const raw = JSON.stringify([todo('same', 'X'), todo('same', 'Y', true, 2)])
    seed(raw)
    render(<App />)
    expect(texts()).toEqual(['X'])
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
    await user.click(checkbox('X'))
    expect(checkbox('X')).toBeChecked()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      expect.objectContaining({ id: 'same', text: 'X', completed: true }),
    ])
  })

  it('AC-01-8 存储里的 HTML 按纯文本显示', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const text = '<img src=x onerror=alert(1)>'
    seed([todo('img', text)])
    render(<App />)
    expect(screen.getByText(text).tagName).toBe('SPAN')
    expect(document.querySelector('img')).toBeNull()
    await user.click(checkbox(text))
    await user.click(deleteButton(text))
    expect(alertSpy).not.toHaveBeenCalled()
    expect(document.querySelector('img')).toBeNull()
  })

  it('AC-01-9 createdAt 更早的条目仍按数组顺序排在前面', () => {
    seed([todo('old', '较早', false, 1), todo('new', '较新', false, 100)])
    render(<App />)
    expect(texts()).toEqual(['较早', '较新'])
  })

  it('AC-02-1 点击添加后置顶、清空并保持焦点', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(), '回复客户邮件')
    await user.click(addButton())
    expect(texts()).toEqual(['回复客户邮件'])
    expect(checkbox('回复客户邮件')).not.toBeChecked()
    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
  })

  it('AC-02-2 回车添加与按钮效果一致', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(), '写周报{Enter}')
    expect(texts()).toEqual(['写周报'])
    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
  })

  it('AC-02-3 空输入时按钮禁用，点击和回车都不新增', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(addButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(addButton())
    fireEvent.submit(input().closest('form')!)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('AC-02-4 纯空白不能添加，也不清空输入框', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const value of ['   ', '\u3000', '\t', '\u00A0']) {
      fireEvent.change(input(), { target: { value } })
      expect(addButton()).toHaveAttribute('aria-disabled', 'true')
      fireEvent.submit(input().closest('form')!)
      expect(input()).toHaveValue(value)
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    }
    await user.click(addButton())
    expect(texts()).toEqual([])
  })

  it('AC-02-5 保存时去掉首尾空格并保留中间空格', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(), '  买牛奶  ')
    fireEvent.submit(input().closest('form')!)
    expect(texts()).toEqual(['买牛奶'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].text).toBe('买牛奶')
    await user.type(input(), '买  牛奶{Enter}')
    expect(texts()[0]).toBe('买  牛奶')
  })

  it('AC-02-6 输入和粘贴都截断到 200', () => {
    render(<App />)
    fireEvent.change(input(), { target: { value: '中'.repeat(230) } })
    expect(input()).toHaveValue('中'.repeat(200))
    fireEvent.submit(input().closest('form')!)
    expect(texts()[0]).toHaveLength(200)
  })

  it('AC-02-7 新待办放在最上面', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B')])
    render(<App />)
    await user.type(input(), 'C{Enter}')
    expect(texts()).toEqual(['C', 'A', 'B'])
  })

  it('AC-02-8 刷新后添加的待办还在', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await user.type(input(), '写周报{Enter}')
    view.unmount()
    render(<App />)
    expect(texts()).toEqual(['写周报'])
    expect(checkbox('写周报')).not.toBeChecked()
  })

  it('AC-02-9 只有零宽字符时按钮禁用', () => {
    render(<App />)
    fireEvent.change(input(), { target: { value: '\u200B\u200B' } })
    expect(addButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.submit(input().closest('form')!)
    expect(texts()).toEqual([])
    expect(input()).toHaveValue('\u200B\u200B')
  })

  it('AC-02-10 粘贴的换行会变成空格', () => {
    render(<App />)
    fireEvent.paste(input(), {
      clipboardData: {
        getData: () => '第一行\n第二行',
      },
    })
    expect(input()).toHaveValue('第一行 第二行')
    fireEvent.submit(input().closest('form')!)
    expect(texts()).toEqual(['第一行 第二行'])
    expect(texts()[0]).not.toContain('\n')
  })

  it('AC-02-11 199 个字符后再输入 emoji 会被整段丢掉', () => {
    render(<App />)
    fireEvent.change(input(), { target: { value: `${'a'.repeat(199)}😀` } })
    expect(input()).toHaveValue('a'.repeat(199))
    expect((input() as HTMLInputElement).value).not.toContain('\uFFFD')
    fireEvent.submit(input().closest('form')!)
    expect(texts()[0]).toBe('a'.repeat(199))
  })

  it('AC-02-12 组字中的 Enter 不提交，下一次 Enter 才添加', () => {
    render(<App />)
    fireEvent.change(input(), { target: { value: 'xiezhoubao' } })
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 })
    fireEvent.submit(input().closest('form')!)
    expect(texts()).toEqual([])
    expect(input()).toHaveValue('xiezhoubao')
    fireEvent.keyUp(input(), { key: 'Enter', keyCode: 229 })
    fireEvent.change(input(), { target: { value: '写周报' } })
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 13 })
    fireEvent.submit(input().closest('form')!)
    expect(texts()).toEqual(['写周报'])
  })

  it('AC-02-13 连点、连按和同时触发只新增一条', () => {
    render(<App />)
    fireEvent.change(input(), { target: { value: 'A' } })
    const form = input().closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.click(addButton())
    expect(texts()).toEqual(['A'])
    expect(new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)!).map((item: Todo) => item.id)).size).toBe(1)
  })

  it('AC-02-14 用户输入的 HTML 刷新后仍是纯文本', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const payloads = ['<script>alert(1)</script>', '"><svg onload=alert(1)>', '<b>粗体</b>', '&lt;tag&gt;']
    const view = render(<App />)
    for (const payload of payloads) {
      await user.type(input(), `${payload}{Enter}`)
    }
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('svg[onload]')).toBeNull()
    expect(screen.getByText('<b>粗体</b>').tagName).toBe('SPAN')
    expect(screen.getByText('&lt;tag&gt;')).toBeInTheDocument()
    view.unmount()
    render(<App />)
    for (const payload of payloads) expect(screen.getByText(payload)).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('svg[onload]')).toBeNull()
    expect(document.body.innerHTML).not.toContain('<b>')
  })

  it('AC-02-15 允许文本相同的两条待办', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(), '写周报{Enter}')
    await user.type(input(), '写周报{Enter}')
    expect(texts()).toEqual(['写周报', '写周报'])
    const boxes = screen.getAllByRole('checkbox', { name: '写周报' })
    expect(boxes).toHaveLength(2)
    await user.click(boxes[0]!)
    expect(boxes[0]).toBeChecked()
    expect(boxes[1]).not.toBeChecked()
    await user.click(deleteButton('写周报', 0))
    expect(texts()).toEqual(['写周报'])
  })

  it('AC-03-1 / AC-03-2 勾选和取消勾选会切换删除线', async () => {
    const user = userEvent.setup()
    seed([todo('a', '任务')])
    render(<App />)
    await user.click(checkbox('任务'))
    expect(checkbox('任务')).toBeChecked()
    expect(row('任务').querySelector('.todo-text')).toHaveClass('line-through')
    await user.click(checkbox('任务'))
    expect(checkbox('任务')).not.toBeChecked()
    expect(row('任务').querySelector('.todo-text')).not.toHaveClass('line-through')
  })

  it('AC-03-3 勾选后顺序不变', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C')])
    render(<App />)
    await user.click(checkbox('B'))
    expect(texts()).toEqual(['A', 'B', 'C'])
  })

  it('AC-03-4 刷新后完成状态还在', async () => {
    const user = userEvent.setup()
    seed([todo('a', '任务')])
    const view = render(<App />)
    await user.click(checkbox('任务'))
    view.unmount()
    render(<App />)
    expect(checkbox('任务')).toBeChecked()
  })

  it('AC-03-5 空格切换勾选，Enter 不切换', async () => {
    const user = userEvent.setup()
    seed([todo('a', '任务')])
    render(<App />)
    checkbox('任务').focus()
    expect(row('任务').querySelector('[aria-hidden="true"]')).toHaveClass('peer-focus-visible:ring-2')
    await user.keyboard('{Enter}')
    expect(checkbox('任务')).not.toBeChecked()
    await user.keyboard(' ')
    expect(checkbox('任务')).toBeChecked()
  })

  it('AC-03-6 点击文本也能切换', async () => {
    const user = userEvent.setup()
    seed([todo('a', '任务')])
    render(<App />)
    await user.click(screen.getByText('任务'))
    expect(checkbox('任务')).toBeChecked()
    await user.click(screen.getByText('任务'))
    expect(checkbox('任务')).not.toBeChecked()
  })

  it('AC-04-1 删除中间项不确认，只影响这一条', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true)
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C')])
    render(<App />)
    await user.click(deleteButton('B'))
    expect(texts()).toEqual(['A', 'C'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('AC-04-2 删光后显示空状态并写入空数组', async () => {
    const user = userEvent.setup()
    seed([todo('a', '只剩一条')])
    render(<App />)
    await user.click(deleteButton('只剩一条'))
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]')
  })

  it('AC-04-3 刷新后被删除的待办不再出现', async () => {
    const user = userEvent.setup()
    seed([todo('a', '留下'), todo('b', '删掉')])
    const view = render(<App />)
    await user.click(deleteButton('删掉'))
    view.unmount()
    render(<App />)
    expect(texts()).toEqual(['留下'])
  })

  it('AC-04-4 删除已完成项不影响其余条目', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B', true), todo('c', 'C')])
    render(<App />)
    await user.click(deleteButton('B'))
    expect(texts()).toEqual(['A', 'C'])
    expect(checkbox('A')).not.toBeChecked()
    expect(checkbox('C')).not.toBeChecked()
  })

  it('AC-04-5 焦点在删除按钮上时 Enter 或空格都能删除', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B')])
    render(<App />)
    await user.type(input(), 'x')
    input().focus()
    await user.tab()
    expect(addButton()).toHaveFocus()
    await user.tab()
    expect(checkbox('A')).toHaveFocus()
    await user.tab()
    expect(deleteButton('A')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(texts()).toEqual(['B'])
    deleteButton('B').focus()
    await user.keyboard(' ')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('AC-01-10 纯零宽文本不合法并备份', () => {
    const raw = JSON.stringify([todo('a', 'A'), { id: 'z', text: '\u200B', completed: false, createdAt: 2 }])
    seed(raw)
    render(<App />)
    expect(texts()).toEqual(['A'])
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([todo('a', 'A')])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('AC-01-11 多余字段和首尾空格不触发修复，下次写入才变成标准结构', async () => {
    const user = userEvent.setup()
    const raw = '[{"id":"a","text":" a ","completed":false,"createdAt":1,"extra":1}]'
    seed(raw)
    render(<App />)
    expect(texts()).toEqual(['a'])
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
    await user.click(checkbox('a'))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved).toEqual([{ id: 'a', text: 'a', completed: true, createdAt: 1 }])
  })

  it('AC-01-12 先丢掉不合法项，再保留后面的同 id', () => {
    const raw = JSON.stringify([
      { id: 'x', text: '', completed: false, createdAt: 1 },
      { id: 'x', text: 'Y', completed: false, createdAt: 2 },
    ])
    seed(raw)
    render(<App />)
    expect(texts()).toEqual(['Y'])
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBe(raw)
  })

  it('AC-02-16 保存时去掉零宽字符', async () => {
    const user = userEvent.setup()
    render(<App />)
    fireEvent.change(input(), { target: { value: '\u200B买菜\u200B' } })
    await user.click(addButton())
    expect(texts()).toEqual(['买菜'])
    expect(texts()[0]).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].text).toBe('买菜')
  })

  it('AC-04-7 鼠标删除后焦点移到下一条', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C')])
    render(<App />)
    await user.click(deleteButton('B'))
    expect(texts()).toEqual(['A', 'C'])
    expect(document.activeElement).toBe(deleteButton('C'))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('AC-04-6 删除后焦点移到下一条、上一条，删空后回到输入框', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C')])
    render(<App />)
    deleteButton('B').focus()
    await user.keyboard('{Enter}')
    expect(texts()).toEqual(['A', 'C'])
    expect(document.activeElement).toBe(deleteButton('C'))
    await user.keyboard('{Enter}')
    expect(texts()).toEqual(['A'])
    expect(document.activeElement).toBe(deleteButton('A'))
    await user.keyboard(' ')
    expect(document.activeElement).toBe(input())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('AC-05-1 页面底部有本地存储说明', () => {
    render(<App />)
    expect(screen.getByText(copy.storageNote)).toBeInTheDocument()
  })

  it('提示条文案与 PRD v1.3 一致', () => {
    expect(copy.storageWarning).toBe('当前无法保存到本地，本次的修改不会被保存，关闭或刷新页面后将丢失。')
  })

  it('AC-05-2 加载时读存储失败会显示提示条和空状态', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('disabled')
    })
    render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(copy.storageWarning)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('AC-05-3 写入失败时操作仍生效，统计正确，只显示一条提示', async () => {
    const user = userEvent.setup()
    seed([todo('a', '已有', true), todo('b', '未完成')])
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    render(<App />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.type(input(), '新的{Enter}')
    expect(texts()).toEqual(['新的', '已有', '未完成'])
    expect(screen.getByRole('status')).toHaveTextContent(copy.storageWarning)
    expect(statsNode()).toHaveTextContent('剩余 2 项 · 共 3 项')
    await user.click(checkbox('未完成'))
    expect(checkbox('未完成')).toBeChecked()
    expect(statsNode()).toHaveTextContent('剩余 1 项 · 共 3 项')
    await user.click(deleteButton('已有'))
    expect(texts()).toEqual(['新的', '未完成'])
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('AC-05-4 写入失败后本次会话停止写入，刷新后重新尝试', async () => {
    const user = userEvent.setup()
    const setItem = Storage.prototype.setItem
    let writes = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      writes += 1
      if (key === STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    const view = render(<App />)
    const writesAfterLoad = writes
    await user.type(input(), '未保存{Enter}')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(texts()).toEqual(['未保存'])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    const writesAfterFailure = writes
    expect(writesAfterFailure).toBeGreaterThan(writesAfterLoad)
    await user.type(input(), '第二条{Enter}')
    await user.click(checkbox('未保存'))
    expect(texts()).toEqual(['第二条', '未保存'])
    expect(checkbox('未保存')).toBeChecked()
    expect(writes).toBe(writesAfterFailure)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    view.unmount()
    vi.restoreAllMocks()
    render(<App />)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.type(input(), '重新保存{Enter}')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).map((item: Todo) => item.text)).toEqual(['重新保存'])
  })

  it('AC-05-5 可读但不可写时显示原数据，添加不写回', async () => {
    const user = userEvent.setup()
    const original = [todo('a', 'A'), todo('b', 'B'), todo('c', 'C', true)]
    seed(original)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    render(<App />)
    expect(texts()).toEqual(['A', 'B', 'C'])
    expect(screen.getByRole('status')).toHaveTextContent(copy.storageWarning)
    await user.type(input(), '新的{Enter}')
    expect(texts()).toEqual(['新的', 'A', 'B', 'C'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(original)
    expect(localStorage.getItem(STORAGE_PROBE_KEY)).toBeNull()
  })

  it('AC-05-6 备份失败时保留原文，只在内存里改', async () => {
    const user = userEvent.setup()
    const raw = JSON.stringify([todo('a', 'A'), null])
    seed(raw)
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === STORAGE_BACKUP_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    render(<App />)
    expect(texts()).toEqual(['A'])
    expect(screen.getByRole('status')).toHaveTextContent(copy.storageWarning)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(localStorage.getItem(STORAGE_BACKUP_KEY)).toBeNull()
    await user.click(checkbox('A'))
    expect(checkbox('A')).toBeChecked()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })

  it('AC-05-7 损坏数据备份失败时显示空状态且不覆盖原文', () => {
    seed('{abc')
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === STORAGE_BACKUP_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(copy.storageWarning)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{abc')
  })

  it('AC-05-8 探测键不残留', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(), '一条{Enter}')
    expect(Object.keys(localStorage)).toEqual([STORAGE_KEY])
    localStorage.setItem(STORAGE_KEY, '{')
    const view = render(<App />)
    view.unmount()
    const keys = Object.keys(localStorage).sort()
    expect(keys).toEqual([STORAGE_BACKUP_KEY, STORAGE_KEY].sort())
    expect(keys).not.toContain(STORAGE_PROBE_KEY)
  })

  it('AC-06-1 / AC-06-7 桌面统计，刷新后保持', () => {
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C', true)])
    const view = render(<App />)
    expect(statsNode()).toHaveTextContent('剩余 2 项 · 共 3 项')
    view.unmount()
    render(<App />)
    expect(statsNode()).toHaveTextContent('剩余 2 项 · 共 3 项')
  })

  it('AC-06-2 勾选和取消会立刻改统计', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C', true)])
    render(<App />)
    await user.click(checkbox('A'))
    expect(statsNode()).toHaveTextContent('剩余 1 项 · 共 3 项')
    await user.click(checkbox('A'))
    expect(statsNode()).toHaveTextContent('剩余 2 项 · 共 3 项')
  })

  it('AC-06-3 添加后统计立刻增加，空列表添加第一条也会出现', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B', true), todo('c', 'C', true)])
    render(<App />)
    expect(statsNode()).toHaveTextContent('剩余 1 项 · 共 3 项')
    await user.type(input(), '新的{Enter}')
    expect(statsNode()).toHaveTextContent('剩余 2 项 · 共 4 项')
  })

  it('AC-06-3 从空列表添加第一条时出现统计', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(statsNode()).not.toBeVisible()
    await user.type(input(), '第一条{Enter}')
    expect(statsNode()).toHaveTextContent('剩余 1 项 · 共 1 项')
  })

  it('AC-06-4 删除已完成项后总数减少、剩余不变', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C', true)])
    render(<App />)
    await user.click(deleteButton('C'))
    expect(statsNode()).toHaveTextContent('剩余 2 项 · 共 2 项')
  })

  it('AC-06-5 删空后统计节点还在，但不可见且没有残留数字', async () => {
    const user = userEvent.setup()
    seed([todo('a', '只剩一条')])
    render(<App />)
    const node = statsNode()
    await user.click(deleteButton('只剩一条'))
    expect(statsNode()).toBe(node)
    expect(node).toHaveAttribute('hidden')
    expect(node.textContent).toBe('')
    expect(node).not.toBeVisible()
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
  })

  it('AC-06-6 全部完成时两种宽度都只显示「全部完成」', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia(false)
    seed([todo('a', 'A', true), todo('b', 'B')])
    render(<App />)
    await user.click(checkbox('B'))
    expect(statsNode().textContent).toBe('全部完成')
    act(() => media.emit(true))
    expect(statsNode().textContent).toBe('全部完成')
    await user.click(checkbox('B'))
    expect(statsNode().textContent).toBe('剩余 1 项')
    act(() => media.emit(false))
    expect(statsNode().textContent).toBe('剩余 1 项 · 共 2 项')
  })

  it('AC-06-8 窄屏只显示剩余，拉到 481px 以上立刻补上总数', () => {
    const media = installMatchMedia(true)
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C', true)])
    render(<App />)
    expect(statsNode().textContent).toBe('剩余 2 项')
    expect(statsNode().textContent).not.toContain('共')
    act(() => media.emit(false))
    expect(statsNode().textContent).toBe('剩余 2 项 · 共 3 项')
  })

  it('AC-07-1 Tab 依次经过输入框、添加按钮、勾选框和删除按钮', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B'), todo('c', 'C')])
    render(<App />)
    await user.type(input(), 'x')
    input().focus()
    await user.tab()
    expect(addButton()).toHaveFocus()
    expect(addButton().className).toContain('focus-visible:ring-2')
    await user.tab()
    expect(checkbox('A')).toHaveFocus()
    await user.tab()
    expect(deleteButton('A')).toHaveFocus()
    await user.tab()
    expect(checkbox('B')).toHaveFocus()
    await user.tab()
    expect(deleteButton('B')).toHaveFocus()
  })

  it('AC-07-2 可访问名称、列表语义，以及没有严重的 axe 问题', async () => {
    installMatchMedia(true)
    seed([todo('a', 'A', true)])
    const { container } = render(<App />)
    expect(input()).toHaveAccessibleName('新待办')
    expect(deleteButton('A')).toHaveAccessibleName('删除待办')
    expect(addButton()).toHaveAccessibleName('添加')
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toBeInTheDocument()
    expect(statsNode()).toHaveAttribute('aria-live', 'polite')
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    const serious = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    )
    expect(serious).toEqual([])
  })

  it('AC-07-3 统计容器不重建，删空后不留下数字', async () => {
    const user = userEvent.setup()
    seed([todo('a', 'A'), todo('b', 'B', true)])
    render(<App />)
    const node = statsNode()
    expect(node).toHaveAttribute('aria-live', 'polite')
    await user.click(checkbox('A'))
    expect(statsNode()).toBe(node)
    expect(node.textContent).toBe('全部完成')
    await user.type(input(), '新的{Enter}')
    expect(statsNode()).toBe(node)
    await user.click(deleteButton('A'))
    await user.click(deleteButton('B'))
    await user.click(deleteButton('新的'))
    expect(statsNode()).toBe(node)
    expect(node.textContent).toBe('')
  })

  it('AC-07-4 只用键盘也能添加、完成和删除', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(input(), '键盘{Enter}')
    expect(texts()).toEqual(['键盘'])
    input().focus()
    await user.tab()
    await user.tab()
    expect(checkbox('键盘')).toHaveFocus()
    await user.keyboard(' ')
    expect(checkbox('键盘')).toBeChecked()
    await user.tab()
    expect(deleteButton('键盘')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(document.activeElement).toBe(input())
  })

  it('AC-08-6 增删改、空状态和损坏数据都不往控制台打 error', async () => {
    const user = userEvent.setup()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed('{')
    const broken = render(<App />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    broken.unmount()
    localStorage.clear()
    const view = render(<App />)
    await user.type(input(), '一条{Enter}')
    await user.click(checkbox('一条'))
    await user.click(deleteButton('一条'))
    view.unmount()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('disabled')
    })
    render(<App />)
    expect(error).not.toHaveBeenCalled()
  })

  it('AC-08-7 没有编辑、拖拽、筛选、标签、日期或登录入口', async () => {
    const user = userEvent.setup()
    seed([todo('a', '任务')])
    render(<App />)
    await user.dblClick(screen.getByText('任务'))
    expect(screen.queryByRole('textbox', { name: '编辑' })).not.toBeInTheDocument()
    expect(texts()).toEqual(['任务'])
    expect(row('任务')).not.toHaveAttribute('draggable', 'true')
    expect(document.body.textContent).not.toMatch(/筛选|标签|截止日期|登录/)
  })

  it('添加、切换、删除用 performance.measure 记到下一帧', async () => {
    const user = userEvent.setup()
    seed([todo('a', '已有')])
    render(<App />)
    await user.type(input(), '计时{Enter}')
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(performance.getEntriesByName('list-rendered').length).toBeGreaterThan(0)
    expect(performance.getEntriesByName('op').length).toBeGreaterThan(0)
    expect(performance.getEntriesByName('op')[0]?.duration).toBeGreaterThanOrEqual(0)
    await user.click(checkbox('计时'))
    await user.click(deleteButton('已有'))
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(performance.getEntriesByName('op').length).toBeGreaterThanOrEqual(3)
  })

  it('500 条待办可以渲染、切换和删除', async () => {
    const items = Array.from({ length: 500 }, (_, index) =>
      todo(`id-${index}`, `事项${index}`, index === 10, 500 - index),
    )
    seed(items)
    render(<App />)
    expect(screen.getAllByRole('listitem')).toHaveLength(500)
    expect(statsNode()).toHaveTextContent('剩余 499 项 · 共 500 项')
    const user = userEvent.setup()
    await user.click(checkbox('事项0'))
    expect(checkbox('事项0')).toBeChecked()
    await user.click(deleteButton('事项250'))
    expect(screen.getAllByRole('listitem')).toHaveLength(499)
    expect(statsNode()).toHaveTextContent('剩余 497 项 · 共 499 项')
  })
})

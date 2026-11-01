import { useCallback, useRef, useState } from 'react'
import { createTodoId, nextCreatedAt, normalizeTodoText, type Todo } from '../model.ts'
import {
  loadTodos,
  mergeStatus,
  safeLocalStorage,
  saveTodos,
  type KeyValueStorage,
  type StorageStatus,
} from '../storage/todoStorage.ts'

type TodoModel = {
  items: Todo[]
  status: StorageStatus
  storage: KeyValueStorage | null
  /** 加载失败或本次会话任一次写入失败后，不再碰存储。 */
  canPersist: boolean
}

export function useTodos(storage?: KeyValueStorage | null) {
  const [model, setModel] = useState<TodoModel>(() => {
    const resolved = storage === undefined ? safeLocalStorage() : storage
    const loaded = loadTodos(resolved)
    return {
      items: loaded.items,
      status: loaded.status,
      storage: resolved,
      canPersist: loaded.status.warning === null,
    }
  })
  const modelRef = useRef(model)

  const commit = useCallback((items: Todo[]) => {
    const current = modelRef.current
    if (!current.canPersist) {
      const next = { ...current, items }
      modelRef.current = next
      setModel(next)
      return
    }
    const saved = saveTodos(items, current.storage)
    const next: TodoModel = {
      ...current,
      items,
      status: mergeStatus(current.status, saved.status),
      canPersist: saved.status.warning === null,
    }
    modelRef.current = next
    setModel(next)
  }, [])

  const add = useCallback(
    (raw: string) => {
      const text = normalizeTodoText(raw)
      if (!text) return false
      const items = [
        { id: createTodoId(), text, completed: false, createdAt: nextCreatedAt() },
        ...modelRef.current.items,
      ]
      commit(items)
      return true
    },
    [commit],
  )

  const toggle = useCallback(
    (id: string) => {
      const current = modelRef.current.items
      if (!current.some((item) => item.id === id)) return
      commit(
        current.map((item) =>
          item.id === id
            ? { id: item.id, text: item.text, completed: !item.completed, createdAt: item.createdAt }
            : item,
        ),
      )
    },
    [commit],
  )

  const remove = useCallback(
    (id: string) => {
      const current = modelRef.current.items
      if (!current.some((item) => item.id === id)) return
      commit(current.filter((item) => item.id !== id))
    },
    [commit],
  )

  return { items: model.items, status: model.status, add, toggle, remove }
}

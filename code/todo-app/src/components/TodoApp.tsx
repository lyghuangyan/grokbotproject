import {
  memo,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { AlertTriangle, Check, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { copy } from '../copy.ts'
import { useTodos } from '../hooks/useTodos.ts'
import { canSubmit, clampTodoInput, type Todo } from '../model.ts'
import { markListRenderedOnNextFrame, markOperationEndOnNextFrame, markOperationStart } from '../perf.ts'
import { formatStats } from '../statsCopy.ts'

const NARROW_QUERY = '(max-width: 480px)'

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(readNarrow)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(NARROW_QUERY)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return narrow
}

function readNarrow() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(NARROW_QUERY).matches
}

function deleteDomId(id: string) {
  return `todo-delete-${id}`
}

export function TodoApp() {
  const { items, status, add, toggle, remove } = useTodos()
  const [draft, setDraft] = useState('')
  const measuredLoad = useRef(false)
  const draftRef = useRef(draft)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipSubmitRef = useRef(false)
  const submitEnabled = canSubmit(draft)

  useEffect(() => {
    if (measuredLoad.current) return
    measuredLoad.current = true
    markListRenderedOnNextFrame()
  }, [])

  function updateDraft(value: string) {
    const next = clampTodoInput(value)
    draftRef.current = next
    setDraft(next)
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text')
    if (!/[\r\n]/.test(pasted)) return
    event.preventDefault()
    const start = event.currentTarget.selectionStart ?? draftRef.current.length
    const end = event.currentTarget.selectionEnd ?? start
    updateDraft(draftRef.current.slice(0, start) + pasted + draftRef.current.slice(end))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    const native = event.nativeEvent
    if (native.isComposing || native.keyCode === 229) skipSubmitRef.current = true
  }

  function onKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') skipSubmitRef.current = false
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (skipSubmitRef.current) {
      skipSubmitRef.current = false
      return
    }
    const raw = draftRef.current
    if (!canSubmit(raw)) return
    draftRef.current = ''
    setDraft('')
    markOperationStart()
    add(raw)
    markOperationEndOnNextFrame()
    inputRef.current?.focus()
  }

  function onToggle(id: string) {
    markOperationStart()
    toggle(id)
    markOperationEndOnNextFrame()
  }

  function onRemove(id: string) {
    const index = items.findIndex((item) => item.id === id)
    const remaining = items.filter((item) => item.id !== id)
    markOperationStart()
    remove(id)
    markOperationEndOnNextFrame()
    const target =
      remaining.length === 0
        ? inputRef.current
        : document.getElementById(
            deleteDomId(remaining[index < remaining.length ? index : remaining.length - 1]!.id),
          )
    if (target instanceof HTMLElement) target.focus()
    else inputRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-muted px-4 pt-6 text-foreground min-[481px]:px-6 lg:pt-24">
      <div className="mx-auto w-full min-w-0 max-w-xl">
        <main className="min-w-0 rounded-xl border border-border bg-background p-4 shadow-sm max-[480px]:shadow-none lg:p-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{copy.title}</h1>
          <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              aria-label={copy.inputLabel}
              placeholder={copy.placeholder}
              maxLength={200}
              value={draft}
              autoComplete="off"
              onChange={(event) => updateDraft(event.target.value)}
              onPaste={onPaste}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-[481px]:h-10 lg:text-sm"
            />
            <button
              type="submit"
              aria-label={copy.add}
              aria-disabled={!submitEnabled}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors duration-150 ease-out hover:bg-primary/90 active:bg-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 min-[481px]:h-10 min-[481px]:w-auto min-[481px]:px-3"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="max-[480px]:sr-only">{copy.add}</span>
            </button>
          </form>

          {status.warning ? (
            <div
              role="status"
              className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{status.warning}</p>
            </div>
          ) : null}

          <div className="mt-4 min-w-0">
            {items.length === 0 ? (
              <EmptyState />
            ) : (
              <ul aria-label={copy.listLabel}>
                {items.map((item) => (
                  <TodoItem key={item.id} item={item} onToggle={onToggle} onRemove={onRemove} />
                ))}
              </ul>
            )}
          </div>
          <StatsLine items={items} />
        </main>
        <p className="mt-4 text-center text-xs text-muted-foreground">{copy.storageNote}</p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-3 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <ClipboardList className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{copy.empty}</p>
    </div>
  )
}

const TodoItem = memo(function TodoItem({
  item,
  onToggle,
  onRemove,
}: {
  item: Todo
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <li className="todo-enter group flex min-h-[52px] min-w-0 items-start gap-3 border-b border-border px-2 py-3 transition-colors duration-150 ease-out last:border-b-0 hover:rounded-md hover:bg-muted/60 focus-within:rounded-md focus-within:bg-muted/60 min-[481px]:min-h-11 min-[481px]:px-3 min-[481px]:py-2.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={item.completed}
          onChange={() => onToggle(item.id)}
        />
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm border border-primary text-transparent peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        <span
          className={`todo-text min-w-0 flex-1 text-base leading-6 break-words [overflow-wrap:anywhere] lg:text-sm lg:leading-5 ${
            item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {item.text}
        </span>
      </label>
      <button
        type="button"
        id={deleteDomId(item.id)}
        aria-label={copy.deleteLabel}
        onClick={() => onRemove(item.id)}
        className="delete-btn mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity duration-150 ease-out hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-[481px]:h-8 min-[481px]:w-8 lg:w-8 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
})

function StatsLine({ items }: { items: readonly Todo[] }) {
  const narrow = useNarrowViewport()
  const stats = formatStats(items)
  const text = stats.visible ? (narrow ? stats.narrow : stats.wide) : ''
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      hidden={text === ''}
      className={
        text === '' ? undefined : 'mt-3 border-t border-border pt-3 text-[13px] text-muted-foreground'
      }
    >
      {text}
    </p>
  )
}

import { reactive } from 'vue'

export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: number
}

export type Filter = 'all' | 'active' | 'done'

export interface UndoEntry {
  todo: Todo
  /** Position of the todo in the list right before it was removed. */
  index: number
}

export interface TodoStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const STORAGE_KEY = 'todo-h5.items'

interface TodoState {
  items: Todo[]
  undo: UndoEntry[] | null
  filter: Filter
}

function uid(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.done === 'boolean' &&
    typeof record.createdAt === 'number'
  )
}

function loadTodos(storage: TodoStorage | null): Todo[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isTodo)) return []
    return parsed
  } catch {
    // Missing, unreadable or corrupted storage: fall back to an empty list.
    return []
  }
}

function persistTodos(storage: TodoStorage | null, items: Todo[]): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage unavailable or full: keep the in-memory state only.
  }
}

export class TodoStore {
  readonly state: TodoState

  constructor(private readonly storage: TodoStorage | null) {
    this.state = reactive({
      items: loadTodos(storage),
      undo: null,
      filter: 'all',
    })
  }

  /** Add a todo at the top; ignore blank (after trim) titles. */
  add(title: string): void {
    const trimmed = title.trim()
    if (!trimmed) return
    this.state.items.unshift({
      id: uid(),
      title: trimmed,
      done: false,
      createdAt: Date.now(),
    })
    this.save()
  }

  toggle(id: string): void {
    const todo = this.state.items.find((item) => item.id === id)
    if (!todo) return
    todo.done = !todo.done
    this.save()
  }

  /** Rename a todo; a blank (after trim) title deletes it instead. */
  rename(id: string, title: string): void {
    const trimmed = title.trim()
    if (!trimmed) {
      this.remove(id)
      return
    }
    const todo = this.state.items.find((item) => item.id === id)
    if (!todo || todo.title === trimmed) return
    todo.title = trimmed
    this.save()
  }

  remove(id: string): void {
    const index = this.state.items.findIndex((item) => item.id === id)
    if (index === -1) return
    const [removed] = this.state.items.splice(index, 1)
    this.replaceUndo([{ todo: removed, index }])
    this.save()
  }

  /** Remove every completed todo; the whole operation counts as one deletion. */
  clearDone(): void {
    const entries: UndoEntry[] = []
    const remaining: Todo[] = []
    this.state.items.forEach((todo, index) => {
      if (todo.done) {
        entries.push({ todo, index })
      } else {
        remaining.push(todo)
      }
    })
    if (entries.length === 0) return
    this.state.items.splice(0, this.state.items.length, ...remaining)
    this.replaceUndo(entries)
    this.save()
  }

  /** Restore the most recent deletion back to its original position. */
  undo(): void {
    const entries = this.state.undo
    if (!entries) return
    const ordered = [...entries].sort((a, b) => a.index - b.index)
    for (const entry of ordered) {
      this.state.items.splice(Math.min(entry.index, this.state.items.length), 0, entry.todo)
    }
    this.state.undo = null
    this.save()
  }

  dismissUndo(): void {
    this.state.undo = null
  }

  /** Move the todo at `fromIndex` to `toIndex` (manual reordering). */
  move(fromIndex: number, toIndex: number): void {
    const items = this.state.items
    if (fromIndex < 0 || fromIndex >= items.length) return
    if (toIndex < 0 || toIndex >= items.length) return
    if (fromIndex === toIndex) return
    const [moved] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, moved)
    this.save()
  }

  setFilter(filter: Filter): void {
    this.state.filter = filter
  }

  private replaceUndo(entries: UndoEntry[]): void {
    this.state.undo = entries
  }

  private save(): void {
    persistTodos(this.storage, this.state.items)
  }
}

export function createTodoStore(storage: TodoStorage | null): TodoStore {
  return new TodoStore(storage)
}

function browserStorage(): TodoStorage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export const store = createTodoStore(typeof document === 'undefined' ? null : browserStorage())

import { describe, expect, it } from 'vitest'
import { createTodoStore, STORAGE_KEY, type Todo, type TodoStorage } from './store'

interface FakeStorage extends TodoStorage {
  removeItem(key: string): void
  clear(): void
}

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  const storage: FakeStorage = {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  }
  return { storage, map }
}

function seed(...titles: string[]): Todo[] {
  return titles.map((title, index) => ({
    id: `id-${index}`,
    title,
    done: false,
    createdAt: index,
  }))
}

function setup(initialItems: Todo[] = []) {
  const { storage, map } = makeStorage(
    initialItems.length > 0 ? { [STORAGE_KEY]: JSON.stringify(initialItems) } : {},
  )
  const store = createTodoStore(storage)
  return { store, map }
}

function titles(store: ReturnType<typeof setup>['store']): string[] {
  return store.state.items.map((item) => item.title)
}

describe('add', () => {
  it('inserts new todos at the top', () => {
    const { store } = setup(seed('first'))
    store.add('second')
    expect(titles(store)).toEqual(['second', 'first'])
  })

  it('ignores empty and whitespace-only titles', () => {
    const { store } = setup()
    store.add('')
    store.add('   ')
    expect(store.state.items).toHaveLength(0)
  })

  it('trims surrounding whitespace and creates complete todos', () => {
    const { store } = setup()
    store.add('  买牛奶  ')
    const [todo] = store.state.items
    expect(todo.title).toBe('买牛奶')
    expect(todo.done).toBe(false)
    expect(typeof todo.id).toBe('string')
    expect(todo.id.length).toBeGreaterThan(0)
    expect(typeof todo.createdAt).toBe('number')
  })
})

describe('toggle', () => {
  it('checks and unchecks a todo without moving it', () => {
    const { store } = setup(seed('a', 'b'))
    store.toggle('id-1')
    expect(store.state.items[1].done).toBe(true)
    expect(titles(store)).toEqual(['a', 'b'])
    store.toggle('id-1')
    expect(store.state.items[1].done).toBe(false)
  })

  it('ignores unknown ids', () => {
    const { store } = setup(seed('a'))
    store.toggle('nope')
    expect(store.state.items[0].done).toBe(false)
  })
})

describe('rename', () => {
  it('renames an existing todo and trims the title', () => {
    const { store } = setup(seed('old'))
    store.rename('id-0', '  new title  ')
    expect(store.state.items[0].title).toBe('new title')
  })

  it('deletes the todo when the new title is blank, recording an undo', () => {
    const { store } = setup(seed('a', 'b'))
    store.rename('id-1', '   ')
    expect(titles(store)).toEqual(['a'])
    expect(store.state.undo).toHaveLength(1)
    expect(store.state.undo![0].todo.title).toBe('b')
  })

  it('ignores unknown ids', () => {
    const { store } = setup(seed('a'))
    store.rename('nope', 'x')
    expect(titles(store)).toEqual(['a'])
  })
})

describe('remove', () => {
  it('removes the todo and records an undo entry with its original index', () => {
    const { store } = setup(seed('a', 'b', 'c'))
    store.remove('id-1')
    expect(titles(store)).toEqual(['a', 'c'])
    expect(store.state.undo).toEqual([{ todo: { id: 'id-1', title: 'b', done: false, createdAt: 1 }, index: 1 }])
  })

  it('ignores unknown ids without touching the undo state', () => {
    const { store } = setup(seed('a'))
    store.remove('id-0')
    store.remove('nope')
    expect(store.state.undo).toHaveLength(1)
    expect(store.state.undo![0].todo.title).toBe('a')
  })
})

describe('clearDone', () => {
  it('removes every done todo and keeps the active ones in order', () => {
    const { store } = setup([
      { id: 'id-0', title: 'a', done: true, createdAt: 0 },
      { id: 'id-1', title: 'b', done: false, createdAt: 1 },
      { id: 'id-2', title: 'c', done: true, createdAt: 2 },
      { id: 'id-3', title: 'd', done: false, createdAt: 3 },
    ])
    store.clearDone()
    expect(titles(store)).toEqual(['b', 'd'])
    expect(store.state.undo).toHaveLength(2)
    expect(store.state.undo!.map((entry) => entry.index)).toEqual([0, 2])
  })

  it('does nothing when nothing is done, preserving the previous undo', () => {
    const { store } = setup(seed('a', 'b'))
    store.remove('id-1')
    store.clearDone()
    expect(titles(store)).toEqual(['a'])
    expect(store.state.undo).toHaveLength(1)
    expect(store.state.undo![0].todo.title).toBe('b')
  })
})

describe('undo', () => {
  it('restores a single deletion to its original position', () => {
    const { store } = setup(seed('a', 'b', 'c'))
    store.remove('id-1')
    store.add('d')
    expect(titles(store)).toEqual(['d', 'a', 'c'])
    store.undo()
    expect(titles(store)).toEqual(['d', 'b', 'a', 'c'])
    expect(store.state.undo).toBeNull()
  })

  it('restores a clearDone batch to their original positions', () => {
    const { store } = setup([
      { id: 'id-0', title: 'a', done: true, createdAt: 0 },
      { id: 'id-1', title: 'b', done: false, createdAt: 1 },
      { id: 'id-2', title: 'c', done: true, createdAt: 2 },
      { id: 'id-3', title: 'd', done: false, createdAt: 3 },
    ])
    store.clearDone()
    store.undo()
    expect(titles(store)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps only the most recent deletion undoable', () => {
    const { store } = setup(seed('a', 'b', 'c'))
    store.remove('id-0')
    store.remove('id-2')
    store.undo()
    expect(titles(store)).toEqual(['b', 'c'])
    store.undo()
    expect(titles(store)).toEqual(['b', 'c'])
  })

  it('does nothing when there is nothing to undo', () => {
    const { store } = setup(seed('a'))
    store.undo()
    expect(titles(store)).toEqual(['a'])
  })
})

describe('dismissUndo', () => {
  it('clears the pending undo so it can no longer be reverted', () => {
    const { store } = setup(seed('a', 'b'))
    store.remove('id-0')
    store.dismissUndo()
    expect(store.state.undo).toBeNull()
    store.undo()
    expect(titles(store)).toEqual(['b'])
  })
})

describe('move', () => {
  it.each([
    { from: 0, to: 2, expected: ['b', 'c', 'a', 'd'] },
    { from: 3, to: 0, expected: ['d', 'a', 'b', 'c'] },
    { from: 1, to: 2, expected: ['a', 'c', 'b', 'd'] },
    { from: 2, to: 1, expected: ['a', 'c', 'b', 'd'] },
  ])('moves the todo from $from to $to', ({ from, to, expected }) => {
    const { store } = setup(seed('a', 'b', 'c', 'd'))
    store.move(from, to)
    expect(titles(store)).toEqual(expected)
  })

  it('ignores out-of-range and no-op moves', () => {
    const { store } = setup(seed('a', 'b'))
    store.move(-1, 0)
    store.move(0, 5)
    store.move(1, 1)
    expect(titles(store)).toEqual(['a', 'b'])
  })

  it('persists the new order', () => {
    const { store, map } = setup(seed('a', 'b'))
    store.move(0, 1)
    const saved = JSON.parse(map.get(STORAGE_KEY)!)
    expect(saved.map((item: Todo) => item.title)).toEqual(['b', 'a'])
  })
})

describe('persistence', () => {
  it('saves every mutation to storage', () => {
    const { store, map } = setup()
    store.add('a')
    expect(map.has(STORAGE_KEY)).toBe(true)
    const saved = JSON.parse(map.get(STORAGE_KEY)!)
    expect(saved).toHaveLength(1)
    expect(saved[0].title).toBe('a')
  })

  it('restores items in order from storage', () => {
    const { storage } = makeStorage()
    const first = createTodoStore(storage)
    first.add('a')
    first.add('b')
    first.toggle(first.state.items[1].id)
    const second = createTodoStore(storage)
    expect(titles(second)).toEqual(['b', 'a'])
    expect(second.state.items[1].done).toBe(true)
  })

  it('falls back to an empty list on corrupted JSON', () => {
    const { store } = setup()
    const { storage } = makeStorage({ [STORAGE_KEY]: '{not json' })
    const fresh = createTodoStore(storage)
    expect(fresh.state.items).toEqual([])
    expect(store.state.items).toEqual([])
  })

  it('falls back to an empty list on structurally invalid data', () => {
    const { storage } = makeStorage({ [STORAGE_KEY]: JSON.stringify([{ id: 1, title: 'x' }]) })
    const fresh = createTodoStore(storage)
    expect(fresh.state.items).toEqual([])
  })

  it('keeps working when reading storage throws', () => {
    const throwing: TodoStorage = {
      getItem: () => {
        throw new Error('boom')
      },
      setItem: () => undefined,
    }
    const store = createTodoStore(throwing)
    expect(store.state.items).toEqual([])
    store.add('a')
    expect(titles(store)).toEqual(['a'])
  })

  it('keeps working when writing storage throws', () => {
    const { storage } = makeStorage()
    const store = createTodoStore({
      getItem: storage.getItem.bind(storage),
      setItem: () => {
        throw new Error('quota exceeded')
      },
    })
    store.add('a')
    expect(titles(store)).toEqual(['a'])
  })
})

describe('filter', () => {
  it('defaults to all and updates via setFilter', () => {
    const { store } = setup()
    expect(store.state.filter).toBe('all')
    store.setFilter('active')
    expect(store.state.filter).toBe('active')
  })

  it('is never persisted to storage', () => {
    const { store, map } = setup()
    store.setFilter('done')
    store.add('a')
    const saved = JSON.parse(map.get(STORAGE_KEY)!)
    expect(saved).toEqual([expect.objectContaining({ title: 'a' })])
    expect(saved).toHaveLength(1)
  })
})

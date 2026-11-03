<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import TodoItem from './TodoItem.vue'
import { store, type Filter, type Todo } from './store'

const newTitle = ref('')
const editingId = ref<string | null>(null)
const dragActive = ref(false)
const dragItems = ref<Todo[]>([])

const visibleItems = computed<Todo[]>(() => {
  const filter = store.state.filter
  if (filter === 'active') return store.state.items.filter((item) => !item.done)
  if (filter === 'done') return store.state.items.filter((item) => item.done)
  return store.state.items
})

// vuedraggable 直接改绑定的数组；用镜像数组做拖拽，落点再通过 store.move 写回，
// 保证 store 是唯一数据源。展开成新数组，确保列表内容变化时（新增/删除/排序）一定触发同步。
watch(
  () => [...visibleItems.value],
  (items) => {
    if (!dragActive.value) dragItems.value = items
  },
  { immediate: true },
)

const activeCount = computed(() => store.state.items.filter((item) => !item.done).length)
const hasDone = computed(() => store.state.items.some((item) => item.done))

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '未完成' },
  { key: 'done', label: '已完成' },
]

function submitNew() {
  store.add(newTitle.value)
  newTitle.value = ''
}

function startEdit(id: string) {
  editingId.value = id
}

function commitEdit(id: string, title: string) {
  if (editingId.value !== id) return
  store.rename(id, title)
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function onDragStart() {
  dragActive.value = true
}

function onDragEnd(event: { oldIndex?: number | null; newIndex?: number | null }) {
  if (
    event.oldIndex !== null &&
    event.oldIndex !== undefined &&
    event.newIndex !== null &&
    event.newIndex !== undefined &&
    event.oldIndex !== event.newIndex
  ) {
    store.move(event.oldIndex, event.newIndex)
  }
  dragItems.value = [...visibleItems.value]
  dragActive.value = false
}

// 撤销提示条：新的删除重置计时器，约 5 秒后自动消失（同时 dismissUndo）。
const undoVisible = computed(() => store.state.undo !== null)
let undoTimer: ReturnType<typeof setTimeout> | null = null

function clearUndoTimer() {
  if (undoTimer !== null) {
    clearTimeout(undoTimer)
    undoTimer = null
  }
}

watch(
  () => store.state.undo,
  (undo) => {
    clearUndoTimer()
    if (undo) {
      undoTimer = setTimeout(() => store.dismissUndo(), 5000)
    }
  },
)

onBeforeUnmount(clearUndoTimer)
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>Todo</h1>
    </header>

    <form class="add-form" @submit.prevent="submitNew">
      <input
        v-model="newTitle"
        class="add-input"
        type="text"
        placeholder="添加待办，回车确认"
        aria-label="添加待办"
        autocomplete="off"
      />
    </form>

    <draggable
      v-model="dragItems"
      class="todo-list"
      tag="ul"
      item-key="id"
      aria-label="待办列表"
      :disabled="store.state.filter !== 'all' || editingId !== null"
      :animation="150"
      :delay="150"
      :delay-on-touch-only="true"
      filter=".no-drag"
      ghost-class="dragging"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <li class="todo-item-row">
          <TodoItem
            :todo="element"
            :editing="editingId === element.id"
            :dragging="dragActive"
            @toggle="store.toggle"
            @edit-start="startEdit"
            @edit-commit="commitEdit"
            @edit-cancel="cancelEdit"
            @remove="store.remove"
          />
        </li>
      </template>
    </draggable>

    <p v-if="visibleItems.length === 0" class="empty-hint">暂无待办</p>

    <footer class="footer">
      <span class="count">{{ activeCount }} 项未完成</span>
      <nav class="filters" aria-label="筛选">
        <button
          v-for="filter in filters"
          :key="filter.key"
          type="button"
          class="filter-btn"
          :class="{ active: store.state.filter === filter.key }"
          @click="store.setFilter(filter.key)"
        >
          {{ filter.label }}
        </button>
      </nav>
      <button type="button" class="clear-btn" :disabled="!hasDone" @click="store.clearDone">
        清除已完成
      </button>
    </footer>

    <Transition name="undo">
      <div v-if="undoVisible" class="undo-banner" role="status">
        <span>已删除 ·</span>
        <button type="button" class="undo-btn" @click="store.undo()">撤销</button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { Todo } from './store'

const props = withDefaults(
  defineProps<{
    todo: Todo
    editing: boolean
    dragging?: boolean
  }>(),
  { dragging: false },
)

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'edit-start', id: string): void
  (e: 'edit-commit', id: string, title: string): void
  (e: 'edit-cancel'): void
  (e: 'remove', id: string): void
}>()

const draft = ref('')
const editInput = ref<HTMLInputElement | null>(null)
let cancelNextBlur = false

watch(
  () => props.editing,
  (editing) => {
    if (editing) {
      draft.value = props.todo.title
      cancelNextBlur = false
      void nextTick(() => {
        editInput.value?.focus()
        editInput.value?.select()
      })
    }
  },
)

function onTitlePointerUp(event: PointerEvent) {
  if (props.dragging || props.editing) return
  // 移动端点按编辑（PC 走双击）
  if (event.pointerType === 'touch') {
    emit('edit-start', props.todo.id)
  }
}

function onTitleDblClick() {
  if (!props.editing) emit('edit-start', props.todo.id)
}

function commit() {
  if (!props.editing) return
  emit('edit-commit', props.todo.id, draft.value)
}

function onEditBlur() {
  if (cancelNextBlur) return
  commit()
}

function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelNextBlur = true
    emit('edit-cancel')
  }
}
</script>

<template>
  <div class="todo-item" :class="{ done: todo.done }">
    <label class="check">
      <input
        type="checkbox"
        class="checkbox no-drag"
        :checked="todo.done"
        :aria-label="todo.done ? '标记为未完成' : '标记为已完成'"
        @change="emit('toggle', todo.id)"
      />
    </label>

    <input
      v-if="editing"
      ref="editInput"
      v-model="draft"
      class="edit-input no-drag"
      type="text"
      aria-label="编辑待办标题"
      @keydown="onEditKeydown"
      @blur="onEditBlur"
    />

    <p v-else class="title" @pointerup="onTitlePointerUp" @dblclick="onTitleDblClick">
      {{ todo.title }}
    </p>

    <button type="button" class="del no-drag" aria-label="删除" @click="emit('remove', todo.id)">
      ×
    </button>
  </div>
</template>

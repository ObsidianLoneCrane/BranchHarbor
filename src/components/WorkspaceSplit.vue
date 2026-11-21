<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { nextTick, ref, watch } from 'vue'
import { t } from '../lib/locale'

const props = withDefaults(defineProps<{ heading: string; history?: boolean }>(), {
  history: false,
})
const detailOpen = defineModel<boolean>({ required: true })
const split = ref<HTMLDivElement>()
const back = ref<HTMLButtonElement>()
const list = ref<HTMLDivElement>()
const width = ref(props.history ? 55 : 32)
const minimum = props.history ? 32 : 23
const maximum = props.history ? 68 : 50
let previousSelection: HTMLElement | null = null
let scrollTop = 0

function resize(value: number) {
  width.value = Math.max(minimum, Math.min(maximum, Math.round(value)))
}

function drag(event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
}

function move(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  const bounds = split.value?.getBoundingClientRect()
  if (!bounds?.width || !handle.hasPointerCapture(event.pointerId)) return
  resize(((event.clientX - bounds.left) / bounds.width) * 100)
}

watch(
  detailOpen,
  async (open) => {
    if (open) {
      const active = document.activeElement
      previousSelection =
        active instanceof HTMLElement && list.value?.contains(active) ? active : null
      scrollTop = list.value?.scrollTop ?? 0
    }
    await nextTick()
    if (open && back.value?.getClientRects().length) back.value.focus({ preventScroll: true })
    if (!open && list.value?.getClientRects().length && document.activeElement === document.body) {
      list.value.scrollTop = scrollTop
      if (previousSelection?.isConnected) previousSelection.focus({ preventScroll: true })
    }
  },
  { flush: 'sync' },
)

async function showList() {
  detailOpen.value = false
  await nextTick()
  if (list.value) list.value.scrollTop = scrollTop
  if (previousSelection?.isConnected) previousSelection.focus({ preventScroll: true })
  else list.value?.focus({ preventScroll: true })
}
</script>

<template>
  <div
    ref="split"
    class="task-split workspace-split"
    :class="{ 'history-split': history, 'detail-open': detailOpen }"
    :style="{ '--list-width': width + '%' }"
  >
    <div ref="list" class="task-sidebar workspace-list" tabindex="-1"><slot name="list" /></div>
    <div
      class="workspace-divider"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="t('Resize list')"
      :aria-valuemin="minimum"
      :aria-valuemax="maximum"
      :aria-valuenow="width"
      @keydown.left.prevent="resize(width - 3)"
      @keydown.right.prevent="resize(width + 3)"
      @keydown.home.prevent="resize(minimum)"
      @keydown.end.prevent="resize(maximum)"
      @pointerdown="drag"
      @pointermove="move"
    />
    <div class="task-preview workspace-detail">
      <div class="workspace-return">
        <button ref="back" class="button button-secondary" type="button" @click="showList">
          <ArrowLeft :size="14" aria-hidden="true" />{{ t(heading) }}
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy, Minus, Square, X } from '@lucide/vue'
import type { Window } from '@tauri-apps/api/window'
import { onMounted, onUnmounted, ref } from 'vue'
import { t } from '../lib/locale'

const props = defineProps<{ desktopWindow: Window; icon: string }>()
const maximized = ref(false)
const error = ref(false)
let resizeTimer: ReturnType<typeof setTimeout> | undefined

async function syncMaximized() {
  maximized.value = await props.desktopWindow.isMaximized()
}

function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    void syncMaximized().catch(() => {})
  }, 100)
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  void syncMaximized().catch(() => {})
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  clearTimeout(resizeTimer)
})

async function run(action: 'minimize' | 'toggleMaximize' | 'close') {
  error.value = false
  try {
    await props.desktopWindow[action]()
    if (action === 'toggleMaximize') await syncMaximized()
  } catch {
    error.value = true
  }
}
</script>

<template>
  <div class="window-titlebar">
    <div class="window-titlebar-drag" data-tauri-drag-region="deep">
      <img :src="icon" width="20" height="20" alt="" />
      <span>BranchHarbor</span>
    </div>
    <div class="window-controls" role="group" :aria-label="t('Window controls')">
      <button
        type="button"
        :title="t('Minimize')"
        :aria-label="t('Minimize')"
        @click="run('minimize')"
      >
        <Minus :size="14" aria-hidden="true" />
      </button>
      <button
        type="button"
        :title="t(maximized ? 'Restore window' : 'Maximize')"
        :aria-label="t(maximized ? 'Restore window' : 'Maximize')"
        @click="run('toggleMaximize')"
      >
        <Copy v-if="maximized" :size="12" aria-hidden="true" />
        <Square v-else :size="12" aria-hidden="true" />
      </button>
      <button
        class="window-close"
        type="button"
        :title="t('Close window')"
        :aria-label="t('Close window')"
        @click="run('close')"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </div>
  </div>
  <p v-if="error" class="window-control-error" role="alert">
    {{ t('The window action could not be completed.') }}
  </p>
</template>

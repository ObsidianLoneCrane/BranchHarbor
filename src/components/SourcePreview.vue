<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
const props = defineProps<{ path: string; text: string }>()
const highlighted = ref<string | null>(null)
const language = ref('Plain text')
const count = computed(() => props.text.split(/\r\n|\r|\n/).length)
let worker: Worker | undefined
let timer: ReturnType<typeof setTimeout> | undefined
function stop() {
  worker?.terminate()
  worker = undefined
  clearTimeout(timer)
}
watch(
  () => [props.path, props.text],
  () => {
    stop()
    highlighted.value = null
    language.value = 'Plain text'
    if (!props.text) return
    try {
      const active = new Worker(new URL('../workers/syntax.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker = active
      active.onmessage = (
        event: MessageEvent<{ html: string | null; language: string | null }>,
      ) => {
        if (worker !== active) return
        highlighted.value = event.data.html
        language.value = event.data.language ?? 'Plain text'
        stop()
      }
      active.onerror = () => {
        if (worker === active) stop()
      }
      timer = setTimeout(stop, 2000)
      active.postMessage({ path: props.path, text: props.text })
    } catch {
      stop()
    }
  },
  { immediate: true },
)
onUnmounted(stop)
</script>

<template>
  <div class="source-summary">
    <span>{{ language }}</span
    ><span>{{ count }} {{ count === 1 ? 'line' : 'lines' }} · UTF-8</span>
  </div>
  <p v-if="!text" class="preview-placeholder">This file is empty.</p>
  <div v-else class="source-preview" role="region" aria-label="File source" tabindex="0">
    <div class="source-lines" aria-hidden="true">
      <span v-for="line in count" :key="line">{{ line }}</span>
    </div>
    <pre><code v-if="highlighted !== null" v-html="highlighted" /><!-- eslint-disable-line vue/no-v-html --><code v-else>{{ text }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
defineProps<{ page: number; hasNext: boolean; disabled: boolean; context: string }>()
defineEmits<{ change: [page: number] }>()
</script>
<template>
  <div class="repository-pagination">
    <span>Page {{ page }}</span>
    <div>
      <button
        class="button button-secondary"
        :aria-label="`Previous ${context} page`"
        :disabled="disabled || page <= 1"
        @click="$emit('change', page - 1)"
      >
        <ChevronLeft :size="14" aria-hidden="true" />Previous</button
      ><button
        class="button button-secondary"
        :aria-label="`Next ${context} page`"
        :disabled="disabled || !hasNext"
        @click="$emit('change', page + 1)"
      >
        Next<ChevronRight :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

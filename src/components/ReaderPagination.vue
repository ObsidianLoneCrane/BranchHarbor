<script setup lang="ts">
import { t } from '../lib/locale'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
defineProps<{
  page: number
  hasNext: boolean
  disabled: boolean
  context: 'comments' | 'discussion'
}>()
defineEmits<{ change: [page: number] }>()
</script>
<template>
  <div class="repository-pagination">
    <span>{{ t('Page {page}', { page }) }}</span>
    <div>
      <button
        class="button button-secondary"
        :aria-label="
          t(context === 'comments' ? 'Previous comments page' : 'Previous discussion page')
        "
        :disabled="disabled || page <= 1"
        @click="$emit('change', page - 1)"
      >
        <ChevronLeft :size="14" aria-hidden="true" />{{ t('Previous') }}</button
      ><button
        class="button button-secondary"
        :aria-label="t(context === 'comments' ? 'Next comments page' : 'Next discussion page')"
        :disabled="disabled || !hasNext"
        @click="$emit('change', page + 1)"
      >
        {{ t('Next') }}<ChevronRight :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

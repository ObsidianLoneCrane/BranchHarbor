<script setup lang="ts">
import { language, t } from '../lib/locale'

defineProps<{ refreshedAt: number; cached: boolean }>()
</script>

<template>
  <p class="contribution-note">
    {{ t(cached ? 'Cached data · Last refreshed' : 'Last refreshed') }}
    <time :datetime="new Date(refreshedAt * 1000).toISOString()">{{
      new Date(refreshedAt * 1000).toLocaleString(language)
    }}</time>
  </p>
</template>

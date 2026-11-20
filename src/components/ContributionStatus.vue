<script setup lang="ts">
defineProps<{ refreshedAt: number; cached: boolean }>()
</script>

<template>
  <p class="contribution-note">
    {{ cached ? 'Cached data · Last refreshed' : 'Last refreshed' }}
    <time :datetime="new Date(refreshedAt * 1000).toISOString()">{{
      new Date(refreshedAt * 1000).toLocaleString()
    }}</time>
  </p>
</template>

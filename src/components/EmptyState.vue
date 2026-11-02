<script setup lang="ts">
import { ArrowUpRight, Sprout } from '@lucide/vue'

defineProps<{ title: string; description: string; action?: string; to?: string }>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-illustration" aria-hidden="true">
      <Sprout :size="32" :stroke-width="1.4" />
    </div>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <RouterLink v-if="action && to" :to="to" class="button button-secondary">
      {{ action }}<ArrowUpRight :size="15" aria-hidden="true" />
    </RouterLink>
    <slot />
  </div>
</template>

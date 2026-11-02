<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const target = computed(() => ({
  accountId: String(route.params.accountId),
  owner: String(route.params.owner),
  name: String(route.params.name),
}))
const selected = computed(() =>
  route.name === 'repository-explorer' ? 'files' : route.params.resource,
)
</script>

<template>
  <nav class="repository-tabs" aria-label="Repository navigation">
    <RouterLink
      :to="{ name: 'repository-explorer', params: target }"
      :class="{ active: selected === 'files' }"
      :aria-current="selected === 'files' ? 'page' : undefined"
      >Files</RouterLink
    >
    <RouterLink
      v-for="resource in ['pulls', 'issues'] as const"
      :key="resource"
      :to="{ name: 'repository-reader', params: { ...target, resource } }"
      :class="{ active: selected === resource }"
      :aria-current="selected === resource ? 'page' : undefined"
      >{{ resource === 'pulls' ? 'Pull requests' : 'Issues' }}</RouterLink
    >
  </nav>
</template>

<script setup lang="ts">
import { t } from '../lib/locale'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { LoaderCircle } from '@lucide/vue'
import type { Resource } from '../lib/reader'
const route = useRoute()
const target = computed(() => ({
  accountId: String(route.params.accountId),
  owner: String(route.params.owner),
  name: String(route.params.name),
}))
const selected = computed(() =>
  route.name === 'repository-explorer'
    ? 'files'
    : (route.params.references ?? route.params.resource),
)
const opening = ref<Resource>()

async function openDiscussion(
  event: MouseEvent,
  resource: Resource,
  navigate: (event: MouseEvent) => Promise<unknown>,
) {
  const regularClick =
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  if (regularClick && selected.value !== resource) opening.value = resource
  try {
    await navigate(event)
  } finally {
    if (opening.value === resource) opening.value = undefined
  }
}
</script>

<template>
  <nav class="repository-tabs" :aria-label="t('Repository navigation')">
    <RouterLink
      :to="{ name: 'repository-explorer', params: target }"
      :class="{ active: selected === 'files' }"
      :aria-current="selected === 'files' ? 'page' : undefined"
      >{{ t('Files') }}</RouterLink
    >
    <RouterLink
      v-for="references in ['branches', 'tags'] as const"
      :key="references"
      :to="{ name: 'repository-references', params: { ...target, references } }"
      :class="{ active: selected === references }"
      :aria-current="selected === references ? 'page' : undefined"
      >{{ t(references === 'branches' ? 'Branches' : 'Tags') }}</RouterLink
    >
    <RouterLink
      v-for="resource in ['pulls', 'issues'] as const"
      v-slot="{ href, navigate }"
      :key="resource"
      :to="{ name: 'repository-reader', params: { ...target, resource } }"
      custom
    >
      <a
        :href="href"
        :class="{ active: selected === resource }"
        :aria-current="selected === resource ? 'page' : undefined"
        :aria-busy="opening === resource || undefined"
        @click="openDiscussion($event, resource, navigate)"
      >
        {{ t(resource === 'pulls' ? 'Pull requests' : 'Issues') }}
        <LoaderCircle
          v-if="opening === resource"
          :size="13"
          class="loading-icon"
          aria-hidden="true"
        />
      </a>
    </RouterLink>
  </nav>
</template>

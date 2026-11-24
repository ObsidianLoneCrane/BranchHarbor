<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GitReference } from '../lib/localGit'
import { t } from '../lib/locale'

const props = defineProps<{ items: GitReference[]; currentBranch?: string | null }>()
const kind = ref<GitReference['kind']>('branch')
const search = ref('')
const page = ref(1)
const pageSize = 30
const filtered = computed(() =>
  props.items.filter(
    (item) =>
      item.kind === kind.value &&
      item.name.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const visible = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
watch([kind, search], () => {
  page.value = 1
})
watch(pages, (count) => {
  page.value = Math.min(page.value, count)
})
</script>

<template>
  <div class="local-actions reference-filters">
    <button
      class="button button-secondary"
      type="button"
      :aria-pressed="kind === 'branch'"
      @click="kind = 'branch'"
    >
      {{ t('Branches') }}
    </button>
    <button
      class="button button-secondary"
      type="button"
      :aria-pressed="kind === 'tag'"
      @click="kind = 'tag'"
    >
      {{ t('Tags') }}
    </button>
    <input
      v-model="search"
      type="search"
      class="form-control reference-search"
      :aria-label="t('Filter references')"
      :placeholder="t('Filter references')"
    />
  </div>
  <ul v-if="visible.length" class="local-list reference-list">
    <li v-for="item in visible" :key="item.name">
      <strong>{{ item.name }}</strong>
      <small v-if="item.kind === 'branch' && item.name === currentBranch">{{
        t('Current branch')
      }}</small>
      <code :title="item.targetOid ?? item.oid">{{
        (item.targetOid ?? item.oid).slice(0, 12)
      }}</code>
      <slot :item="item" />
    </li>
  </ul>
  <p v-else>{{ t('No matching references.') }}</p>
  <div v-if="pages > 1" class="local-toolbar">
    <span>{{ t('Page {page}', { page }) }}</span>
    <div class="local-actions">
      <button class="button button-secondary" :disabled="page === 1" @click="page--">
        {{ t('Previous') }}
      </button>
      <button class="button button-secondary" :disabled="page >= pages" @click="page++">
        {{ t('Next') }}
      </button>
    </div>
  </div>
</template>

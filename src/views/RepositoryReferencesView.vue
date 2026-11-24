<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RepositoryTabs from '../components/RepositoryTabs.vue'
import { accountError } from '../lib/accounts'
import { explore, type Branch } from '../lib/explorer'
import { t } from '../lib/locale'
import '../localGit.css'

const route = useRoute()
const target = computed(() => ({
  accountId: String(route.params.accountId),
  owner: String(route.params.owner),
  name: String(route.params.name),
}))
const kind = computed(() => (route.params.references === 'tags' ? 'tags' : 'branches'))
const title = computed(() => (kind.value === 'tags' ? 'Tags' : 'Branches'))
const page = ref(1)
const retry = ref(0)
const loading = ref(false)
const result = ref<{
  items: (Pick<Branch, 'name' | 'commit'> & { protected?: boolean })[]
  hasNext: boolean
}>()
const error = ref('')

watch(
  [target, kind],
  () => {
    page.value = 1
  },
  { flush: 'sync' },
)
watch(
  [target, kind, page, retry],
  async ([repository, references, requested], _, cleanup) => {
    let current = true
    cleanup(() => {
      current = false
    })
    result.value = undefined
    error.value = ''
    loading.value = true
    try {
      const data =
        references === 'tags'
          ? await explore(repository, { kind: 'tags', page: requested })
          : await explore(repository, { kind: 'branches', page: requested })
      if (current) result.value = data
    } catch (cause) {
      if (current) error.value = accountError(cause).message
    } finally {
      if (current) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <RouterLink :to="{ name: 'repositories' }" class="text-link explorer-back">
    {{ t('Back to repositories') }}
  </RouterLink>
  <div class="page-heading repository-heading">
    <h1 id="page-title" tabindex="-1">{{ target.owner }}/{{ target.name }}</h1>
    <button class="button button-secondary" :disabled="loading" @click="retry++">
      {{ t('Refresh') }}
    </button>
  </div>
  <RepositoryTabs />
  <section class="panel local-panel" :aria-label="t(title)" :aria-busy="loading">
    <h2>{{ t(title) }}</h2>
    <p v-if="loading" role="status">{{ t('Loading references…') }}</p>
    <p v-else-if="error" role="alert">{{ t(error) }}</p>
    <template v-else-if="result">
      <ul v-if="result.items.length" class="local-list reference-list">
        <li v-for="item in result.items" :key="item.name">
          <strong>{{ item.name }}</strong>
          <small v-if="item.protected">{{ t('Protected') }}</small>
          <code :title="item.commit.sha">{{ item.commit.sha.slice(0, 12) }}</code>
        </li>
      </ul>
      <p v-else>{{ t('No references on this page.') }}</p>
    </template>
    <div v-if="page > 1 || result?.hasNext" class="local-toolbar">
      <span>{{ t('Page {page}', { page }) }}</span>
      <div class="local-actions">
        <button class="button button-secondary" :disabled="page === 1 || loading" @click="page--">
          {{ t('Previous') }}
        </button>
        <button
          class="button button-secondary"
          :disabled="!result?.hasNext || page >= 10000 || loading"
          @click="page++"
        >
          {{ t('Next') }}
        </button>
      </div>
    </div>
  </section>
</template>

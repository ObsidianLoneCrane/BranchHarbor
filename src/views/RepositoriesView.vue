<script setup lang="ts">
import { Plus, Search } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AddRepositoryDialog from '../components/AddRepositoryDialog.vue'
import WorkspaceRepositoryRows from '../components/WorkspaceRepositoryRows.vue'
import {
  invalidateLocalCatalog,
  useWorkspaceRepositories,
} from '../composables/workspaceRepositories'
import { invalidateLocalActivity } from '../composables/workspaceActivity'
import { t } from '../lib/locale'
import '../localGit.css'

const route = useRoute()
const source = ref('all')
const query = ref('')
const addDialog = ref<InstanceType<typeof AddRepositoryDialog>>()
const added = ref(false)
const { items, busy, failures, localError, hasMore, refresh, refreshLocal, more, accounts } =
  useWorkspaceRepositories()
watch(
  () => [route.name, route.query.source] as const,
  ([name, value]) => {
    if (name !== 'repositories' || !value) return
    source.value = value === 'local' || value === 'github' || value === 'gitee' ? value : 'all'
  },
  { immediate: true },
)
const visible = computed(() =>
  items.value.filter((item) => {
    const matchesSource =
      source.value === 'all' || item.sources.some((value) => value === source.value)
    return (
      matchesSource &&
      [
        item.name,
        item.local?.path,
        ...item.remotes.map((remote) => `${remote.owner}/${remote.name}`),
      ].some((value) => value?.toLowerCase().includes(query.value.trim().toLowerCase()))
    )
  }),
)

function openAddDialog() {
  added.value = false
  addDialog.value?.open()
}

function repositoryAdded() {
  invalidateLocalCatalog()
  invalidateLocalActivity()
  query.value = ''
  if (source.value !== 'all') source.value = 'local'
  void refreshLocal()
  added.value = true
}
</script>

<template>
  <div class="page-heading repository-heading">
    <h1 id="page-title" tabindex="-1">{{ t('Repositories') }}</h1>
    <button
      class="button button-primary"
      type="button"
      aria-haspopup="dialog"
      @click="openAddDialog"
    >
      <Plus :size="15" aria-hidden="true" />{{ t('Add repository') }}
    </button>
  </div>
  <AddRepositoryDialog ref="addDialog" @added="repositoryAdded" />
  <section class="panel local-panel" :aria-label="t('Repository workspace')" :aria-busy="busy">
    <div class="workspace-filters">
      <label class="local-field">
        <span
          ><Search :size="14" class="workspace-icon" aria-hidden="true" />
          {{ t('Search repositories') }}</span
        >
        <input v-model="query" class="form-control" type="search" />
      </label>
      <label class="local-field">
        {{ t('Repository source') }}
        <select v-model="source" class="form-control">
          <optgroup label="" class="select-options">
            <option value="all">{{ t('All sources') }}</option>
            <option value="local">{{ t('Local') }}</option>
            <option value="github">GitHub</option>
            <option value="gitee">Gitee</option>
          </optgroup>
        </select>
      </label>
      <button class="button button-secondary" type="button" :disabled="busy" @click="refresh">
        {{ t('Refresh') }}
      </button>
    </div>
    <p v-if="added" class="repository-added" role="status">{{ t('Repository added.') }}</p>
    <p v-if="localError" role="alert">{{ t(localError) }}</p>
    <p
      v-for="(message, accountId) in failures"
      :key="accountId"
      class="workspace-warning"
      role="alert"
    >
      {{ accounts.find((account) => account.id === accountId)?.login }} · {{ t(message) }}
    </p>
    <WorkspaceRepositoryRows v-if="visible.length" :items="visible" />
    <p v-else-if="busy" role="status">{{ t('Loading repositories...') }}</p>
    <p v-else>{{ t('No repositories to show') }}</p>
    <button
      v-if="hasMore && source !== 'local'"
      class="button button-secondary workspace-more"
      :disabled="busy"
      @click="more"
    >
      {{ t('Load more repositories') }}
    </button>
  </section>
</template>

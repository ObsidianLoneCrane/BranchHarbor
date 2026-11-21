<script setup lang="ts">
import { t } from '../lib/locale'
import { ArrowRight, ChevronRight, FolderGit2 } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import LocalActivity from '../components/LocalActivity.vue'
import ProviderCard from '../components/ProviderCard.vue'
import { useAccounts } from '../composables/accounts'
import { utcToday } from '../lib/contributions'
import {
  displayLocalPath,
  hasLocalGit,
  listLocal,
  localGitError,
  localRepositoryName,
  type LocalRepository,
} from '../lib/localGit'
import '../contributions.css'
import '../overview.css'

const { ensureLoaded } = useAccounts()
const repositories = ref<LocalRepository[]>([])
const repositoryError = ref('')
const repositoriesLoading = ref(false)
const today = utcToday()
const localRepositories = { name: 'repositories', query: { source: 'local' } }

async function loadRepositories() {
  repositoriesLoading.value = true
  repositoryError.value = ''
  try {
    repositories.value = (await listLocal()).slice(0, 5)
  } catch (error) {
    repositoryError.value = localGitError(error)
  } finally {
    repositoriesLoading.value = false
  }
}

onMounted(() => {
  if (hasLocalGit()) {
    void ensureLoaded()
    void loadRepositories()
  }
})
</script>

<template>
  <div class="overview">
    <div class="page-heading overview-heading">
      <h1 id="page-title" tabindex="-1">{{ t('Overview') }}</h1>
      <RouterLink to="/repositories" class="button button-primary">
        <FolderGit2 :size="16" aria-hidden="true" />{{ t('Browse repositories') }}
      </RouterLink>
    </div>
    <div class="overview-grid">
      <section class="panel overview-panel" aria-labelledby="recent-title">
        <header class="overview-panel-heading">
          <h2 id="recent-title">{{ t('Recent local repositories') }}</h2>
          <RouterLink v-if="repositories.length" :to="localRepositories" class="text-link">
            {{ t('All local repositories') }}<ArrowRight :size="14" aria-hidden="true" />
          </RouterLink>
        </header>
        <div v-if="repositoriesLoading || repositoryError" class="overview-panel-body">
          <p v-if="repositoriesLoading" role="status">{{ t('Reading recent repositories…') }}</p>
          <template v-else>
            <p role="alert">{{ t(repositoryError) }}</p>
            <button class="button button-secondary" @click="loadRepositories">
              {{ t('Retry') }}
            </button>
          </template>
        </div>
        <ul v-else-if="repositories.length" class="overview-repositories">
          <li v-for="repository in repositories" :key="repository.id">
            <RouterLink
              :to="{ name: 'local-repository', params: { id: repository.id } }"
              :aria-label="localRepositoryName(repository.path)"
              class="overview-repository"
            >
              <span class="overview-repository-icon"
                ><FolderGit2 :size="19" aria-hidden="true"
              /></span>
              <span class="overview-repository-copy">
                <strong>{{ localRepositoryName(repository.path) }}</strong>
                <span :title="displayLocalPath(repository.path)">{{
                  displayLocalPath(repository.path)
                }}</span>
              </span>
              <ChevronRight :size="15" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
        <div v-else class="overview-panel-body overview-empty">
          <span class="overview-repository-icon"><FolderGit2 :size="19" aria-hidden="true" /></span>
          <div>
            <h3>{{ t('No local repositories yet') }}</h3>
            <p>{{ t('Import, create, or clone a repository to get started.') }}</p>
          </div>
        </div>
      </section>
      <LocalActivity :day="today" summary />
    </div>
    <section class="home-contributions" aria-labelledby="contributions-title">
      <h2 id="contributions-title">{{ t('Your contributions') }}</h2>
      <div class="provider-grid">
        <ProviderCard provider="github" /><ProviderCard provider="gitee" />
      </div>
    </section>
  </div>
</template>

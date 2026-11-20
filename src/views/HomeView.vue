<script setup lang="ts">
import { ArrowRight, ArrowUpRight, FolderGit2, GitBranch, Link2 } from '@lucide/vue'
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

const { accounts, ensureLoaded } = useAccounts()
const repositories = ref<LocalRepository[]>([])
const repositoryError = ref('')
const repositoriesLoading = ref(false)
const today = utcToday()

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
  <div class="page-heading">
    <div>
      <p class="eyebrow">YOUR WORK, IN ONE PLACE</p>
      <h1 id="page-title" tabindex="-1">A clearer view of your work.</h1>
      <p class="page-description">
        View contribution sources, local activity, and recent repositories.
      </p>
    </div>
  </div>
  <section class="welcome-banner" aria-labelledby="welcome-title">
    <div class="welcome-copy">
      <span class="subtle-badge"
        ><span class="status-dot accent-dot" />{{
          accounts.length ? 'Accounts connected' : 'A fresh workspace'
        }}</span
      >
      <h2 id="welcome-title">
        {{
          accounts.length
            ? 'Your repositories are within reach.'
            : 'Every good project starts somewhere.'
        }}
      </h2>
      <p v-if="accounts.length">
        Browse the projects available to your connected accounts.<br class="wide-break" />Each
        platform keeps its own identity.
      </p>
      <p v-else>
        Your accounts and repositories will find a home here.<br class="wide-break" />Explore the
        workspace while the connections take shape.
      </p>
      <RouterLink
        :to="accounts.length ? '/repositories' : '/settings'"
        class="button button-primary"
        >{{ accounts.length ? 'Browse repositories' : 'Explore account settings'
        }}<ArrowUpRight :size="16" aria-hidden="true"
      /></RouterLink>
    </div>
    <div class="branch-art" aria-hidden="true">
      <div class="art-orbit orbit-one" />
      <div class="art-orbit orbit-two" />
      <div class="art-node node-a"><FolderGit2 :size="23" /></div>
      <div class="art-node node-b"><Link2 :size="21" /></div>
      <div class="art-node node-c"><GitBranch :size="29" /></div>
      <svg viewBox="0 0 250 190">
        <path d="M60 50V95Q60 130 100 130H175M175 130V45M175 130V160" /></svg
      ><span class="art-label">ONE WORKSPACE, MANY POSSIBILITIES</span>
    </div>
  </section>
  <section aria-labelledby="contributions-title">
    <div class="section-heading">
      <div>
        <h2 id="contributions-title">Your contributions</h2>
      </div>
    </div>
    <div class="provider-grid">
      <ProviderCard provider="github" /><ProviderCard provider="gitee" />
    </div>
  </section>
  <section aria-labelledby="recent-title" class="recent-section">
    <div class="section-heading">
      <div>
        <h2 id="recent-title">Recent local repositories</h2>
      </div>
      <RouterLink to="/repositories" class="text-link"
        >All repositories<ArrowRight :size="15" aria-hidden="true"
      /></RouterLink>
    </div>
    <div v-if="repositoriesLoading || repositoryError" class="panel contribution-panel">
      <p v-if="repositoriesLoading" role="status">Reading recent repositories…</p>
      <template v-else>
        <p role="alert">{{ repositoryError }}</p>
        <div><button class="button button-secondary" @click="loadRepositories">Retry</button></div>
      </template>
    </div>
    <ul v-else-if="repositories.length" class="panel contribution-panel activity-entries">
      <li v-for="repository in repositories" :key="repository.id">
        <RouterLink
          :to="{ name: 'local-repository', params: { id: repository.id } }"
          class="text-link"
          >{{ localRepositoryName(repository.path) }}</RouterLink
        >
        <span class="contribution-note">{{ displayLocalPath(repository.path) }}</span>
      </li>
    </ul>
    <div v-else class="recent-empty">
      <div class="muted-icon"><FolderGit2 :size="23" :stroke-width="1.5" aria-hidden="true" /></div>
      <div>
        <h3>No local repositories yet</h3>
        <p>Import, create, or clone a repository to get started.</p>
      </div>
      <RouterLink to="/repositories" class="icon-button" aria-label="Explore repositories"
        ><ArrowRight :size="18"
      /></RouterLink>
    </div>
  </section>
  <LocalActivity class="recent-section" :day="today" summary />
</template>

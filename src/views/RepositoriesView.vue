<script setup lang="ts">
import LocalRepositoryList from '../components/LocalRepositoryList.vue'
import RepositoryBrowser from '../components/RepositoryBrowser.vue'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAccounts } from '../composables/accounts'
import { t } from '../lib/locale'
import '../localGit.css'

const route = useRoute()
const { accounts } = useAccounts()
const selected = ref('')
const source = computed(() => {
  if (route.query.source === 'local' || route.query.source === 'remote') return route.query.source
  return selected.value || (accounts.value.length ? 'remote' : 'local')
})
</script>

<template>
  <div class="page-heading">
    <div>
      <h1 id="page-title" tabindex="-1">{{ t('Repositories') }}</h1>
    </div>
  </div>
  <nav class="repository-tabs task-tabs" :aria-label="t('Repository source')">
    <RouterLink
      v-for="option in [
        { id: 'local', label: 'Local' },
        { id: 'remote', label: 'Remote' },
      ]"
      :key="option.id"
      :to="{ name: 'repositories', query: { source: option.id } }"
      :class="{ active: source === option.id }"
      :aria-current="source === option.id ? 'page' : undefined"
      @click="selected = option.id"
      >{{ t(option.label) }}</RouterLink
    >
  </nav>
  <LocalRepositoryList v-show="source === 'local'" />
  <RepositoryBrowser v-show="source === 'remote'" />
</template>

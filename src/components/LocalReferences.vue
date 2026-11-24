<script setup lang="ts">
import { ref, watch } from 'vue'
import { localGitError, readLocalReferences, type GitReference } from '../lib/localGit'
import { t } from '../lib/locale'
import GitReferenceList from './GitReferenceList.vue'

const props = defineProps<{ id: number; revision: number; branch: string | null }>()
const items = ref<GitReference[]>()
const loading = ref(false)
const error = ref('')

watch(
  () => [props.id, props.revision] as const,
  async ([id], _, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    loading.value = true
    error.value = ''
    try {
      const refs = await readLocalReferences(id)
      if (active) items.value = refs
    } catch (cause) {
      if (active) error.value = localGitError(cause)
    } finally {
      if (active) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="panel local-panel" :aria-label="t('Local references')" :aria-busy="loading">
    <h2>{{ t('Local references') }}</h2>
    <p v-if="loading" role="status">{{ t('Loading references…') }}</p>
    <p v-else-if="error" role="alert">{{ t(error) }}</p>
    <GitReferenceList v-else-if="items" :items="items" :current-branch="branch" />
  </section>
</template>

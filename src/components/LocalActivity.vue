<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import {
  hasLocalGit,
  localGitError,
  localRepositoryName,
  readLocalActivity,
  type LocalActivity,
} from '../lib/localGit'

const props = defineProps<{ day: string; summary?: boolean }>()
const available = hasLocalGit()
const data = ref<LocalActivity>()
const error = ref('')
const loading = ref(false)
let revision = 0

async function load(day: string) {
  const generation = ++revision
  data.value = undefined
  error.value = ''
  loading.value = false
  if (!available || !day) return
  loading.value = true
  try {
    const result = await readLocalActivity(day)
    if (revision === generation && result.day === day) data.value = result
  } catch (cause) {
    if (revision === generation) error.value = localGitError(cause)
  } finally {
    if (revision === generation) loading.value = false
  }
}

watch(() => props.day, load, { immediate: true })
onScopeDispose(() => {
  revision++
})
</script>

<template>
  <section class="panel contribution-panel" aria-label="Local Git activity">
    <h2>{{ summary ? 'Local activity today' : 'Local Git activity' }}</h2>
    <p v-if="!available">Open the desktop app to read local commits.</p>
    <p v-else-if="loading" role="status">Reading local commits…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!day">Choose a UTC day to see local commits.</p>
    <template v-else-if="data">
      <p class="contribution-note">
        Commits reachable from HEAD in registered working trees · {{ day }} UTC
      </p>
      <p v-if="!data.commits.length">
        {{
          data.skippedRepositories || data.limited
            ? 'No commits found in the available history.'
            : 'No local commits found for this day.'
        }}
      </p>
      <ul v-else class="activity-entries">
        <li
          v-for="commit in data.commits.slice(0, summary ? 3 : data.commits.length)"
          :key="`${commit.repositoryId}:${commit.hash}`"
        >
          <strong>{{ commit.subject || '(No commit subject)' }}</strong>
          <span class="contribution-note">
            {{ commit.author }} ·
            <time :datetime="new Date(commit.committedAt * 1000).toISOString()"
              >{{ new Date(commit.committedAt * 1000).toISOString().slice(11, 16) }} UTC</time
            >
            · <code>{{ commit.hash.slice(0, 8) }}</code>
          </span>
          <RouterLink
            class="text-link"
            :to="{ name: 'local-repository', params: { id: commit.repositoryId } }"
            >{{ localRepositoryName(commit.repositoryPath) }}</RouterLink
          >
        </li>
      </ul>
      <p v-if="data.limited" class="contribution-note">
        Showing up to 20 commits from the 12 most recent working trees.
      </p>
      <p v-if="data.skippedRepositories" class="contribution-note">
        {{ data.skippedRepositories }} working trees could not be read.
      </p>
    </template>
    <div v-if="available && day" class="contribution-controls">
      <RouterLink v-if="summary" class="text-link" :to="{ name: 'activity', query: { day } }"
        >Open daily activity</RouterLink
      >
      <button
        v-else
        class="button button-secondary"
        type="button"
        :disabled="loading"
        @click="load(day)"
      >
        Refresh local commits
      </button>
    </div>
  </section>
</template>

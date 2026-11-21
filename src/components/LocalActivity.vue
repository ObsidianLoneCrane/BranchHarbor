<script setup lang="ts">
import { t } from '../lib/locale'
import { ArrowRight } from '@lucide/vue'
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
  <section
    class="panel"
    :class="summary ? 'overview-panel' : 'contribution-panel'"
    :aria-label="t('Local Git activity')"
  >
    <header v-if="summary" class="overview-panel-heading">
      <h2>{{ t('Local activity today') }}</h2>
      <RouterLink
        v-if="available"
        class="text-link"
        :to="{ name: 'activity', query: { day, view: 'local' } }"
      >
        {{ t('Open daily activity') }}<ArrowRight :size="14" aria-hidden="true" />
      </RouterLink>
    </header>
    <h2 v-else>{{ t('Local Git activity') }}</h2>
    <div :class="{ 'overview-panel-body': summary && !data?.commits.length }">
      <p v-if="!available">{{ t('Open the desktop app to read local commits.') }}</p>
      <p v-else-if="loading" role="status">{{ t('Reading local commits…') }}</p>
      <p v-else-if="error" role="alert">{{ t(error) }}</p>
      <p v-else-if="!day">{{ t('Choose a UTC day to see local commits.') }}</p>
      <template v-else-if="data">
        <p v-if="!summary" class="contribution-note">
          {{ t('Commits reachable from HEAD in registered working trees · {day} UTC', { day }) }}
        </p>
        <p v-if="!data.commits.length">
          {{
            t(
              data.skippedRepositories || data.limited
                ? 'No commits found in the available history.'
                : 'No local commits found for this day.',
            )
          }}
        </p>
        <ul v-else :class="summary ? 'overview-commits' : 'activity-entries'">
          <li
            v-for="commit in data.commits.slice(0, summary ? 3 : data.commits.length)"
            :key="`${commit.repositoryId}:${commit.hash}`"
          >
            <strong>{{ commit.subject || t('(No commit subject)') }}</strong>
            <span v-if="summary" class="overview-commit-meta">
              <RouterLink :to="{ name: 'local-repository', params: { id: commit.repositoryId } }">{{
                localRepositoryName(commit.repositoryPath)
              }}</RouterLink>
              <time :datetime="new Date(commit.committedAt * 1000).toISOString()"
                >{{ new Date(commit.committedAt * 1000).toISOString().slice(11, 16) }} UTC</time
              >
            </span>
            <template v-else>
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
            </template>
          </li>
        </ul>
        <p v-if="!summary && data.limited" class="contribution-note">
          {{ t('Showing up to 20 commits from the 12 most recent working trees.') }}
        </p>
        <p
          v-if="data.skippedRepositories"
          class="contribution-note"
          :class="{ 'overview-panel-body': summary && data.commits.length }"
        >
          {{ t('{count} working trees could not be read.', { count: data.skippedRepositories }) }}
        </p>
      </template>
    </div>
    <div v-if="!summary && available && day" class="contribution-controls">
      <button class="button button-secondary" type="button" :disabled="loading" @click="load(day)">
        {{ t('Refresh local commits') }}
      </button>
    </div>
  </section>
</template>

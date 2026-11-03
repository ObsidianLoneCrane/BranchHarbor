<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import EmptyState from '../components/EmptyState.vue'
import { useAccounts } from '../composables/accounts'
import { accountError, hasNativeAccounts, providerName } from '../lib/accounts'
import { readContributionSource, type ContributionSource } from '../lib/contributions'

const native = hasNativeAccounts()
const {
  accounts,
  error: accountsError,
  loading: accountsLoading,
  ensureLoaded,
  refresh,
} = useAccounts()
const accountId = ref('')
const selected = computed(() => accounts.value.find((account) => account.id === accountId.value))
const day = ref('')
const today = new Date().toISOString().slice(0, 10)
const source = shallowRef<ContributionSource>()
const error = ref('')
const loading = ref(false)
let revision = 0

onMounted(() => {
  if (native) void ensureLoaded()
})

watch(
  accounts,
  (items) => {
    if (!items.some((account) => account.id === accountId.value)) {
      accountId.value = items[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(
  accountId,
  () => {
    day.value = ''
  },
  { flush: 'sync' },
)
watch(
  [accountId, day],
  () => {
    revision++
    source.value = undefined
    error.value = ''
  },
  { flush: 'sync' },
)

async function load() {
  const account = selected.value
  if (!account || loading.value) return
  const requestedDay = account.provider === 'github' ? day.value || null : null
  const expected =
    account.provider === 'gitee'
      ? 'giteePublicEvents'
      : requestedDay
        ? 'githubDay'
        : 'githubCalendar'
  const generation = revision
  loading.value = true
  source.value = undefined
  error.value = ''
  try {
    const response = await readContributionSource(account.id, requestedDay)
    if (generation !== revision) return
    if (response.accountId !== account.id || response.data.source !== expected) {
      error.value = 'The contribution source returned an unexpected response.'
      return
    }
    source.value = response.data
  } catch (cause) {
    if (generation === revision) error.value = accountError(cause).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">PERSONAL ACTIVITY</p>
      <h1 id="page-title" tabindex="-1">Activity</h1>
      <p class="page-description">
        Inspect the contribution data available for each connected account.
      </p>
    </div>
  </div>

  <section class="panel" aria-label="Contribution sources">
    <div class="panel-toolbar">
      <span>Contribution sources</span><span class="subtle-badge">Read-only preview</span>
    </div>
    <div v-if="accountsError" class="contribution-preview">
      <p role="alert">{{ accountsError.message }}</p>
      <button class="button" type="button" :disabled="accountsLoading" @click="refresh">
        Reload accounts
      </button>
    </div>
    <p v-else-if="accountsLoading" class="contribution-preview" role="status">Loading accounts…</p>
    <EmptyState
      v-else-if="!selected"
      :title="
        native
          ? 'Connect an account to get started'
          : 'Contribution sources are available in the desktop app'
      "
      description="GitHub provides contribution counts. Gitee provides a sample of public events."
      action="Explore account settings"
      to="/settings"
    />
    <div v-else class="contribution-preview">
      <form class="source-controls" @submit.prevent="load">
        <label>
          Account
          <select v-model="accountId" :disabled="loading">
            <option v-for="account in accounts" :key="account.id" :value="account.id">
              {{ providerName(account.provider) }} · {{ account.login }}
            </option>
          </select>
        </label>
        <label v-if="selected.provider === 'github'">
          UTC day (optional)
          <input v-model="day" type="date" min="2008-01-01" :max="today" :disabled="loading" />
        </label>
        <button class="button button-primary" type="submit" :disabled="loading">Load source</button>
      </form>
      <p v-if="selected.provider === 'github'" class="development-note">
        Leave the day blank for GitHub’s default calendar period. Visibility depends on the token
        and GitHub settings.
      </p>
      <p v-else class="development-note">
        Gitee’s full-year contribution calendar is unavailable. This preview shows public events
        with limited coverage.
      </p>
      <p v-if="loading" role="status">Loading contribution source…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <div v-else-if="source" aria-live="polite">
        <template v-if="source.source === 'giteePublicEvents'">
          <h2>Gitee public events</h2>
          <p>Up to {{ source.limit }} events from the public feed. Coverage dates are unknown.</p>
          <p v-if="!source.events.length">No events returned by this source.</p>
          <ul v-else class="source-events">
            <li v-for="event in source.events" :key="event.id">
              <time :datetime="event.createdAt">{{ event.createdAt }}</time>
              <span>{{ event.eventType || 'Unclassified event' }}</span>
              <span v-if="event.repository?.name">{{ event.repository.name }}</span>
            </li>
          </ul>
        </template>
        <template v-else>
          <h2>
            GitHub {{ source.source === 'githubCalendar' ? 'calendar summary' : 'daily counts' }}
          </h2>
          <p>
            <time :datetime="source.startedAt">{{ source.startedAt }}</time>
            –
            <time :datetime="source.endedAt">{{ source.endedAt }}</time>
          </p>
          <p v-if="source.source === 'githubCalendar'">
            {{ source.calendar.totalContributions }} contributions
          </p>
          <ul v-else>
            <li>Commits: {{ source.totalCommitContributions }}</li>
            <li>Pull requests opened: {{ source.totalPullRequestContributions }}</li>
            <li>Issues opened: {{ source.totalIssueContributions }}</li>
          </ul>
          <p v-if="source.restrictedContributionsCount">
            GitHub also reports {{ source.restrictedContributionsCount }} restricted contributions
            without details.
          </p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.contribution-preview {
  padding: 1.25rem;
}

.source-controls,
.source-events li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
}

.source-controls label {
  display: grid;
  gap: 0.25rem;
}

.source-controls select,
.source-controls input {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.5rem;
  max-width: 100%;
}

.source-events {
  padding: 0;
}

.source-events li {
  padding-block: 0.5rem;
  overflow-wrap: anywhere;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ContributionStatus from '../components/ContributionStatus.vue'
import LocalActivity from '../components/LocalActivity.vue'
import { useAccounts } from '../composables/accounts'
import { useContributionSource } from '../composables/contributions'
import { hasNativeAccounts, providerName } from '../lib/accounts'
import { utcToday } from '../lib/contributions'
import '../contributions.css'

const route = useRoute()
const native = hasNativeAccounts()
const {
  accounts,
  error: accountsError,
  loading: accountsLoading,
  ensureLoaded,
  refresh: reloadAccounts,
} = useAccounts()
const accountId = ref('')
const selected = computed(() => accounts.value.find((account) => account.id === accountId.value))
const today = utcToday()
const day = ref('')
watch(
  () => route.query.day,
  (value) => {
    day.value =
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value &&
      value >= '2008-01-01' &&
      value <= today
        ? value
        : ''
  },
  { immediate: true },
)
watch(
  [accounts, () => route.query.account],
  ([items, requested], previous) => {
    if (requested !== previous?.[1] || !items.some((item) => item.id === accountId.value)) {
      accountId.value = items.find((item) => item.id === requested)?.id ?? items[0]?.id ?? ''
    }
  },
  { immediate: true },
)
const requestDay = computed(() =>
  selected.value?.provider === 'github' ? day.value || null : null,
)
const { response, cached, loading, error, refresh } = useContributionSource(
  () => selected.value,
  () => requestDay.value,
)
const source = computed(() => response.value?.data)
const events = computed(() => {
  if (source.value?.source !== 'giteePublicEvents') return []
  return source.value.events.filter((event) => {
    const date = new Date(event.createdAt)
    return (
      !day.value ||
      (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day.value)
    )
  })
})
onMounted(() => {
  if (native) void ensureLoaded()
})
</script>

<template>
  <div class="page-heading">
    <div>
      <h1 id="page-title" tabindex="-1">Activity</h1>
      <p class="page-description">Browse platform contributions and local commits by UTC date.</p>
    </div>
  </div>
  <section class="panel contribution-panel" aria-label="Contribution sources">
    <h2>Platform activity</h2>
    <div class="contribution-controls">
      <label v-if="accounts.length" class="contribution-field">
        Account
        <select v-model="accountId" class="form-control">
          <option v-for="account in accounts" :key="account.id" :value="account.id">
            {{ providerName(account.provider) }} · {{ account.login }}
          </option>
        </select>
      </label>
      <label class="contribution-field">
        UTC day (optional)
        <input v-model="day" class="form-control" type="date" min="2008-01-01" :max="today" />
      </label>
      <button class="button button-secondary" type="button" @click="day = today">Today</button>
      <button
        v-if="selected"
        class="button button-primary"
        type="button"
        :disabled="loading"
        @click="refresh"
      >
        {{ response ? 'Refresh source' : 'Load source' }}
      </button>
    </div>
    <p v-if="accountsLoading" role="status">Loading accounts…</p>
    <template v-else-if="accountsError">
      <p role="alert">{{ accountsError.message }}</p>
      <div>
        <button class="button button-secondary" type="button" @click="reloadAccounts">
          Reload accounts
        </button>
      </div>
    </template>
    <p v-else-if="!selected">
      <RouterLink v-if="native" to="/settings" class="text-link">Connect an account</RouterLink>
      <template v-else>Contribution sources are available in the desktop app.</template>
    </p>
    <p v-else class="contribution-note">
      {{
        selected.provider === 'github'
          ? 'Leave the day blank for the GitHub calendar summary.'
          : 'Gitee public sample. Full-year calendar unavailable.'
      }}
    </p>
    <p v-if="loading" role="status">Refreshing contribution source…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ContributionStatus v-if="response" :refreshed-at="response.refreshedAt" :cached="cached" />
    <template v-if="source?.source === 'giteePublicEvents'">
      <h3>Gitee public events</h3>
      <p class="contribution-note">
        Up to {{ source.limit }} events from the public feed. Coverage dates are unknown.
      </p>
      <p v-if="!source.events.length">No events returned by this source.</p>
      <p v-else-if="!events.length">No events in the public sample match this UTC day.</p>
      <ul v-else class="activity-entries">
        <li v-for="event in events" :key="event.id">
          <strong>{{ event.eventType || 'Unclassified event' }}</strong>
          <span v-if="event.repository?.name">{{ event.repository.name }}</span>
          <time class="contribution-note" :datetime="event.createdAt">{{ event.createdAt }}</time>
        </li>
      </ul>
    </template>
    <template v-else-if="source">
      <h3>GitHub {{ source.source === 'githubCalendar' ? 'calendar summary' : 'daily counts' }}</h3>
      <p class="contribution-note">{{ source.startedAt }} to {{ source.endedAt }}</p>
      <p v-if="source.source === 'githubCalendar'">
        {{ source.calendar.totalContributions }} contributions
      </p>
      <ul v-else class="activity-entries">
        <li>Commits: {{ source.totalCommitContributions }}</li>
        <li>Pull requests opened: {{ source.totalPullRequestContributions }}</li>
        <li>Issues opened: {{ source.totalIssueContributions }}</li>
      </ul>
      <p v-if="source.restrictedContributionsCount" class="contribution-note">
        GitHub reports {{ source.restrictedContributionsCount }} restricted contributions without
        details.
      </p>
    </template>
  </section>
  <LocalActivity :day="day" />
</template>

<script setup lang="ts">
import { t } from '../lib/locale'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ContributionCalendar from '../components/ContributionCalendar.vue'
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
const firstDay = '2008-01-01'
const today = utcToday()
const day = ref(today)
const calendarDay = ref('')
const calendarOpen = ref(false)
const tab = ref<'platform' | 'local'>('platform')

function validDay(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= firstDay &&
    value <= today &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}

function selectDay(value: string) {
  if (!validDay(value)) return
  day.value = value
  calendarOpen.value = false
}

function changeDay(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  if (validDay(input.value)) selectDay(input.value)
  else input.value = day.value
}

watch(
  () => route.query.view,
  (view) => {
    tab.value = view === 'local' ? 'local' : 'platform'
  },
  { immediate: true },
)
watch(
  () => route.query.day,
  (value) => {
    selectDay(validDay(value) ? value : today)
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
const github = computed(() => selected.value?.provider === 'github')
const showCalendar = computed(() => github.value && calendarOpen.value)
const requestDay = computed(() => (github.value && !showCalendar.value ? day.value : null))
const { response, cached, loading, error, refresh } = useContributionSource(
  () => (tab.value === 'platform' ? selected.value : undefined),
  () => requestDay.value,
  { loadOnCacheMiss: true },
)
const source = computed(() => response.value?.data)
const events = computed(() => {
  if (source.value?.source !== 'giteePublicEvents') return []
  return source.value.events.filter((event) => {
    const date = new Date(event.createdAt)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day.value
  })
})
onMounted(() => {
  if (native) void ensureLoaded()
})
</script>

<template>
  <div class="page-heading">
    <div>
      <h1 id="page-title" tabindex="-1">{{ t('Activity') }}</h1>
      <p class="page-description">
        {{ t('Browse platform contributions and local commits by UTC date.') }}
      </p>
    </div>
  </div>
  <div class="activity-toolbar">
    <div class="local-actions" :aria-label="t('Contribution sources')">
      <button
        class="button button-secondary"
        type="button"
        :aria-pressed="tab === 'platform'"
        @click="tab = 'platform'"
      >
        {{ t('Platform activity') }}
      </button>
      <button
        class="button button-secondary"
        type="button"
        :aria-pressed="tab === 'local'"
        @click="tab = 'local'"
      >
        {{ t('Local Git activity') }}
      </button>
    </div>
    <label class="contribution-field activity-date-field">
      {{ t('UTC date') }}
      <input
        class="form-control"
        type="date"
        :value="day"
        :min="firstDay"
        :max="today"
        required
        @change="changeDay"
      />
    </label>
  </div>
  <section
    v-show="tab === 'platform'"
    class="panel contribution-panel"
    :aria-label="t('Contribution sources')"
  >
    <h2>{{ t('Platform activity') }}</h2>
    <div class="contribution-controls">
      <label v-if="accounts.length" class="contribution-field">
        {{ t('Account') }}
        <select v-model="accountId" class="form-control" @change="calendarOpen = false">
          <optgroup class="select-options" label="">
            <option v-for="account in accounts" :key="account.id" :value="account.id">
              {{ providerName(account.provider) }} · {{ account.login }}
            </option>
          </optgroup>
        </select>
      </label>
      <button
        v-if="selected"
        class="button button-primary"
        type="button"
        :disabled="loading"
        @click="refresh"
      >
        {{ t(response ? 'Refresh source' : 'Load source') }}
      </button>
      <button
        v-if="github"
        class="button button-secondary"
        type="button"
        @click="calendarOpen = !showCalendar"
      >
        {{ t(showCalendar ? 'Show daily activity' : 'Show contribution calendar') }}
      </button>
    </div>
    <p v-if="accountsLoading" role="status">{{ t('Loading accounts…') }}</p>
    <template v-else-if="accountsError">
      <p role="alert">{{ t(accountsError.message) }}</p>
      <div>
        <button class="button button-secondary" type="button" @click="reloadAccounts">
          {{ t('Reload accounts') }}
        </button>
      </div>
    </template>
    <p v-else-if="!selected">
      <RouterLink v-if="native" to="/settings" class="text-link">{{
        t('Connect an account')
      }}</RouterLink>
      <template v-else>{{ t('Contribution sources are available in the desktop app.') }}</template>
    </p>
    <p v-else-if="!github" class="contribution-note">
      {{ t('Gitee public sample. Full-year calendar unavailable.') }}
    </p>
    <p v-if="loading" role="status">{{ t('Refreshing contribution source…') }}</p>
    <p v-if="error" role="alert">{{ t(error) }}</p>
    <ContributionStatus v-if="response" :refreshed-at="response.refreshedAt" :cached="cached" />
    <template v-if="source?.source === 'giteePublicEvents'">
      <h3>{{ t('Gitee public events') }}</h3>
      <p class="contribution-note">
        {{
          t('Up to {count} events from the public feed. Coverage dates are unknown.', {
            count: source.limit,
          })
        }}
      </p>
      <p v-if="!source.events.length">{{ t('No events returned by this source.') }}</p>
      <p v-else-if="!events.length">
        {{ t('No events in the public sample match this UTC day.') }}
      </p>
      <ul v-else class="activity-entries">
        <li v-for="event in events" :key="event.id">
          <strong>{{ event.eventType || t('Unclassified event') }}</strong>
          <span v-if="event.repository?.name">{{ event.repository.name }}</span>
          <time class="contribution-note" :datetime="event.createdAt">{{ event.createdAt }}</time>
        </li>
      </ul>
    </template>
    <template v-else-if="source">
      <h3>
        {{
          t(source.source === 'githubCalendar' ? 'GitHub calendar summary' : 'GitHub daily counts')
        }}
      </h3>
      <ContributionCalendar
        v-if="source.source === 'githubCalendar'"
        v-model="calendarDay"
        :source="source"
        @select="selectDay"
      />
      <ul v-else class="activity-entries">
        <li>{{ t('Commits: {count}', { count: source.totalCommitContributions }) }}</li>
        <li>
          {{ t('Pull requests opened: {count}', { count: source.totalPullRequestContributions }) }}
        </li>
        <li>{{ t('Issues opened: {count}', { count: source.totalIssueContributions }) }}</li>
      </ul>
      <p
        v-if="source.source === 'githubDay' && source.restrictedContributionsCount"
        class="contribution-note"
      >
        {{
          t('GitHub reports {count} restricted contributions without details.', {
            count: source.restrictedContributionsCount,
          })
        }}
      </p>
    </template>
  </section>
  <LocalActivity v-if="tab === 'local'" :day="day" />
</template>

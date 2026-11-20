<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAccounts } from '../composables/accounts'
import { useContributionSource } from '../composables/contributions'
import { providerName, type Provider } from '../lib/accounts'
import ContributionCalendar from './ContributionCalendar.vue'
import ContributionStatus from './ContributionStatus.vue'

const props = defineProps<{ provider: Provider }>()
const router = useRouter()
const {
  accounts,
  loading: accountsLoading,
  error: accountsError,
  refresh: refreshAccounts,
} = useAccounts()
const name = computed(() => providerName(props.provider))
const connections = computed(() =>
  accounts.value.filter((item) => item.provider === props.provider),
)
const accountId = ref('')
const selectedDay = ref('')
const selected = computed(() => connections.value.find((item) => item.id === accountId.value))
const { response, cached, loading, error, refresh } = useContributionSource(
  () => selected.value,
  () => null,
)
watch(
  connections,
  (items) => {
    if (!items.some((item) => item.id === accountId.value)) accountId.value = items[0]?.id ?? ''
  },
  { immediate: true },
)
watch(accountId, () => {
  selectedDay.value = ''
})

function openActivity(day: string) {
  void router.push({ name: 'activity', query: { account: accountId.value, day } })
}
</script>

<template>
  <section class="provider-card" :aria-label="`${name} contributions`">
    <div class="provider-heading">
      <div class="provider-title">
        <span class="provider-mark" :class="{ gitee: provider === 'gitee' }" aria-hidden="true">{{
          provider === 'github' ? 'GH' : 'G'
        }}</span>
        <h3>{{ name }}</h3>
      </div>
      <span v-if="!selected && !accountsLoading" class="status">Not connected</span>
    </div>
    <div class="provider-content">
      <p v-if="accountsLoading" role="status">Loading accounts…</p>
      <template v-else-if="accountsError">
        <p role="alert">{{ accountsError.message }}</p>
        <div>
          <button class="button button-secondary" @click="refreshAccounts">Reload accounts</button>
        </div>
      </template>
      <template v-else-if="selected">
        <div class="contribution-controls">
          <label class="contribution-field">
            {{ name }} account
            <select v-model="accountId" class="form-control">
              <option v-for="item in connections" :key="item.id" :value="item.id">
                {{ item.login }}
              </option>
            </select>
          </label>
          <button
            class="button button-secondary"
            type="button"
            :disabled="loading"
            @click="refresh"
          >
            Refresh {{ name }}
          </button>
        </div>
        <p v-if="loading" role="status">Refreshing {{ name }}…</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <ContributionCalendar
          v-if="response?.data.source === 'githubCalendar'"
          v-model="selectedDay"
          :source="response.data"
          @select="openActivity"
        />
        <template v-if="response?.data.source === 'giteePublicEvents'">
          <p>
            <strong>{{ response.data.events.length }} events in the public sample</strong>
          </p>
          <p class="contribution-note">
            Up to {{ response.data.limit }} events. Coverage dates are unknown.
          </p>
          <ul v-if="response.data.events.length" class="activity-entries">
            <li v-for="event in response.data.events.slice(0, 3)" :key="event.id">
              <strong>{{ event.eventType || 'Unclassified event' }}</strong>
              <span v-if="event.repository?.name">{{ event.repository.name }}</span>
              <time class="contribution-note" :datetime="event.createdAt">{{
                event.createdAt
              }}</time>
            </li>
          </ul>
        </template>
        <ContributionStatus v-if="response" :refreshed-at="response.refreshedAt" :cached="cached" />
        <p v-else-if="!loading && !error" class="contribution-note">
          Refresh to load {{ name }} data.
        </p>
      </template>
      <p v-else class="calendar-message">Connect a {{ name }} account to load data.</p>
      <p class="contribution-note">
        {{
          provider === 'github'
            ? 'Source · GitHub contribution calendar'
            : 'Source · Gitee public events. Full-year calendar unavailable.'
        }}
      </p>
    </div>
    <div class="provider-footer">
      <RouterLink to="/settings" :aria-label="`View ${name} account settings`"
        >Account settings</RouterLink
      >
      <RouterLink v-if="selected" :to="{ name: 'activity', query: { account: accountId } }"
        >Open activity</RouterLink
      >
    </div>
  </section>
</template>

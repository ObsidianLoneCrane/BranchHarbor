<script setup lang="ts">
import { t } from '../lib/locale'
import { computed, ref, watch } from 'vue'
import { useAccounts } from '../composables/accounts'
import { useContributionSource } from '../composables/contributions'
import { providerName, type Provider } from '../lib/accounts'
import ContributionStatus from './ContributionStatus.vue'

const props = defineProps<{ provider: Provider }>()
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
</script>

<template>
  <section class="provider-card" :aria-label="t('{provider} contributions', { provider: name })">
    <div class="provider-heading">
      <div class="provider-title">
        <span class="provider-mark" :class="{ gitee: provider === 'gitee' }" aria-hidden="true">{{
          provider === 'github' ? 'GH' : 'G'
        }}</span>
        <h3>{{ name }}</h3>
      </div>
      <span v-if="!selected && !accountsLoading" class="status">{{ t('Not connected') }}</span>
    </div>
    <div class="provider-content">
      <p v-if="accountsLoading" role="status">{{ t('Loading accounts…') }}</p>
      <template v-else-if="accountsError">
        <p role="alert">{{ t(accountsError.message) }}</p>
        <div>
          <button class="button button-secondary" @click="refreshAccounts">
            {{ t('Reload accounts') }}
          </button>
        </div>
      </template>
      <template v-else-if="selected">
        <div class="contribution-controls">
          <label v-if="connections.length > 1" class="contribution-field">
            {{ t(provider === 'github' ? 'GitHub account' : 'Gitee account') }}
            <select v-model="accountId" class="form-control">
              <optgroup class="select-options" label="">
                <option v-for="item in connections" :key="item.id" :value="item.id">
                  {{ item.login }}
                </option>
              </optgroup>
            </select>
          </label>
          <span v-else class="contribution-note" :title="selected.login">{{ selected.login }}</span>
          <button
            class="button button-secondary"
            type="button"
            :disabled="loading"
            @click="refresh"
          >
            {{ t(provider === 'github' ? 'Refresh GitHub' : 'Refresh Gitee') }}
          </button>
        </div>
        <p v-if="loading" role="status">{{ t('Refreshing {provider}…', { provider: name }) }}</p>
        <p v-if="error" role="alert">{{ t(error) }}</p>
        <p v-if="response?.data.source === 'githubCalendar'">
          <strong>{{
            t('{count} contributions', { count: response.data.calendar.totalContributions })
          }}</strong>
        </p>
        <template v-if="response?.data.source === 'giteePublicEvents'">
          <p>
            <strong>{{
              t('{count} events in the public sample', { count: response.data.events.length })
            }}</strong>
          </p>
          <p class="contribution-note">
            {{
              t('Up to {count} events. Coverage dates are unknown.', { count: response.data.limit })
            }}
          </p>
        </template>
        <ContributionStatus v-if="response" :refreshed-at="response.refreshedAt" :cached="cached" />
        <p v-else-if="!loading && !error" class="contribution-note">
          {{ t('Refresh to load {provider} data.', { provider: name }) }}
        </p>
      </template>
      <p class="contribution-note">
        {{
          t(
            provider === 'github'
              ? 'Source · GitHub contribution calendar'
              : 'Source · Gitee public events. Full-year calendar unavailable.',
          )
        }}
      </p>
    </div>
    <div class="provider-footer">
      <RouterLink
        to="/settings"
        :aria-label="t('View {provider} account settings', { provider: name })"
        >{{ t('Account settings') }}</RouterLink
      >
      <RouterLink v-if="selected" :to="{ name: 'activity', query: { account: accountId } }">{{
        t('Open activity')
      }}</RouterLink>
    </div>
  </section>
</template>

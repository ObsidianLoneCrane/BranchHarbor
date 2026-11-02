<script setup lang="ts">
import { ArrowUpRight, LockKeyhole } from '@lucide/vue'
import { computed } from 'vue'
import { useAccounts } from '../composables/accounts'
const props = defineProps<{ provider: 'GitHub' | 'Gitee' }>()
const connections = computed(() =>
  useAccounts().accounts.value.filter(
    (account) => account.provider === props.provider.toLowerCase(),
  ),
)
const status = computed(() =>
  !connections.value.length
    ? 'Not connected'
    : connections.value.some((account) => account.credentialStatus === 'saved')
      ? `${connections.value.length} saved account${connections.value.length > 1 ? 's' : ''}`
      : 'Reconnect needed',
)
</script>

<template>
  <section class="provider-card" :aria-label="`${provider} contributions`">
    <div class="provider-heading">
      <div class="provider-title">
        <span class="provider-mark" :class="{ gitee: provider === 'Gitee' }" aria-hidden="true">{{
          provider === 'GitHub' ? 'GH' : 'G'
        }}</span>
        <h3>{{ provider }}</h3>
      </div>
      <span class="status"><span class="status-dot" />{{ status }}</span>
    </div>
    <div class="calendar-placeholder" aria-hidden="true">
      <span v-for="cell in 371" :key="cell" />
    </div>
    <p class="calendar-message">
      <LockKeyhole :size="13" aria-hidden="true" />Contribution data is not available yet
    </p>
    <div class="provider-footer">
      <span>Independent platform calendar</span
      ><RouterLink to="/settings" :aria-label="`View ${provider} account settings`"
        >Account settings<ArrowUpRight :size="14" aria-hidden="true"
      /></RouterLink>
    </div>
  </section>
</template>

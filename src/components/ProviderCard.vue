<script setup lang="ts">
import { ArrowUpRight, LockKeyhole } from '@lucide/vue'
defineProps<{ provider: 'GitHub' | 'Gitee' }>()
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
      <span class="status"><span class="status-dot" />Not connected</span>
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

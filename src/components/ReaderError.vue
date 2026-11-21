<script setup lang="ts">
import { t } from '../lib/locale'
import type { AccountError } from '../lib/accounts'
defineProps<{ error: AccountError; remaining: number; busy: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="account-alert reader-error" role="alert">
    <p>{{ t(error.message) }}</p>
    <div class="repository-error-actions">
      <span v-if="remaining">{{ t('Try again in {count} seconds.', { count: remaining }) }}</span
      ><button
        class="button button-secondary"
        :disabled="busy || remaining > 0"
        @click="$emit('retry')"
      >
        {{ t('Retry') }}</button
      ><RouterLink
        v-if="
          [
            'unauthorized',
            'resourceUnavailable',
            'credentialMissing',
            'credentialUnavailable',
            'accountNotFound',
          ].includes(error.code)
        "
        to="/settings"
        class="text-link"
        >{{ t('Manage account') }}</RouterLink
      >
    </div>
  </div>
</template>

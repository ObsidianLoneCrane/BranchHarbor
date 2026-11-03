<script setup lang="ts">
import type { AccountError } from '../lib/accounts'
defineProps<{ error: AccountError; remaining: number; busy: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="account-alert reader-error" role="alert">
    <p>{{ error.message }}</p>
    <div class="repository-error-actions">
      <span v-if="remaining">Try again in {{ remaining }} seconds.</span
      ><button
        class="button button-secondary"
        :disabled="busy || remaining > 0"
        @click="$emit('retry')"
      >
        Retry</button
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
        >Manage account</RouterLink
      >
    </div>
  </div>
</template>

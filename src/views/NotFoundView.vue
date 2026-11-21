<script setup lang="ts">
import { t } from '../lib/locale'
import EmptyState from '../components/EmptyState.vue'
</script>

<template>
  <h1 id="page-title" tabindex="-1" class="not-found-title">{{ t('Page not found') }}</h1>
  <section class="panel">
    <EmptyState
      :title="t('Check the address')"
      :description="t('This page does not exist. Return to Home to continue.')"
      :action="t('Back to Home')"
      to="/"
    />
  </section>
</template>

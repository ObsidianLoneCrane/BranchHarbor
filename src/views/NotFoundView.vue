<script setup lang="ts">
import EmptyState from '../components/EmptyState.vue'
</script>

<template>
  <h1 id="page-title" tabindex="-1" class="not-found-title">Page not found</h1>
  <section class="panel">
    <EmptyState
      title="A little off the beaten path"
      description="This page does not exist. Your workspace is still right here."
      action="Back to Home"
      to="/"
    />
  </section>
</template>

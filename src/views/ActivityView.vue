<script setup lang="ts">
import WorkspaceActivity from '../components/WorkspaceActivity.vue'
import { t } from '../lib/locale'
import '../localGit.css'
</script>

<template>
  <div class="page-heading">
    <h1 id="page-title" tabindex="-1">{{ t('Activity') }}</h1>
  </div>
  <WorkspaceActivity />
</template>

<script setup lang="ts">
import { CircleDot, GitCommitHorizontal, GitPullRequest } from '@lucide/vue'
import EmptyState from '../components/EmptyState.vue'
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">THE LITTLE STEPS ADD UP</p>
      <h1 id="page-title" tabindex="-1">Activity</h1>
      <p class="page-description">A record of your work, one day at a time.</p>
    </div>
  </div>
  <section class="panel" aria-label="Activity timeline">
    <div class="panel-toolbar">
      <span>Your timeline</span><span class="subtle-badge">Awaiting integration</span>
    </div>
    <EmptyState
      title="A fresh page in your story"
      description="Commits, pull requests, and issue activity will appear here once the platform integrations are ready."
      action="Explore account settings"
      to="/settings"
    />
  </section>
  <div class="activity-types">
    <div>
      <GitCommitHorizontal :size="20" aria-hidden="true" />
      <h3>Commits</h3>
      <p>Small changes, lasting progress.</p>
    </div>
    <div>
      <GitPullRequest :size="20" aria-hidden="true" />
      <h3>Pull requests</h3>
      <p>Ideas moving toward a merge.</p>
    </div>
    <div>
      <CircleDot :size="20" aria-hidden="true" />
      <h3>Issues</h3>
      <p>Keep track of what comes next.</p>
    </div>
  </div>
  <p class="development-note">
    Activity and platform contribution totals use different data and counting rules.
  </p>
</template>

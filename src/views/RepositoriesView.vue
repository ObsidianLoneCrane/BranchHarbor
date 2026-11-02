<script setup lang="ts">
import { GitBranch, HardDrive, Plus } from '@lucide/vue'
import RepositoryBrowser from '../components/RepositoryBrowser.vue'
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">A PLACE FOR YOUR PROJECTS</p>
      <h1 id="page-title" tabindex="-1">Repositories</h1>
      <p class="page-description">Local projects and remote repositories, within reach.</p>
    </div>
    <button
      class="button button-primary"
      disabled
      title="Repository creation is planned for a later stage"
    >
      <Plus :size="16" aria-hidden="true" />New repository
    </button>
  </div>
  <RepositoryBrowser />
  <div class="two-column-info">
    <div class="info-card">
      <HardDrive :size="20" aria-hidden="true" />
      <div>
        <h3>Keep your local workflow</h3>
        <p>Existing repositories stay in their folders. Import support is coming next.</p>
      </div>
    </div>
    <div class="info-card">
      <GitBranch :size="20" aria-hidden="true" />
      <div>
        <h3>More than one remote</h3>
        <p>A project can connect to GitHub and Gitee, with explicit push targets.</p>
      </div>
    </div>
  </div>
</template>

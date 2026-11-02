<script setup lang="ts">
import { FolderGit2, GitBranch, HardDrive, Plus } from '@lucide/vue'
import EmptyState from '../components/EmptyState.vue'
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
  <section class="panel repository-panel" aria-label="Repository workspace">
    <div class="panel-toolbar">
      <span><FolderGit2 :size="17" aria-hidden="true" />Your repositories</span
      ><span class="subtle-badge">Not connected</span>
    </div>
    <EmptyState
      title="Your projects start here"
      description="Import a local project or connect a hosting account to bring your work into one workspace."
      action="Explore account settings"
      to="/settings"
      ><div class="availability-note">
        Repository import and creation are not available in this preview.
      </div></EmptyState
    >
  </section>
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

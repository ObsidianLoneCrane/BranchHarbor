<script setup lang="ts">
import { ArrowRight, ArrowUpRight, FolderGit2, GitBranch, Link2 } from '@lucide/vue'
import ProviderCard from '../components/ProviderCard.vue'
import { useAccounts } from '../composables/accounts'
const { accounts } = useAccounts()
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">YOUR WORK, IN ONE PLACE</p>
      <h1 id="page-title" tabindex="-1">A clearer view of your work.</h1>
      <p class="page-description">
        A little space for your repositories, contributions, and what comes next.
      </p>
    </div>
  </div>
  <section class="welcome-banner" aria-labelledby="welcome-title">
    <div class="welcome-copy">
      <span class="subtle-badge"
        ><span class="status-dot accent-dot" />{{
          accounts.length ? 'Accounts connected' : 'A fresh workspace'
        }}</span
      >
      <h2 id="welcome-title">
        {{
          accounts.length
            ? 'Your repositories are within reach.'
            : 'Every good project starts somewhere.'
        }}
      </h2>
      <p v-if="accounts.length">
        Browse the projects available to your connected accounts.<br class="wide-break" />Each
        platform keeps its own identity.
      </p>
      <p v-else>
        Your accounts and repositories will find a home here.<br class="wide-break" />Explore the
        workspace while the connections take shape.
      </p>
      <RouterLink
        :to="accounts.length ? '/repositories' : '/settings'"
        class="button button-primary"
        >{{ accounts.length ? 'Browse repositories' : 'Explore account settings'
        }}<ArrowUpRight :size="16" aria-hidden="true"
      /></RouterLink>
    </div>
    <div class="branch-art" aria-hidden="true">
      <div class="art-orbit orbit-one" />
      <div class="art-orbit orbit-two" />
      <div class="art-node node-a"><FolderGit2 :size="23" /></div>
      <div class="art-node node-b"><Link2 :size="21" /></div>
      <div class="art-node node-c"><GitBranch :size="29" /></div>
      <svg viewBox="0 0 250 190">
        <path d="M60 50V95Q60 130 100 130H175M175 130V45M175 130V160" /></svg
      ><span class="art-label">ONE WORKSPACE, MANY POSSIBILITIES</span>
    </div>
  </section>
  <section aria-labelledby="contributions-title">
    <div class="section-heading">
      <div>
        <h2 id="contributions-title">Your contributions</h2>
        <p>Two platforms. Each with its own story.</p>
      </div>
      <span class="section-note">Separate by design</span>
    </div>
    <div class="provider-grid">
      <ProviderCard provider="GitHub" /><ProviderCard provider="Gitee" />
    </div>
  </section>
  <section aria-labelledby="recent-title" class="recent-section">
    <div class="section-heading">
      <div>
        <h2 id="recent-title">Recent repositories</h2>
        <p>Pick up where you left off.</p>
      </div>
      <RouterLink to="/repositories" class="text-link"
        >All repositories<ArrowRight :size="15" aria-hidden="true"
      /></RouterLink>
    </div>
    <div class="recent-empty">
      <div class="muted-icon"><FolderGit2 :size="23" :stroke-width="1.5" aria-hidden="true" /></div>
      <div>
        <h3>A home for your next project</h3>
        <p>Your imported and connected repositories will appear here.</p>
      </div>
      <RouterLink to="/repositories" class="icon-button" aria-label="Explore repositories"
        ><ArrowRight :size="18"
      /></RouterLink>
    </div>
  </section>
  <p class="development-note">
    Account connections and repository discovery are available in the desktop app. Git operations
    and contribution calendars are coming in later stages.
  </p>
</template>

<script setup lang="ts">
import { ArrowRight, FolderGit2 } from '@lucide/vue'
import { computed } from 'vue'
import ActivityTimeline from '../components/ActivityTimeline.vue'
import WorkspaceRepositoryRows from '../components/WorkspaceRepositoryRows.vue'
import { useWorkspaceRepositories } from '../composables/workspaceRepositories'
import { useWorkspaceActivity } from '../composables/workspaceActivity'
import { providerName } from '../lib/accounts'
import { t } from '../lib/locale'
import '../localGit.css'
import '../overview.css'

const { popular, busy, accounts, localError, failures } = useWorkspaceRepositories()
const { items: activity, loading, errors } = useWorkspaceActivity()
const platforms = computed(() =>
  (['github', 'gitee'] as const).map((provider) => {
    const matches = accounts.value.filter((account) => account.provider === provider)
    return {
      provider,
      count: matches.length,
      login: matches.length === 1 ? matches[0]?.login : undefined,
      connected: matches.some((account) => account.credentialStatus === 'saved'),
    }
  }),
)
</script>

<template>
  <div class="overview">
    <div class="page-heading overview-heading">
      <h1 id="page-title" tabindex="-1">{{ t('Overview') }}</h1>
      <RouterLink to="/repositories" class="button button-primary">
        <FolderGit2 :size="16" aria-hidden="true" />{{ t('Browse repositories') }}
      </RouterLink>
    </div>
    <div class="overview-grid">
      <section class="panel local-panel" :aria-label="t('Frequently used repositories')">
        <div class="local-toolbar">
          <h2>{{ t('Frequently used repositories') }}</h2>
          <RouterLink to="/repositories" class="text-link"
            >{{ t('All repositories') }} <ArrowRight :size="14" aria-hidden="true"
          /></RouterLink>
        </div>
        <WorkspaceRepositoryRows v-if="popular.length" :items="popular.slice(0, 5)" />
        <p v-else-if="busy" role="status">{{ t('Loading repositories...') }}</p>
        <p v-else>{{ t('No repositories to show') }}</p>
        <p v-if="localError" class="workspace-warning">{{ t(localError) }}</p>
        <p v-if="Object.keys(failures).length" class="workspace-warning">
          {{ t('Some sources could not be loaded.') }}
        </p>
      </section>
      <section class="panel local-panel" :aria-label="t('Recent activity')">
        <div class="local-toolbar">
          <h2>{{ t('Recent activity') }}</h2>
          <RouterLink to="/activity" class="text-link"
            >{{ t('Open activity') }} <ArrowRight :size="14" aria-hidden="true"
          /></RouterLink>
        </div>
        <p v-if="loading && !activity.length" role="status">{{ t('Loading activity…') }}</p>
        <ActivityTimeline v-else :items="activity.slice(0, 5)" />
        <p v-if="Object.keys(errors).length" class="workspace-warning">
          {{ t('Some sources could not be loaded.') }}
        </p>
      </section>
    </div>
    <section class="panel local-panel" :aria-label="t('Connected accounts')">
      <div v-for="item in platforms" :key="item.provider" class="platform-summary">
        <span class="source-mark" :data-source="item.provider">{{
          item.provider === 'github' ? 'GH' : 'G'
        }}</span>
        <strong>{{ providerName(item.provider) }}</strong>
        <span v-if="item.login">@{{ item.login }}</span>
        <span v-else-if="item.count">{{
          t('{count} connected accounts', { count: item.count })
        }}</span>
        <span class="platform-status">{{ t(item.connected ? 'Connected' : 'Not connected') }}</span>
        <RouterLink to="/settings" class="text-link">{{ t('Account settings') }}</RouterLink>
      </div>
    </section>
  </div>
</template>

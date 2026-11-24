<script setup lang="ts">
import { FolderGit2, Globe2 } from '@lucide/vue'
import type { WorkspaceRepository } from '../composables/workspaceRepositories'
import { providerName } from '../lib/accounts'
import { displayLocalPath } from '../lib/localGit'
import { t } from '../lib/locale'

defineProps<{ items: WorkspaceRepository[] }>()
</script>

<template>
  <ul class="local-list workspace-repositories" :aria-label="t('Repositories')">
    <li v-for="item in items" :key="item.key" class="workspace-repository-row">
      <div class="workspace-repository-title">
        <component
          :is="item.local ? FolderGit2 : Globe2"
          :size="16"
          class="workspace-icon"
          aria-hidden="true"
        />
        <h2>{{ item.name }}</h2>
        <span
          v-for="source in item.sources"
          :key="source"
          class="source-mark"
          :data-source="source"
          >{{ source === 'local' ? t('Local') : providerName(source) }}</span
        >
      </div>
      <p v-if="item.local" class="workspace-repository-path">
        {{ displayLocalPath(item.local.path) }}
      </p>
      <div class="local-actions">
        <RouterLink
          v-if="item.local"
          class="text-link"
          :to="{ name: 'local-repository', params: { id: item.local.id } }"
          >{{ item.remotes.length ? t('Local workspace') : t('Open repository') }}</RouterLink
        >
        <RouterLink
          v-for="remote in item.remotes"
          :key="`${remote.provider}:${remote.owner}/${remote.name}`"
          class="text-link"
          :to="{
            name: 'repository-explorer',
            params: { accountId: remote.accountId, owner: remote.owner, name: remote.name },
          }"
        >
          {{
            item.remotes.length > 1
              ? `${providerName(remote.provider)} · ${remote.owner}/${remote.name}`
              : t(item.local ? 'Browse remote' : 'Open repository')
          }}
        </RouterLink>
      </div>
    </li>
  </ul>
</template>

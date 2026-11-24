<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkspaceActivity } from '../composables/workspaceActivity'
import { t } from '../lib/locale'
import ActivityTimeline from './ActivityTimeline.vue'

const { items, errors, loading, limited, skipped, more, refresh, hasMore } = useWorkspaceActivity()
const source = ref('all')
const repository = ref('')
const kind = ref('')
const kinds = computed(() => [...new Set(items.value.map((item) => item.type))].sort())
const visible = computed(() =>
  items.value.filter(
    (item) =>
      (source.value === 'all' || item.source === source.value) &&
      (!kind.value || item.type === kind.value) &&
      item.repository.toLowerCase().includes(repository.value.trim().toLowerCase()),
  ),
)
</script>

<template>
  <section class="panel local-panel" :aria-label="t('Recent activity')" :aria-busy="loading">
    <div class="workspace-filters">
      <label class="local-field"
        >{{ t('Activity source') }}
        <select v-model="source" class="form-control">
          <optgroup class="select-options" label="">
            <option value="all">{{ t('All sources') }}</option>
            <option value="local">{{ t('Local') }}</option>
            <option value="github">GitHub</option>
            <option value="gitee">Gitee</option>
          </optgroup>
        </select>
      </label>
      <label class="local-field"
        >{{ t('Repository') }} <input v-model="repository" class="form-control" type="search"
      /></label>
      <label class="local-field"
        >{{ t('Activity type') }}
        <select v-model="kind" class="form-control">
          <optgroup class="select-options" label="">
            <option value="">{{ t('All') }}</option>
            <option v-for="type in kinds" :key="type" :value="type">{{ t(type) }}</option>
          </optgroup>
        </select>
      </label>
      <button class="button button-secondary" type="button" :disabled="loading" @click="refresh">
        {{ t('Refresh') }}
      </button>
    </div>
    <p class="workspace-repository-path">
      {{
        t(
          'Platform feeds show available public events. Local history uses registered working trees.',
        )
      }}
    </p>
    <p v-for="(error, key) in errors" :key="key" class="workspace-warning" role="alert">
      {{ t(error) }}
    </p>
    <p v-if="skipped" class="workspace-warning">
      {{ t('{count} working trees could not be read.', { count: skipped }) }}
    </p>
    <p v-if="loading && !visible.length" role="status">{{ t('Loading activity…') }}</p>
    <ActivityTimeline v-else :items="visible" group-by-day />
    <button
      v-if="hasMore"
      class="button button-secondary workspace-more"
      type="button"
      :disabled="loading"
      @click="more"
    >
      {{ t('Load more activity') }}
    </button>
    <p v-else-if="limited" class="workspace-repository-path">
      {{ t('Local activity reached its preview limit.') }}
    </p>
  </section>
</template>

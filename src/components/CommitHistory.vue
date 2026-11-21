<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { historyLaneColor, layoutHistory, localHistory, type Commit } from '../lib/history'
import { localGitError } from '../lib/localGit'
import { t } from '../lib/locale'
import WorkspaceSplit from './WorkspaceSplit.vue'

const props = defineProps<{ id: number; revision: number }>()
const commits = ref<Commit[]>([])
const selected = ref('')
const detailOpen = ref(false)
const limited = ref(false)
const loading = ref(false)
const error = ref('')
const graph = computed(() => layoutHistory(commits.value))
const width = computed(() => Math.max(1, ...graph.value.map((row) => row.width)) * 15 + 8)
const detail = computed(() => commits.value.find((commit) => commit.hash === selected.value))
const laneX = (lane: number) => 11 + lane * 15

function select(hash: string) {
  selected.value = hash
  detailOpen.value = true
}

watch(
  () => props.id,
  () => {
    detailOpen.value = false
  },
)

watch(
  () => [props.id, props.revision],
  async (_, __, cleanup) => {
    let current = true
    cleanup(() => {
      current = false
    })
    loading.value = true
    error.value = ''
    try {
      const result = await localHistory(props.id)
      if (!current) return
      commits.value = result.commits
      limited.value = result.limited
      if (!commits.value.some((commit) => commit.hash === selected.value))
        selected.value = commits.value[0]?.hash ?? ''
    } catch (cause) {
      if (!current) return
      commits.value = []
      error.value = localGitError(cause)
    } finally {
      if (current) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="panel task-panel" :aria-label="t('Commit history')">
    <div class="task-panel-heading">
      <h2>{{ t('Commit history') }}</h2>
      <p>{{ t('Local refs and last-fetched remote refs') }}</p>
    </div>
    <p v-if="loading" class="task-message" role="status">{{ t('Loading history…') }}</p>
    <p v-else-if="error" class="task-message" role="alert">{{ t(error) }}</p>
    <p v-else-if="!graph.length" class="task-message">{{ t('No commits yet') }}</p>
    <WorkspaceSplit v-else v-model="detailOpen" heading="Back to history" history>
      <template #list>
        <ol class="history-list">
          <li v-for="row in graph" :key="row.commit.hash">
            <button
              type="button"
              :aria-pressed="selected === row.commit.hash"
              @click="select(row.commit.hash)"
            >
              <svg :width="width" height="46" aria-hidden="true">
                <path
                  v-for="(line, index) in row.lines"
                  :key="index"
                  :d="`M ${laneX(line.from)} ${line.startsAtCommit ? 23 : 0} C ${laneX(line.from)} 32 ${laneX(line.to)} 38 ${laneX(line.to)} 46`"
                  :style="{ '--lane-color': historyLaneColor(line.color) }"
                />
                <line
                  v-if="row.incoming"
                  :x1="laneX(row.lane)"
                  y1="0"
                  :x2="laneX(row.lane)"
                  y2="23"
                  :style="{ '--lane-color': historyLaneColor(row.color) }"
                />
                <circle
                  :cx="laneX(row.lane)"
                  cy="23"
                  :r="row.commit.parents.length > 1 ? 5 : 4"
                  :style="{ '--lane-color': historyLaneColor(row.color) }"
                />
              </svg>
              <span class="history-row-copy">
                <strong :title="row.commit.subject">{{
                  row.commit.subject || t('(No commit subject)')
                }}</strong>
                <span
                  ><code>{{ row.commit.hash.slice(0, 8) }}</code> · {{ row.commit.author }}</span
                >
              </span>
              <span v-if="row.commit.refs.length" class="history-refs">
                <span :title="row.commit.refs[0]">{{ row.commit.refs[0] }}</span>
                <span v-if="row.commit.refs.length > 1">{{
                  t('{count} more', { count: row.commit.refs.length - 1 })
                }}</span>
              </span>
            </button>
          </li>
        </ol>
      </template>
      <div v-if="detail" class="history-detail">
        <h3>{{ t('Commit details') }}</h3>
        <pre>{{ detail.message || detail.subject }}</pre>
        <p>
          {{ detail.author }} · <time :datetime="detail.date">{{ detail.date.slice(0, 10) }}</time>
        </p>
        <code>{{ detail.hash }}</code>
        <details v-if="detail.refs.length" class="task-disclosure">
          <summary>{{ t('References') }}</summary>
          <ul>
            <li v-for="reference in detail.refs" :key="reference">
              <code>{{ reference }}</code>
            </li>
          </ul>
        </details>
        <h4>{{ t('Parents') }}</h4>
        <ul v-if="detail.parents.length">
          <li v-for="parent in detail.parents" :key="parent">
            <button
              v-if="commits.some((commit) => commit.hash === parent)"
              type="button"
              class="text-button"
              @click="selected = parent"
            >
              <code>{{ parent.slice(0, 12) }}</code>
            </button>
            <code v-else>{{ parent.slice(0, 12) }} · {{ t('Outside loaded history') }}</code>
          </li>
        </ul>
        <p v-else>{{ t('Root commit') }}</p>
      </div>
    </WorkspaceSplit>
    <p v-if="limited" class="task-message">
      {{ t('Showing the first 150 commits in topological order.') }}
    </p>
  </section>
</template>

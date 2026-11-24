<script setup lang="ts">
import { CircleDot, GitCommitHorizontal, GitPullRequest, Upload, Zap } from '@lucide/vue'
import { computed } from 'vue'
import type { TimelineItem } from '../composables/workspaceActivity'
import { providerName } from '../lib/accounts'
import { language, t } from '../lib/locale'

const props = defineProps<{ items: TimelineItem[]; groupByDay?: boolean }>()
const dateFormat = computed(() => new Intl.DateTimeFormat(language.value, { dateStyle: 'full' }))
const timeFormat = computed(
  () =>
    new Intl.DateTimeFormat(language.value, {
      dateStyle: props.groupByDay ? undefined : 'medium',
      timeStyle: 'short',
    }),
)
const days = computed(() => {
  if (!props.groupByDay) return [{ key: 'recent', date: '', time: 0, items: props.items }]
  const groups = new Map<
    string,
    { key: string; date: string; time: number; items: TimelineItem[] }
  >()
  for (const item of props.items) {
    const local = new Date(item.time)
    const day = [local.getFullYear(), local.getMonth() + 1, local.getDate()]
      .map((part) => String(part).padStart(2, '0'))
      .join('-')
    let group = groups.get(day)
    if (!group) {
      group = { key: day, date: day, time: item.time, items: [] }
      groups.set(day, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
})

function repositoryHue(item: TimelineItem) {
  const name = `${item.source}:${item.repositoryId ?? item.repository.toLowerCase()}`
  let hash = 0
  for (const letter of name) hash = Math.imul(hash, 31) + letter.charCodeAt(0)
  return (hash >>> 0) % 360
}
const types = {
  Commit: { label: 'Commit', icon: GitCommitHorizontal },
  PushEvent: { label: 'Push', icon: Upload },
  PullRequestEvent: { label: 'Pull request', icon: GitPullRequest },
  IssuesEvent: { label: 'Issue', icon: CircleDot },
}
function event(type: string) {
  return Object.hasOwn(types, type) ? types[type as keyof typeof types] : { label: type, icon: Zap }
}
</script>

<template>
  <div v-if="items.length" :class="{ 'timeline-days': groupByDay }">
    <div v-for="day in days" :key="day.key" :class="{ 'timeline-day': groupByDay }">
      <h2 v-if="groupByDay" :id="`activity-day-${day.key}`" class="timeline-day-heading">
        <time :datetime="day.date">{{ dateFormat.format(day.time) }}</time>
      </h2>
      <ul
        class="local-list workspace-timeline"
        :aria-labelledby="groupByDay ? `activity-day-${day.key}` : undefined"
        :aria-label="groupByDay ? undefined : t('Recent activity')"
      >
        <li v-for="item in day.items" :key="item.key">
          <component
            :is="event(item.type).icon"
            :size="16"
            class="workspace-icon"
            aria-hidden="true"
          />
          <div>
            <strong>{{ item.subject || t(event(item.type).label) }}</strong>
            <div class="timeline-meta">
              <span class="source-mark" :data-source="item.source">{{
                item.source === 'local' ? t('Local') : providerName(item.source)
              }}</span>
              <span
                v-if="item.repository"
                class="timeline-repository"
                :style="{ '--repository-hue': repositoryHue(item) }"
              >
                <RouterLink
                  v-if="item.repositoryId"
                  :to="{ name: 'local-repository', params: { id: item.repositoryId } }"
                  >{{ item.repository }}</RouterLink
                >
                <template v-else>{{ item.repository }}</template>
              </span>
              <span v-if="item.author">{{ item.author }}</span>
              <time :datetime="new Date(item.time).toISOString()">{{
                timeFormat.format(item.time)
              }}</time>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
  <p v-else>{{ t('No matching activity.') }}</p>
</template>

<script setup lang="ts">
import { t } from '../lib/locale'
import { computed } from 'vue'
import type { ContributionSource } from '../lib/contributions'

const props = defineProps<{ source: Extract<ContributionSource, { source: 'githubCalendar' }> }>()
defineEmits<{ select: [day: string] }>()
const selected = defineModel<string>({ default: '' })
const days = computed(() => props.source.calendar.weeks.flatMap((week) => week.contributionDays))
const day = computed(() => days.value.find((item) => item.date === selected.value))
const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE']
</script>

<template>
  <p>
    <strong>{{ t('{count} contributions', { count: source.calendar.totalContributions }) }}</strong>
  </p>
  <p class="contribution-note">
    {{ source.startedAt.slice(0, 10) }} to {{ source.endedAt.slice(0, 10) }}
  </p>
  <div v-if="days.length" class="contribution-calendar" aria-hidden="true">
    <div v-for="(week, index) in source.calendar.weeks" :key="index" class="contribution-week">
      <button
        v-for="item in week.contributionDays"
        :key="item.date"
        type="button"
        tabindex="-1"
        :data-level="Math.max(0, levels.indexOf(item.contributionLevel))"
        :style="{ gridRow: new Date(item.date + 'T00:00:00Z').getUTCDay() + 1 }"
        :title="
          t('{day} · {count} contributions', { day: item.date, count: item.contributionCount })
        "
        :class="{ 'calendar-selected': selected === item.date }"
        @click="selected = item.date"
      />
    </div>
  </div>
  <div v-if="days.length" class="contribution-controls">
    <label class="contribution-field">
      {{ t('Calendar day') }}
      <select v-model="selected" class="form-control">
        <optgroup class="select-options" label="">
          <option value="">{{ t('Choose a day') }}</option>
          <option v-for="item in days" :key="item.date" :value="item.date">{{ item.date }}</option>
        </optgroup>
      </select>
    </label>
    <button
      class="button button-secondary"
      type="button"
      :disabled="!day"
      @click="day && $emit('select', day.date)"
    >
      {{ t('View activity') }}
    </button>
  </div>
  <p v-if="day" aria-live="polite">
    {{ t('{day} · {count} contributions', { day: day.date, count: day.contributionCount }) }}
  </p>
  <p v-if="source.restrictedContributionsCount" class="contribution-note">
    {{
      t('GitHub reports {count} restricted contributions without details.', {
        count: source.restrictedContributionsCount,
      })
    }}
  </p>
</template>

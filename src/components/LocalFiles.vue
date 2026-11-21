<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ChevronRight, FileCode2, Folder, Link2 } from '@lucide/vue'
import { localGitError } from '../lib/localGit'
import { t } from '../lib/locale'
import WorkspaceSplit from './WorkspaceSplit.vue'

interface Entry {
  name: string
  hash: string
  kind: 'directory' | 'file' | 'symlink' | 'submodule'
}
interface Tree {
  entries: Entry[]
  limited: boolean
}
interface Row {
  entry: Entry
  path: string[]
}
const props = defineProps<{ id: number; head: string | null; active: boolean }>()
const SourcePreview = defineAsyncComponent(() => import('./SourcePreview.vue'))
const trees = ref<Record<string, Tree>>({})
const expanded = ref<string[]>([])
const choice = ref<Row>()
const detailOpen = ref(false)
const blob = ref<{ status: string; text: string | null }>()
const busy = ref(false)
const error = ref('')
let revision = 0
let initialized = false
const key = (path: string[]) => JSON.stringify(path)
const rows = computed(() => {
  const result: Row[] = []
  function visit(path: string[]) {
    for (const entry of trees.value[key(path)]?.entries ?? []) {
      const child = [...path, entry.name]
      result.push({ entry, path: child })
      if (expanded.value.includes(key(child))) visit(child)
    }
  }
  visit([])
  return result
})

async function readTree(path: string[], hash: string | null = null) {
  const request = ++revision
  busy.value = true
  error.value = ''
  try {
    const result = await invoke<Tree>('read_local_tree', { id: props.id, hash })
    if (request === revision) {
      trees.value[key(path)] = result
      if (hash) expanded.value.push(key(path))
      else initialized = true
    }
  } catch (cause) {
    if (request === revision) error.value = localGitError(cause)
  } finally {
    if (request === revision) busy.value = false
  }
}

watch(
  () => [props.id, props.head],
  () => {
    revision++
    busy.value = false
    initialized = false
    trees.value = {}
    expanded.value = []
    choice.value = undefined
    detailOpen.value = false
    blob.value = undefined
    if (props.active && props.head) void readTree([])
  },
)
watch(
  () => props.active,
  (active) => {
    if (active && !initialized && !busy.value && props.head) void readTree([])
  },
  { immediate: true },
)

async function open(row: Row) {
  const path = key(row.path)
  if (row.entry.kind === 'directory') {
    if (expanded.value.includes(path))
      expanded.value = expanded.value.filter((item) => item !== path)
    else if (trees.value[path]) expanded.value.push(path)
    else await readTree(row.path, row.entry.hash)
    return
  }
  error.value = ''
  choice.value = row
  detailOpen.value = true
  blob.value = undefined
  if (row.entry.kind !== 'file') return
  const request = ++revision
  busy.value = true
  try {
    const result = await invoke<typeof blob.value>('read_local_blob', {
      id: props.id,
      hash: row.entry.hash,
    })
    if (request === revision) blob.value = result
  } catch (cause) {
    if (request === revision) error.value = localGitError(cause)
  } finally {
    if (request === revision) busy.value = false
  }
}
</script>

<template>
  <section class="panel task-panel" :aria-label="t('Repository files')">
    <div class="task-panel-heading">
      <h2>{{ t('Files') }}</h2>
      <p>{{ t('Committed files at HEAD') }}</p>
    </div>
    <p v-if="!head" class="task-message">{{ t('No commits yet') }}</p>
    <WorkspaceSplit v-else v-model="detailOpen" heading="Back to files">
      <template #list>
        <p v-if="error && !detailOpen" class="task-message" role="alert">{{ t(error) }}</p>
        <button
          v-if="error && !initialized"
          class="button button-secondary task-message"
          @click="readTree([])"
        >
          {{ t('Retry') }}
        </button>
        <p v-if="busy && !detailOpen" class="task-message" role="status">
          {{ t('Loading files…') }}
        </p>
        <ul class="directory-list">
          <li v-for="row in rows" :key="key(row.path)">
            <button
              type="button"
              :disabled="busy"
              :style="{ paddingInlineStart: `${8 + Math.min(row.path.length - 1, 16) * 12}px` }"
              :aria-expanded="
                row.entry.kind === 'directory' ? expanded.includes(key(row.path)) : undefined
              "
              :aria-pressed="
                row.entry.kind !== 'directory'
                  ? key(choice?.path ?? []) === key(row.path)
                  : undefined
              "
              @click="open(row)"
            >
              <ChevronRight v-if="row.entry.kind === 'directory'" :size="13" class="tree-caret" />
              <Folder v-if="row.entry.kind === 'directory'" :size="16" />
              <FileCode2 v-else-if="row.entry.kind === 'file'" :size="16" />
              <Link2 v-else :size="16" />
              <span class="entry-name" :title="row.path.join('/')">{{ row.entry.name }}</span>
            </button>
          </li>
        </ul>
        <p v-if="Object.values(trees).some((tree) => tree.limited)" class="task-message">
          {{ t('Some directories exceed the preview limit.') }}
        </p>
        <p v-if="!rows.length && initialized" class="task-message">
          {{ t('This directory is empty.') }}
        </p>
      </template>
      <p v-if="error && detailOpen" class="task-message" role="alert">{{ t(error) }}</p>
      <p v-if="busy && detailOpen" class="task-message" role="status">{{ t('Loading files…') }}</p>
      <template v-if="choice">
        <div class="file-heading">
          <strong>{{ choice.path.join(' / ') }}</strong>
        </div>
        <SourcePreview
          v-if="blob?.status === 'text'"
          :path="choice.path.join('/')"
          :text="blob.text ?? ''"
        />
        <p v-else-if="blob || choice.entry.kind !== 'file'" class="task-message">
          {{ t('A text preview is unavailable for this entry.') }}
        </p>
      </template>
      <p v-else-if="!busy && !error" class="task-message">{{ t('Select a file') }}</p>
    </WorkspaceSplit>
  </section>
</template>

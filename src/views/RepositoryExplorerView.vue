<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Folder,
  GitBranch,
  Link2,
  LoaderCircle,
  RefreshCw,
} from '@lucide/vue'
import { createExplorer, type Crumb } from '../composables/explorer'
import { useAccounts } from '../composables/accounts'
import { providerName } from '../lib/accounts'
import type { TreeEntry } from '../lib/explorer'
import RepositoryTabs from '../components/RepositoryTabs.vue'
import WorkspaceSplit from '../components/WorkspaceSplit.vue'
import { t } from '../lib/locale'
import { recordRepositoryVisit } from '../composables/workspaceRepositories'

const SourcePreview = defineAsyncComponent(() => import('../components/SourcePreview.vue'))
const route = useRoute()
const explorer = createExplorer()
const { state, remaining } = explorer
const expanded = ref<string[]>([])
const detailOpen = ref(false)
const treeKey = (crumbs: Crumb[]) => JSON.stringify(crumbs.map((crumb) => crumb.name))
const rows = computed(() => {
  const result: { entry: TreeEntry; crumbs: Crumb[]; key: string }[] = []
  const root = state.crumbs[0]
  if (!root) return result
  function visit(crumbs: Crumb[], sha: string) {
    const listing =
      state.directories.get(sha) ?? (state.directory?.sha === sha ? state.directory : null)
    for (const entry of listing?.items ?? []) {
      const child = [...crumbs, { name: entry.path, sha: entry.sha }]
      const key = treeKey(child)
      result.push({ entry, crumbs, key })
      if (expanded.value.includes(key) && crumbs.length < 128) visit(child, entry.sha)
    }
  }
  visit([root], root.sha)
  return result
})
watch(
  () => state.revision?.treeSha,
  () => {
    expanded.value = []
    detailOpen.value = false
  },
)
async function openEntry(entry: TreeEntry, crumbs: Crumb[], key: string) {
  detailOpen.value = entry.type !== 'tree'
  if (entry.type === 'tree' && expanded.value.includes(key)) {
    expanded.value = expanded.value.filter((value) => value !== key)
    await explorer.directory(crumbs)
    return
  }
  await explorer.selectEntry(entry, crumbs)
}
function openParent() {
  detailOpen.value = false
  return explorer.directory(state.crumbs.slice(0, -1))
}
watch(
  () => state.directory,
  (directory) => {
    if (state.crumbs.length > 1 && directory?.sha === state.crumbs.at(-1)?.sha) {
      const key = treeKey(state.crumbs)
      if (!expanded.value.includes(key)) expanded.value.push(key)
    }
  },
)
const account = computed(() =>
  useAccounts().accounts.value.find((value) => value.id === route.params.accountId),
)
const selectedOnPage = computed(() =>
  state.branches.some((branch) => branch.name === state.selectedBranch),
)
const filePath = computed(() =>
  [...state.crumbs.slice(1).map((crumb) => crumb.name), state.entry?.path]
    .filter(Boolean)
    .join('/'),
)
const unavailable = computed(() =>
  state.special === 'symlink'
    ? 'Symbolic link. Its target is not followed.'
    : state.special === 'submodule'
      ? 'Git submodule. Browsing another repository is not supported here.'
      : state.special
        ? 'This Git entry type cannot be previewed.'
        : state.preview?.status === 'binary'
          ? 'Binary file. A text preview is not available.'
          : state.preview?.status === 'tooLarge'
            ? 'Preview unavailable. Files must be at most 256 KiB and 5,000 lines.'
            : state.preview?.status === 'unsupportedEncoding'
              ? 'This file is not supported UTF-8 text.'
              : '',
)
const target = {
  accountId: String(route.params.accountId),
  owner: String(route.params.owner),
  name: String(route.params.name),
}
void explorer.open(target)
const visitKey = computed(() => {
  const provider = account.value?.provider
  const id = state.detail?.id
  return provider && id ? `remote:${provider}:${id}` : ''
})
watch(
  visitKey,
  (key) => {
    if (key) recordRepositoryVisit(key)
  },
  { immediate: true },
)
onUnmounted(explorer.dispose)
function kind(entry: TreeEntry) {
  return entry.mode === '120000'
    ? 'Symbolic link'
    : entry.type === 'tree'
      ? 'Directory'
      : entry.type === 'commit'
        ? 'Submodule'
        : entry.type === 'blob'
          ? 'File'
          : 'Unsupported entry'
}
function size(value: number | null) {
  return value === null ? '' : value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`
}
</script>

<template>
  <RouterLink :to="{ name: 'repositories' }" class="text-link explorer-back"
    ><ArrowLeft :size="14" aria-hidden="true" />{{ t('Back to repositories') }}</RouterLink
  >
  <div class="page-heading explorer-heading">
    <div>
      <h1 id="page-title" tabindex="-1">
        {{ state.detail?.fullName ?? `${route.params.owner}/${route.params.name}` }}
      </h1>
      <p v-if="account" class="explorer-account">
        {{ providerName(account.provider) }} · @{{ account.login
        }}<span v-if="state.detail"> · {{ t(state.detail.visibility) }}</span
        ><span v-if="state.detail?.archived"> · {{ t('Archived') }}</span>
      </p>
    </div>
    <button
      class="button button-secondary"
      :disabled="!!state.busy || remaining > 0"
      @click="explorer.refresh"
    >
      <RefreshCw :size="13" aria-hidden="true" />{{ t('Refresh') }}
    </button>
  </div>
  <RepositoryTabs />
  <p v-if="state.detail?.description" class="explorer-description">
    {{ state.detail.description }}
  </p>
  <div v-if="state.error" class="account-alert explorer-alert" role="alert">
    <p>{{ t(state.error.message) }}</p>
    <div class="repository-error-actions">
      <span v-if="remaining">{{ t('Try again in {count} seconds.', { count: remaining }) }}</span
      ><button
        class="button button-secondary"
        :disabled="!!state.busy || remaining > 0"
        @click="explorer.retry"
      >
        {{ t('Retry') }}</button
      ><RouterLink
        v-if="
          [
            'unauthorized',
            'resourceUnavailable',
            'credentialMissing',
            'credentialUnavailable',
            'accountNotFound',
          ].includes(state.error.code)
        "
        to="/settings"
        class="text-link"
        >{{ t('Manage account') }}</RouterLink
      >
    </div>
  </div>
  <div v-if="state.busy === 'initial'" class="panel repository-status" role="status">
    <LoaderCircle :size="18" class="loading-icon" aria-hidden="true" />{{
      t('Loading repository...')
    }}
  </div>
  <div v-else-if="state.empty" class="panel preview-placeholder">
    <Folder :size="30" aria-hidden="true" />
    <h2>{{ t('No branches yet') }}</h2>
    <p>
      {{
        t('This repository is empty or has no accessible branches. Refresh after its first commit.')
      }}
    </p>
  </div>
  <section
    v-else-if="state.detail"
    class="panel explorer-panel"
    :aria-label="t('Repository files')"
  >
    <div class="explorer-toolbar">
      <label class="branch-selector"
        ><GitBranch :size="15" aria-hidden="true" /><span class="sr-only">{{ t('Branch') }}</span
        ><select
          class="form-control"
          :value="state.selectedBranch"
          :disabled="state.busy === 'branches' || !state.selectedBranch || remaining > 0"
          @change="explorer.selectBranch(($event.target as HTMLSelectElement).value)"
        >
          <optgroup class="select-options" label="">
            <option v-if="state.selectedBranch && !selectedOnPage" :value="state.selectedBranch">
              {{ t('{branch} (selected)', { branch: state.selectedBranch }) }}
            </option>
            <option v-for="branch in state.branches" :key="branch.name" :value="branch.name">
              {{
                branch.protected ? t('{branch} · protected', { branch: branch.name }) : branch.name
              }}
            </option>
          </optgroup>
        </select></label
      >
      <div class="branch-pagination">
        <button
          class="icon-button"
          :aria-label="t('Previous branch page')"
          :disabled="state.branchPage <= 1 || !!state.busy || remaining > 0"
          @click="explorer.branchPage(state.branchPage - 1)"
        >
          <ChevronLeft :size="15" /></button
        ><span>{{ t('Branch page {page}', { page: state.branchPage }) }}</span
        ><button
          class="icon-button"
          :aria-label="t('Next branch page')"
          :disabled="!state.hasNext || !!state.busy || remaining > 0"
          @click="explorer.branchPage(state.branchPage + 1)"
        >
          <ChevronRight :size="15" />
        </button>
      </div>
      <span v-if="state.revision" class="revision-label" :title="state.revision.commitSha">{{
        t('Commit {hash}', { hash: state.revision.commitSha.slice(0, 8) })
      }}</span>
    </div>
    <nav v-if="state.crumbs.length" class="directory-crumbs" :aria-label="t('Directory path')">
      <template v-for="(crumb, index) in state.crumbs" :key="`${index}:${crumb.sha}`"
        ><ChevronRight v-if="index" :size="11" aria-hidden="true" /><button
          :disabled="index === state.crumbs.length - 1 || remaining > 0"
          @click="explorer.directory(state.crumbs.slice(0, index + 1))"
        >
          {{ index === 0 ? t('Files') : crumb.name }}
        </button></template
      >
    </nav>
    <p v-if="state.directory?.truncated" class="directory-warning" role="status">
      {{
        t(
          'This directory listing is truncated by the provider or preview limit. Some entries are missing; this is not a complete listing.',
        )
      }}
    </p>
    <WorkspaceSplit v-model="detailOpen" heading="Back to files">
      <template #list>
        <button
          v-if="state.crumbs.length > 1"
          class="directory-up"
          :disabled="remaining > 0"
          @click="openParent"
        >
          <ArrowLeft :size="13" aria-hidden="true" />{{ t('Parent directory') }}
        </button>
        <p
          v-if="['branch', 'directory'].includes(state.busy)"
          class="preview-placeholder"
          role="status"
        >
          {{ t('Loading directory...') }}
        </p>
        <ul v-else-if="rows.length" class="directory-list" :aria-label="t('Directory entries')">
          <li v-for="{ entry, crumbs, key } in rows" :key="key">
            <button
              :class="{
                'entry-selected':
                  state.entry?.path === entry.path && treeKey(state.crumbs) === treeKey(crumbs),
              }"
              :aria-label="`${entry.path} ${t(kind(entry))}`"
              :aria-expanded="entry.type === 'tree' ? expanded.includes(key) : undefined"
              :style="{ paddingInlineStart: `${8 + Math.min(crumbs.length - 1, 16) * 12}px` }"
              :disabled="remaining > 0"
              @click="openEntry(entry, crumbs, key)"
            >
              <ChevronRight
                v-if="entry.type === 'tree'"
                :size="13"
                class="tree-caret"
                aria-hidden="true"
              />
              <Folder v-if="entry.type === 'tree'" :size="16" aria-hidden="true" /><Link2
                v-else-if="entry.mode === '120000' || entry.type === 'commit'"
                :size="16"
                aria-hidden="true"
              /><FileCode2 v-else :size="16" aria-hidden="true" /><span
                class="entry-name"
                :title="[...crumbs.slice(1).map((crumb) => crumb.name), entry.path].join('/')"
                >{{ entry.path }}</span
              ><span v-if="entry.mode === '120000' || entry.type === 'commit'" class="entry-kind">{{
                t(kind(entry))
              }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="state.directory" class="preview-placeholder">
          {{ t('This directory is empty.') }}
        </p>
      </template>
      <div class="file-pane" :aria-busy="state.busy === 'file'">
        <div v-if="state.entry" class="file-heading">
          <strong>{{ filePath }}</strong
          ><span>{{ size(state.preview?.size ?? state.entry.size) }}</span>
        </div>
        <p v-if="state.busy === 'file'" class="preview-placeholder" role="status">
          {{ t('Loading file...') }}
        </p>
        <div v-else-if="unavailable" class="preview-placeholder">
          <FileCode2 :size="27" aria-hidden="true" />
          <p>{{ t(unavailable) }}</p>
        </div>
        <SourcePreview
          v-else-if="state.preview?.status === 'text'"
          :path="filePath"
          :text="state.preview.text ?? ''"
        />
        <div v-else class="preview-placeholder">
          <FileCode2 :size="29" aria-hidden="true" />
          <h2>{{ t('Select a file') }}</h2>
          <p>{{ t('Browse the directory and choose a text file to read its source.') }}</p>
        </div>
      </div>
    </WorkspaceSplit>
    <div class="panel-footnote">
      {{
        t(
          'Read-only preview · Files stay pinned to the selected commit until you switch branches or refresh.',
        )
      }}
    </div>
  </section>
</template>

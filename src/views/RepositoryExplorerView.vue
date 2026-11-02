<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, watch } from 'vue'
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
import { createExplorer } from '../composables/explorer'
import { useAccounts } from '../composables/accounts'
import { providerName } from '../lib/accounts'
import type { TreeEntry } from '../lib/explorer'

const SourcePreview = defineAsyncComponent(() => import('../components/SourcePreview.vue'))
const route = useRoute()
const explorer = createExplorer()
const { state, remaining } = explorer
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
watch(
  () => [route.params.accountId, route.params.owner, route.params.name],
  (values) => {
    void explorer.open({
      accountId: String(values[0]),
      owner: String(values[1]),
      name: String(values[2]),
    })
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
  <RouterLink to="/repositories" class="text-link explorer-back"
    ><ArrowLeft :size="14" aria-hidden="true" />Back to repositories</RouterLink
  >
  <div class="page-heading explorer-heading">
    <div>
      <p class="eyebrow">YOUR REPOSITORY, IN VIEW</p>
      <h1 id="page-title" tabindex="-1">
        {{ state.detail?.fullName ?? `${route.params.owner}/${route.params.name}` }}
      </h1>
      <p v-if="account" class="explorer-account">
        {{ providerName(account.provider) }} · @{{ account.login
        }}<span v-if="state.detail"> · {{ state.detail.visibility }}</span
        ><span v-if="state.detail?.archived"> · Archived</span>
      </p>
    </div>
    <button
      class="button button-secondary"
      :disabled="!!state.busy || remaining > 0"
      @click="explorer.refresh"
    >
      <RefreshCw :size="13" aria-hidden="true" />Refresh
    </button>
  </div>
  <p v-if="state.detail?.description" class="explorer-description">
    {{ state.detail.description }}
  </p>
  <div v-if="state.error" class="account-alert explorer-alert" role="alert">
    <p>{{ state.error.message }}</p>
    <div class="repository-error-actions">
      <span v-if="remaining">Try again in {{ remaining }} seconds.</span
      ><button
        class="button button-secondary"
        :disabled="!!state.busy || remaining > 0"
        @click="explorer.retry"
      >
        Retry</button
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
        >Manage account</RouterLink
      >
    </div>
  </div>
  <div v-if="state.busy === 'initial'" class="panel repository-status" role="status">
    <LoaderCircle :size="18" class="loading-icon" aria-hidden="true" />Loading repository...
  </div>
  <div v-else-if="state.empty" class="panel preview-placeholder">
    <Folder :size="30" aria-hidden="true" />
    <h2>No branches yet</h2>
    <p>This repository is empty or has no accessible branches. Refresh after its first commit.</p>
  </div>
  <section v-else-if="state.detail" class="panel explorer-panel" aria-label="Repository files">
    <div class="explorer-toolbar">
      <label class="branch-selector"
        ><GitBranch :size="15" aria-hidden="true" /><span class="sr-only">Branch</span
        ><select
          class="form-control"
          :value="state.selectedBranch"
          :disabled="state.busy === 'branches' || !state.selectedBranch || remaining > 0"
          @change="explorer.selectBranch(($event.target as HTMLSelectElement).value)"
        >
          <option v-if="state.selectedBranch && !selectedOnPage" :value="state.selectedBranch">
            {{ state.selectedBranch }} (selected)
          </option>
          <option v-for="branch in state.branches" :key="branch.name" :value="branch.name">
            {{ branch.name }}{{ branch.protected ? ' · protected' : '' }}
          </option>
        </select></label
      >
      <div class="branch-pagination">
        <button
          class="icon-button"
          aria-label="Previous branch page"
          :disabled="state.branchPage <= 1 || !!state.busy || remaining > 0"
          @click="explorer.branchPage(state.branchPage - 1)"
        >
          <ChevronLeft :size="15" /></button
        ><span>Branch page {{ state.branchPage }}</span
        ><button
          class="icon-button"
          aria-label="Next branch page"
          :disabled="!state.hasNext || !!state.busy || remaining > 0"
          @click="explorer.branchPage(state.branchPage + 1)"
        >
          <ChevronRight :size="15" />
        </button>
      </div>
      <span v-if="state.revision" class="revision-label" :title="state.revision.commitSha"
        >Commit {{ state.revision.commitSha.slice(0, 8) }}</span
      >
    </div>
    <nav v-if="state.crumbs.length" class="directory-crumbs" aria-label="Directory path">
      <template v-for="(crumb, index) in state.crumbs" :key="`${index}:${crumb.sha}`"
        ><ChevronRight v-if="index" :size="11" aria-hidden="true" /><button
          :disabled="index === state.crumbs.length - 1 || remaining > 0"
          @click="explorer.directory(state.crumbs.slice(0, index + 1))"
        >
          {{ index === 0 ? 'Files' : crumb.name }}
        </button></template
      >
    </nav>
    <p v-if="state.directory?.truncated" class="directory-warning" role="status">
      This directory listing is truncated by the provider or preview limit. Some entries are
      missing; this is not a complete listing.
    </p>
    <div class="explorer-workspace">
      <div class="directory-pane" :aria-busy="['branch', 'directory'].includes(state.busy)">
        <button
          v-if="state.crumbs.length > 1"
          class="directory-up"
          :disabled="remaining > 0"
          @click="explorer.directory(state.crumbs.slice(0, -1))"
        >
          <ArrowLeft :size="13" aria-hidden="true" />Parent directory
        </button>
        <p
          v-if="['branch', 'directory'].includes(state.busy)"
          class="preview-placeholder"
          role="status"
        >
          Loading directory...
        </p>
        <ul
          v-else-if="state.directory?.items.length"
          class="directory-list"
          aria-label="Directory entries"
        >
          <li v-for="entry in state.directory.items" :key="`${entry.path}:${entry.sha}`">
            <button
              :class="{ 'entry-selected': state.entry?.path === entry.path }"
              :aria-label="`${entry.path} ${kind(entry)}`"
              :disabled="remaining > 0"
              @click="explorer.selectEntry(entry)"
            >
              <Folder v-if="entry.type === 'tree'" :size="16" aria-hidden="true" /><Link2
                v-else-if="entry.mode === '120000' || entry.type === 'commit'"
                :size="16"
                aria-hidden="true"
              /><FileCode2 v-else :size="16" aria-hidden="true" /><span class="entry-name">{{
                entry.path
              }}</span
              ><span class="entry-kind">{{ kind(entry) }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="state.directory" class="preview-placeholder">This directory is empty.</p>
      </div>
      <div class="file-pane" :aria-busy="state.busy === 'file'">
        <div v-if="state.entry" class="file-heading">
          <strong>{{ filePath }}</strong
          ><span>{{ size(state.preview?.size ?? state.entry.size) }}</span>
        </div>
        <p v-if="state.busy === 'file'" class="preview-placeholder" role="status">
          Loading file...
        </p>
        <div v-else-if="unavailable" class="preview-placeholder">
          <FileCode2 :size="27" aria-hidden="true" />
          <p>{{ unavailable }}</p>
        </div>
        <SourcePreview
          v-else-if="state.preview?.status === 'text'"
          :path="filePath"
          :text="state.preview.text ?? ''"
        />
        <div v-else class="preview-placeholder">
          <FileCode2 :size="29" aria-hidden="true" />
          <h2>Select a file</h2>
          <p>Browse the directory and choose a text file to read its source.</p>
        </div>
      </div>
    </div>
    <div class="panel-footnote">
      Read-only preview · Files stay pinned to the selected commit until you switch branches or
      refresh.
    </div>
  </section>
</template>

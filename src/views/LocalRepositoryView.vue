<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  changeLocal,
  displayLocalPath,
  hasLocalGit,
  listLocal,
  localGitError,
  localRepositoryName,
  readLocal,
  readLocalDiff,
  removeLocal,
  type LocalChange,
  type LocalOperation,
  type LocalRepository,
  type LocalSnapshot,
} from '../lib/localGit'
import '../localGit.css'
import LocalFiles from '../components/LocalFiles.vue'
import CommitHistory from '../components/CommitHistory.vue'
import WorkspaceSplit from '../components/WorkspaceSplit.vue'
import LocalReferences from '../components/LocalReferences.vue'
import RemoteReferences from '../components/RemoteReferences.vue'
import { t } from '../lib/locale'
import { invalidateLocalCatalog, recordRepositoryVisit } from '../composables/workspaceRepositories'
import { invalidateLocalActivity } from '../composables/workspaceActivity'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const available = hasLocalGit()
const repository = ref<LocalRepository>()
const snapshot = ref<LocalSnapshot>()
const alert = ref('')
const progress = ref('')
const notice = ref('')
const diff = ref<{ path: string; staged: boolean; text: string; truncated: boolean }>()
const diffOpen = ref(false)
const diffLines = computed(() => {
  const value = diff.value?.text ?? ''
  if (value.length > 100_000) return []
  const lines = value.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []
  return lines.length > 1500 ? [] : lines
})
const message = ref('')
const branchName = ref('')
const branchStart = ref('')
const selectedBranch = ref('')
const deleting = ref('')
const removing = ref(false)
const remoteName = ref('')
const remoteUrl = ref('')
const selectedRemote = ref('')
const remoteBranch = ref('')
const track = ref(false)
const tasks = {
  changes: 'Changes',
  files: 'Files',
  history: 'History',
  branches: 'Branches',
  references: 'References',
  remotes: 'Remotes',
} as const
const task = computed(() =>
  typeof route.query.task === 'string' && Object.hasOwn(tasks, route.query.task)
    ? route.query.task
    : 'changes',
)
const historyOpened = ref(false)
const historyRevision = ref(0)
const syncOpen = ref(false)
const commitOpen = ref(false)
const workingChanges = computed(() => snapshot.value?.changes.filter(hasWorkingChange) ?? [])
const stagedChanges = computed(() => snapshot.value?.changes.filter(canUnstage) ?? [])
watch(
  task,
  (value) => {
    if (value === 'history') historyOpened.value = true
  },
  { immediate: true },
)

const remote = computed(() =>
  snapshot.value?.remotes.find((item) => item.name === selectedRemote.value),
)
const staged = computed(() => snapshot.value?.changes.some(canUnstage) ?? false)

function canUnstage(item: LocalChange) {
  return 'ADMT'.includes(item.index)
}

function hasWorkingChange(item: LocalChange) {
  return item.worktree !== ' ' || item.index === '?'
}

const statusLabels: Record<string, string> = {
  A: 'Added',
  D: 'Deleted',
  M: 'Modified',
  T: 'Type changed',
  U: 'Conflict',
  '?': 'Untracked',
}

function status(item: LocalChange) {
  if (item.index === '?') return 'Untracked'
  if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(item.index + item.worktree)) {
    return 'Unmerged'
  }
  return [
    item.index === ' ' ? '' : `Staged · ${statusLabels[item.index] ?? item.index}`,
    item.worktree === ' ' ? '' : `Working tree · ${statusLabels[item.worktree] ?? item.worktree}`,
  ]
    .filter(Boolean)
    .join(' / ')
}

async function refresh(target = id.value) {
  const next = await readLocal(target)
  if (id.value !== target) return
  snapshot.value = next
  if (!next.branches.includes(selectedBranch.value)) selectedBranch.value = ''
  if (!next.branches.includes(branchStart.value)) branchStart.value = ''
  if (!next.remotes.some((item) => item.name === selectedRemote.value)) selectedRemote.value = ''
}

async function load(target: number) {
  diffOpen.value = false
  repository.value = undefined
  snapshot.value = undefined
  diff.value = undefined
  alert.value = ''
  notice.value = ''
  removing.value = false
  deleting.value = ''
  commitOpen.value = false
  syncOpen.value = false
  historyRevision.value++
  if (!available) return
  progress.value = 'Reading local repository…'
  try {
    const found = (await listLocal()).find((item) => item.id === target)
    if (id.value !== target) return
    if (!found) throw 'notRegistered'
    repository.value = found
    recordRepositoryVisit(`local:${target}`)
    await refresh(target)
  } catch (error) {
    if (id.value === target) alert.value = localGitError(error)
  } finally {
    if (id.value === target) progress.value = ''
  }
}

watch(id, load, { immediate: true })

async function showDiff(path: string, isStaged: boolean) {
  if (progress.value) return
  diffOpen.value = true
  const target = id.value
  alert.value = ''
  diff.value = undefined
  progress.value = 'Reading diff…'
  try {
    const result = await readLocalDiff(target, path, isStaged)
    if (id.value === target) diff.value = { path, staged: isStaged, ...result }
  } catch (error) {
    if (id.value === target) alert.value = localGitError(error)
  } finally {
    if (id.value === target) progress.value = ''
  }
}

async function perform(operation: LocalOperation, pending: string, success: string) {
  if (progress.value) return false
  const target = id.value
  alert.value = ''
  notice.value = ''
  progress.value = pending
  diff.value = undefined
  deleting.value = ''
  let succeeded = false
  try {
    await changeLocal(target, operation)
    invalidateLocalActivity()
    if (operation.kind === 'addRemote') invalidateLocalCatalog()
    succeeded = true
    if (id.value === target) notice.value = success
  } catch (error) {
    if (id.value === target) alert.value = localGitError(error)
  }
  try {
    if (id.value === target) await refresh(target)
  } catch (error) {
    if (id.value === target) {
      snapshot.value = undefined
      if (!alert.value) alert.value = localGitError(error)
    }
  } finally {
    if (id.value === target) progress.value = ''
  }
  if (id.value === target && succeeded) historyRevision.value++
  return succeeded && id.value === target
}

async function commit() {
  if (!snapshot.value?.author) return
  if (
    await perform(
      { kind: 'commit', author: snapshot.value.author, message: message.value },
      'Committing…',
      'Commit created.',
    )
  ) {
    message.value = ''
  }
}

async function createBranch() {
  if (
    await perform(
      { kind: 'createBranch', name: branchName.value, start: branchStart.value || 'HEAD' },
      'Creating branch…',
      'Branch created.',
    )
  ) {
    branchName.value = ''
  }
}

async function addRemote() {
  if (
    await perform(
      { kind: 'addRemote', name: remoteName.value, url: remoteUrl.value.trim() },
      'Adding remote…',
      'Remote added.',
    )
  ) {
    remoteName.value = ''
    remoteUrl.value = ''
  }
}

function synchronize(kind: 'fetch' | 'pull' | 'push') {
  if (!remote.value) return
  const { name, fetchUrl, pushUrl } = remote.value
  if (kind === 'fetch' && fetchUrl) {
    void perform({ kind, remote: name, url: fetchUrl }, 'Fetching…', 'Fetch completed.')
    return
  }
  const branch = snapshot.value?.branch
  if (!branch || !remoteBranch.value) return
  if (kind === 'pull' && fetchUrl) {
    void perform(
      { kind, remote: name, url: fetchUrl, branch: remoteBranch.value, localBranch: branch },
      'Pulling…',
      'Fast-forward pull completed.',
    )
  }
  if (kind === 'push' && pushUrl) {
    void perform(
      {
        kind,
        remote: name,
        url: pushUrl,
        branch: remoteBranch.value,
        localBranch: branch,
        track: track.value,
      },
      'Pushing…',
      'Push completed.',
    )
  }
}

async function forget() {
  const target = id.value
  progress.value = 'Removing registration…'
  alert.value = ''
  try {
    await removeLocal(target)
    invalidateLocalCatalog()
    invalidateLocalActivity()
    if (id.value === target) await router.push({ name: 'repositories' })
  } catch (error) {
    if (id.value === target) alert.value = localGitError(error)
  } finally {
    if (id.value === target) progress.value = ''
  }
}
</script>

<template>
  <nav class="workspace-path" :aria-label="t('Repository path')">
    <RouterLink class="text-link" :to="{ name: 'repositories', query: { source: 'local' } }">{{
      t('All repositories')
    }}</RouterLink>
    <span aria-hidden="true">/</span>
    <span>{{ t('Local repository') }}</span>
  </nav>
  <div class="page-heading repository-heading">
    <div>
      <h1 id="page-title" tabindex="-1">
        {{ repository ? localRepositoryName(repository.path) : t('Local repository') }}
      </h1>
      <p v-if="repository" class="page-description">{{ displayLocalPath(repository.path) }}</p>
      <p v-if="snapshot" class="workspace-branch">
        <code>{{ snapshot.branch ?? t('Detached HEAD') }}</code>
      </p>
    </div>
    <div v-if="available" class="local-actions">
      <button class="button button-secondary" :disabled="!!progress" @click="load(id)">
        {{ t('Refresh') }}
      </button>
      <details v-if="repository" class="repository-options">
        <summary class="button button-secondary">{{ t('Repository options') }}</summary>
        <div class="panel">
          <button
            class="button button-secondary"
            :disabled="!!progress"
            @click="removing = !removing"
          >
            {{ t('Remove from list') }}
          </button>
        </div>
      </details>
    </div>
  </div>
  <p v-if="!available">
    {{ t('Open BranchHarbor on your desktop to work with local repositories.') }}
  </p>
  <div v-if="progress || alert || notice || removing" class="panel local-panel">
    <p v-if="progress" role="status">{{ t(progress) }}</p>
    <p v-if="alert" role="alert">{{ t(alert) }}</p>
    <p v-if="notice" role="status">{{ t(notice) }}</p>
    <div v-if="removing" class="local-actions">
      <p>{{ t('Remove this registration? Your files and Git history stay in the folder.') }}</p>
      <button class="button button-danger" :disabled="!!progress" @click="forget">
        {{ t('Remove registration') }}
      </button>
      <button class="button button-secondary" @click="removing = false">{{ t('Cancel') }}</button>
    </div>
  </div>
  <template v-if="snapshot">
    <nav
      class="repository-tabs task-tabs repository-task-bar"
      :aria-label="t('Repository navigation')"
    >
      <RouterLink
        v-for="(label, key) in tasks"
        :key="key"
        :to="{
          name: 'local-repository',
          params: { id },
          query: key === 'changes' ? {} : { task: key },
        }"
        :class="{ active: task === key }"
        :aria-current="task === key ? 'page' : undefined"
        >{{ t(label) }}</RouterLink
      >
    </nav>
    <LocalFiles
      v-show="task === 'files'"
      :id="id"
      :head="snapshot.head"
      :active="task === 'files'"
    />
    <CommitHistory
      v-if="historyOpened"
      v-show="task === 'history'"
      :id="id"
      :revision="historyRevision"
    />
    <section v-show="task === 'changes'" class="panel task-panel" aria-labelledby="changes-title">
      <h2 id="changes-title" class="sr-only">{{ t('Changes') }}</h2>
      <WorkspaceSplit v-model="diffOpen" heading="Back to changes">
        <template #list
          ><div class="change-sidebar">
            <div
              v-for="group in [
                { title: 'Unstaged', items: workingChanges, staged: false },
                { title: 'Staged', items: stagedChanges, staged: true },
              ]"
              :key="group.title"
              class="change-group"
            >
              <h3>
                {{ t(group.title) }} <span>{{ group.items.length }}</span>
              </h3>
              <ul class="directory-list">
                <li v-for="item in group.items" :key="item.path" class="change-row">
                  <button
                    type="button"
                    :disabled="!!progress"
                    :aria-label="`${t(group.staged ? 'View staged diff' : 'View diff')} · ${item.path}`"
                    :aria-pressed="diff?.path === item.path && diff?.staged === group.staged"
                    @click="showDiff(item.path, group.staged)"
                  >
                    <span class="change-path" :title="item.path">
                      <span class="entry-name">{{ item.path.split('/').at(-1) }}</span>
                      <span v-if="item.path.includes('/')" class="change-directory">{{
                        item.path.slice(0, item.path.lastIndexOf('/'))
                      }}</span> </span
                    ><span
                      class="change-status"
                      :class="{
                        'change-status-added': (group.staged ? item.index : item.worktree) === 'A',
                        'change-status-deleted':
                          (group.staged ? item.index : item.worktree) === 'D',
                      }"
                      :title="status(item)"
                      aria-hidden="true"
                      >{{ group.staged ? item.index : item.worktree }}</span
                    >
                  </button>
                  <button
                    type="button"
                    class="change-action"
                    :disabled="!!progress"
                    @click="
                      perform(
                        { kind: group.staged ? 'unstage' : 'stage', path: item.path },
                        group.staged ? 'Unstaging file…' : 'Staging file…',
                        group.staged ? 'File unstaged.' : 'File staged.',
                      )
                    "
                  >
                    {{ t(group.staged ? 'Unstage' : 'Stage') }}
                  </button>
                </li>
              </ul>
            </div>
            <p v-if="!snapshot.changes.length" class="task-message">
              {{ t('Working tree is clean.') }}
            </p>
            <button
              v-if="staged && !commitOpen"
              type="button"
              class="button button-primary"
              :aria-expanded="commitOpen"
              @click="commitOpen = !commitOpen"
            >
              {{ t('Prepare commit') }}
            </button>
            <form
              v-if="staged && commitOpen"
              class="local-form commit-form"
              @submit.prevent="commit"
            >
              <p>{{ snapshot.author ?? t('Git author is not configured') }}</p>
              <label class="local-field"
                >{{ t('Commit message') }}
                <textarea
                  v-model="message"
                  class="form-control"
                  rows="3"
                  maxlength="2000"
                  required
                  :disabled="!!progress"
                />
              </label>
              <button
                class="button button-primary"
                :disabled="!!progress || !message.trim() || !snapshot.author"
                type="submit"
              >
                {{ t('Commit staged changes') }}
              </button>
              <button class="button button-secondary" type="button" @click="commitOpen = false">
                {{ t('Cancel') }}
              </button>
            </form>
          </div></template
        >
        <template v-if="diff">
          <div class="file-heading">
            <strong>{{ diff.path }}</strong
            ><span>{{ t(diff.staged ? 'Staged diff' : 'Working tree diff') }}</span>
          </div>
          <p v-if="diff.truncated" class="task-message">
            {{ t('The diff exceeds the preview limit.') }}
          </p>
          <pre
            v-if="diff.text"
            class="local-diff"
            tabindex="0"
          ><template v-if="diffLines.length"><span v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="{ 'diff-added': line.startsWith('+') && !line.startsWith('+++'), 'diff-deleted': line.startsWith('-') && !line.startsWith('---'), 'diff-hunk': line.startsWith('@@') }">{{ line }}</span></template><template v-else>{{ diff.text }}</template></pre>
          <p v-else class="task-message">{{ t('No text diff is available.') }}</p>
        </template>
        <p v-else class="task-message">{{ t('Select a changed file to inspect its diff.') }}</p>
      </WorkspaceSplit>
    </section>
    <section
      v-show="task === 'branches'"
      class="panel local-panel"
      aria-labelledby="branches-title"
    >
      <h2 id="branches-title">{{ t('Branches') }}</h2>
      <dl class="local-metadata">
        <div>
          <dt>{{ t('Branch') }}</dt>
          <dd>{{ snapshot.branch ?? t('Detached HEAD') }}</dd>
        </div>
        <div>
          <dt>{{ t('Upstream') }}</dt>
          <dd>{{ snapshot.upstream ?? t('No upstream') }}</dd>
        </div>
        <div v-if="snapshot.upstream">
          <dt>{{ t('As of last fetch') }}</dt>
          <dd>
            {{
              t('{ahead} ahead · {behind} behind', {
                ahead: snapshot.ahead ?? 0,
                behind: snapshot.behind ?? 0,
              })
            }}
          </dd>
        </div>
      </dl>
      <div v-if="snapshot.branches.length" class="local-form">
        <label class="local-field">
          {{ t('Local branch') }}
          <select
            v-model="selectedBranch"
            class="form-control"
            :disabled="!!progress"
            @change="deleting = ''"
          >
            <optgroup class="select-options" label="">
              <option value="">{{ t('Choose a branch') }}</option>
              <option v-for="branch in snapshot.branches" :key="branch">{{ branch }}</option>
            </optgroup>
          </select>
        </label>
        <div class="local-actions">
          <button
            class="button button-secondary"
            :disabled="!!progress || !selectedBranch || selectedBranch === snapshot.branch"
            @click="
              perform(
                { kind: 'switchBranch', name: selectedBranch },
                'Switching branch…',
                'Branch switched.',
              )
            "
          >
            {{ t('Switch branch') }}
          </button>
          <button
            class="button button-secondary"
            :disabled="!!progress || !selectedBranch || selectedBranch === snapshot.branch"
            @click="deleting = selectedBranch"
          >
            {{ t('Delete branch') }}
          </button>
        </div>
        <div v-if="deleting" class="local-actions">
          <p>
            {{ t('Delete local branch') }} <strong>{{ deleting }}</strong
            >?
          </p>
          <button
            class="button button-danger"
            :disabled="!!progress"
            @click="
              perform(
                { kind: 'deleteBranch', name: deleting },
                'Deleting branch…',
                'Branch deleted.',
              )
            "
          >
            {{ t('Confirm deletion') }}
          </button>
          <button class="button button-secondary" @click="deleting = ''">{{ t('Cancel') }}</button>
        </div>
      </div>
      <details v-if="snapshot.head" class="task-disclosure">
        <summary>{{ t('New branch') }}</summary>
        <form class="local-form" @submit.prevent="createBranch">
          <label class="local-field"
            >{{ t('New branch name') }}
            <input v-model="branchName" class="form-control" required :disabled="!!progress"
          /></label>
          <label class="local-field">
            {{ t('Starting point') }}
            <select v-model="branchStart" class="form-control" :disabled="!!progress">
              <optgroup class="select-options" label="">
                <option value="">{{ t('Current commit (HEAD)') }}</option>
                <option v-for="branch in snapshot.branches" :key="branch">{{ branch }}</option>
              </optgroup>
            </select>
          </label>
          <div>
            <button
              class="button button-secondary"
              type="submit"
              :disabled="!!progress || !branchName.trim()"
            >
              {{ t('Create branch') }}
            </button>
          </div>
        </form>
      </details>
      <p v-else>{{ t('Create the first commit to add more branches.') }}</p>
    </section>
    <LocalReferences
      v-if="task === 'references'"
      :id="id"
      :key="id"
      :branch="snapshot.branch"
      :revision="historyRevision"
    />
    <section v-show="task === 'remotes'" class="panel local-panel" aria-labelledby="remotes-title">
      <h2 id="remotes-title">{{ t('Remotes') }}</h2>
      <ul v-if="snapshot.remotes.length" class="local-list">
        <li v-for="item in snapshot.remotes" :key="item.name">
          <strong>{{ item.name }}</strong>
          <p>{{ t('Fetch') }} · {{ item.fetchUrl ?? t('Unsupported target') }}</p>
          <p>{{ t('Push') }} · {{ item.pushUrl ?? t('Unsupported target') }}</p>
        </li>
      </ul>
      <p v-else>{{ t('No remotes configured.') }}</p>
      <RemoteReferences
        v-if="task === 'remotes' && snapshot.remotes.length"
        :id="id"
        :key="id"
        :remotes="snapshot.remotes"
        :disabled="!!progress"
        @deleted="historyRevision++"
      />
      <details class="task-disclosure">
        <summary>{{ t('Add remote') }}</summary>
        <form class="local-form" @submit.prevent="addRemote">
          <label class="local-field"
            >{{ t('Remote name') }}
            <input v-model="remoteName" class="form-control" required :disabled="!!progress"
          /></label>
          <label class="local-field"
            >{{ t('Remote URL') }}
            <input
              v-model="remoteUrl"
              class="form-control"
              required
              :disabled="!!progress"
              autocomplete="off"
          /></label>
          <div>
            <button
              class="button button-secondary"
              type="submit"
              :disabled="!!progress || !remoteName.trim() || !remoteUrl.trim()"
            >
              {{ t('Add remote') }}
            </button>
          </div>
        </form>
      </details>
      <button
        v-if="snapshot.remotes.length"
        type="button"
        class="button button-secondary"
        :aria-expanded="syncOpen"
        @click="syncOpen = !syncOpen"
      >
        {{ t('Synchronize') }}
      </button>
      <div v-if="snapshot.remotes.length && syncOpen" class="local-form">
        <p>
          {{ t('Git uses your configured credential helper or SSH identity for remote access.') }}
        </p>
        <label class="local-field">
          {{ t('Target remote') }}
          <select v-model="selectedRemote" class="form-control" :disabled="!!progress">
            <optgroup class="select-options" label="">
              <option value="">{{ t('Choose a remote') }}</option>
              <option v-for="item in snapshot.remotes" :key="item.name">{{ item.name }}</option>
            </optgroup>
          </select>
        </label>
        <label class="local-field">
          {{ t('Remote branch') }}
          <input
            v-model="remoteBranch"
            class="form-control"
            :placeholder="snapshot.branch ?? t('Branch name')"
            :disabled="!!progress"
          />
        </label>
        <label
          ><input v-model="track" type="checkbox" :disabled="!!progress" />
          {{ t('Set upstream after push') }}</label
        >
        <p v-if="remote && snapshot.branch && remoteBranch">
          {{ snapshot.branch }} ↔ {{ remote.name }}/{{ remoteBranch }}
        </p>
        <div class="local-actions">
          <button
            class="button button-secondary"
            type="button"
            :disabled="!!progress || !remote?.fetchUrl"
            @click="synchronize('fetch')"
          >
            {{ t('Fetch') }}
          </button>
          <button
            class="button button-secondary"
            type="button"
            :disabled="
              !!progress || !remote?.fetchUrl || !snapshot.branch || !remoteBranch || !snapshot.head
            "
            @click="synchronize('pull')"
          >
            {{ t('Pull (fast-forward only)') }}
          </button>
          <button
            class="button button-primary"
            type="button"
            :disabled="
              !!progress || !remote?.pushUrl || !snapshot.branch || !remoteBranch || !snapshot.head
            "
            @click="synchronize('push')"
          >
            {{ t('Push') }}
          </button>
        </div>
      </div>
    </section>
  </template>
</template>

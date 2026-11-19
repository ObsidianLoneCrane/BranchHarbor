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
  repository.value = undefined
  snapshot.value = undefined
  diff.value = undefined
  alert.value = ''
  notice.value = ''
  removing.value = false
  deleting.value = ''
  if (!available) return
  progress.value = 'Reading local repository…'
  try {
    const found = (await listLocal()).find((item) => item.id === target)
    if (id.value !== target) return
    if (!found) throw 'notRegistered'
    repository.value = found
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
    if (id.value === target) await router.push({ name: 'repositories' })
  } catch (error) {
    if (id.value === target) alert.value = localGitError(error)
  } finally {
    if (id.value === target) progress.value = ''
  }
}
</script>

<template>
  <RouterLink class="text-link" :to="{ name: 'repositories' }">All repositories</RouterLink>
  <div class="page-heading">
    <div>
      <h1 id="page-title" tabindex="-1">
        {{ repository ? localRepositoryName(repository.path) : 'Local repository' }}
      </h1>
      <p v-if="repository" class="page-description">{{ displayLocalPath(repository.path) }}</p>
    </div>
    <div v-if="available" class="local-actions">
      <button class="button button-secondary" :disabled="!!progress" @click="load(id)">
        Refresh
      </button>
      <button
        v-if="repository"
        class="button button-secondary"
        :disabled="!!progress"
        @click="removing = !removing"
      >
        Remove from list
      </button>
    </div>
  </div>
  <p v-if="!available">Open BranchHarbor on your desktop to work with local repositories.</p>
  <div v-if="progress || alert || notice || removing" class="panel local-panel">
    <p v-if="progress" role="status">{{ progress }}</p>
    <p v-if="alert" role="alert">{{ alert }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="removing" class="local-actions">
      <p>Remove this registration? Your files and Git history stay in the folder.</p>
      <button class="button button-danger" :disabled="!!progress" @click="forget">
        Remove registration
      </button>
      <button class="button button-secondary" @click="removing = false">Cancel</button>
    </div>
  </div>
  <template v-if="snapshot">
    <section class="panel local-panel" aria-labelledby="changes-title">
      <h2 id="changes-title">Changes</h2>
      <dl class="local-metadata">
        <div>
          <dt>Branch</dt>
          <dd>{{ snapshot.branch ?? 'Detached HEAD' }}</dd>
        </div>
        <div>
          <dt>Commit</dt>
          <dd>{{ snapshot.head ?? 'No commits yet' }}</dd>
        </div>
        <div>
          <dt>Commit author</dt>
          <dd>{{ snapshot.author ?? 'Git author is not configured' }}</dd>
        </div>
        <div>
          <dt>Upstream</dt>
          <dd>{{ snapshot.upstream ?? 'No upstream' }}</dd>
          <dd v-if="snapshot.upstream">
            {{ snapshot.ahead }} ahead · {{ snapshot.behind }} behind as of last fetch
          </dd>
        </div>
      </dl>
      <p v-if="!snapshot.changes.length">Working tree is clean.</p>
      <ul v-else class="local-list">
        <li v-for="item in snapshot.changes" :key="item.path" class="local-change">
          <div>
            <strong>{{ item.path }}</strong>
            <p>{{ status(item) }}</p>
          </div>
          <div class="local-actions">
            <button
              v-if="hasWorkingChange(item)"
              class="button button-secondary"
              :disabled="!!progress"
              @click="showDiff(item.path, false)"
            >
              View diff
            </button>
            <button
              v-if="hasWorkingChange(item)"
              class="button button-secondary"
              :disabled="!!progress"
              @click="perform({ kind: 'stage', path: item.path }, 'Staging file…', 'File staged.')"
            >
              Stage
            </button>
            <button
              v-if="canUnstage(item)"
              class="button button-secondary"
              :disabled="!!progress"
              @click="showDiff(item.path, true)"
            >
              View staged diff
            </button>
            <button
              v-if="canUnstage(item)"
              class="button button-secondary"
              :disabled="!!progress"
              @click="
                perform({ kind: 'unstage', path: item.path }, 'Unstaging file…', 'File unstaged.')
              "
            >
              Unstage
            </button>
          </div>
        </li>
      </ul>
      <div v-if="diff" class="local-form">
        <div class="local-toolbar">
          <h3>{{ diff.staged ? 'Staged diff' : 'Working tree diff' }} · {{ diff.path }}</h3>
          <button class="button button-secondary" @click="diff = undefined">Close diff</button>
        </div>
        <p v-if="diff.truncated">The diff exceeds the preview limit.</p>
        <pre v-if="diff.text" class="local-diff" tabindex="0">{{ diff.text }}</pre>
        <p v-else>No text diff is available.</p>
      </div>
      <form v-if="staged" class="local-form" @submit.prevent="commit">
        <label class="local-field">
          Commit message
          <textarea
            v-model="message"
            class="form-control"
            rows="3"
            maxlength="2000"
            required
            :disabled="!!progress"
          />
        </label>
        <p v-if="!snapshot.author">Configure your name and email in Git, then refresh.</p>
        <div>
          <button
            class="button button-primary"
            :disabled="!!progress || !message.trim() || !snapshot.author"
            type="submit"
          >
            Commit staged changes
          </button>
        </div>
      </form>
    </section>
    <section class="panel local-panel" aria-labelledby="branches-title">
      <h2 id="branches-title">Branches</h2>
      <div v-if="snapshot.branches.length" class="local-form">
        <label class="local-field">
          Local branch
          <select
            v-model="selectedBranch"
            class="form-control"
            :disabled="!!progress"
            @change="deleting = ''"
          >
            <option value="">Choose a branch</option>
            <option v-for="branch in snapshot.branches" :key="branch">{{ branch }}</option>
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
            Switch branch
          </button>
          <button
            class="button button-secondary"
            :disabled="!!progress || !selectedBranch || selectedBranch === snapshot.branch"
            @click="deleting = selectedBranch"
          >
            Delete branch
          </button>
        </div>
        <div v-if="deleting" class="local-actions">
          <p>
            Delete local branch <strong>{{ deleting }}</strong
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
            Confirm deletion
          </button>
          <button class="button button-secondary" @click="deleting = ''">Cancel</button>
        </div>
      </div>
      <form v-if="snapshot.head" class="local-form" @submit.prevent="createBranch">
        <label class="local-field"
          >New branch name
          <input v-model="branchName" class="form-control" required :disabled="!!progress"
        /></label>
        <label class="local-field">
          Starting point
          <select v-model="branchStart" class="form-control" :disabled="!!progress">
            <option value="">Current commit (HEAD)</option>
            <option v-for="branch in snapshot.branches" :key="branch">{{ branch }}</option>
          </select>
        </label>
        <div>
          <button class="button button-secondary" type="submit" :disabled="!!progress">
            Create branch
          </button>
        </div>
      </form>
      <p v-else>Create the first commit to add more branches.</p>
    </section>
    <section class="panel local-panel" aria-labelledby="remotes-title">
      <h2 id="remotes-title">Remotes</h2>
      <ul v-if="snapshot.remotes.length" class="local-list">
        <li v-for="item in snapshot.remotes" :key="item.name">
          <strong>{{ item.name }}</strong>
          <p>Fetch · {{ item.fetchUrl ?? 'Unsupported target' }}</p>
          <p>Push · {{ item.pushUrl ?? 'Unsupported target' }}</p>
        </li>
      </ul>
      <p v-else>No remotes configured.</p>
      <form class="local-form" @submit.prevent="addRemote">
        <label class="local-field"
          >Remote name
          <input v-model="remoteName" class="form-control" required :disabled="!!progress"
        /></label>
        <label class="local-field"
          >Remote URL
          <input
            v-model="remoteUrl"
            class="form-control"
            required
            :disabled="!!progress"
            autocomplete="off"
        /></label>
        <div>
          <button class="button button-secondary" type="submit" :disabled="!!progress">
            Add remote
          </button>
        </div>
      </form>
      <div v-if="snapshot.remotes.length" class="local-form">
        <h3>Synchronize</h3>
        <p>Git uses your configured credential helper or SSH identity for remote access.</p>
        <label class="local-field">
          Target remote
          <select v-model="selectedRemote" class="form-control" :disabled="!!progress">
            <option value="">Choose a remote</option>
            <option v-for="item in snapshot.remotes" :key="item.name">{{ item.name }}</option>
          </select>
        </label>
        <label class="local-field">
          Remote branch
          <input
            v-model="remoteBranch"
            class="form-control"
            :placeholder="snapshot.branch ?? 'Branch name'"
            :disabled="!!progress"
          />
        </label>
        <label
          ><input v-model="track" type="checkbox" :disabled="!!progress" /> Set upstream after
          push</label
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
            Fetch
          </button>
          <button
            class="button button-secondary"
            type="button"
            :disabled="
              !!progress || !remote?.fetchUrl || !snapshot.branch || !remoteBranch || !snapshot.head
            "
            @click="synchronize('pull')"
          >
            Pull (fast-forward only)
          </button>
          <button
            class="button button-primary"
            type="button"
            :disabled="
              !!progress || !remote?.pushUrl || !snapshot.branch || !remoteBranch || !snapshot.head
            "
            @click="synchronize('push')"
          >
            Push
          </button>
        </div>
      </div>
    </section>
  </template>
</template>

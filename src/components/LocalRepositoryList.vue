<script setup lang="ts">
import { FolderGit2 } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  addLocal,
  displayLocalPath,
  hasLocalGit,
  listLocal,
  localGitError,
  localRepositoryName,
  type LocalRepository,
} from '../lib/localGit'

const router = useRouter()
const available = hasLocalGit()
const repositories = ref<LocalRepository[]>([])
const mode = ref<'import' | 'create' | 'clone' | null>(null)
const path = ref('')
const url = ref('')
const message = ref('')
const busy = ref(false)
const actionLabels = {
  import: 'Import repository',
  create: 'New repository',
  clone: 'Clone repository',
}

async function refresh() {
  busy.value = true
  message.value = ''
  try {
    repositories.value = await listLocal()
  } catch (error) {
    message.value = localGitError(error)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (available) void refresh()
})

async function submit() {
  if (!mode.value || busy.value || !available) return
  busy.value = true
  message.value = ''
  try {
    const request =
      mode.value === 'clone'
        ? { kind: 'clone' as const, path: path.value, url: url.value.trim() }
        : { kind: mode.value, path: path.value }
    const added = await addLocal(request)
    await router.push({ name: 'local-repository', params: { id: added.id } })
  } catch (error) {
    message.value = localGitError(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel local-panel" aria-labelledby="local-repositories-title">
    <div class="local-toolbar">
      <h2 id="local-repositories-title">
        <FolderGit2 :size="19" aria-hidden="true" />Local repositories
      </h2>
      <div class="local-actions">
        <button
          v-for="(label, option) in actionLabels"
          :key="option"
          class="button button-secondary"
          :disabled="!available || busy"
          :aria-expanded="mode === option"
          @click="mode = mode === option ? null : option"
        >
          {{ label }}
        </button>
      </div>
    </div>
    <p v-if="!available">Open BranchHarbor on your desktop to work with local repositories.</p>
    <form v-if="mode" class="local-form" @submit.prevent="submit">
      <label class="local-field">
        {{ mode === 'import' ? 'Repository folder path' : 'Destination folder path' }}
        <input v-model="path" class="form-control" required :disabled="busy" />
      </label>
      <label v-if="mode === 'clone'" class="local-field">
        Remote URL
        <input v-model="url" class="form-control" required :disabled="busy" autocomplete="off" />
      </label>
      <p>
        {{
          mode === 'import'
            ? 'Enter the full path to an existing working tree.'
            : 'Enter the full path to a new or empty folder.'
        }}
      </p>
      <div class="local-actions">
        <button class="button button-primary" :disabled="busy" type="submit">
          {{ mode === 'import' ? 'Import' : mode === 'create' ? 'Create' : 'Clone' }}
        </button>
        <button class="button button-secondary" :disabled="busy" type="button" @click="mode = null">
          Cancel
        </button>
      </div>
    </form>
    <p v-if="busy" role="status">
      {{ mode === 'clone' ? 'Cloning repository…' : 'Working with local repositories…' }}
    </p>
    <div v-if="message" class="local-actions">
      <p role="alert">{{ message }}</p>
      <button v-if="!mode" class="button button-secondary" @click="refresh">Retry</button>
    </div>
    <ul v-if="repositories.length" class="local-list">
      <li v-for="repository in repositories" :key="repository.id">
        <RouterLink
          class="local-repository-link"
          :to="{ name: 'local-repository', params: { id: repository.id } }"
        >
          <strong>{{ localRepositoryName(repository.path) }}</strong>
          <span>{{ displayLocalPath(repository.path) }}</span>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="available && !busy && !message && !mode">No local repositories yet.</p>
  </section>
</template>

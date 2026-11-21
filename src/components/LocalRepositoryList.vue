<script setup lang="ts">
import { t } from '../lib/locale'
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
  pickRepositoryFolder,
  type LocalRepository,
} from '../lib/localGit'

const router = useRouter()
const available = hasLocalGit()
const repositories = ref<LocalRepository[]>([])
const mode = ref<'create' | 'clone' | null>(null)
const path = ref('')
const url = ref('')
const message = ref('')
const busy = ref(false)
const choosingFolder = ref(false)
const actionLabels = {
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

async function submit(kind: 'import' | 'create' | 'clone') {
  if (busy.value || !available) return
  busy.value = true
  message.value = ''
  try {
    let destination = path.value
    if (kind === 'import') {
      mode.value = null
      choosingFolder.value = true
      const selected = await pickRepositoryFolder(t('Choose a Git repository folder'))
      choosingFolder.value = false
      if (selected === null) return
      destination = selected
    }
    const request =
      kind === 'clone'
        ? { kind, path: destination, url: url.value.trim() }
        : { kind, path: destination }
    const added = await addLocal(request)
    await router.push({ name: 'local-repository', params: { id: added.id } })
  } catch (error) {
    message.value = localGitError(error)
  } finally {
    choosingFolder.value = false
    busy.value = false
  }
}
</script>

<template>
  <section class="panel local-panel" aria-labelledby="local-repositories-title">
    <div class="local-toolbar">
      <h2 id="local-repositories-title">
        <FolderGit2 :size="19" aria-hidden="true" />{{ t('Local repositories') }}
      </h2>
      <div class="local-actions">
        <button
          class="button button-secondary"
          :disabled="!available || busy"
          @click="submit('import')"
        >
          {{ t('Import repository') }}
        </button>
        <button
          v-for="(label, option) in actionLabels"
          :key="option"
          class="button button-secondary"
          :disabled="!available || busy"
          :aria-expanded="mode === option"
          @click="mode = mode === option ? null : option"
        >
          {{ t(label) }}
        </button>
      </div>
    </div>
    <p v-if="!available">
      {{ t('Open BranchHarbor on your desktop to work with local repositories.') }}
    </p>
    <form v-if="mode" class="local-form" @submit.prevent="submit(mode)">
      <label class="local-field">
        {{ t('Destination folder path') }}
        <input v-model="path" class="form-control" required :disabled="busy" />
      </label>
      <label v-if="mode === 'clone'" class="local-field">
        {{ t('Remote URL') }}
        <input v-model="url" class="form-control" required :disabled="busy" autocomplete="off" />
      </label>
      <p>{{ t('Enter the full path to a new or empty folder.') }}</p>
      <div class="local-actions">
        <button
          class="button button-primary"
          :disabled="busy || !path.trim() || (mode === 'clone' && !url.trim())"
          type="submit"
        >
          {{ t(mode === 'create' ? 'Create' : 'Clone') }}
        </button>
        <button class="button button-secondary" :disabled="busy" type="button" @click="mode = null">
          {{ t('Cancel') }}
        </button>
      </div>
    </form>
    <p v-if="busy && !choosingFolder" role="status">
      {{ t(mode === 'clone' ? 'Cloning repository…' : 'Working with local repositories…') }}
    </p>
    <div v-if="message" class="local-actions">
      <p role="alert">{{ t(message) }}</p>
      <button v-if="!mode" class="button button-secondary" @click="refresh">
        {{ t('Retry') }}
      </button>
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
    <p v-else-if="available && !busy && !message && !mode">{{ t('No local repositories yet.') }}</p>
  </section>
</template>

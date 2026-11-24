<script setup lang="ts">
import { HardDrive, FolderOpen, Trash2 } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { onMounted, ref } from 'vue'
import { displayLocalPath, hasLocalGit, pickRepositoryFolder } from '../lib/localGit'
import { language, t } from '../lib/locale'
import { clearSessionCaches } from '../lib/sessionCache'
import '../localGit.css'

interface StorageInfo {
  path: string
  pendingPath: string | null
  databaseBytes: number
  migrationFailed: boolean
}

const desktop = hasLocalGit()
const info = ref<StorageInfo>()
const cacheBytes = ref(0)
const busy = ref(false)
const confirmClear = ref(false)
const status = ref('')
const error = ref('')

function size(bytes: number) {
  const formatter = new Intl.NumberFormat(language.value, { maximumFractionDigits: 1 })
  if (bytes >= 1024 ** 2) return `${formatter.format(bytes / 1024 ** 2)} MiB`
  if (bytes >= 1024) return `${formatter.format(bytes / 1024)} KiB`
  return `${formatter.format(bytes)} B`
}

async function load() {
  const [storage, cache] = await Promise.all([
    invoke<StorageInfo>('get_storage_info'),
    invoke<number>('cache_storage', { clear: false }),
  ])
  info.value = storage
  cacheBytes.value = cache
}

async function run(operation: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    await operation()
  } catch (cause) {
    error.value =
      cause === 'invalidStorageFolder'
        ? 'Choose a separate, empty folder that this app can access.'
        : cause === 'folderPicker'
          ? 'The folder picker could not be opened. Try again.'
          : 'Storage could not be updated. Check folder permissions and available space.'
  } finally {
    busy.value = false
  }
}

function changeFolder() {
  return run(async () => {
    const folder = await pickRepositoryFolder(t('Choose a data folder'))
    if (!folder) return
    await invoke('schedule_data_move', { folder })
    await load()
  })
}

function cancelMove() {
  return run(async () => {
    await invoke('schedule_data_move', { folder: null })
    await load()
  })
}

function clear() {
  return run(async () => {
    await invoke('cache_storage', { clear: true })
    clearSessionCaches()
    confirmClear.value = false
    await load()
    status.value = 'Cached data cleared.'
  })
}

onMounted(() => {
  if (desktop) void run(load)
})
</script>

<template>
  <section class="settings-section" aria-labelledby="storage-title">
    <div class="settings-intro">
      <h2 id="storage-title">{{ t('Data and storage') }}</h2>
    </div>
    <div class="panel local-panel storage-panel" :aria-busy="busy">
      <p v-if="!desktop">{{ t('Data storage settings are available in the desktop app.') }}</p>
      <template v-else>
        <dl v-if="info" class="storage-details">
          <div>
            <dt><HardDrive :size="15" aria-hidden="true" /> {{ t('Data directory') }}</dt>
            <dd class="storage-path">{{ displayLocalPath(info.path) }}</dd>
          </div>
          <div>
            <dt>{{ t('Database size') }}</dt>
            <dd>{{ size(info.databaseBytes) }}</dd>
          </div>
          <div>
            <dt>{{ t('Downloaded activity cache') }}</dt>
            <dd>{{ size(cacheBytes) }}</dd>
          </div>
        </dl>
        <p v-if="info?.migrationFailed" class="workspace-warning" role="alert">
          {{ t('The data move failed. BranchHarbor is using the previous directory.') }}
        </p>
        <p v-if="info?.pendingPath" class="storage-path" role="status">
          {{
            t('Close and reopen BranchHarbor to move data to {path}.', {
              path: displayLocalPath(info.pendingPath),
            })
          }}
        </p>
        <p v-if="info" class="workspace-repository-path">
          {{
            t(
              'Choose an empty folder. The original databases remain as a backup after the move. Credentials and appearance preferences stay in their existing locations.',
            )
          }}
        </p>
        <div v-if="info" class="local-actions">
          <button
            class="button button-secondary"
            type="button"
            :disabled="busy"
            @click="changeFolder"
          >
            <FolderOpen :size="15" aria-hidden="true" /> {{ t('Change data folder') }}
          </button>
          <button
            v-if="info.pendingPath"
            class="text-button"
            type="button"
            :disabled="busy"
            @click="cancelMove"
          >
            {{ t('Cancel move') }}
          </button>
          <button
            class="button button-secondary"
            type="button"
            :disabled="busy || confirmClear"
            @click="confirmClear = true"
          >
            <Trash2 :size="15" aria-hidden="true" /> {{ t('Clear cached data') }}
          </button>
        </div>
        <div v-if="confirmClear" class="storage-confirm">
          <p>
            {{
              t(
                'Clear downloaded activity and session caches? Account connections and registered repositories are kept.',
              )
            }}
          </p>
          <div class="local-actions">
            <button class="button button-secondary" type="button" :disabled="busy" @click="clear">
              {{ t('Clear cache') }}
            </button>
            <button
              class="text-button"
              type="button"
              :disabled="busy"
              @click="confirmClear = false"
            >
              {{ t('Cancel') }}
            </button>
          </div>
        </div>
        <p v-if="status" role="status">{{ t(status) }}</p>
        <p v-if="error" class="workspace-warning" role="alert">
          {{ t(error) }}
          <button v-if="!info" class="text-button" type="button" @click="run(load)">
            {{ t('Try again') }}
          </button>
        </p>
      </template>
    </div>
  </section>
</template>

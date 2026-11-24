<script setup lang="ts">
import { ClipboardPlus, FolderOpen, GitFork, X } from '@lucide/vue'
import { nextTick, ref } from 'vue'
import { addLocal, hasLocalGit, localGitError, pickRepositoryFolder } from '../lib/localGit'
import { t } from '../lib/locale'

type Mode = 'import' | 'clone' | 'create'
const emit = defineEmits<{ added: [] }>()
const dialog = ref<HTMLDialogElement>()
const urlField = ref<HTMLInputElement>()
const pathField = ref<HTMLInputElement>()
const importAction = ref<HTMLButtonElement>()
const available = hasLocalGit()
const mode = ref<Exclude<Mode, 'import'>>()
const path = ref('')
const url = ref('')
const error = ref('')
const busy = ref(false)
const picking = ref(false)

function open() {
  mode.value = undefined
  path.value = ''
  url.value = ''
  error.value = ''
  dialog.value?.showModal()
}
defineExpose({ open })

function close() {
  if (!busy.value) dialog.value?.close()
}

async function changeMode(value?: typeof mode.value) {
  mode.value = value
  error.value = ''
  await nextTick()
  if (value) (value === 'clone' ? urlField : pathField).value?.focus()
  else importAction.value?.focus()
}

async function pick(title: string) {
  picking.value = true
  try {
    return await pickRepositoryFolder(t(title))
  } finally {
    picking.value = false
  }
}

async function chooseDestination() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    path.value = (await pick('Choose a destination folder')) ?? path.value
  } catch (cause) {
    error.value = localGitError(cause)
  } finally {
    busy.value = false
  }
}

async function submit(kind: Mode) {
  if (busy.value || !available) return
  busy.value = true
  error.value = ''
  try {
    const destination =
      kind === 'import' ? await pick('Choose a Git repository folder') : path.value
    if (!destination) return
    await addLocal(
      kind === 'clone'
        ? { kind, path: destination, url: url.value.trim() }
        : { kind, path: destination },
    )
    dialog.value?.close()
    emit('added')
  } catch (cause) {
    error.value = localGitError(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="account-dialog add-repository-dialog"
    aria-labelledby="add-repository-title"
    @cancel.prevent="close"
  >
    <div class="dialog-heading">
      <h2 id="add-repository-title">
        {{
          t(
            mode === 'clone'
              ? 'Clone repository'
              : mode === 'create'
                ? 'New repository'
                : 'Add repository',
          )
        }}
      </h2>
      <button
        class="icon-button"
        type="button"
        :aria-label="t('Close repository dialog')"
        :disabled="busy"
        @click="close"
      >
        <X :size="18" aria-hidden="true" />
      </button>
    </div>
    <p v-if="!available" class="dialog-description">
      {{ t('Open BranchHarbor on your desktop to work with local repositories.') }}
    </p>
    <div v-if="!mode" class="repository-dialog-options">
      <button
        ref="importAction"
        class="button button-secondary"
        type="button"
        :disabled="!available || busy"
        @click="submit('import')"
      >
        <FolderOpen :size="16" aria-hidden="true" /> {{ t('Import repository') }}
      </button>
      <button
        class="button button-secondary"
        type="button"
        :disabled="!available || busy"
        @click="changeMode('clone')"
      >
        <GitFork :size="16" aria-hidden="true" /> {{ t('Clone repository') }}
      </button>
      <button
        class="button button-secondary"
        type="button"
        :disabled="!available || busy"
        @click="changeMode('create')"
      >
        <ClipboardPlus :size="16" aria-hidden="true" /> {{ t('New repository') }}
      </button>
    </div>
    <form v-else class="local-form" @submit.prevent="submit(mode)">
      <label v-if="mode === 'clone'" class="local-field">
        {{ t('Remote URL') }}
        <input
          ref="urlField"
          v-model="url"
          class="form-control"
          required
          :disabled="busy"
          autocomplete="off"
        />
      </label>
      <div class="repository-destination">
        <label class="local-field">
          {{ t('Destination folder path') }}
          <input ref="pathField" v-model="path" class="form-control" required :disabled="busy" />
        </label>
        <button
          class="button button-secondary"
          type="button"
          :disabled="busy"
          @click="chooseDestination"
        >
          {{ t('Browse') }}
        </button>
      </div>
      <p class="dialog-description">{{ t('Enter the full path to a new or empty folder.') }}</p>
      <div class="repository-dialog-actions">
        <button
          class="button button-secondary"
          type="button"
          :disabled="busy"
          @click="changeMode()"
        >
          {{ t('Back') }}
        </button>
        <button
          class="button button-primary"
          type="submit"
          :disabled="busy || !path.trim() || (mode === 'clone' && !url.trim())"
        >
          {{ t(mode === 'create' ? 'Create' : 'Clone') }}
        </button>
      </div>
    </form>
    <p v-if="busy && !picking" class="dialog-description" role="status">
      {{ t(mode === 'clone' ? 'Cloning repository…' : 'Working with local repositories…') }}
    </p>
    <p v-if="error" class="account-alert" role="alert">{{ t(error) }}</p>
  </dialog>
</template>

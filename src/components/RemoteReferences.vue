<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  deleteRemoteReference,
  localGitError,
  readRemoteReferences,
  type GitReference,
  type LocalRemote,
  type RemoteReferences,
} from '../lib/localGit'
import { t } from '../lib/locale'
import GitReferenceList from './GitReferenceList.vue'

const props = defineProps<{ id: number; remotes: LocalRemote[]; disabled: boolean }>()
const emit = defineEmits<{ deleted: [] }>()
const name = ref('')
const endpoint = ref<'fetch' | 'push'>('push')
const remote = computed(() => props.remotes.find((item) => item.name === name.value))
const url = computed(() =>
  endpoint.value === 'push' ? remote.value?.pushUrl : remote.value?.fetchUrl,
)
const sharedEndpoint = computed(() => remote.value?.fetchUrl === remote.value?.pushUrl)
const snapshot = ref<RemoteReferences>()
const confirmation = ref<GitReference>()
const busy = ref(false)
const error = ref('')
const notice = ref(false)
const listRevision = ref(0)
let revision = 0

watch(
  () => props.remotes,
  (items) => {
    if (!items.some((item) => item.name === name.value)) name.value = items[0]?.name ?? ''
  },
  { immediate: true },
)
watch(
  [name, endpoint, url],
  () => {
    revision++
    snapshot.value = undefined
    confirmation.value = undefined
    error.value = ''
    notice.value = false
  },
  { flush: 'sync' },
)

function canDelete(item: GitReference) {
  return (
    !busy.value &&
    !props.disabled &&
    (endpoint.value === 'push' || sharedEndpoint.value) &&
    (item.kind === 'tag' ||
      (!!snapshot.value?.defaultBranch && snapshot.value.defaultBranch !== item.name))
  )
}

function fullName(item: GitReference) {
  return `refs/${item.kind === 'branch' ? 'heads' : 'tags'}/${item.name}`
}

async function load() {
  const current = revision
  const result = await readRemoteReferences(props.id, name.value, endpoint.value === 'push')
  if (current !== revision) return
  if (url.value !== result.url) throw 'remoteEndpointChanged'
  snapshot.value = result
}

async function refresh() {
  if (!url.value || props.disabled || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = false
  confirmation.value = undefined
  listRevision.value++
  snapshot.value = undefined
  try {
    await load()
  } catch (cause) {
    error.value = localGitError(cause)
  } finally {
    busy.value = false
  }
}

async function remove() {
  const item = confirmation.value
  const approvedUrl = snapshot.value?.url
  if (!item || !approvedUrl || !canDelete(item)) return
  busy.value = true
  confirmation.value = undefined
  error.value = ''
  notice.value = false
  try {
    await deleteRemoteReference(props.id, {
      remote: name.value,
      url: approvedUrl,
      name: item.name,
      kind: item.kind,
      oid: item.oid,
    })
    notice.value = true
    emit('deleted')
  } catch (cause) {
    error.value = localGitError(cause)
  }
  try {
    await load()
  } catch (cause) {
    snapshot.value = undefined
    if (!error.value) error.value = localGitError(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="local-form" :aria-label="t('Remote references')" :aria-busy="busy">
    <h3>{{ t('Remote references') }}</h3>
    <div class="local-actions reference-controls">
      <label class="local-field">
        {{ t('Reference remote') }}
        <select v-model="name" class="form-control" :disabled="busy || disabled">
          <optgroup class="select-options" label="">
            <option v-for="item in remotes" :key="item.name">{{ item.name }}</option>
          </optgroup>
        </select>
      </label>
      <label class="local-field">
        {{ t('Remote endpoint') }}
        <select v-model="endpoint" class="form-control" :disabled="busy || disabled">
          <optgroup class="select-options" label="">
            <option value="push">{{ t('Push') }}</option>
            <option value="fetch">{{ t('Fetch') }}</option>
          </optgroup>
        </select>
      </label>
      <button
        class="button button-secondary"
        type="button"
        :disabled="!url || busy || disabled"
        @click="refresh"
      >
        {{ t('Refresh references') }}
      </button>
    </div>
    <p>
      <code>{{ url ?? t('Unsupported target') }}</code>
    </p>
    <p v-if="busy" role="status">{{ t('Working with remote references…') }}</p>
    <p v-if="error" role="alert">{{ t(error) }}</p>
    <p v-if="notice" role="status">{{ t('Remote reference deleted.') }}</p>
    <template v-if="snapshot">
      <p v-if="snapshot.defaultBranch">
        {{ t('Remote default branch') }} · <code>{{ snapshot.defaultBranch }}</code>
      </p>
      <p v-else>
        {{ t('Git could not identify the remote default branch. Branch deletion is unavailable.') }}
      </p>
      <p v-if="endpoint === 'fetch' && !sharedEndpoint">
        {{ t('Select the push endpoint to delete a remote reference.') }}
      </p>
      <div
        v-if="confirmation"
        class="reference-confirm"
        role="group"
        :aria-label="t('Confirm remote reference deletion')"
      >
        <p>
          {{
            t('Delete {reference} from {remote}?', {
              reference: fullName(confirmation),
              remote: name,
            })
          }}
        </p>
        <p>
          <code>{{ snapshot.url }}</code>
        </p>
        <p>
          <code>{{ confirmation.oid }}</code>
        </p>
        <div class="local-actions">
          <button
            class="button button-danger"
            type="button"
            :disabled="busy || disabled"
            @click="remove"
          >
            {{ t('Confirm deletion') }}
          </button>
          <button class="button button-secondary" type="button" @click="confirmation = undefined">
            {{ t('Cancel') }}
          </button>
        </div>
      </div>
      <GitReferenceList :key="listRevision" :items="snapshot.items">
        <template #default="{ item }">
          <button
            class="button button-secondary"
            type="button"
            :disabled="!canDelete(item)"
            @click="confirmation = item"
          >
            {{ t(item.kind === 'branch' ? 'Delete remote branch' : 'Delete remote tag') }}
          </button>
        </template>
      </GitReferenceList>
    </template>
  </section>
</template>

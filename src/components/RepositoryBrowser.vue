<script setup lang="ts">
import { language, t } from '../lib/locale'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from '@lucide/vue'
import EmptyState from './EmptyState.vue'
import { useAccounts } from '../composables/accounts'
import {
  accountError,
  listRepositories,
  providerName,
  type AccountError,
  type Repository,
  type RepositoryQuery,
} from '../lib/accounts'

const store = useAccounts()
const { accounts, loading: accountsLoading, error: accountsError } = store
const platform = ref('all')
const selected = ref('')
const ownership = ref<RepositoryQuery['ownership']>('all')
const visibility = ref<RepositoryQuery['visibility']>('all')
const items = ref<Repository[]>([])
const loading = ref(false)
const error = ref<AccountError | null>(null)
const page = ref(1)
const hasNext = ref(false)
const loaded = ref(false)
const refreshed = ref<Date>()
const clock = ref(Date.now())
const cooldowns = reactive<Record<string, number>>({})
const remaining = computed(() =>
  Math.max(0, Math.ceil(((cooldowns[selected.value] ?? 0) - clock.value) / 1000)),
)
let timer: ReturnType<typeof setInterval> | undefined
let requestId = 0
const available = computed(() =>
  accounts.value.filter(
    (account) => platform.value === 'all' || account.provider === platform.value,
  ),
)
const current = computed(() => accounts.value.find((account) => account.id === selected.value))
watch(
  available,
  (list) => {
    if (!list.some((account) => account.id === selected.value)) selected.value = list[0]?.id ?? ''
  },
  { immediate: true },
)

async function load(nextPage = 1) {
  const ticket = ++requestId
  const accountId = selected.value
  if (!accountId) {
    items.value = []
    error.value = null
    loaded.value = false
    loading.value = false
    return
  }
  if (remaining.value) {
    items.value = []
    loaded.value = false
    loading.value = false
    refreshed.value = undefined
    error.value = accountError({ code: 'rateLimited', retryAfterSeconds: remaining.value })
    return
  }
  loading.value = true
  error.value = null
  items.value = []
  loaded.value = false
  refreshed.value = undefined
  try {
    if (current.value?.credentialStatus !== 'saved')
      throw accountError({
        code:
          current.value?.credentialStatus === 'missing'
            ? 'credentialMissing'
            : 'credentialUnavailable',
      })
    const response = await listRepositories({
      accountId,
      page: nextPage,
      ownership: ownership.value,
      visibility: visibility.value,
    })
    if (ticket !== requestId) return
    if (response.accountId !== accountId) throw accountError({ code: 'invalidResponse' })
    items.value = response.items
    page.value = response.page
    hasNext.value = response.hasNext
    loaded.value = true
    refreshed.value = new Date()
  } catch (cause) {
    if (ticket !== requestId) return
    error.value = accountError(cause)
    if (error.value.code === 'rateLimited') {
      cooldowns[accountId] = Date.now() + (error.value.retryAfterSeconds ?? 60) * 1000
      clock.value = Date.now()
      timer ??= setInterval(() => {
        clock.value = Date.now()
        if (!Object.values(cooldowns).some((deadline) => deadline > clock.value)) {
          clearInterval(timer)
          timer = undefined
        }
      }, 1000)
    }
  } finally {
    if (ticket === requestId) loading.value = false
  }
}
watch(
  [selected, ownership, visibility],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
onMounted(() => {
  void store.ensureLoaded()
})
onUnmounted(() => {
  requestId++
  clearInterval(timer)
})
function updated(value: string | null) {
  if (!value) return t('Update time unavailable')
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? t('Update time unavailable')
    : t('Updated {time}', {
        time: date.toLocaleDateString(language.value, { dateStyle: 'medium' }),
      })
}
</script>

<template>
  <section
    class="panel repository-panel"
    :aria-label="t('Repository workspace')"
    :aria-busy="loading || accountsLoading"
  >
    <div class="panel-toolbar">
      <span><FolderGit2 :size="17" aria-hidden="true" />{{ t('Your repositories') }}</span
      ><button
        v-if="accounts.length"
        class="button button-secondary"
        :disabled="loading || remaining > 0 || !selected"
        @click="load()"
      >
        <RefreshCw :size="13" aria-hidden="true" />{{ t('Refresh') }}</button
      ><span v-else class="subtle-badge">{{ t('Not connected') }}</span>
    </div>
    <div v-if="accountsError" class="account-alert" role="alert">
      <p>{{ t(accountsError.message) }}</p>
      <button class="text-button" @click="store.refresh">{{ t('Retry loading accounts') }}</button>
    </div>
    <p v-if="accountsLoading && !accounts.length" class="repository-status" role="status">
      {{ t('Loading saved accounts...') }}
    </p>
    <template v-else-if="accounts.length">
      <div class="repository-filters">
        <label
          >{{ t('Platform')
          }}<select v-model="platform" class="form-control">
            <optgroup class="select-options" label="">
              <option value="all">{{ t('All platforms') }}</option>
              <option value="github">GitHub</option>
              <option value="gitee">Gitee</option>
            </optgroup>
          </select></label
        ><label class="account-filter"
          >{{ t('Account')
          }}<select v-model="selected" class="form-control">
            <optgroup class="select-options" label="">
              <option v-if="!available.length" value="">{{ t('No connected account') }}</option>
              <option v-for="account in available" :key="account.id" :value="account.id">
                {{ providerName(account.provider) }} / @{{ account.login }}
              </option>
            </optgroup>
          </select></label
        ><label
          >{{ t('Ownership')
          }}<select v-model="ownership" class="form-control">
            <optgroup class="select-options" label="">
              <option value="all">{{ t('All accessible') }}</option>
              <option value="owned">{{ t('Owned by me') }}</option>
            </optgroup>
          </select></label
        ><label
          >{{ t('Visibility')
          }}<select v-model="visibility" class="form-control">
            <optgroup class="select-options" label="">
              <option value="all">{{ t('All visibility') }}</option>
              <option value="public">{{ t('Public') }}</option>
              <option value="private">{{ t('Private') }}</option>
            </optgroup>
          </select></label
        >
      </div>
      <p class="repository-scope">
        {{
          t(
            'Only repositories allowed by the selected token are shown. Private visibility depends on its permissions.',
          )
        }}
      </p>
      <div v-if="error" class="account-alert repository-error" role="alert">
        <p>{{ t(error.message) }}</p>
        <div class="repository-error-actions">
          <span v-if="remaining">{{
            t('Try again in {count} seconds.', { count: remaining })
          }}</span
          ><button
            class="button button-secondary"
            :disabled="loading || remaining > 0"
            @click="load(page)"
          >
            {{ t('Retry') }}</button
          ><RouterLink
            v-if="
              ['unauthorized', 'forbidden', 'credentialMissing', 'credentialUnavailable'].includes(
                error.code,
              )
            "
            to="/settings"
            class="text-link"
            >{{ t('Manage account') }}</RouterLink
          >
        </div>
      </div>
      <div v-else-if="loading" class="repository-status" role="status">
        <LoaderCircle :size="18" class="loading-icon" aria-hidden="true" />{{
          t('Loading repositories...')
        }}
      </div>
      <EmptyState
        v-else-if="!selected"
        :title="t('No account for this platform')"
        :description="t('Connect an account in Settings or select another platform.')"
        :action="t('Manage accounts')"
        to="/settings"
      />
      <EmptyState
        v-else-if="loaded && !items.length"
        :title="t('No repositories to show')"
        :description="
          t(
            'No repositories were returned for this page and these filters. Check token permissions if you expected private repositories.',
          )
        "
      />
      <ul v-else class="repository-list" :aria-label="t('Repositories')">
        <li v-for="repo in items" :key="repo.id" class="repository-row">
          <div class="repository-name-row">
            <FolderGit2 :size="19" aria-hidden="true" />
            <h2>
              <RouterLink
                :to="{
                  name: 'repository-explorer',
                  params: { accountId: selected, owner: repo.owner, name: repo.name },
                }"
                >{{ repo.fullName }}</RouterLink
              >
            </h2>
            <span class="visibility-badge"
              ><LockKeyhole v-if="repo.visibility === 'private'" :size="10" aria-hidden="true" />{{
                t(repo.visibility)
              }}</span
            ><span v-if="repo.archived" class="subtle-badge">{{ t('Archived') }}</span>
          </div>
          <p v-if="repo.description" class="repository-description">{{ repo.description }}</p>
          <div class="repository-metadata">
            <span v-if="repo.language"
              ><span class="status-dot accent-dot" />{{ repo.language }}</span
            ><span
              ><GitBranch :size="12" aria-hidden="true" />{{
                repo.defaultBranch || t('No default branch')
              }}</span
            ><span>{{ t(repo.owned ? 'Owned by you' : 'Accessible to you') }}</span
            ><span>{{ updated(repo.updatedAt) }}</span>
          </div>
        </li>
      </ul>
      <div v-if="loaded && selected" class="repository-pagination">
        <span>
          {{ t('Page {page}', { page }) }}
          <span v-if="refreshed">
            ·
            {{
              t('Refreshed {time}', {
                time: refreshed.toLocaleTimeString(language, { timeStyle: 'short' }),
              })
            }}
          </span>
        </span>
        <div>
          <button
            class="button button-secondary"
            :disabled="page <= 1 || loading || remaining > 0"
            @click="load(page - 1)"
          >
            <ChevronLeft :size="14" aria-hidden="true" />{{ t('Previous') }}</button
          ><button
            class="button button-secondary"
            :disabled="!hasNext || loading || remaining > 0"
            @click="load(page + 1)"
          >
            {{ t('Next') }}<ChevronRight :size="14" aria-hidden="true" />
          </button>
        </div>
      </div>
    </template>
    <EmptyState
      v-else-if="!accountsError && !accountsLoading"
      :title="t('No remote repositories connected')"
      :description="
        t('Connect a GitHub or Gitee account to see the repositories available to you.')
      "
      :action="t('Explore account settings')"
      to="/settings"
    />
  </section>
</template>

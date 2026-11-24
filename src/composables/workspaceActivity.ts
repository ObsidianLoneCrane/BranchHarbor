import { computed, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAccounts } from './accounts'
import { accountError, type Provider } from '../lib/accounts'
import { readCachedContributionSource, readContributionSource } from '../lib/contributions'
import {
  hasLocalGit,
  localGitError,
  localRepositoryName,
  type LocalActivity,
} from '../lib/localGit'
import { sessionCache, sessionCacheRevision } from '../lib/sessionCache'
import { useForegroundRefresh } from './foregroundRefresh'

interface ProviderEvent {
  id: string
  eventType: string | null
  createdAt: string
  repository?: string | null
}

export interface TimelineItem {
  key: string
  source: 'local' | Provider
  type: string
  time: number
  repository: string
  subject?: string
  author?: string
  repositoryId?: number
}

const eventsCache = sessionCache<ProviderEvent[]>(40, 120_000, 10 * 60_000, true)
const localCache = sessionCache<LocalActivity>(4, 30_000, 2 * 60_000, true)
export const invalidateLocalActivity = localCache.clear
const localPageSize = 30
const maxLocalItems = 200

export function useWorkspaceActivity() {
  const store = useAccounts()
  const local = ref(localCache.peek(String(localPageSize))?.value)
  const accounts = computed(() =>
    store.accounts.value.filter((account) => account.credentialStatus === 'saved'),
  )
  const feeds = ref<Record<string, ProviderEvent[]>>({})
  const errors = ref<Record<string, string>>({})
  const loading = ref(false)
  const lastPage = ref<Record<string, { page: number; more: boolean }>>({})
  let generation = 0
  let localLimit = localPageSize
  const canLoadLocal = computed(() => !!local.value?.limited && localLimit < maxLocalItems)
  const feedKey = (account: { id: string; verifiedAt: number }, page: number) =>
    JSON.stringify([account.id, account.verifiedAt, page])

  async function load(force = false, more = false, preserve = false) {
    if (!hasLocalGit()) return
    const ticket = ++generation
    const limit = more
      ? Math.min(maxLocalItems, localLimit + localPageSize)
      : preserve
        ? localLimit
        : localPageSize
    loading.value = true
    errors.value = {}
    const localRequest =
      more && !canLoadLocal.value
        ? Promise.resolve()
        : localCache
            .load(String(limit), () => invoke('read_recent_local_activity', { limit }), force)
            .then((result) => {
              if (ticket === generation) {
                localLimit = limit
                local.value = result
              }
            })
            .catch((error) => {
              if (ticket === generation) errors.value.local = localGitError(error)
            })
    await Promise.all([
      localRequest,
      ...accounts.value.map(async (account) => {
        const previousPage = lastPage.value[account.id]
        if (more && previousPage && !previousPage.more) return
        const currentPage = more ? (previousPage?.page ?? 0) + 1 : 1
        const key = feedKey(account, currentPage)
        const saved = eventsCache.peek(key)
        if (saved && !more && !preserve) feeds.value[account.id] = saved.value
        let stored: ProviderEvent[] | undefined
        try {
          const result = await eventsCache.load(
            key,
            async () => {
              if (account.provider === 'github')
                return invoke<ProviderEvent[]>('read_recent_github_activity', {
                  accountId: account.id,
                  page: currentPage,
                })
              const downloaded = await readCachedContributionSource(account.id, null)
              if (downloaded?.data.source === 'giteePublicEvents') {
                stored = downloaded.data.events.map((event) => ({
                  ...event,
                  repository: event.repository?.name,
                }))
                if (!force && Date.now() - downloaded.refreshedAt * 1000 < 120_000) return stored
              }
              const { data } = await readContributionSource(account.id, null)
              if (data.source !== 'giteePublicEvents') throw { code: 'invalidResponse' }
              return data.events.map((event) => ({ ...event, repository: event.repository?.name }))
            },
            force,
          )
          if (ticket !== generation) return
          const keepPages =
            preserve && previousPage && previousPage.page > 1 && result.length === 30
          const previous = more || keepPages ? (feeds.value[account.id] ?? []) : []
          feeds.value[account.id] = [
            ...new Map([...result, ...previous].map((event) => [event.id, event])).values(),
          ].slice(0, 300)
          lastPage.value[account.id] = keepPages
            ? previousPage
            : {
                page: currentPage,
                more: account.provider === 'github' && result.length === 30 && currentPage < 10,
              }
        } catch (error) {
          if (ticket === generation) {
            if (stored && !feeds.value[account.id]) feeds.value[account.id] = stored
            errors.value[account.id] = accountError(error).message
          }
        }
      }),
    ])
    if (ticket === generation) loading.value = false
  }

  onMounted(() => {
    void store.ensureLoaded()
  })
  watch(
    () =>
      JSON.stringify([
        sessionCacheRevision.value,
        accounts.value.map((account) => [account.id, account.verifiedAt]),
      ]),
    () => {
      feeds.value = {}
      lastPage.value = {}
      void load()
    },
    { immediate: true },
  )
  useForegroundRefresh(() => {
    if (
      !loading.value &&
      (!localCache.fresh(String(localLimit)) ||
        accounts.value.some((account) => !eventsCache.fresh(feedKey(account, 1))))
    ) {
      void load(false, false, true)
    }
  })
  const items = computed(() => {
    const rows: TimelineItem[] = (local.value?.commits ?? []).map((commit) => ({
      key: `local:${commit.repositoryId}:${commit.hash}`,
      source: 'local',
      type: 'Commit',
      time: commit.committedAt * 1000,
      repository: localRepositoryName(commit.repositoryPath),
      subject: commit.subject,
      author: commit.author,
      repositoryId: commit.repositoryId,
    }))
    const seen = new Set<string>()
    for (const account of accounts.value) {
      for (const event of feeds.value[account.id] ?? []) {
        const time = Date.parse(event.createdAt)
        const key = `${account.provider}:${event.id}`
        if (!Number.isFinite(time) || seen.has(key)) continue
        seen.add(key)
        rows.push({
          key,
          source: account.provider,
          type: event.eventType ?? 'Unclassified event',
          time,
          repository: event.repository ?? '',
          author: account.login,
        })
      }
    }
    return rows.sort((left, right) => right.time - left.time || left.key.localeCompare(right.key))
  })
  return {
    items,
    errors,
    loading,
    limited: computed(() => !!local.value?.limited),
    skipped: computed(() => local.value?.skippedRepositories ?? 0),
    more: () => load(false, true),
    refresh: () => load(true),
    hasMore: computed(
      () => accounts.value.some(({ id }) => lastPage.value[id]?.more) || canLoadLocal.value,
    ),
  }
}
